/*global importScripts supercluster */

importScripts('../dist/supercluster.js');

var now = Date.now();

var index;

getJSON('../test/fixtures/places.json', function (geojson) {
    console.log('loaded ' + geojson.length + ' points JSON in ' + ((Date.now() - now) / 1000) + 's');

    index = supercluster({
        log: true,
        radius: 60,
        extent: 256,
        maxZoom: 17
    }).load(geojson.features);

    console.log(index.getTile(0, 0, 0));

    postMessage({ready: true});
});

self.onmessage = function (e) {
    if (e.data.getClusterExpansionZoom) {
        postMessage({
            expansionZoom: index.getClusterExpansionZoom(e.data.getClusterExpansionZoom),
            center: e.data.center
        });
    } else if (e.data) {
        postMessage(index.getClusters(e.data.bbox, e.data.zoom));
    }
};

function getJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onload = function () {
        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            callback(xhr.response);
        }
    };
    xhr.send();
}
