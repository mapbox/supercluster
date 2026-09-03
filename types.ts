// Compile-only check of the public types — `tsc --noEmit` in `pretest` is the assertion, nothing here
// runs. Lives at the root because `node --test` collects every `.ts` under `test/` and would report this
// as a test; a root name without a `-test`/`.test` suffix is left alone. Each `@ts-expect-error` is
// self-verifying: TS reports an unused directive if the line it guards ever starts compiling.

import Supercluster from './index.js';
import type {ClusterFeature, ClusterProperties, Options, PointFeature} from './index.js';

interface Place { name: string; population: number; }
interface Totals { population: number; }

// Options is the constructor's input shape, so every field must stay optional: `{}` fails to compile the
// moment one becomes required. A partial literal is what `@types/supercluster` consumers already write.
const empty: Options<Place, Totals> = {};
new Supercluster(empty);
new Supercluster();

// The map/reduce pair is where the two type parameters have to line up: `map` takes the input feature's
// own properties (P) and returns the cluster accumulator (C), and `reduce` sees only C on both sides.
const index = new Supercluster<Place, Totals>({
    radius: 60,
    extent: 8192,
    map: props => ({population: props.population}),
    reduce: (accumulated, props) => { accumulated.population += props.population; },
});

// `map` must return C — and since Place structurally satisfies Totals, only a return missing the
// accumulator field outright is rejected.
// @ts-expect-error
new Supercluster<Place, Totals>({map: props => ({name: props.name})});
// `reduce` accumulates C, so P-only fields aren't there to read.
// @ts-expect-error
new Supercluster<Place, Totals>({reduce: (acc, props) => { acc.population += props.name.length; }});
// A property outside P isn't readable in `map`.
// @ts-expect-error
new Supercluster<Place, Totals>({map: props => ({population: props.elevation})});
// `reduce: null` is what the default resolves to, so it must stay assignable.
new Supercluster<Place, Totals>({reduce: null});

// Point and MultiPoint input both load; resolved options have every field filled in.
index.load([
    {type: 'Feature', properties: {name: 'a', population: 5}, geometry: {type: 'Point', coordinates: [0, 0]}},
    {type: 'Feature', properties: {name: 'b', population: 5}, geometry: {type: 'MultiPoint', coordinates: [[0, 0], [1, 1]]}},
]);
const extent: number = index.options.extent;

// getClusters returns a union: clusters carry ClusterProperties & C, individual points carry P.
// getChildren narrows the same way, and getLeaves is always individual points.
for (const f of index.getClusters([-180, -90, 180, 90], 3)) {
    if ('cluster' in f.properties) {
        const cluster: ClusterProperties & Totals = f.properties;
        const total: number = cluster.population + cluster.point_count;
    } else {
        const point: Place = f.properties;
    }
}
const children: (ClusterFeature<Totals> | PointFeature<Place>)[] = index.getChildren(0);
const leaves: PointFeature<Place>[] = index.getLeaves(0, 10, 0);

// Both tile flavors are nullable; getTile nests coords in a geometry array, getTileRaw inlines them.
// Tags are null or undefined for an input feature whose `properties` was null or absent, so they need a
// guard before use — the unguarded assignment below must not compile.
const tile = index.getTile(0, 0, 0);
if (tile) for (const f of tile.features) {
    const coords: [number, number] = f.geometry[0];
    // @ts-expect-error
    const unguarded: (ClusterProperties & Totals) | Place = f.tags;
    if (f.tags) { const tags: (ClusterProperties & Totals) | Place = f.tags; }
}

const rawTile = index.getTileRaw(0, 0, 0);
if (rawTile) for (const f of rawTile.features) {
    const coords: [number, number] = [f.x, f.y];
    if (f.tags) { const tags: (ClusterProperties & Totals) | Place = f.tags; }
}
