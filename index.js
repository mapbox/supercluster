'use strict';

var kdbush = require('kdbush');

module.exports = supercluster;

function supercluster(options) {
    return new SuperCluster(options);
}

function SuperCluster(options) {
    this.options = extend(Object.create(this.options), options);
    this.trees = new Array(this.options.maxZoom + 1);
}

SuperCluster.prototype = {
    options: {
        minZoom: 0,   // min zoom to generate clusters on
        maxZoom: 16,  // max zoom level to cluster the points on
        radius: 40,   // cluster radius in pixels
        extent: 512,  // tile extent (radius is calculated relative to it)
        nodeSize: 64, // size of the KD-tree leaf node, affects performance
        log: false    // whether to log timing info
    },

    load: function (points) {
        var log = this.options.log;

        if (log) console.time('total time');

        var timerId = 'prepare ' + points.length + ' points';
        if (log) console.time(timerId);

        this.points = points;

        // generate a cluster object for each point
        var clusters = points.map(createPointCluster);
        if (log) console.timeEnd(timerId);

        // cluster points on max zoom, then cluster the results on previous zoom, etc.;
        // results in a cluster hierarchy across zoom levels
        for (var z = this.options.maxZoom; z >= this.options.minZoom; z--) {
            var now = +Date.now();

            // index input points into a KD-tree
            this.trees[z + 1] = kdbush(clusters, getX, getY, this.options.nodeSize, Float32Array);

            clusters = this._cluster(clusters, z); // create a new set of clusters for the zoom

            if (log) console.log('z%d: %d clusters in %dms', z, clusters.length, +Date.now() - now);
        }

        // index top-level clusters
        this.trees[this.options.minZoom] = kdbush(clusters, getX, getY, this.options.nodeSize, Float32Array);

        if (log) console.timeEnd('total time');

        return this;
    },

    getClusters: function (bbox, zoom) {
        var tree = this.trees[this._limitZoom(zoom)];
        var ids = tree.range(lngX(bbox[0]), latY(bbox[3]), lngX(bbox[2]), latY(bbox[1]));
        var clusters = [];
        for (var i = 0; i < ids.length; i++) {
            var c = tree.points[ids[i]];
            clusters.push(c.id !== -1 ? this.points[c.id] : getClusterJSON(c));
        }
        return clusters;
    },

    getTile: function (z, x, y) {
        var tree = this.trees[this._limitZoom(z)];
        var z2 = Math.pow(2, z);
        var extent = this.options.extent;
        var r = this.options.radius;
        var p = r / extent;
        var top = (y - p) / z2;
        var bottom = (y + 1 + p) / z2;

        var tile = {
            features: []
        };

        this._addTileFeatures(
            tree.range((x - p) / z2, top, (x + 1 + p) / z2, bottom),
            tree.points, x, y, z2, tile);

        if (x === 0) {
            this._addTileFeatures(
                tree.range(1 - p / z2, top, 1, bottom),
                tree.points, z2, y, z2, tile);
        }
        if (x === z2 - 1) {
            this._addTileFeatures(
                tree.range(0, top, p / z2, bottom),
                tree.points, -1, y, z2, tile);
        }

        return tile.features.length ? tile : null;
    },

    _addTileFeatures: function (ids, points, x, y, z2, tile) {
        for (var i = 0; i < ids.length; i++) {
            var c = points[ids[i]];
            tile.features.push({
                type: 1,
                geometry: [[
                    Math.round(this.options.extent * (c.x * z2 - x)),
                    Math.round(this.options.extent * (c.y * z2 - y))
                ]],
                tags: c.id !== -1 ? this.points[c.id].properties : getClusterProperties(c)
            });
        }
    },

    _limitZoom: function (z) {
        return Math.max(this.options.minZoom, Math.min(z, this.options.maxZoom + 1));
    },

    _cluster: function (points, zoom) {
        var clusters = [];
        var r = this.options.radius / (this.options.extent * Math.pow(2, zoom));

        // loop through each point
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            // if we've already visited the point at this zoom level, skip it
            if (p.zoom <= zoom) continue;
            p.zoom = zoom;

            // find all nearby points
            var tree = this.trees[zoom + 1];
            var neighborIds = tree.within(p.x, p.y, r);

            var foundNeighbors = false;
            var numPoints = p.numPoints;
            var wx = p.x * numPoints;
            var wy = p.y * numPoints;

            for (var j = 0; j < neighborIds.length; j++) {
                var b = tree.points[neighborIds[j]];
                // filter out neighbors that are too far or already processed
                if (zoom < b.zoom) {
                    foundNeighbors = true;
                    b.zoom = zoom; // save the zoom (so it doesn't get processed twice)
                    wx += b.x * b.numPoints; // accumulate coordinates for calculating weighted center
                    wy += b.y * b.numPoints;
                    numPoints += b.numPoints;
                }
            }

            clusters.push(foundNeighbors ? createCluster(wx / numPoints, wy / numPoints, numPoints, -1) : p);
        }

        return clusters;
    }
};

function createCluster(x, y, numPoints, id) {
    return {
        x: x, // weighted cluster center
        y: y,
        zoom: Infinity, // the last zoom the cluster was processed at
        id: id, // index of the source feature in the original input array
        numPoints: numPoints
    };
}

function createPointCluster(p, i) {
    var coords = p.geometry.coordinates;
    return createCluster(lngX(coords[0]), latY(coords[1]), 1, i);
}

function getClusterJSON(cluster) {
    return {
        type: 'Feature',
        properties: getClusterProperties(cluster),
        geometry: {
            type: 'Point',
            coordinates: [xLng(cluster.x), yLat(cluster.y)]
        }
    };
}

function getClusterProperties(cluster) {
    var count = cluster.numPoints;
    var abbrev = count >= 10000 ? Math.round(count / 1000) + 'k' :
                 count >= 1000 ? (Math.round(count / 100) / 10) + 'k' : count;
    return {
        cluster: true,
        point_count: count,
        point_count_abbreviated: abbrev
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

function extend(dest, src) {
    for (var id in src) dest[id] = src[id];
    return dest;
}

function getX(p) {
    return p.x;
}
function getY(p) {
    return p.y;
}
