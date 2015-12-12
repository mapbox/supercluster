'use strict';

var rbush = require('rbush');

module.exports = supercluster;

function supercluster(options) {
    return new SuperCluster(options);
}

function SuperCluster(options) {
    options = this.options = extend(Object.create(this.options), options);
    console.log('clustering radius %d of %d', options.radius, options.extent);

    this._initTrees();
}

SuperCluster.prototype = {
    options: {
        nodeSize: 16, // size of the R-tree leaf node, affects performance
        maxZoom: 16,  // max zoom level to cluster the points on
        radius: 300,  // cluster radius relative to tile extent
        extent: 4096  // tile extent
    },

    load: function (points) {
        console.time('total time');

        var timerId = 'prepared ' + points.length + ' points';
        console.time(timerId);
        // generate a cluster object for each point
        var clusters = points.map(projectPoint);
        console.timeEnd(timerId);

        // cluster points on max zoom, then cluster the results on previous zoom, etc.
        // results in a cluster hierarchy across zoom levels
        for (var z = this.options.maxZoom; z >= 0; z--) {
            clusters = this._cluster(clusters, z);
        }
        console.timeEnd('total time');
    },

    _initTrees: function () {
        var format = ['.x', '.y', '.x', '.y'];
        this.trees = [];
        // make an R-Tree index for each zoom level
        for (var z = 0; z <= this.options.maxZoom; z++) {
            this.trees[z] = rbush(this.options.nodeSize, format);
        }
    },

    _cluster: function (points, zoom) {
        var now = +Date.now();

        // load points into an R-tree of the zoom
        this.trees[zoom].load(points);

        var newClusters = [];

        // loop through each point
        for (var i = 0; i < points.length; i++) {
            var point = points[i];

            // if we've already visited the cluster at this zoom level, skip it
            if (point.zoom <= zoom) continue;

            point.zoom = zoom;

            // find unprocessed neighbors within a cluster radius
            var neighbors = this._getNeighbors(point, zoom);

            if (neighbors.length === 0) {
                newClusters.push(point); // no neighbors, add a single point as cluster
                continue;
            }

            var wx = 0;
            var wy = 0;

            for (var j = 0; j < neighbors.length; j++) {
                var b = neighbors[j];
                b.zoom = zoom; // save the zoom (so it doesn't get processed twice)
                wx += b.x; // accumulate coordinates for calculating weighted center
                wy += b.y;
            }

            // form a cluster with neighbors
            var newCluster = createCluster(point.x, point.y);
            newCluster.neighbors = neighbors;

            // save weighted cluster center for display
            newCluster.wx = wx / neighbors.length;
            newCluster.wy = wy / neighbors.length;

            newClusters.push(newCluster);
        }

        console.log('z%d: %d clusters in %dms', zoom, newClusters.length, +Date.now() - now);
        return newClusters;
    },

    _getNeighbors: function (p, zoom) {
        var r = this.options.radius / (this.options.extent * Math.pow(2, zoom));

        // find all nearby points with a bbox search
        var bboxNeighbors = this.trees[zoom].search([p.x - r, p.y - r, p.x + r, p.y + r]);
        if (bboxNeighbors.length === 0) return [];

        var neighbors = [];

        for (var j = 0; j < bboxNeighbors.length; j++) {
            var b = bboxNeighbors[j];
            // filter out neighbors that are too far or already processed
            if (zoom < b.zoom && distSq(p, b) <= r * r) {
                neighbors.push(b);
            }
        }

        return neighbors;
    }
};

function projectPoint(p) {
    return createCluster(lngX(p[0]), latY(p[1]));
}

// longitude to spherical mercator x in [0..1] range
function lngX(lng) {
    return lng / 360 + 0.5;
}

// latitude to spherical mercator y in [0..1] range
function latY(lat) {
    var sin = Math.sin(lat * Math.PI / 180),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return y < 0 ? 0 :
           y > 1 ? 1 : y;
}

function createCluster(x, y) {
    return {
        // cluster center
        x: x,
        y: y,

        // weighted cluster center
        wx: x,
        wy: y,

        // the last zoom the cluster was processed at
        zoom: Infinity,

        children: null
    };
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
