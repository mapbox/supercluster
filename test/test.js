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
    var childCounts = index.getChildren(0, 0).map((p) => p.properties.point_count || 1);
    t.same(childCounts, [6, 7, 2, 1]);
    t.end();
});

test('returns leaves of a cluster', function (t) {
    var index = supercluster().load(places.features);
    var leafNames = index.getLeaves(0, 0, 10, 5).map((p) => p.properties.name);
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
