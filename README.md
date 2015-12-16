# supercluster [![Simply Awesome](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects) [![Build Status](https://travis-ci.org/mapbox/supercluster.svg?branch=master)](https://travis-ci.org/mapbox/supercluster)

A very fast JavaScript library for geospatial point clustering for browsers and Node. _A work in progress._

```js
var index = supercluster({
    radius: 40,
    maxZoom: 16
});
index.load(points);
index.getClusters([-180, -85, 180, 85], 2);
```

Clustering 6 million points in Leaflet:

![clusters2](https://cloud.githubusercontent.com/assets/25395/11857351/43407b46-a40c-11e5-8662-e99ab1cd2cb7.gif)
