'use strict';

var test = require('tap').test;
var supercluster = require('../');

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
