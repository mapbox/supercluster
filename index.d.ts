// Public types for supercluster

import type {BBox, Feature, GeoJsonProperties, MultiPoint, Point} from 'geojson';

/** A very fast geospatial point clustering library. */
declare class Supercluster<
    P extends GeoJsonProperties = Supercluster.AnyProps,
    C extends GeoJsonProperties = Supercluster.AnyProps,
> {
    constructor(options?: Supercluster.Options<P, C>);

    options: Readonly<Required<Supercluster.Options<P, C>>>;

    /** Loads an array of point (or multi-point) features. Once loaded, the index is immutable. */
    load(points: Supercluster.InputFeature<P>[]): this;

    /** Clusters and points for the given bbox (`[westLng, southLat, eastLng, northLat]`) and zoom. */
    getClusters(bbox: BBox, zoom: number): (Supercluster.ClusterFeature<C> | Supercluster.PointFeature<P>)[];

    /** A geojson-vt-compatible tile of cluster/point features, or `null` where there's no data. */
    getTile(zoom: number, x: number, y: number): Supercluster.Tile<C, P> | null;

    /** The same tile with coords inline (`type: 4`, `x`/`y`), matching geojson-vt's getTileRaw. */
    getTileRaw(zoom: number, x: number, y: number): Supercluster.RawTile<C, P> | null;

    /** The children of a cluster on the next zoom level. Throws if `clusterId` doesn't exist. */
    getChildren(clusterId: number): (Supercluster.ClusterFeature<C> | Supercluster.PointFeature<P>)[];

    /** All points of a cluster, with pagination support. */
    getLeaves(clusterId: number, limit?: number, offset?: number): Supercluster.PointFeature<P>[];

    /** The zoom on which a cluster expands into several children (useful for "click to zoom"). */
    getClusterExpansionZoom(clusterId: number): number;
}

// Merged into the class so both `import Supercluster, {type Options}` and the `Supercluster.Options`
// namespace access that `@types/supercluster` consumers already write keep resolving.
declare namespace Supercluster {
    /** Default properties type, allowing any properties. Prefer concrete types where you can. */
    export interface AnyProps { [name: string]: any; }

    // Constructor input: every field is optional and falls back to its default. The resolved set of
    // options, with defaults filled in, is what `Supercluster.options` exposes.
    export interface Options<P, C> {
        /** Minimum zoom level at which clusters are generated. @default 0 */
        minZoom?: number;
        /** Maximum zoom level at which clusters are generated; capped at 30. @default 16 */
        maxZoom?: number;
        /** Minimum number of points to form a cluster. @default 2 */
        minPoints?: number;
        /** Cluster radius, in pixels. @default 40 */
        radius?: number;
        /** (Tiles) Tile extent; radius is calculated relative to this value. @default 512 */
        extent?: number;
        /** Size of the KD-tree leaf node; affects performance. @default 64 */
        nodeSize?: number;
        /** Whether timing info should be logged. @default false */
        log?: boolean;
        /** Whether to generate ids for input features in vector tiles. @default false */
        generateId?: boolean;
        /** Cluster properties for a single point, e.g. `props => ({sum: props.myValue})`. Defaults to identity. */
        map?: (props: P) => C;
        /** Merges two clusters' properties, e.g. `(accumulated, props) => { accumulated.sum += props.sum; }` */
        reduce?: ((accumulated: C, props: Readonly<C>) => void) | null;
    }

    /** A GeoJSON Feature whose geometry is a Point — what getClusters and getLeaves hand back. */
    export type PointFeature<P> = Feature<Point, P>;

    /** Input features may also be MultiPoints, clustered as one individual point per coordinate. */
    export type InputFeature<P> = Feature<Point | MultiPoint, P>;

    export interface ClusterProperties {
        /** Always `true`, marking the feature as a cluster rather than an individual point. */
        cluster: true;
        cluster_id: number;
        point_count: number;
        /** `point_count` abbreviated as a string past 1000 (e.g. `1.3k`), the raw number below it. */
        point_count_abbreviated: string | number;
    }

    export type ClusterFeature<C> = PointFeature<ClusterProperties & C>;

    // An individual point's tags are its input feature's `properties`, passed through verbatim — hence
    // `undefined` for a feature that had none, which callers writing tags out must handle.
    export type TileTags<C, P> = (ClusterProperties & C) | P | undefined;

    /**
     * Nested envelope returned by getTile(). Coords are extent-scaled ints in tile space, and `tags`
     * (not `properties`) matches geojson-vt and gl-js's geojson_rt.ts.
     */
    export interface TileFeature<C, P> {
        id?: number | string;
        type: 1;
        geometry: [number, number][];
        tags: TileTags<C, P>;
    }

    export interface Tile<C, P> {
        features: TileFeature<C, P>[];
    }

    /**
     * Flat envelope returned by getTileRaw(), structurally a subset of geojson-vt's `RawFeature`: every
     * clustered feature is a lone point, so only the `type: 4` variant with inline `x`/`y` appears.
     */
    export interface RawFeature<C, P> {
        id?: number | string;
        type: 4;
        x: number;
        y: number;
        tags: TileTags<C, P>;
    }

    export interface RawTile<C, P> {
        readonly features: readonly RawFeature<C, P>[];
    }
}

export default Supercluster;
export type {
    AnyProps, ClusterFeature, ClusterProperties, InputFeature, Options,
    PointFeature, RawFeature, RawTile, Tile, TileFeature, TileTags,
} from './index.d.ts';
