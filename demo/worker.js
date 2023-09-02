/*global importScripts Supercluster */

importScripts('../dist/supercluster.js');

const now = Date.now();
const url = '../test/fixtures/places.json';
let index = new Supercluster({
        log: true,
        radius: 60,
        extent: 256,
        maxZoom: 17
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
}

function getJSON(url) {
  fetch(url)
  .then(response => response.json())
  .then(geojson => {
    
    console.log(`Loaded ${  geojson.features.length  } points JSON in ${ (Date.now() - now) / 1000 }s`);
    
    index.load(geojson.features);

    console.log(index.getTile(0, 0, 0));

    postMessage({ready: true});
  })
  .catch(error  => {console.log('Request failed', error);});
}

getJSON(url);
