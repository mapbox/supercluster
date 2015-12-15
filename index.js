'use strict';

var rbush = require('rbush');

module.exports = supercluster;

function supercluster(options) {
    return new SuperCluster(options);
}

function SuperCluster(options) {
    this.options = extend(Object.create(this.options), options);
    this._initTrees();
}

SuperCluster.prototype = {
    options: {
        minZoom: 0,   // min zoom to generate clusters on
        maxZoom: 16,  // max zoom level to cluster the points on
        radius: 40,   // cluster radius in pixels
        extent: 512,  // tile extent (radius is calculated relative to it)
        nodeSize: 16, // size of the R-tree leaf node, affects performance
        log: false    // whether to log timing info
    },

    load: function (points) {
        var log = this.options.log;

        if (log) console.time('total time');

        var timerId = 'prepare ' + points.length + ' points';
        if (log) console.time(timerId);

        // generate a cluster object for each point
        var clusters = points.map(createPointCluster);
        if (log) console.timeEnd(timerId);

        // cluster points on max zoom, then cluster the results on previous zoom, etc.;
        // results in a cluster hierarchy across zoom levels
        for (var z = this.options.maxZoom; z >= this.options.minZoom; z--) {
            var now = +Date.now();

            this.trees[z + 1].load(clusters); // index input points into an R-tree
            clusters = this._cluster(clusters, z); // create a new set of clusters for the zoom

            if (log) console.log('z%d: %d clusters in %dms', z, clusters.length, +Date.now() - now);
        }
        this.trees[this.options.minZoom].load(clusters); // index top-level clusters

        if (log) console.timeEnd('total time');

        return this;
    },

    getClusters: function (bbox, zoom) {
        var projBBox = [lngX(bbox[0]), latY(bbox[3]), lngX(bbox[2]), latY(bbox[1])];
        var z = Math.max(this.options.minZoom, Math.min(zoom, this.options.maxZoom + 1));
        var clusters = this.trees[z].search(projBBox);
        return clusters.map(getCluster);
    },

    _initTrees: function () {
        this.trees = [];
        // make an R-Tree index for each zoom level
        for (var z = 0; z <= this.options.maxZoom + 1; z++) {
            this.trees[z] = rbush(this.options.nodeSize);
            this.trees[z].toBBox = toBBox;
            this.trees[z].compareMinX = compareMinX;
            this.trees[z].compareMinY = compareMinY;
        }
    },

    _cluster: function (points, zoom) {
        var clusters = [];
        var r = this.options.radius / (this.options.extent * Math.pow(2, zoom));
        var bbox = [0, 0, 0, 0];

        // loop through each point
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            // if we've already visited the point at this zoom level, skip it
            if (p.zoom <= zoom) continue;
            p.zoom = zoom;

            // find all nearby points with a bbox search
            bbox[0] = p.x - r;
            bbox[1] = p.y - r;
            bbox[2] = p.x + r;
            bbox[3] = p.y + r;
            var bboxNeighbors = this.trees[zoom + 1].search(bbox);

            var foundNeighbors = false;
            var numPoints = p.numPoints;
            var wx = p.wx * numPoints;
            var wy = p.wy * numPoints;

            for (var j = 0; j < bboxNeighbors.length; j++) {
                var b = bboxNeighbors[j];
                // filter out neighbors that are too far or already processed
                if (zoom < b.zoom && distSq(p, b) <= r * r) {
                    foundNeighbors = true;
                    b.zoom = zoom; // save the zoom (so it doesn't get processed twice)
                    wx += b.wx * b.numPoints; // accumulate coordinates for calculating weighted center
                    wy += b.wy * b.numPoints;
                    numPoints += b.numPoints;
                }
            }

            if (!foundNeighbors) {
                clusters.push(p); // no neighbors, add a single point as cluster
                continue;
            }

            // form a cluster with neighbors
            var cluster = createCluster(p.x, p.y);
            cluster.numPoints = numPoints;

            // save weighted cluster center for display
            cluster.wx = wx / numPoints;
            cluster.wy = wy / numPoints;

            clusters.push(cluster);
        }

        return clusters;
    }
};

function toBBox(p) {
    return [p.x, p.y, p.x, p.y];
}
function compareMinX(a, b) {
    return a.x - b.x;
}
function compareMinY(a, b) {
    return a.y - b.y;
}

function createCluster(x, y) {
    return {
        x: x, // cluster center
        y: y,
        wx: x, // weighted cluster center
        wy: y,
        zoom: Infinity, // the last zoom the cluster was processed at
        point: null,
        numPoints: 1
    };
}

function createPointCluster(p) {
    var coords = p.geometry.coordinates;
    var cluster = createCluster(lngX(coords[0]), latY(coords[1]));
    cluster.point = p;
    return cluster;
}

function getCluster(cluster) {
    return cluster.point ? cluster.point : {
        type: 'Feature',
        properties: {
            cluster: true,
            numPoints: cluster.numPoints
        },
        geometry: {
            type: 'Point',
            coordinates: [xLng(cluster.wx), yLat(cluster.wy)]
        }
    };
}

// longitude/latitude to spherical mercator in [0..1] range
function lngX(lng) {
    return lng / 360 + 0.5;
}
function latY(lat) {
    var sin = Math.sin(lat * Math.PI / 180),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return y < 0 ? 0 :
           y > 1 ? 1 : y;
}

// spherical mercator to longitude/latitude
function xLng(x) {
    return (x - 0.5) * 360;
}
function yLat(y) {
    var y2 = (180 - y * 360) * Math.PI / 180;
    return 360 * Math.atan(Math.exp(y2)) / Math.PI - 90;
}

// squared distance between two points
function distSq(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function extend(dest, src) {
    for (var id in src) dest[id] = src[id];
    return dest;
}
