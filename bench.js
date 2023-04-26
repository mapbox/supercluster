
import Supercluster from './index.js';
import v8 from 'v8';

const points = [];
for (let i = 0; i < 1000000; i++) {
    points.push({
        type: 'Feature',
        properties: {
            index: i
        },
        geometry: {
            type: 'Point',
            coordinates: [
                -180 + 360 * Math.random(),
                -80 + 160 * Math.random()
            ]
        }
    });
}

global.gc();
const size = v8.getHeapStatistics().used_heap_size;

const index = new Supercluster({
    log: true,
    maxZoom: 6,
    // map: props => ({sum: props.index}),
    // reduce: (accumulated, props) => { accumulated.sum += props.sum; }
}).load(points);

global.gc();
console.log(`memory used: ${  Math.round((v8.getHeapStatistics().used_heap_size - size) / 1024)  } KB`);

index.getClusters([-180, -90, 180, 90], 0).map(f => JSON.stringify(f.properties));
