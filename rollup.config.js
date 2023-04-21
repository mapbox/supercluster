import terser from '@rollup/plugin-terser';
import resolve from "@rollup/plugin-node-resolve";

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

export default [
    config('dist/supercluster.js', [resolve()]),
    config('dist/supercluster.min.js', [resolve(), terser()])
];
