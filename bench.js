// Memory + speed benchmark for supercluster.
//
// Run:  node --expose-gc bench.js
// To reduce noise, run multiple times and compare medians.
//
// Metrics:
//   alloc  held + Σ(bytes freed by GC during build), via v8.GCProfiler
//   peak   max usedHeapSize before any in-build GC
//   held   heapUsed + external after multi-pass forced GC, vs baseline

import v8 from 'v8';
import Supercluster from './index.js';

if (!global.gc) { console.error('run with --expose-gc'); process.exit(2); }

const N = 1_000_000;
const OPTS = {log: true, maxZoom: 17};

let points = [];
for (let i = 0; i < N; i++) {
    points.push({
        type: 'Feature',
        properties: {index: i},
        geometry: {type: 'Point', coordinates: [
            -180 + 360 * Math.random(),
            -80 + 160 * Math.random()
        ]}
    });
}

function settle() {
    for (let i = 0; i < 8; i++) global.gc();
}

function snap() {
    const m = process.memoryUsage();
    return m.heapUsed + m.external;
}

function fmt(b) {
    const mb = Math.abs(b) / (1024 * 1024);
    if (mb < 1) return `${(b / 1024).toFixed(0)} KB`;
    if (mb < 100) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024)).toFixed(0)} MB`;
}

settle();
const baseline = snap();

const prof = new v8.GCProfiler();
prof.start();
const idx = new Supercluster(OPTS).load(points);
points = null;
const stats = prof.stop().statistics;
const ext = process.memoryUsage().external;

let freed = 0;
let peakHeap = 0;
for (const e of stats) {
    const before = e.beforeGC.heapStatistics.usedHeapSize;
    const after = e.afterGC.heapStatistics.usedHeapSize;
    if (before > after) freed += before - after;
    if (before > peakHeap) peakHeap = before;
}

settle();
const held = snap() - baseline;
const alloc = held + freed;
const peak = peakHeap + ext - baseline;

console.log(`\nalloc: ${fmt(alloc)}`);
console.log(`peak:  ${fmt(peak)}`);
console.log(`held:  ${fmt(held + (idx.trees.length ? 0 : 0))}`);
