'use strict';

var rbush = require('rbush');

module.exports = supercluster;

function supercluster(options) {
    return new SuperCluster(options);
}

function SuperCluster(options) {
    this.options = Object.create(this.options);
    for (var key in options) this.options[key] = options[key];
    options = this.options;

    console.log('clustering radius %d of %d', options.radius, options.extent);

    var r = this._r = options.radius / (options.extent * Math.pow(2, options.maxZoom));
    this._r2 = r * r;

    this._initTrees();
}

SuperCluster.prototype = {
    options: {
        nodeSize: 16,
        maxZoom: 18,
        radius: 400,
        extent: 4096
    },

    load: function (points) {
        var timerId = 'prepared ' + points.length + ' points';
        console.time(timerId);
        var clusters = points.map(projectPoint);
        console.timeEnd(timerId);

        console.time('total time');
        for (var z = this.options.maxZoom; z > 0; z--) {
            clusters = this._cluster(clusters, z);
        }
        console.timeEnd('total time');
    },

    _initTrees: function () {
        this.trees = [];
        var format = ['.x', '.y', '.x', '.y'];
        for (var z = 0; z <= this.options.maxZoom; z++) {
            this.trees[z] = rbush(this.options.nodeSize, format);
        }
    },

    _cluster: function (clusters, zoom) {
        var now = +Date.now();

        var tree = this.trees[zoom].load(clusters);

        var newClusters = [];
        var r = this._r;
        var bbox = [0, 0, 0, 0];

        for (var i = 0; i < clusters.length; i++) {
            var c = clusters.pop();

            if (c.zoom <= zoom) continue;
            c.zoom = zoom;

            bbox[0] = c.x - r;
            bbox[1] = c.y - r;
            bbox[2] = c.x + r;
            bbox[3] = c.y + r;

            var neighbors = tree.search(bbox);
            if (neighbors.length === 0) {
                newClusters.push(c);
                continue;
            }

            var children = [];
            var wx = 0;
            var wy = 0;

            for (var j = 0; j < neighbors.length; j++) {
                var b = neighbors[j];

                if (zoom < b.zoom && distSq(c, b) <= this._r2) {
                    b.zoom = zoom;
                    children.push(b);
                    wx += b.x;
                    wy += b.y;
                }
            }

            if (!children.length) {
                newClusters.push(c);
                continue;
            }

            var newCluster = cluster(children[0].x, children[0].y);
            newCluster.children = children;
            newCluster.wx = wx / children.length;
            newCluster.wy = wy / children.length;

            newClusters.push(newCluster);
        }

        console.log('clustered into %d clusters on z%d in %dms', newClusters.length, zoom, +Date.now() - now);
        return newClusters;
    }
};

function projectPoint(p) {
    var sin = Math.sin(p[1] * Math.PI / 180),
        x = (p[0] / 360 + 0.5),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);

    y = y < 0 ? 0 :
        y > 1 ? 1 : y;

    return cluster(x, y);
}

function cluster(x, y) {
    return {
        // cluster center
        x: x,
        y: y,

        // weighted cluster center
        wx: x,
        wy: y,

        zoom: Infinity,
        children: null
    };
}

function distSq(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}
