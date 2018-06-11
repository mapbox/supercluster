import {uglify} from 'rollup-plugin-uglify';
import resolve from "rollup-plugin-node-resolve";

const config = (file, plugins) => ({
    input: 'index.js',
    output: {
        name: 'supercluster',
        format: 'umd',
        indent: false,
        file
    },
    plugins
});

export default [
    config('dist/supercluster.js', [resolve()]),
    config('dist/supercluster.min.js', [resolve(), uglify()])
];
