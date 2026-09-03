// Compile-only check of the public types — `tsc --noEmit` in `pretest` is the assertion, nothing here
// runs. Lives at the root because `node --test` collects every `.ts` under `test/` and would report this
// as a test; a root name without a `-test`/`.test` suffix is left alone.

import Supercluster from './index.js';
import type {Options, AnyProps} from './index.js';

// Options is the constructor's input shape, so every field must stay optional: `{}` fails to compile the
// moment one becomes required. A partial literal is what `@types/supercluster` consumers already write.
const none: Options<AnyProps, AnyProps> = {};
const some: Options<AnyProps, AnyProps> = {radius: 60, extent: 8192};

const index = new Supercluster(some);
new Supercluster(none);
new Supercluster();

index.load([{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [0, 0]}}]);

// Resolved options, by contrast, have every field filled in.
const extent: number = index.options.extent;

// Both tile flavors are nullable; getTile nests coords in a geometry array, getTileRaw inlines them.
const tile = index.getTile(0, 0, 0);
if (tile) for (const f of tile.features) {
    const first: [number, number] = f.geometry[0];
    void first;
}

const rawTile = index.getTileRaw(0, 0, 0);
if (rawTile) for (const f of rawTile.features) {
    const xy: [number, number] = [f.x, f.y];
    void xy;
}

void extent;
