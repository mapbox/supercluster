// Memory + speed benchmark for supercluster.
//
// Run:  node --expose-gc bench.js
//
// Metrics:
//   ms     median build time
//   alloc  held + Σ(bytes freed by GC during build), via v8.GCProfiler
//   peak   max usedHeapSize before any in-build GC
//   held   heapUsed + external after multi-pass forced GC, vs baseline
//
// Each iteration's build runs inside buildAndMeasure() so the local `idx`
// goes away with the call frame on return. Without this, V8 keeps the
// previous iteration's index alive on the loop body's stack frame and
// `held` measures incorrectly (often near zero or negative).

import v8 from 'v8';
import Supercluster from './index.js';

if (!global.gc) { console.error('run with --expose-gc'); process.exit(2); }

const N = 1_000_000;
const ITER = 3;
const OPTS = {log: true, maxZoom: 17};

const points = [];
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

function buildAndMeasure(baseline) {
    const prof = new v8.GCProfiler();
    prof.start();
    const t0 = performance.now();
    const idx = new Supercluster(OPTS).load(points);
    const ms = performance.now() - t0;
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
    // feed a read of idx into the returned value; V8 can't elide a property
    // load whose result escapes, so idx stays live across settle()
    return {ms, alloc: held + freed, peak: peakHeap + ext - baseline, held, trees: idx.trees.length};
}

console.log(`--- warmup (${N.toLocaleString()} points, maxZoom ${OPTS.maxZoom}) ---`);
(function warmup() { new Supercluster(OPTS).load(points); })();
settle();
const baseline = snap();

const samples = [];
for (let i = 0; i < ITER; i++) {
    console.log(`\n--- iteration ${i + 1} of ${ITER} ---`);
    const s = buildAndMeasure(baseline);
    settle();
    console.log(`alloc=${fmt(s.alloc)}  peak=${fmt(s.peak)}  held=${fmt(s.held)}`);
    samples.push(s);
}

const pick = (key, agg) => agg(samples.map(s => s[key]));
const max = arr => Math.max(...arr);
const median = arr => arr.sort((a, b) => a - b)[arr.length >> 1];

console.log(`\n--- results (median ms/held, max alloc/peak across ${ITER} iterations) ---`);
console.log(`ms:    ${pick('ms', median).toFixed(0)}`);
console.log(`alloc: ${fmt(pick('alloc', max))}`);
console.log(`peak:  ${fmt(pick('peak', max))}`);
console.log(`held:  ${fmt(pick('held', median))}`);
