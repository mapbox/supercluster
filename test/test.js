'use strict';

var test = require('tap').test;
var supercluster = require('../');

var places = require('./fixtures/places.json');
var placesTile = require('./fixtures/places-z0-0-0.json');
var placesCluster = require('./fixtures/places-cluster.json');

test(function (t) {
    var index = supercluster().load(places.features);
    t.same(index.getTile(0, 0, 0), placesTile);
    t.end();
});

test(function (t) {
    var index = supercluster({
        radius: 1000,
        metricKey: 'scalerank',
        metricReducer: Math.max
    }).load(places.features);
    var clusters = index.getClusters([-145, -85, 85, 100], 0);
    t.equal(clusters.length, 1);
    t.same(clusters[0], placesCluster);
    t.end();
});
