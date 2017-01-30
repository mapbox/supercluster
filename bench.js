'use strict';

// run this benchmark with:
// node --expose-gc bench.js

var supercluster = require('./');
var v8 = require('v8');

var points = [];
for (var i = 0; i < 1000000; i++) {
    points.push({
        type: 'Feature',
        properties: {
            index: i
        },
        geometry: {
            type: 'Point',
            coordinates: [
                -180 + 360 * Math.random(),
                -80 + 160 * Math.random()
            ]
        }
    });
}

global.gc();
var size = v8.getHeapStatistics().used_heap_size;

var index = supercluster({log: true, maxZoom: 6}).load(points);

global.gc();
console.log('memory used: ' + Math.round((v8.getHeapStatistics().used_heap_size - size) / 1024) + ' KB');

index.getClusters([-180, -90, 180, 90], 0).map((f) => JSON.stringify(f.properties));
