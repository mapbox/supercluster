/*global L */

const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markers = L.geoJson(null, {
    pointToLayer: createClusterIcon
}).addTo(map);

const worker = new Worker('worker.js');
let ready = false;

worker.onmessage = function (e) {
    if (e.data.ready) {
        ready = true;
        update();
    } else if (e.data.expansionZoom) {
        map.flyTo(e.data.center, e.data.expansionZoom);
    } else {
        markers.clearLayers();
        markers.addData(e.data);
    }
};

function update() {
    if (!ready) return;
    const bounds = map.getBounds();
    worker.postMessage({
        bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: map.getZoom()
    });
}

map.on('moveend', update);

function createClusterIcon(feature, latlng) {
    if (!feature.properties.cluster) return L.marker(latlng);

    const count = feature.properties.point_count;
    const size =
        count < 100 ? 'small' :
        count < 1000 ? 'medium' : 'large';
    const icon = L.divIcon({
        html: `<div><span>${  feature.properties.point_count_abbreviated  }</span></div>`,
        className: `marker-cluster marker-cluster-${  size}`,
        iconSize: L.point(40, 40)
    });

    return L.marker(latlng, {icon});
}

markers.on('click', (e) => {
    if (e.layer.feature.properties.cluster_id) {
        worker.postMessage({
            getClusterExpansionZoom: e.layer.feature.properties.cluster_id,
            center: e.latlng
        });
    }
});
