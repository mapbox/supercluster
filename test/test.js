
import test from 'node:test';
import assert from 'node:assert/strict';

import {readFileSync} from 'fs';
import Supercluster from '../index.js';

const places = JSON.parse(readFileSync(new URL('./fixtures/places.json', import.meta.url)));
const placesTile = JSON.parse(readFileSync(new URL('./fixtures/places-z0-0-0.json', import.meta.url)));
const placesTileMin5 = JSON.parse(readFileSync(new URL('./fixtures/places-z0-0-0-min5.json', import.meta.url)));

test('generates clusters properly', () => {
    const index = new Supercluster().load(places.features);
    const tile = index.getTile(0, 0, 0);
    assert.deepEqual(tile.features, placesTile.features);
});

test('supports minPoints option', () => {
    const index = new Supercluster({minPoints: 5}).load(places.features);
    const tile = index.getTile(0, 0, 0);
    assert.deepEqual(tile.features, placesTileMin5.features);
});

test('returns children of a cluster', () => {
    const index = new Supercluster().load(places.features);
    const childCounts = index.getChildren(164).map(p => p.properties.point_count || 1);
    assert.deepEqual(childCounts, [6, 7, 2, 1]);
});

test('returns leaves of a cluster', () => {
    const index = new Supercluster().load(places.features);
    const leafNames = index.getLeaves(164, 10, 5).map(p => p.properties.name);
    assert.deepEqual(leafNames, [
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
});

test('generates unique ids with generateId option', () => {
    const index = new Supercluster({generateId: true}).load(places.features);
    const ids = index.getTile(0, 0, 0).features.filter(f => !f.tags.cluster).map(f => f.id);
    assert.deepEqual(ids, [12, 20, 21, 22, 24, 28, 30, 62, 81, 118, 119, 125, 81, 118]);
});

test('getLeaves handles null-property features', () => {
    const index = new Supercluster().load(places.features.concat([{
        type: 'Feature',
        properties: null,
        geometry: {
            type: 'Point',
            coordinates: [-79.04411780507252, 43.08771393436908]
        }
    }]));
    const leaves = index.getLeaves(165, 1, 6);
    assert.equal(leaves[0].properties, null);
});

test('returns cluster expansion zoom', () => {
    const index = new Supercluster().load(places.features);
    assert.deepEqual(index.getClusterExpansionZoom(164), 1);
    assert.deepEqual(index.getClusterExpansionZoom(196), 1);
    assert.deepEqual(index.getClusterExpansionZoom(581), 2);
    assert.deepEqual(index.getClusterExpansionZoom(1157), 2);
    assert.deepEqual(index.getClusterExpansionZoom(4134), 3);
});

test('returns cluster expansion zoom for maxZoom', () => {
    const index = new Supercluster({
        radius: 60,
        extent: 256,
        maxZoom: 4,
    }).load(places.features);

    assert.deepEqual(index.getClusterExpansionZoom(2504), 5);
});

test('aggregates cluster properties with reduce', () => {
    const index = new Supercluster({
        map: props => ({sum: props.scalerank}),
        reduce: (a, b) => { a.sum += b.sum; },
        radius: 100
    }).load(places.features);

    assert.deepEqual(index.getTile(1, 0, 0).features.map(f => f.tags.sum).filter(Boolean),
        [146, 84, 63, 23, 34, 12, 19, 29, 8, 8, 80, 35]);
    assert.deepEqual(index.getTile(0, 0, 0).features.map(f => f.tags.sum).filter(Boolean),
        [298, 122, 12, 36, 98, 7, 24, 8, 125, 98, 125, 12, 36, 8]);
});

test('returns clusters when query crosses international dateline', () => {
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

    assert.ok(nonCrossing.length);
    assert.ok(crossing.length);
    assert.equal(nonCrossing.length, crossing.length);
});

test('does not crash on weird bbox values', () => {
    const index = new Supercluster().load(places.features);
    assert.equal(index.getClusters([129.426390, -103.720017, -445.930843, 114.518236], 1).length, 26);
    assert.equal(index.getClusters([112.207836, -84.578666, -463.149397, 120.169159], 1).length, 27);
    assert.equal(index.getClusters([129.886277, -82.332680, -445.470956, 120.390930], 1).length, 26);
    assert.equal(index.getClusters([458.220043, -84.239039, -117.137190, 120.206585], 1).length, 25);
    assert.equal(index.getClusters([456.713058, -80.354196, -118.644175, 120.539148], 1).length, 25);
    assert.equal(index.getClusters([453.105328, -75.857422, -122.251904, 120.732760], 1).length, 25);
    assert.equal(index.getClusters([-180, -90, 180, 90], 1).length, 61);
});

test('does not crash on non-integer zoom values', () => {
    const index = new Supercluster().load(places.features);
    assert.ok(index.getClusters([179, -10, -177, 10], 1.25));
});

test('makes sure same-location points are clustered', () => {
    const index = new Supercluster({
        maxZoom: 20,
        extent: 8192,
        radius: 16
    }).load([
        {type: 'Feature', geometry: {type: 'Point', coordinates: [-1.426798, 53.943034]}},
        {type: 'Feature', geometry: {type: 'Point', coordinates: [-1.426798, 53.943034]}}
    ]);

    assert.equal(index.trees[20].ids.length, 1);
});

test('makes sure unclustered point coords are not rounded', () => {
    const index = new Supercluster({maxZoom: 19}).load([
        {type: 'Feature', geometry: {type: 'Point', coordinates: [173.19150559062456, -41.340357424709275]}}
    ]);

    assert.deepEqual(index.getTile(20, 1028744, 656754).features[0].geometry[0], [421, 281]);
});

test('does not throw on zero items', () => {
    assert.doesNotThrow(() => {
        const index = new Supercluster().load([]);
        assert.deepEqual(index.getClusters([-180, -85, 180, 85], 0), []);
    });
});
