export const createCluster = (x, y, id, numPoints, properties) => {
    return {
        x, // weighted cluster center
        y,
        zoom: Infinity, // the last zoom the cluster was processed at
        id, // encodes index of the first child of the cluster and its zoom level
        parentId: -1, // parent cluster id
        numPoints,
        properties
    };
}

export const createPointCluster = (p, id) => {
    const [x, y] = p.geometry.coordinates;
    return {
        x: lngX(x), // projected point coordinates
        y: latY(y),
        zoom: Infinity, // the last zoom the point was processed at
        index: id, // index of the source feature in the original input array,
        parentId: -1 // parent cluster id
    };
}

export const getClusterJSON = (cluster) => {
    return {
        type: 'Feature',
        id: cluster.id,
        properties: getClusterProperties(cluster),
        geometry: {
            type: 'Point',
            coordinates: [xLng(cluster.x), yLat(cluster.y)]
        }
    };
}

export const getClusterProperties = (cluster) => {
    const count = cluster.numPoints;
    const abbrev =
        count >= 10000 ? `${Math.round(count / 1000)}k` :
            count >= 1000 ? `${Math.round(count / 100) / 10}k` : count;
    return extend(extend({}, cluster.properties), {
        cluster: true,
        cluster_id: cluster.id,
        point_count: count,
        point_count_abbreviated: abbrev
    });
}

// longitude/latitude to spherical mercator in [0..1] range
export const lngX = (lng) => {
    return lng / 360 + 0.5;
}
export const latY = (lat) => {
    const sin = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return y < 0 ? 0 : y > 1 ? 1 : y;
}

// spherical mercator to longitude/latitude
const xLng = (x) => {
    return (x - 0.5) * 360;
}
const yLat = (y) => {
    const y2 = (180 - y * 360) * Math.PI / 180;
    return 360 * Math.atan(Math.exp(y2)) / Math.PI - 90;
}

export const extend = (dest, src) => {
    for (const id in src) dest[id] = src[id];
    return dest;
}

export const getX = (p) => {
    return p.x;
}
export const getY = (p) => {
    return p.y;
}