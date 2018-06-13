
import tap from 'tap';
import supercluster from '../index.js';

var test = tap.test;
var places = require('./fixtures/places.json');
var placesTile = require('./fixtures/places-z0-0-0.json');

test('generates clusters properly', function (t) {
    var index = supercluster().load(places.features);
    var tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTile.features);
    t.end();
});

test('returns children of a cluster', function (t) {
    var index = supercluster().load(places.features);
    var childCounts = index.getChildren(1).map((p) => p.properties.point_count || 1);
    t.same(childCounts, [6, 7, 2, 1]);
    t.end();
});

test('returns leaves of a cluster', function (t) {
    var index = supercluster().load(places.features);
    var leafNames = index.getLeaves(1, 10, 5).map((p) => p.properties.name);
    t.same(leafNames, [
        'Niagara Falls',
        'Cape San Blas',
        'Cape Sable',
        'Cape Canaveral',
        'San  Salvador',
        'Cabo Gracias a Dios',
        'I. de Cozumel',
        'Grand Cayman',
        'Miquelon',
        'Cape Bauld'
    ]);
    t.end();
});

test('getLeaves handles null-property features', function (t) {
    var index = supercluster().load(places.features.concat([{
        type: 'Feature',
        properties: null,
        geometry: {
            type: 'Point',
            coordinates: [-79.04411780507252, 43.08771393436908]
        }
    }]));
    var leaves = index.getLeaves(1, 1, 6);
    t.equal(leaves[0].properties, null);
    t.end();
});

test('returns cluster expansion zoom', function (t) {
    var index = supercluster().load(places.features);
    t.same(index.getClusterExpansionZoom(1, 0), 1);
    t.same(index.getClusterExpansionZoom(33, 0), 1);
    t.same(index.getClusterExpansionZoom(353, 0), 2);
    t.same(index.getClusterExpansionZoom(833, 0), 2);
    t.same(index.getClusterExpansionZoom(1857, 0), 3);
    t.end();
});

test('aggregates cluster properties with reduce', function (t) {
    var index = supercluster({
        initial: function () { return {sum: 0}; },
        map: function (props) { return {sum: props.scalerank}; },
        reduce: function (a, b) { a.sum += b.sum; }
    }).load(places.features);

    t.equal(index.getTile(0, 0, 0).features[0].tags.sum, 69);

    t.end();
});

test('returns clusters when query crosses international dateline', function (t) {
    var index = supercluster().load([
        {
            type: 'Feature',
            properties: null,
            geometry: {
                type: 'Point',
                coordinates: [-178.989, 0]
            }
        }, {
            type: 'Feature',
            properties: null,
            geometry: {
                type: 'Point',
                coordinates: [-178.990, 0]
            }
        }, {
            type: 'Feature',
            properties: null,
            geometry: {
                type: 'Point',
                coordinates: [-178.991, 0]
            }
        }, {
            type: 'Feature',
            properties: null,
            geometry: {
                type: 'Point',
                coordinates: [-178.992, 0]
            }
        }
    ]);

    var nonCrossing = index.getClusters([-179, -10, -177, 10], 1);
    var crossing = index.getClusters([179, -10, -177, 10], 1);

    t.ok(nonCrossing.length);
    t.ok(crossing.length);
    t.equal(nonCrossing.length, crossing.length);

    t.end();
});

test('does not crash on weird bbox values', function (t) {
    var index = supercluster().load(places.features);
    t.equal(index.getClusters([129.426390, -103.720017, -445.930843, 114.518236], 1).length, 26);
    t.equal(index.getClusters([112.207836, -84.578666, -463.149397, 120.169159], 1).length, 27);
    t.equal(index.getClusters([129.886277, -82.332680, -445.470956, 120.390930], 1).length, 26);
    t.equal(index.getClusters([458.220043, -84.239039, -117.137190, 120.206585], 1).length, 25);
    t.equal(index.getClusters([456.713058, -80.354196, -118.644175, 120.539148], 1).length, 25);
    t.equal(index.getClusters([453.105328, -75.857422, -122.251904, 120.732760], 1).length, 25);
    t.equal(index.getClusters([-180, -90, 180, 90], 1).length, 61);
    t.end();
});

