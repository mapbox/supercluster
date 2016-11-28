'use strict';

var test = require('tap').test;
var supercluster = require('../');

var places = require('./fixtures/places.json');
var placesTile = require('./fixtures/places-z0-0-0.json');
var placesTileWithPointsTracked = require('./fixtures/places-tracked-points-z0-0-0.json');

test(function (t) {
    var index = supercluster().load(places.features);
    var tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTile.features);
    t.end();
});


// Should not track points in cluster if cluster's zoom lesser than 'trackPointsInClusterFromZoom'.
test(function (t) {
    var index = supercluster({
        trackPointsInClusterByPropertyField: 'name',
        trackPointsInClusterFromZoom: 15
    }).load(places.features);

    var tile = index.getTile(0, 0, 0);
    t.same(tile.features, placesTile.features);
    t.end();
});

// Should track points by field in cluster if cluster's zoom greater than 'trackPointsInClusterFromZoom'.
test(function (t) {
    var index = supercluster({
        trackPointsInClusterByPropertyField: 'name',
        trackPointsInClusterFromZoom: 0
    }).load(places.features);

    var tile = index.getTile(0, 0, 0);

    t.same(tile.features, placesTileWithPointsTracked.features);

    for (var i = 0; i < tile.features.length; i++) {
        if (tile.features[i].tags.cluster) {
            t.equal(tile.features[i].tags.point_count, tile.features[i].tags.includedPoints.length);
        }
    }
    t.end();
});
