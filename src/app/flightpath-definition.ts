
import "leaflet";
import "leaflet-draw";
let L = require("leaflet");
let leafletDraw = require('leaflet-draw'); // Some stuff is not in the typings (yet). E.g. L.Draw.Polyline
interface LayerItem {
    name: string;
    value: L.TileLayer;
}


export class FlightpathDefinition {

    private _envelope: number[][] = [[]]; // an array of [x, y] values (polygon vertices)
    private _levelTriangles: number[] = []; // A non-efficient triangle mesh representation which lists for each triangle all three vertex coordinates (x,y,z) as an array like [t0x0, t0y0, t0z0, t0x1, t0y1, t0z1, t0x2, t0y2, t0z2, t1x0, t1y0, t1z0, ..., tnx2, tny2, tnz2] 

    constructor() {
    }

    get envelope(): number[][] {
        return this._envelope;
    }

    set envelope(env: number[][]) {
        this._envelope = null;
        this._envelope = env;
    }

    clearEnvelope(): void {
        this._envelope = [[]];
    }

    /**
     * Add a flight level triangle.
     * @param v1 the first tirangle vertex [lat, lon].
     * @param v2 the second triangle vertex [lat, lon].
     * @param v3 the third triangle vertex [lat, lon].
     * @param h1 the altitude relative to start position of the first vertex.
     * @param h2 the altitude relative to start position of the second vertex.
     * @param h3 the altitude relative to start position of the third vertex.
     */
    addFlightLevelTriangle(v1: number[], v2: number[], v3: number[], h1: number, h2: number, h3: number): void {
        this._levelTriangles.push(v1[0]); this._levelTriangles.push(v1[1]); this._levelTriangles.push(h1);
        this._levelTriangles.push(v2[0]); this._levelTriangles.push(v2[1]); this._levelTriangles.push(h2);
        this._levelTriangles.push(v3[0]); this._levelTriangles.push(v3[1]); this._levelTriangles.push(h3);
    }

    clearFlightLevel(): void {
        this._levelTriangles = [];
    }

}