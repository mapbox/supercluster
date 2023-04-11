
import {test} from 'tape';
import Supercluster from '../index.js';

const places = require('./fixtures/places.json');
const placesTile = require('./fixtures/places-z0-0-0.json');
const placesTileMin5 = require('./fixtures/places-z0-0-0-min5.json');

test('Test indexing with minZoom, maxZoom and zoomStep', (t) => {
    const minzoom = 10;
    const zoomStep = 0.1;
    const index = new Supercluster({minZoom: minzoom, maxZoom: 15, zoomStep});

    t.same(index._zoomToIndex(minzoom), 0);
    t.same(index._zoomToIndex(minzoom + 5 * zoomStep), 5);
    t.same(index._zoomToIndex(minzoom + (10 * zoomStep)), 10);
    t.end();
});

test('Test indexing with minZoom, maxZoom and zoomStep', (t) => {
    const minzoom = 10;
    const zoomStep = 1;
    const index = new Supercluster({minZoom: minzoom, maxZoom: 20, zoomStep});


    t.same(index._zoomToIndex(minzoom), 0);
    t.same(index._zoomToIndex(minzoom + 5 * zoomStep), 5);
    t.same(index._zoomToIndex(minzoom + 10 * zoomStep), 10);
    t.end();
});

test('Test indexing with minZoom, maxZoom and zoomStep', (t) => {
    const minzoom = 10;
    const zoomStep = 0.2;
    const index = new Supercluster({minZoom: minzoom, maxZoom: 20, zoomStep});


    t.same(index._zoomToIndex(minzoom), 0);
    t.same(index._zoomToIndex(minzoom + 5 * zoomStep), 5);
    t.same(index._zoomToIndex(minzoom + 10 * zoomStep), 10);
    t.end();
});

test('generates clusters properly', (t) => {
    const index = new Supercluster().load(places.features);
    const tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTile.features);
    t.end();
});

test('supports minPoints option', (t) => {
    const index = new Supercluster({minPoints: 5}).load(places.features);
    const tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTileMin5.features);
    t.end();
});

test('returns children of a cluster', (t) => {
    const index = new Supercluster().load(places.features);
    const childCounts = index.getChildren(164).map(p => p.properties.point_count || 1);
    t.same(childCounts, [6, 7, 2, 1]);
    t.end();
});

test('returns leaves of a cluster', (t) => {
    const index = new Supercluster().load(places.features);
    const leafNames = index.getLeaves(164, 10, 5).map(p => p.properties.name);
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

test('generates unique ids with generateId option', (t) => {
    const index = new Supercluster({generateId: true}).load(places.features);
    const ids = index.getTile(0, 0, 0).features.filter(f => !f.tags.cluster).map(f => f.id);
    t.same(ids, [12, 20, 21, 22, 24, 28, 30, 62, 81, 118, 119, 125, 81, 118]);
    t.end();
});

test('getLeaves handles null-property features', (t) => {
    const index = new Supercluster().load(places.features.concat([{
        type: 'Feature',
        properties: null,
        geometry: {
            type: 'Point',
            coordinates: [-79.04411780507252, 43.08771393436908]
        }
    }]));
    const leaves = index.getLeaves(165, 1, 6);
    t.equal(leaves[0].properties, null);
    t.end();
});

test('returns cluster expansion zoom', (t) => {
    const index = new Supercluster().load(places.features);
    t.same(index.getClusterExpansionZoom(164), 1);
    t.same(index.getClusterExpansionZoom(420), 1);
    t.same(index.getClusterExpansionZoom(3493), 2);
    t.same(index.getClusterExpansionZoom(8101), 2);
    t.same(index.getClusterExpansionZoom(31910), 3);
    t.end();
});

test('returns cluster expansion zoom for maxZoom', (t) => {
    const index = new Supercluster({
        radius: 60,
        extent: 256,
        maxZoom: 4,
    }).load(places.features);

    t.same(index.getClusterExpansionZoom(18856), 5);
    t.end();
});

test('aggregates cluster properties with reduce', (t) => {
    const index = new Supercluster({
        map: props => ({sum: props.scalerank}),
        reduce: (a, b) => { a.sum += b.sum; },
        radius: 100
    }).load(places.features);

    t.same(index.getTile(1, 0, 0).features.map(f => f.tags.sum).filter(Boolean),
        [146, 84, 63, 23, 34, 12, 19, 29, 8, 8, 80, 35]);
    t.same(index.getTile(0, 0, 0).features.map(f => f.tags.sum).filter(Boolean),
        [298, 122, 12, 36, 98, 7, 24, 8, 125, 98, 125, 12, 36, 8]);

    t.end();
});

test('returns clusters when query crosses international dateline', (t) => {
    const index = new Supercluster().load([
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

    const nonCrossing = index.getClusters([-179, -10, -177, 10], 1);
    const crossing = index.getClusters([179, -10, -177, 10], 1);

    t.ok(nonCrossing.length);
    t.ok(crossing.length);
    t.equal(nonCrossing.length, crossing.length);

    t.end();
});

test('does not crash on weird bbox values', (t) => {
    const index = new Supercluster().load(places.features);
    t.equal(index.getClusters([129.426390, -103.720017, -445.930843, 114.518236], 1).length, 26);
    t.equal(index.getClusters([112.207836, -84.578666, -463.149397, 120.169159], 1).length, 27);
    t.equal(index.getClusters([129.886277, -82.332680, -445.470956, 120.390930], 1).length, 26);
    t.equal(index.getClusters([458.220043, -84.239039, -117.137190, 120.206585], 1).length, 25);
    t.equal(index.getClusters([456.713058, -80.354196, -118.644175, 120.539148], 1).length, 25);
    t.equal(index.getClusters([453.105328, -75.857422, -122.251904, 120.732760], 1).length, 25);
    t.equal(index.getClusters([-180, -90, 180, 90], 1).length, 61);
    t.end();
});

test('does not crash on non-integer zoom values', (t) => {
    const index = new Supercluster().load(places.features);
    t.ok(index.getClusters([179, -10, -177, 10], 1.25));
    t.end();
});

test('makes sure same-location points are clustered', (t) => {
    const index = new Supercluster({
        maxZoom: 20,
        extent: 8192,
        radius: 16
    }).load([
        {type: 'Feature', geometry: {type: 'Point', coordinates: [-1.426798, 53.943034]}},
        {type: 'Feature', geometry: {type: 'Point', coordinates: [-1.426798, 53.943034]}}
    ]);

    t.equal(index.trees[20].ids.length, 1);

    t.end();
});

test('makes sure unclustered point coords are not rounded', (t) => {
    const index = new Supercluster({maxZoom: 19}).load([
        {type: 'Feature', geometry: {type: 'Point', coordinates: [173.19150559062456, -41.340357424709275]}}
    ]);

    t.same(index.getTile(20, 1028744, 656754).features[0].geometry[0], [421, 281]);

    t.end();
});
