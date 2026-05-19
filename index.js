
import KDBush from 'kdbush';

const defaultOptions = {
    minZoom: 0,   // min zoom to generate clusters on
    maxZoom: 16,  // max zoom level to cluster the points on
    minPoints: 2, // minimum points to form a cluster
    radius: 40,   // cluster radius in pixels
    extent: 512,  // tile extent (radius is calculated relative to it)
    nodeSize: 64, // size of the KD-tree leaf node, affects performance
    log: false,   // whether to log timing info

    // whether to generate numeric ids for input features (in vector tiles)
    generateId: false,

    // a reduce function for calculating custom cluster properties
    reduce: null, // (accumulated, props) => { accumulated.sum += props.sum; }

    // properties to use for individual points when running the reducer
    map: props => props // props => ({sum: props.my_value})
};

// Int32 encoding of source coords in [0, 1]: (coord - 0.5) * SCALE in [-2^29, 2^29].
// Keeps every stored value AND sqDist subtractions inside V8's 31-bit SMI fast path.
const SCALE = 0x40000000; // 2^30
const INV_SCALE = 1 / SCALE;
const encode = c => (c - 0.5) * SCALE;
const decode = v => v * INV_SCALE + 0.5;

const OFFSET_ZOOM = 2;
const OFFSET_ID = 3;
const OFFSET_PARENT = 4;
const OFFSET_NUM = 5;
const OFFSET_PROP = 6;

export default class Supercluster {
    constructor(options) {
        this.options = Object.assign(Object.create(defaultOptions), options);
        this.trees = new Array(this.options.maxZoom + 1);
        this.stride = this.options.reduce ? 7 : 6;
        this.clusterProps = [];
    }

    load(points) {
        const {log, minZoom, maxZoom} = this.options;

        if (log) console.time('total time');

        const notProcessed = maxZoom + 1; // sentinel for "not yet processed at any zoom"
        const timerId = `z${notProcessed}: ${points.length} points`;
        if (log) console.time(timerId);

        this.numPoints = points.length;
        const stride = this.stride;

        // retain only per-point fields used by output paths; drop the GeoJSON wrappers
        const props = this.props = new Array(points.length);
        // original Float64 mercator coords for drift-free single-point output
        const coords = this.coords = new Float64Array(points.length * 2);
        let ids = null;

        // generate a cluster object for each point and index input points into a KD-tree
        const data = new Int32Array(points.length * stride);
        let w = 0;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (!p.geometry) continue;

            const [lng, lat] = p.geometry.coordinates;
            const px = lngX(lng);
            const py = latY(lat);
            coords[2 * i] = px;
            coords[2 * i + 1] = py;
            // store internal point/cluster data in flat typed arrays for performance
            writeSlot(data, w, encode(px), encode(py), notProcessed, i, 1);
            props[i] = p.properties;
            if (p.id !== undefined) {
                if (!ids) ids = new Array(points.length);
                ids[i] = p.id;
            }
            w += stride;
        }
        this.ids = ids;
        const numInput = w / stride;
        const inputSlab = w === data.length ? data : data.subarray(0, w);
        let prev = inputSlab;
        let prevNum = numInput;
        let tree = this.trees[maxZoom + 1] = this._createTree(prev, prevNum);

        if (log) console.timeEnd(timerId);

        // cluster points on max zoom, then cluster the results on previous zoom, etc.;
        // results in a cluster hierarchy across zoom levels
        for (let z = maxZoom; z >= minZoom; z--) {
            const now = performance.now();

            // allocate a tight Int32 slab for this zoom; output is strictly <= input length
            const out = new Int32Array(prevNum * stride);
            const written = this._cluster(prev, prevNum, z, out);
            tree = this.trees[z] = this._createTree(out, written);
            prev = out;
            prevNum = written;

            if (log) console.log(`z${z}: ${tree.numItems} clusters in ${(performance.now() - now).toFixed(2)}ms`);
        }

        if (log) console.timeEnd('total time');

        return this;
    }

    getClusters(bbox, zoom) {
        let minLng = ((bbox[0] + 180) % 360 + 360) % 360 - 180;
        const minLat = Math.max(-90, Math.min(90, bbox[1]));
        let maxLng = bbox[2] === 180 ? 180 : ((bbox[2] + 180) % 360 + 360) % 360 - 180;
        const maxLat = Math.max(-90, Math.min(90, bbox[3]));

        if (bbox[2] - bbox[0] >= 360) {
            minLng = -180;
            maxLng = 180;
        } else if (minLng > maxLng) {
            const easternHem = this.getClusters([minLng, minLat, 180, maxLat], zoom);
            const westernHem = this.getClusters([-180, minLat, maxLng, maxLat], zoom);
            return easternHem.concat(westernHem);
        }

        const tree = this.trees[this._limitZoom(zoom)];
        const ids = tree.range(encode(lngX(minLng)), encode(latY(maxLat)), encode(lngX(maxLng)), encode(latY(minLat)));
        const data = tree.data;
        const clusters = [];
        for (const id of ids) {
            const k = this.stride * id;
            clusters.push(data[k + OFFSET_NUM] > 1 ? getClusterJSON(data, k, this.clusterProps) : this._pointJSON(data, k));
        }
        return clusters;
    }

    getChildren(clusterId) {
        const originId = this._getOriginId(clusterId);
        const originZoom = this._getOriginZoom(clusterId);
        const errorMsg = 'No cluster with the specified id.';

        const tree = this.trees[originZoom];
        if (!tree) throw new Error(errorMsg);

        const data = tree.data;
        if (originId >= tree.numItems) throw new Error(errorMsg);

        const r = this.options.radius / (this.options.extent * Math.pow(2, originZoom - 1));
        const x = data[originId * this.stride];
        const y = data[originId * this.stride + 1];
        const ids = tree.within(x, y, r * SCALE);
        const children = [];
        for (const id of ids) {
            const k = id * this.stride;
            if (data[k + OFFSET_PARENT] === clusterId) {
                children.push(data[k + OFFSET_NUM] > 1 ? getClusterJSON(data, k, this.clusterProps) : this._pointJSON(data, k));
            }
        }

        if (children.length === 0) throw new Error(errorMsg);

        return children;
    }

    getLeaves(clusterId, limit, offset) {
        limit = limit || 10;
        offset = offset || 0;

        const leaves = [];
        this._appendLeaves(leaves, clusterId, limit, offset, 0);

        return leaves;
    }

    getTile(z, x, y) {
        const tree = this.trees[this._limitZoom(z)];
        const z2 = Math.pow(2, z);
        const {extent, radius} = this.options;
        const p = radius / extent;
        const top = encode((y - p) / z2);
        const bottom = encode((y + 1 + p) / z2);

        const tile = {features: []};

        this._addTileFeatures(
            tree.range(encode((x - p) / z2), top, encode((x + 1 + p) / z2), bottom),
            tree.data, x, y, z2, tile);

        if (x === 0) {
            this._addTileFeatures(
                tree.range(encode(1 - p / z2), top, encode(1), bottom),
                tree.data, z2, y, z2, tile);
        }
        if (x === z2 - 1) {
            this._addTileFeatures(
                tree.range(encode(0), top, encode(p / z2), bottom),
                tree.data, -1, y, z2, tile);
        }

        return tile.features.length ? tile : null;
    }

    getClusterExpansionZoom(clusterId) {
        let expansionZoom = this._getOriginZoom(clusterId) - 1;
        while (expansionZoom <= this.options.maxZoom) {
            const children = this.getChildren(clusterId);
            expansionZoom++;
            if (children.length !== 1) break;
            clusterId = children[0].properties.cluster_id;
        }
        return expansionZoom;
    }

    _appendLeaves(result, clusterId, limit, offset, skipped) {
        const children = this.getChildren(clusterId);

        for (const child of children) {
            const props = child.properties;

            if (props && props.cluster) {
                if (skipped + props.point_count <= offset) {
                    // skip the whole cluster
                    skipped += props.point_count;
                } else {
                    // enter the cluster
                    skipped = this._appendLeaves(result, props.cluster_id, limit, offset, skipped);
                    // exit the cluster
                }
            } else if (skipped < offset) {
                // skip a single point
                skipped++;
            } else {
                // add a single point
                result.push(child);
            }
            if (result.length === limit) break;
        }

        return skipped;
    }

    _createTree(data, numItems) {
        const tree = new KDBush(numItems, this.options.nodeSize, Int32Array);
        const stride = this.stride;
        for (let i = 0; i < numItems; i++) tree.add(data[i * stride], data[i * stride + 1]);
        tree.finish();
        tree.data = data;
        return tree;
    }

    _addTileFeatures(ids, data, x, y, z2, tile) {
        for (const i of ids) {
            const k = i * this.stride;
            const isCluster = data[k + OFFSET_NUM] > 1;

            let tags, px, py;
            if (isCluster) {
                tags = getClusterProperties(data, k, this.clusterProps);
                px = decode(data[k]);
                py = decode(data[k + 1]);
            } else {
                const origIndex = data[k + OFFSET_ID];
                tags = this.props[origIndex];
                px = this.coords[2 * origIndex];
                py = this.coords[2 * origIndex + 1];
            }

            const f = {
                type: 1,
                geometry: [[
                    Math.round(this.options.extent * (px * z2 - x)),
                    Math.round(this.options.extent * (py * z2 - y))
                ]],
                tags
            };

            // assign id
            let id;
            if (isCluster || this.options.generateId) {
                // optionally generate id for points
                id = data[k + OFFSET_ID];
            } else if (this.ids) {
                // keep id if already assigned
                id = this.ids[data[k + OFFSET_ID]];
            }

            if (id !== undefined) f.id = id;

            tile.features.push(f);
        }
    }

    _limitZoom(z) {
        return Math.max(this.options.minZoom, Math.min(Math.floor(+z), this.options.maxZoom + 1));
    }

    _cluster(data, numItems, zoom, out) {
        const {radius, extent, reduce, minPoints, maxZoom} = this.options;
        const r = radius / (extent * (1 << zoom)) * SCALE;
        const notProcessed = maxZoom + 1;
        const tree = this.trees[zoom + 1];
        const stride = this.stride;
        const limit = numItems * stride;
        const neighborIds = new Uint32Array(numItems);
        let cursor = 0;

        // loop through each point
        for (let i = 0; i < limit; i += stride) {
            // if we've already visited the point at this zoom level, skip it
            if (data[i + OFFSET_ZOOM] <= zoom) continue;
            data[i + OFFSET_ZOOM] = zoom;

            // find all nearby points
            const x = data[i];
            const y = data[i + 1];
            const neighborCount = tree.withinInto(x, y, r, neighborIds);

            const numPointsOrigin = data[i + OFFSET_NUM];
            let numPoints = numPointsOrigin;

            // count the number of points in a potential cluster
            for (let n = 0; n < neighborCount; n++) {
                const k = neighborIds[n] * stride;
                // filter out neighbors that are already processed
                if (data[k + OFFSET_ZOOM] > zoom) numPoints += data[k + OFFSET_NUM];
            }

            // if there were neighbors to merge, and there are enough points to form a cluster
            if (numPoints > numPointsOrigin && numPoints >= minPoints) {
                let wx = x * numPointsOrigin;
                let wy = y * numPointsOrigin;

                let clusterProperties;
                let clusterPropIndex = -1;

                // encode both zoom and point index on which the cluster originated -- offset by total length of features
                const id = ((i / stride | 0) << 5) + (zoom + 1) + this.numPoints;

                for (let n = 0; n < neighborCount; n++) {
                    const k = neighborIds[n] * stride;

                    if (data[k + OFFSET_ZOOM] <= zoom) continue;
                    data[k + OFFSET_ZOOM] = zoom; // save the zoom (so it doesn't get processed twice)

                    const numPoints2 = data[k + OFFSET_NUM];
                    wx += data[k] * numPoints2; // accumulate coordinates for calculating weighted center
                    wy += data[k + 1] * numPoints2;

                    data[k + OFFSET_PARENT] = id;

                    if (reduce) {
                        if (!clusterProperties) {
                            clusterProperties = this._map(data, i, true);
                            clusterPropIndex = this.clusterProps.length;
                            this.clusterProps.push(clusterProperties);
                        }
                        reduce(clusterProperties, this._map(data, k));
                    }
                }

                data[i + OFFSET_PARENT] = id;
                writeSlot(out, cursor, wx / numPoints, wy / numPoints, notProcessed, id, numPoints, reduce ? clusterPropIndex : undefined);
                cursor += stride;

            } else { // left points as unclustered
                for (let j = 0; j < stride; j++) out[cursor + j] = data[i + j];
                cursor += stride;

                if (numPoints > 1) {
                    for (let n = 0; n < neighborCount; n++) {
                        const k = neighborIds[n] * stride;
                        if (data[k + OFFSET_ZOOM] <= zoom) continue;
                        data[k + OFFSET_ZOOM] = zoom;
                        for (let j = 0; j < stride; j++) out[cursor + j] = data[k + j];
                        cursor += stride;
                    }
                }
            }
        }

        return cursor / stride;
    }

    // get index of the point from which the cluster originated
    _getOriginId(clusterId) {
        return (clusterId - this.numPoints) >> 5;
    }

    // get zoom of the point from which the cluster originated
    _getOriginZoom(clusterId) {
        return (clusterId - this.numPoints) % 32;
    }

    _pointJSON(data, k) {
        const origIndex = data[k + OFFSET_ID];
        const f = {
            type: 'Feature',
            properties: this.props[origIndex],
            geometry: {
                type: 'Point',
                coordinates: [xLng(this.coords[2 * origIndex]), yLat(this.coords[2 * origIndex + 1])]
            }
        };
        if (this.ids && this.ids[origIndex] !== undefined) f.id = this.ids[origIndex];
        return f;
    }

    _map(data, i, clone) {
        if (data[i + OFFSET_NUM] > 1) {
            const props = this.clusterProps[data[i + OFFSET_PROP]];
            return clone ? Object.assign({}, props) : props;
        }
        const original = this.props[data[i + OFFSET_ID]];
        const result = this.options.map(original);
        return clone && result === original ? Object.assign({}, result) : result;
    }
}

// write one stride-tuple (cluster or input point) into a typed slab
function writeSlot(data, k, x, y, zoom, id, num, propIndex) {
    data[k]     = x;
    data[k + 1] = y;
    data[k + 2] = zoom;
    data[k + 3] = id;
    data[k + 4] = -1; // parent cluster id
    data[k + 5] = num;
    if (propIndex !== undefined) data[k + 6] = propIndex;
}

function getClusterJSON(data, i, clusterProps) {
    return {
        type: 'Feature',
        id: data[i + OFFSET_ID],
        properties: getClusterProperties(data, i, clusterProps),
        geometry: {
            type: 'Point',
            coordinates: [xLng(decode(data[i])), yLat(decode(data[i + 1]))]
        }
    };
}

function getClusterProperties(data, i, clusterProps) {
    const count = data[i + OFFSET_NUM];
    const abbrev =
        count >= 10000 ? `${Math.round(count / 1000)  }k` :
        count >= 1000 ? `${Math.round(count / 100) / 10  }k` : count;
    const propIndex = data[i + OFFSET_PROP];
    const properties = propIndex === -1 ? {} : Object.assign({}, clusterProps[propIndex]);

    return Object.assign(properties, {
        cluster: true,
        'cluster_id': data[i + OFFSET_ID],
        'point_count': count,
        'point_count_abbreviated': abbrev
    });
}

// longitude/latitude to spherical mercator in [0..1] range
function lngX(lng) {
    return lng / 360 + 0.5;
}
function latY(lat) {
    const sin = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return y < 0 ? 0 : y > 1 ? 1 : y;
}

// spherical mercator to longitude/latitude
function xLng(x) {
    return (x - 0.5) * 360;
}
function yLat(y) {
    const y2 = (180 - y * 360) * Math.PI / 180;
    return 360 * Math.atan(Math.exp(y2)) / Math.PI - 90;
}
