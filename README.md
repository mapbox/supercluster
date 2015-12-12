# supercluster [![Simply Awesome](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects) [![Build Status](https://travis-ci.org/mapbox/supercluster.svg?branch=master)](https://travis-ci.org/mapbox/supercluster)

A very fast JavaScript library for geospatial point clustering for browsers and Node. _A work in progress._

```js
var index = supercluster({
    radius: 40,
    maxZoom: 16
});

index.load(points);
```
