' script src="https://unpkg.com/supercluster@7.1.2/dist/supercluster.min.js"></script>
const index = new Supercluster({
    radius: 40,
    maxZoom: 16
});
index.load(points);
index.getClusters([-180, -85, 180, 85], 2);
