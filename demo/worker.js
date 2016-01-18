'use strict';

// generate supercluster.js from the repo root with:
// browserify index.js -s supercluster > demo/supercluster.js
importScripts('supercluster.js');

var now = Date.now();

var index;

getJSON('../trees-na.json', function (trees) {
    console.log('loaded ' + trees.length + ' points JSON in ' + ((Date.now() - now) / 1000) + 's');

    console.time('map to GeoJSON');
    trees = trees.map(function (p) {
        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Point',
                coordinates: p
            }
        };
    });
    console.timeEnd('map to GeoJSON');

    index = supercluster({
        log: true,
        radius: 60,
        extent: 256,
        maxZoom: 17
    }).load(trees);

    console.log(index.getTile(0, 0, 0));

    postMessage({ready: true});
});

self.onmessage = function (e) {
    if (e.data) {
        postMessage(index.getClusters(e.data.bbox, e.data.zoom));
    }
};

function getJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onload = function () {
        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            callback(xhr.response);
        }
    };
    xhr.send();
}
