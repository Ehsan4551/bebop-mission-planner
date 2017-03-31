
import "leaflet";
import "leaflet-draw";
let L = require("leaflet");
let leafletDraw = require('leaflet-draw'); // Some stuff is not in the typings (yet). E.g. L.Draw.Polyline
interface LayerItem {
    name: string;
    value: L.TileLayer;
}


export class FlightpathDefinition {

    private _envelope = null;

    constructor() {
    }

    get envelope(): any {
        return this._envelope;
    }

    set envelope(env: any) {
        if (this._envelope) {
            this._envelope.remove();
            this._envelope = null;
        }
        this._envelope = env;
    }

}