import KDBush from 'kdbush'

const defaultOptions = {
  minZoom: 0, // min zoom to generate clusters on
  maxZoom: 16, // max zoom level to cluster the points on
  radius: 40, // cluster radius in pixels
  extent: 1, // tile extent (radius is calculated relative to it)
  nodeSize: 64, // size of the KD-tree leaf node, affects performance
  log: false, // whether to log timing info

  // a reduce function for calculating custom cluster properties
  reduce: null, // (accumulated, props) => { accumulated.sum += props.sum; }

  // initial properties of a cluster (before running the reducer)
  initial: () => ({}), // () => ({sum: 0})

  // properties to use for individual points when running the reducer
  map: props => props, // props => ({sum: props.my_value})
  // for accessing x and y values when using Spacial Cluster
  getX: p => p.x,
  getY: p => p.y
}

class SpatialCluster {
  constructor(options) {
    this.options = extend(Object.create(defaultOptions), options)
    this.trees = new Array(this.options.maxZoom + 1)
  }

  load(points) {
    const { log, minZoom, maxZoom, nodeSize, getX, getY } = this.options

    if (log) console.time('total time')

    const timerId = `prepare ${points.length} points`
    if (log) console.time(timerId)

    this.points = points

    // generate a cluster object for each point and index input points into a KD-tree
    let clusters = []
    for (let i = 0; i < points.length; i++) {
      clusters.push(createPointCluster(points[i], i, getX, getY))
    }
    this.trees[maxZoom + 1] = new KDBush(clusters, p => p.x, p => p.y, nodeSize, Float32Array)

    if (log) console.timeEnd(timerId)

    // cluster points on max zoom, then cluster the results on previous zoom, etc.;
    // results in a cluster hierarchy across zoom levels
    for (let z = maxZoom; z >= minZoom; z--) {
      const now = +Date.now()

      // create a new set of clusters for the zoom and index them with a KD-tree
      clusters = this._cluster(clusters, z)
      this.trees[z] = new KDBush(clusters, p => p.x, p => p.y, nodeSize, Float32Array)

      if (log) console.log('z%d: %d clusters in %dms', z, clusters.length, +Date.now() - now)
    }

    if (log) console.timeEnd('total time')

    return this
  }

  getClusters(bbox, zoom) {
    const tree = this.trees[this._limitZoom(zoom)]
    const ids = tree.range(...bbox)
    const clusters = []
    for (const id of ids) {
      const c = tree.points[id]
      c.numPoints && clusters.push(getClusterJSON(c))
    }
    return clusters
  }

  getChildren(clusterId) {
    const originId = clusterId >> 5
    const originZoom = clusterId % 32
    const errorMsg = 'No cluster with the specified id.'

    const index = this.trees[originZoom]
    if (!index) throw new Error(errorMsg)

    const origin = index.points[originId]
    if (!origin) throw new Error(errorMsg)

    const r = this.options.radius / (this.options.extent * Math.pow(2, originZoom - 1))
    const ids = index.within(origin.x, origin.y, r)
    const children = []
    for (const id of ids) {
      const c = index.points[id]
      if (c.parentId === clusterId) {
        children.push(c.numPoints ? getClusterJSON(c) : this.points[c.index])
      }
    }

    if (children.length === 0) throw new Error(errorMsg)

    return children
  }

  getLeaves(clusterId, limit, offset) {
    limit = limit || 10
    offset = offset || 0

    const leaves = []
    this._appendLeaves(leaves, clusterId, limit, offset, 0)

    return leaves
  }

  getTile(z, x, y) {
    const tree = this.trees[this._limitZoom(z)]
    const z2 = Math.pow(2, z)
    const { extent, radius } = this.options
    const p = radius / extent
    const top = (y - p) / z2
    const bottom = (y + 1 + p) / z2

    const tile = {
      features: []
    }

    this._addTileFeatures(
      tree.range((x - p) / z2, top, (x + 1 + p) / z2, bottom),
      tree.points,
      x,
      y,
      z2,
      tile
    )

    if (x === 0) {
      this._addTileFeatures(tree.range(1 - p / z2, top, 1, bottom), tree.points, z2, y, z2, tile)
    }
    if (x === z2 - 1) {
      this._addTileFeatures(tree.range(0, top, p / z2, bottom), tree.points, -1, y, z2, tile)
    }

    return tile.features.length ? tile : null
  }

  getClusterExpansionZoom(clusterId) {
    let clusterZoom = (clusterId % 32) - 1
    while (clusterZoom < this.options.maxZoom) {
      const children = this.getChildren(clusterId)
      clusterZoom++
      if (children.length !== 1) break
      clusterId = children[0].properties.cluster_id
    }
    return clusterZoom
  }

  _appendLeaves(result, clusterId, limit, offset, skipped) {
    const children = this.getChildren(clusterId)

    for (const child of children) {
      const props = child.properties

      if (props && props.cluster) {
        if (skipped + props.point_count <= offset) {
          // skip the whole cluster
          skipped += props.point_count
        } else {
          // enter the cluster
          skipped = this._appendLeaves(result, props.cluster_id, limit, offset, skipped)
          // exit the cluster
        }
      } else if (skipped < offset) {
        // skip a single point
        skipped++
      } else {
        // add a single point
        result.push(child)
      }
      if (result.length === limit) break
    }

    return skipped
  }

  _addTileFeatures(ids, points, x, y, z2, tile) {
    for (const i of ids) {
      const c = points[i]
      const f = c.numPoints ? getClusterProperties(c) : this.points[c.index].properties
    }
    const id = c.numPoints ? c.id : this.points[c.index].id
    if (id !== undefined) {
      f.id = id
    }
    tile.features.push(f)
  }

  _limitZoom(z) {
    return Math.max(this.options.minZoom, Math.min(z, this.options.maxZoom + 1))
  }

  _cluster(points, zoom) {
    const clusters = []
    const { radius, extent, reduce, initial } = this.options
    const r = radius / (extent * Math.pow(2, zoom))

    // loop through each point
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      // if we've already visited the point at this zoom level, skip it
      if (p.zoom <= zoom) continue
      p.zoom = zoom

      // find all nearby points
      const tree = this.trees[zoom + 1]
      const neighborIds = tree.within(p.x, p.y, r)
      // debugger

      let numPoints = p.numPoints || 1
      let wx = p.x * numPoints
      let wy = p.y * numPoints

      let clusterProperties = null

      if (reduce) {
        clusterProperties = initial()
        this._accumulate(clusterProperties, p)
      }

      // encode both zoom and point index on which the cluster originated
      const id = (i << 5) + (zoom + 1)

      for (const neighborId of neighborIds) {
        const b = tree.points[neighborId]
        // filter out neighbors that are already processed
        if (b.zoom <= zoom) continue
        b.zoom = zoom // save the zoom (so it doesn't get processed twice)

        const numPoints2 = b.numPoints || 1
        wx += b.x * numPoints2 // accumulate coordinates for calculating weighted center
        wy += b.y * numPoints2

        numPoints += numPoints2
        b.parentId = id

        if (reduce) {
          this._accumulate(clusterProperties, b)
        }
      }

      if (numPoints === 1) {
        clusters.push(p)
      } else {
        p.parentId = id
        clusters.push(
          createCluster(wx / numPoints, wy / numPoints, id, numPoints, clusterProperties)
        )
      }
    }

    return clusters
  }

  _accumulate(clusterProperties, point) {
    const { map, reduce } = this.options
    const properties = point.numPoints ? point.properties : map(this.points[point.index].properties)
    reduce(clusterProperties, properties)
  }
}

function createCluster(x, y, id, numPoints, properties) {
  return {
    x, // weighted cluster center
    y,
    zoom: Infinity, // the last zoom the cluster was processed at
    id, // encodes index of the first child of the cluster and its zoom level
    parentId: -1, // parent cluster id
    numPoints,
    properties
  }
}

function createPointCluster(p, id, getX, getY) {
  const x = getX(p)
  const y = getY(p)
  return {
    x,
    y,
    zoom: Infinity, // the last zoom the point was processed at
    index: id, // index of the source feature in the original input array,
    parentId: -1 // parent cluster id
  }
}

function getClusterJSON(cluster) {
  return {
    id: cluster.id,
    properties: getClusterProperties(cluster),
    coordinates: [cluster.x, cluster.y]
  }
}

function getClusterProperties(cluster) {
  const count = cluster.numPoints
  const abbrev =
    count >= 10000
      ? `${Math.round(count / 1000)}k`
      : count >= 1000
        ? `${Math.round(count / 100) / 10}k`
        : count
  return extend(extend({}, cluster.properties), {
    cluster: true,
    cluster_id: cluster.id,
    point_count: count,
    point_count_abbreviated: abbrev
  })
}

function extend(dest, src) {
  for (const id in src) dest[id] = src[id]
  return dest
}

export default function spatialcluster(options) {
  return new SpatialCluster(options)
}
