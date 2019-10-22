import {terser} from 'rollup-plugin-terser';
import resolve from "rollup-plugin-node-resolve";
import buble from 'rollup-plugin-buble';

const config = (file, plugins) => ({
    input: 'index.js',
    output: {
        name: 'Supercluster',
        format: 'umd',
        indent: false,
        file
    },
    plugins
});

const bubleConfig = {transforms: {dangerousForOf: true}};

export default [
    config('dist/index.js', [resolve(), buble(bubleConfig)]),
    config('dist/index.min.js', [resolve(), terser(), buble(bubleConfig)])
];
