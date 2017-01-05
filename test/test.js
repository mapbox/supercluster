'use strict';

var test = require('tap').test;
var supercluster = require('../');

var places = require('./fixtures/places.json');
var placesTile = require('./fixtures/places-z0-0-0.json');
var placesTileWithAggregate = require('./fixtures/places-with-aggregate-z0-0-0.json');

test(function (t) {
    var index = supercluster().load(places.features);
    var tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTile.features);
    t.end();
});

test(function (t) {
    var index = supercluster({aggregateBy: 'scalerank'}).load(places.features);
    var tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTileWithAggregate.features);
    t.end();
});
