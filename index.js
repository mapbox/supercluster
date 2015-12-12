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
        var tree = this.trees[zoom].load(points);

        var newClusters = [];
        var r = this.options.radius / (this.options.extent * Math.pow(2, zoom));
        var bbox = [0, 0, 0, 0];

        // loop through each point
        for (var i = 0; i < points.length; i++) {
            var c = points[i];

            // if we've already visited the cluster at this zoom level, skip it
            if (c.zoom <= zoom) continue;

            c.zoom = zoom;

            bbox[0] = c.x - r;
            bbox[1] = c.y - r;
            bbox[2] = c.x + r;
            bbox[3] = c.y + r;

            // find all nearby points with a bbox search
            var neighbors = tree.search(bbox);
            if (neighbors.length === 0) {
                newClusters.push(c); // no neighbors, add point to results
                continue;
            }

            var children = [];
            var wx = 0;
            var wy = 0;

            for (var j = 0; j < neighbors.length; j++) {
                var b = neighbors[j];

                // filter out neighbors that are too far or already processed
                if (zoom < b.zoom && distSq(c, b) <= r * r) {
                    b.zoom = zoom;
                    children.push(b);
                    wx += b.x;
                    wy += b.y;
                }
            }

            if (!children.length) {
                newClusters.push(c); // no neighbors, add points to results
                continue;
            }

            // form a cluster with neighbors
            var newCluster = createCluster(children[0].x, children[0].y);
            newCluster.children = children;

            // calculate weighted cluster center for display
            newCluster.wx = wx / children.length;
            newCluster.wy = wy / children.length;

            newClusters.push(newCluster);
        }

        console.log('z%d: %d clusters in %dms', zoom, newClusters.length, +Date.now() - now);
        return newClusters;
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
