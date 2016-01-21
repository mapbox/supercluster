'use strict';

var test = require('tap').test;
var supercluster = require('../');

var places = require('./fixtures/places.json');
var placesTile = require('./fixtures/places-z0-0-0.json');

test(function (t) {
    var index = supercluster().load(places.features);
    t.same(index.getTile(0, 0, 0), placesTile);
    t.end();
});
