import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import { SelectItem } from 'primeng/primeng';
import { Flightplan, Waypoint } from './flightplan';
import * as fileSaver from "file-saver";

// Leaflet dependencies
import "leaflet";
import "leaflet-draw";
let L = require("leaflet");
let leafletDraw = require('leaflet-draw'); // Some stuff is not in the typings (yet). E.g. L.Draw.Polyline

// Geolib
let geolib = require('geolib');

export class FlightplanViewModel {

    // The flightplan this model is connected to
    private _flightplan = null; // can be null

    // The map this view is placed on
    private _map: L.Map = null;

    // Layergroup on which all features of this model live
    private _drawnItems = L.featureGroup(); // FeatureGroup is to store editable layers

    // Flight waypoint trajectory
    private _flightplanPolyline: L.Polyline = null;
    private _flightplanWaypoints: L.Circle[] = [];
    private _flightplanBearings: L.Polyline[] = [];
    private _flightplanWaypointMarkers: L.Marker[] = [];
    private _flightplanTakeoffMarker: L.Marker = null;
    private _flightplanTouchdownMarker: L.Marker = null;
    private _iconTakeoff = null;
    private _iconTouchdown = null;
    private _selectedWaypointIndex: number = -1; // none
    private _selectedWaypoint: Waypoint = null;

    // Flight level
    private _flightLevelPoints = []; // array of L.Marker
    private _selectedFlightLevelPoint = null; // a L.Marker from above array
    private _addingFlightLevelPoints: boolean = false;
    private _selectedFlightLevelDefaultAltitude = 8;

    // Path refinement
    private _selectedWaypointDistance: number = 5;

    // Flight level point handler
    private _flightlevelPointsDrawer = null;

    // FlightpathDefinition (might go into separate path view model later..)
    private _polygonDrawer = null;

    // Custom layer L.Layer attributes
    private _tagFlightLevelPoint: string = 'flight-level-point';
    private _tagFlightEnvelope: string = 'flight-envelope-polygon';
    private _tagFlightplanPolyline: string = 'flight-plan-polyline';
    private _tagTakeoffPoint: string = 'take-off-point';
    private _tagTouchdownPoint: string = 'touch-down-point';
    private _tagWaypointCircle: string = 'waypoint-circle';

    // TODO: Stuff which should belong to a view-model of the flightpath defintion model.
    private _addingEnvelope: boolean = false;
    private _polygon = null; // a L.Polygon

    // Waypoint attributes applicable to all waypoints
    private _selectedBearing: number = 0;
    private _selectedWaypointRadius: number = 2;
    private _selectedAltitude = 8;

    // Error reporter
    private _obsErrors: Subject<string> = new Subject<string>();
    // Warning reporter
    private _obsWarnings: Subject<string> = new Subject<string>();

    // Visualization options
    private _drawWaypointsOn: boolean = true;
    private _drawTouchdownOn: boolean = true;
    private _drawTakeoffOn: boolean = true;

    constructor(flightplan: Flightplan, map: L.Map) {

        // Set the flightplan this model observes
        this._flightplan = flightplan;

        // Subscribe to flightplan changes
        this.subscribeToFlightplanChanges();

        this._map = map; // Add the feature group layer of the flight plan view model to the map
        this._map.addLayer(this.featureGroup); // Add the feature group of this view model to the map

        // Create a polygon handler
        this._polygonDrawer = new L.Draw.Polygon(this._map);

        // Create point handler
        this._flightlevelPointsDrawer = new L.Draw.Marker(this._map);
        this._flightlevelPointsDrawer.options.repeatMode = true;

        // Create marker icons
        this._iconTakeoff = L.icon({
            iconUrl: 'assets/img/takeoff.png',
            iconSize: [28, 28], // size of the icon
            iconAnchor: [14, 14], // point of the icon which will correspond to marker's location
            popupAnchor: [-3, -76] // point from which the popup should open relative to the iconAnchor
        });
        this._iconTouchdown = L.icon({
            iconUrl: 'assets/img/touchdown.png',
            iconSize: [28, 28], // size of the icon
            iconAnchor: [14, 14], // point of the icon which will correspond to marker's location
            popupAnchor: [-3, -76] // point from which the popup should open relative to the iconAnchor
        });

        // If clicking on one of the features drawn with leaflet-draw.
        this._drawnItems.on('click', (e: any) => {
            let layer = e.layer;
            if (layer.hasOwnProperty("tag")) {
                if (layer.tag === this._tagFlightEnvelope) {
                    this.toggleEditFlightPolygon(layer);
                }
                else if (layer.tag === this._tagFlightLevelPoint) {
                    this.toggleEditFlightLevelPoint(layer);
                }
                else if (layer.tag === this._tagFlightplanPolyline) {
                    this.toggleEditFlightplanPolyline();
                }
                else if (layer.tag === this._tagTakeoffPoint) {
                    this.toggleEditTakeoffPoint();
                }
                else if (layer.tag === this._tagTouchdownPoint) {
                    this.toggleEditTouchdownPoint();
                }
                else if (layer.tag === this._tagWaypointCircle) {
                    this.toggleEditWaypoint(layer.index);
                }
            }
        });

        // When things are drawn with the drawer objects.
        this._map.on(L.Draw.Event.CREATED, (e: any) => {
            let type = e.layerType;
            let layer = e.layer; // a layer is a shape e.g. a Polyline
            if (type === 'marker') {
                if (this.addingFlightLevelPoints) {
                    this.addFlightLevelPoint(layer);
                }
            }
            else if (type === 'polygon') {
                if (this.addingEnvelope) {
                    this.addEnvelope(layer);
                }
            }
            this.featureGroup.addLayer(layer);
        });
    }

    resetFlightplan(flightplan: Flightplan): void {
        this._flightplan = flightplan; // can be null
        this.redrawFlightplan();
        this.centerMapOnTakeoff();
        this.subscribeToFlightplanChanges();
    }

    /**
     * Return an observable reporting errors
     */
    errors(): Observable<string> {
        return this._obsErrors;
    }

    /**
     * Return an observable reporting warning messages.
     */
    warnings(): Observable<string> {
        return this._obsWarnings;
    }

    /**
     * Return the layer on which view model features are drawn. Is a L.featureGroup.
     */
    get featureGroup(): any {
        return this._drawnItems;
    }

    get selectedFlightLevelPoint(): any {
        return this._selectedFlightLevelPoint;
    }

    get selectedFlightLevelDefaultAltitude(): number {
        return this._selectedFlightLevelDefaultAltitude;
    }

    set selectedFlightLevelDefaultAltitude(alt: number) {
        this._selectedFlightLevelDefaultAltitude = alt;
    }

    get addingFlightLevelPoints(): boolean {
        return this._addingFlightLevelPoints;
    }

    get selectedWaypointDistance(): number {
        return this._selectedWaypointDistance;
    }

    set selectedWaypointDistance(dist: number) {
        this._selectedWaypointDistance = dist;
    }

    get selectedWaypointRadius(): number {
        return this._selectedWaypointRadius;
    }

    set selectedWaypointRadius(radius: number) {
        this._selectedWaypointRadius = radius;
    }

    get selectedAltitude(): number {
        return this._selectedAltitude;
    }

    set selectedAltitude(alt: number) {
        this._selectedAltitude = alt;
    }

    get selectedBearing(): number {
        return this._selectedBearing;
    }

    set selectedBearing(bear: number) {
        this._selectedBearing = bear;
    }

    set drawWaypointsOn(dotIt: boolean) {
        this._drawWaypointsOn = dotIt;
        this.redrawFlightplanWaypoints();
    }

    get drawWaypointsOn(): boolean {
        return this._drawWaypointsOn;
    }

    set drawTouchdownOn(dotIt: boolean) {
        this._drawTouchdownOn = dotIt;
        this.redrawFlightplanTouchDownPosition();
    }

    get drawTouchdownOn(): boolean {
        return this._drawTouchdownOn;
    }

    set drawTakeoffOn(dotIt: boolean) {
        this._drawTakeoffOn = dotIt;
        this.redrawFlightplanTakeoffPosition();
    }

    get drawTakeoffOn(): boolean {
        return this._drawTakeoffOn;
    }

    /**
     * Is -1 if none is selected.
     */
    get selectedWaypointIndex(): number {
        return this._selectedWaypointIndex;
    }

    /**
     * Is the selected waypoint or null.
     */
    get selectedWaypoint(): Waypoint {
        return this._selectedWaypoint;
    }


    private redrawFlightplanTakeoffPosition(): void {
        if (this._flightplanTakeoffMarker) {
            this._flightplanTakeoffMarker.remove();
            this._flightplanTakeoffMarker = null;
        }
        if (this._drawTakeoffOn) {
            if (this._flightplan) {
                this._flightplanTakeoffMarker = L.marker([this._flightplan.takeOffPosition.latitude, this._flightplan.takeOffPosition.longitude], { icon: this._iconTakeoff });
                (<any>this._flightplanTakeoffMarker).tag = this._tagTakeoffPoint; // add a tag, so later we know what this is
                this._drawnItems.addLayer(this._flightplanTakeoffMarker);
            }
        }
    }

    private redrawFlightplanTouchDownPosition(): void {
        if (this._flightplanTouchdownMarker) {
            this._flightplanTouchdownMarker.remove();
            this._flightplanTouchdownMarker = null;
        }
        if (this._drawTouchdownOn) {
            if (this._flightplan) {
                this._flightplanTouchdownMarker = L.marker([this._flightplan.touchDownPosition.latitude, this._flightplan.touchDownPosition.longitude], { icon: this._iconTouchdown });
                (<any>this._flightplanTouchdownMarker).tag = this._tagTouchdownPoint; // add a tag, so later we know what this is
                this._drawnItems.addLayer(this._flightplanTouchdownMarker);
            }
        }
    }

    private redrawFlightplanWaypoints(): void {

        // Remove any previous flightplan drawing from the map.
        if (this._flightplanPolyline) {
            this._flightplanPolyline.remove();
            this._flightplanPolyline = null;
        }
        this._flightplanWaypoints.forEach((wp) => {
            wp.remove();
            wp = null;
        });
        this._flightplanWaypoints = [];
        this._flightplanBearings.forEach((bb) => {
            bb.remove();
            bb = null;
        });
        this._flightplanBearings = [];
        this._flightplanWaypointMarkers.forEach((mm) => {
            mm.remove();
            mm = null;
        });
        this._flightplanWaypointMarkers = [];

        // Render new flight plan if a valid one was passed.
        if (this._flightplan) {
            // Create array of LatLng from flightplan waypoints
            let lla: L.LatLng[] = [];

            // Don't draw this for now // Take-off position
            // lla.push(L.latLng(this._flightplan.takeOffPosition.latitude, this._flightplan.takeOffPosition.longitude, 0));

            // waypoints
            this._flightplan.waypoints.forEach(wp => {
                lla.push(L.latLng(wp.latitude, wp.longitude, 0));
            });

            // Don't draw this for now  // Touchdown position
            // lla.push(L.latLng(this._flightplan.touchDownPosition.latitude, this._flightplan.touchDownPosition.longitude, 0));

            // Add the polyline to the map
            this._flightplanPolyline = L.polyline(lla, { color: "red", lineJoin: "round", lineCap: "butt" }); // .addTo(this._map);
            (<any>this._flightplanPolyline).tag = this._tagFlightplanPolyline; // add a tag, so later we know what this is
            this._drawnItems.addLayer(this._flightplanPolyline);

            if (this._drawWaypointsOn) {

                // Add a waypoint radius for each waypoint
                for (let i = 0; i < this._flightplan.numWaypoints; i++) {
                    let wp: Waypoint = this._flightplan.waypoints[i];
                    let center = new L.LatLng(wp.latitude, wp.longitude);
                    let wpCircle = L.circle(center, wp.radius);
                    wpCircle.index = i;
                    wpCircle.tag = this._tagWaypointCircle;
                    if (i === this._selectedWaypointIndex) {
                        wpCircle.setStyle({ color: 'yellow' }); // set to highlighted style
                    }
                    this._drawnItems.addLayer(wpCircle);
                    this._flightplanWaypoints.push(wpCircle);
                }

                // Add bearing indicator for each waypoint
                for (let i = 0; i < this._flightplan.numWaypoints; i++) {
                    let wp: Waypoint = this._flightplan.waypoints[i];
                    let endpoint = geolib.computeDestinationPoint(wp, wp.radius * 2.0, wp.orientation);
                    let line: L.LatLng[] = [];
                    line.push(L.latLng(wp.latitude, wp.longitude));
                    line.push(L.latLng(endpoint.latitude, endpoint.longitude));
                    let bearingLine = L.polyline(line, { color: "yellow", lineJoin: "round", lineCap: "butt" });
                    bearingLine.index = i;
                    this._flightplanBearings.push(bearingLine.addTo(this._map));
                }

                // Add waypoint markers (to carry a popup)
                for (let i = 0; i < this._flightplan.numWaypoints; i++) {
                    let wp: Waypoint = this._flightplan.waypoints[i];
                    let endpoint = geolib.computeDestinationPoint(wp, wp.radius * 2.0, wp.orientation);
                    let center: L.LatLng = L.latLng(wp.latitude, wp.longitude);
                    let marker = L.marker([wp.latitude, wp.longitude], { opacity: 0.01 }); //opacity may be set to zero
                    marker.index = i;
                    marker.bindTooltip("WP: " + i.toString() + ", Altitude: " + wp.altitude.toString(), { permanent: false, className: "my-label", offset: [0, 0] });
                    this._flightplanWaypointMarkers.push(marker.addTo(this._map));
                }
            }
        }
    }


    /**
     * Recreates the entire view model states from the flightplan model and draws it on the map.
     * If the current flightplan is null, an empty state results an nothing is drawn.
     */
    private redrawFlightplan(): void {
        this.redrawFlightplanTakeoffPosition();
        this.redrawFlightplanTouchDownPosition();
        this.redrawFlightplanWaypoints();
    }

    // Center map on take-off location
    centerMapOnTakeoff(): void {
        if (this._flightplan) {
            this._map.panTo(L.latLng(this._flightplan.takeOffPosition.latitude, this._flightplan.takeOffPosition.longitude));
        }
    }

    toggleEditFlightplanPolyline(): void {
        if (this._flightplanPolyline && (<any>this._flightplanPolyline).editing.enabled()) {
            (<any>this._flightplanPolyline).editing.disable();
            this.updateWaypoints();
        }
        else if (this._flightplanPolyline && !(<any>this._flightplanPolyline).editing.enabled()) {
            (<any>this._flightplanPolyline).editing.enable();
        }
        else {
            this._obsErrors.next("No flight level point selected.");
        }
    }

    updateWaypoints(): void {
        if (this._flightplan) {
            let newWaypoints: Waypoint[] = [];
            let coords = this._flightplanPolyline.getLatLngs(); // is a L.LatLng
            if (coords.length === this._flightplan.waypoints.length) {
                console.log("Number of waypoints didn't change, retaining waypoint attributes like altitude.");
                for (let i: number = 0; i < coords.length; i++) {
                    newWaypoints.push(new Waypoint(
                        coords[i].lat,
                        coords[i].lng,
                        this._flightplan.waypoints[i].altitude,
                        this._flightplan.waypoints[i].orientation,
                        this._flightplan.waypoints[i].radius));
                }
            }
            else {
                // This resets altitude, bearing and radius (TODO: prevent this)
                console.log("Number of waypoints changed. Resetting waypoint attributes like altitude to selected default values.");
                coords.forEach((coord) => {
                    newWaypoints.push(new Waypoint(
                        coord.lat,
                        coord.lng,
                        this._selectedFlightLevelDefaultAltitude,
                        this._selectedBearing,
                        this._selectedWaypointRadius));
                });
                this._obsWarnings.next("Number of waypoints changed. All waypoint attributes like altitude have been reset!");
            }
            this._flightplan.setWaypoints(newWaypoints);
        }
    }

    toggleEditTakeoffPoint(): void {
        if (this._flightplanTakeoffMarker && (<any>this._flightplanTakeoffMarker).editing.enabled()) {
            (<any>this._flightplanTakeoffMarker).editing.disable();
            this.updateTakeoffPosition();
        }
        else if (this._flightplanTakeoffMarker && !(<any>this._flightplanTakeoffMarker).editing.enabled()) {
            (<any>this._flightplanTakeoffMarker).editing.enable();
        }
        else {
            this._obsErrors.next("Take-off point not selected.");
        }
    }

    updateTakeoffPosition(): void {
        if (this._flightplan) {
            let ll: L.LatLng = this._flightplanTakeoffMarker.getLatLng();
            let newWaypoint: Waypoint = new Waypoint(
                ll.lat,
                ll.lng,
                this._flightplan.takeOffPosition.altitude,
                this._flightplan.takeOffPosition.orientation,
                this._flightplan.takeOffPosition.radius);
            this._flightplan.setTakeoff(newWaypoint);
        }
    }

    toggleEditTouchdownPoint(): void {
        if (this._flightplanTouchdownMarker && (<any>this._flightplanTouchdownMarker).editing.enabled()) {
            (<any>this._flightplanTouchdownMarker).editing.disable();
            this.updateTouchdownPosition();
        }
        else if (this._flightplanTouchdownMarker && !(<any>this._flightplanTouchdownMarker).editing.enabled()) {
            (<any>this._flightplanTouchdownMarker).editing.enable();
        }
        else {
            this._obsErrors.next("Touch-down point not selected.");
        }
    }

    updateTouchdownPosition(): void {
        if (this._flightplan) {
            let ll: L.LatLng = this._flightplanTouchdownMarker.getLatLng();
            let newWaypoint: Waypoint = new Waypoint(
                ll.lat,
                ll.lng,
                this._flightplan.touchDownPosition.altitude,
                this._flightplan.touchDownPosition.orientation,
                this._flightplan.touchDownPosition.radius);
            this._flightplan.setTouchdown(newWaypoint);
        }
    }

    toggleEditWaypoint(index: number) {
        if (this._flightplan &&
            index >= 0 &&
            index < this._flightplan.waypoints.length &&
            index < this._flightplanWaypoints.length) {

            if (index !== this._selectedWaypointIndex) {
                // A new point has been selected

                // remove style from previous selection
                if (this._selectedWaypointIndex >= 0) {
                    this._flightplanWaypoints[this._selectedWaypointIndex].setStyle({ color: '#3388ff' }); // reset to normal style
                }

                // store the newly selected index
                this._selectedWaypointIndex = index;

                // store a copy of the selected waypoint
                this._selectedWaypoint = this._flightplan.waypoints[index].clone();

                // Highlight new selection
                this._flightplanWaypoints[index].setStyle({ color: 'yellow' }); // set to highlighted style
            }
            else {
                // The same point has been selected -> deselect
                // remove style from previous selection
                if (this._selectedWaypointIndex >= 0) {
                    this._flightplanWaypoints[this._selectedWaypointIndex].setStyle({ color: '#3388ff' }); // reset to normal style
                }
                // deselect
                this._selectedWaypointIndex = -1;
            }
        }
        else {
            this._selectedWaypointIndex = -1;
            this._obsErrors.next("Invalid waypoint index received for editing");
        }
    }

    updateSelectedWaypoint() {
        if (this._flightplan && this._selectedWaypointIndex > 0) {
            this._flightplan.setWaypoint(this._selectedWaypoint, this._selectedWaypointIndex); // clones the waypoint and emits waypoint observable next.
        }
    }


    toggleAddFlightLevelPoints(): void {
        // start adding points
        if (!this._addingFlightLevelPoints) {
            this._flightlevelPointsDrawer.enable();
            this._addingFlightLevelPoints = true;
        }
        // stop adding points
        else {
            this._addingFlightLevelPoints = false;
            this._flightlevelPointsDrawer.disable();
        }
    }

    removeFlightLevelPoints(): void {
        this._flightLevelPoints.forEach((flp) => {
            flp.remove();
            flp = null;
        });
        this._flightLevelPoints = [];
        this.updateFlightLevelPoints();
    }

    disableEditAllFlightLevelPoints(): void {
        this._flightLevelPoints.forEach((flp) => {
            flp.editing.disable();
        });
    }

    /**
     * Edit the passed marker.
     * @param marker a leaflet L.Marker representing a flight level point.
     */
    toggleEditFlightLevelPoint(marker: any): void {
        if (marker && !marker.editing.enabled()) {
            this.disableEditAllFlightLevelPoints(); // disable editing for all flight level points first
            marker.editing.enable();
            this._selectedFlightLevelPoint = marker;
        }
        else if (marker && marker.editing.enabled()) {
            marker.editing.disable();
            this._selectedFlightLevelPoint = null;
            this.updateFlightLevelPoints();
        }
        else {
            this._obsErrors.next("No flight level point selected.");
        }
    }

    /**
     * Called when flight level point data changed, point data including altitude.
     */
    updateFlightLevelPoints(): void {
        // TODO: update the flightpath definition here
        // - generate delaunay triangulation and draw it
        // - add triangle coordinates to flightpath definitinon
        console.log('Flight level point data changed!');
    }

    /**
    * Start drawing a polygon for the flight path definition.
    */
    addFlightPolygon(): void {
        this.removeFlightPolygon();
        this._polygonDrawer.enable();
        this._addingEnvelope = true;
    }

    /**
     * Edit the polygon of the flight path definition.
     * @param polygon a leaflet L.Polygon representing the flight envelope.
     */
    toggleEditFlightPolygon(polygon: any): void {
        // Start editing
        if (polygon && !polygon.editing.enabled()) {
            polygon.editing.enable();
            polygon.setStyle({ color: 'yellow' });
        }
        // Stop editing
        else if (polygon && polygon.editing.enabled()) {
            polygon.editing.disable();
            polygon.setStyle({ color: '#3388ff' });
            //this.updateFlightEnvelope(polygon, this._flightpathDefinition);
        }
        // Cannot edit if no envelope created
        else {
            this._obsErrors.next("No flight path envelope selected. Create one first.");
        }
    }

    /**
     * Remove the current flight path definition polygon.
     */
    removeFlightPolygon(): void {
        if (this._polygon) {
            this._polygon.editing.disable();
            this._polygon.remove();
            this._polygon = null;
            //this.updateFlightEnvelope(this._polygon, this._flightpathDefinition);
        }
    }


    addFlightLevelPoint(layer: any): void {
        layer.altitude = this._selectedFlightLevelDefaultAltitude; // add an altitude attribute ... hey, it's JS after all, so who cares?
        layer.tag = this._tagFlightLevelPoint; // add a tag, so later we know what this is
        layer.bindTooltip("Altitude: " + layer.altitude.toString(), { permanent: false, className: "my-label", offset: [0, 0] });
        layer.index = this._flightLevelPoints.length;
        layer.on('mouseover', () => { // update the content of the tooltip on mouseover
            if (layer._tooltip) { // TODO: don't access private member
                layer._tooltip.setContent("Altitude: " + layer.altitude.toString());
            }
        });
        this._flightLevelPoints.push(layer);
        this.updateFlightLevelPoints();
    }

    get addingEnvelope(): boolean {
        return this._addingEnvelope;
    }

    addEnvelope(layer: any): void {
        this._addingEnvelope = false;
        // remove old polygon from map
        this.removeFlightPolygon();
        // store new polygon
        this._polygon = layer;
        this._polygon.tag = this._tagFlightEnvelope; // add a tag, so later we know what this is.
        // add points of new polygon to flightpath definition.
        //this.updateFlightEnvelope(layer, this._flightpathDefinition);
    }

    // updateFlightEnvelope(layer, fpd: FlightpathDefinition): void {
    //     if (layer == null) {
    //         fpd.clearEnvelope();
    //         console.log('Flight envelope coordinate array: ' + '[[]]');
    //         return;
    //     }
    //     // add here the coordinates of the polygon to the flightpath definition
    //     // getLatLngs is a 2-d array of coordinates of shapes [[{"lat":47.47,"lng":8.2}, ...], [...]]
    //     // we expect only 1 shape in this layer.                   
    //     let latlngs = layer.getLatLngs(); // is a 2-d array of coordinates of shapes [[{"lat":47.47,"lng":8.2}, ...], [...]]
    //     if (latlngs.length !== 1) {
    //         this.showError("More than 1 polygon drawn.");
    //     }
    //     else {
    //         latlngs.forEach((shape) => {
    //             let points = [];
    //             shape.forEach((latLng) => {
    //                 points.push([latLng.lat, latLng.lng]);
    //             });
    //             // add the first as the last (required by polygon-offset)
    //             if (points.length > 0) {
    //                 points.push([points[0][0], points[0][1]]);
    //             }
    //             console.log('Flight envelope coordinate array: ' + JSON.stringify(points));
    //             fpd.envelope = points;
    //         });
    //     }
    // }


    private subscribeToFlightplanChanges(): void {
        if (this._flightplan) {
            // What if the name changes
            this._flightplan.nameObs().subscribe(
                (name: string) => {
                    console.log('Flightplan name change received in view model.');
                },
                err => {
                    this._obsErrors.next("Error receiving flightplan name update in view model.");
                },
                () => { }
            );
            // What if mavlink code changes
            this._flightplan.mavlinkObs().subscribe(
                (mavlink: string) => {
                    console.log('Mavlink change received in view model.');
                    this.redrawFlightplan();
                },
                (err) => {
                    this._obsErrors.next("Error receiving mavlink update in view model.");
                },
                () => { }
            );
            // What if take off changes
            this._flightplan.takeOffPositionObs().subscribe(
                (wp: Waypoint) => {
                    console.log('Take-off position change received in view model.');
                    this.redrawFlightplanTakeoffPosition();
                },
                (err) => {
                    this._obsErrors.next("Error receiving take-off position update in view model.");
                },
                () => { }
            );
            // What if touch down changes
            this._flightplan.touchDownPositionObs().subscribe(
                (wp: Waypoint) => {
                    console.log('touchDownPositionObs name changed');
                    this.redrawFlightplanTouchDownPosition();
                },
                (err) => {
                    this._obsErrors.next("Error receiving touch down position update in view model.");
                },
                () => { }
            );
            // What if waypoint data changes
            this._flightplan.waypointsObs().subscribe(
                (wps: Waypoint[]) => {
                    console.log('waypointsObs name changed');
                    this.redrawFlightplanWaypoints();
                },
                (err) => {
                    this._obsErrors.next("Error receiving waypoint update in view model.");
                },
                () => { }
            );
            // What if something changes and we don't know what
            this._flightplan.onChangeObs().subscribe(
                () => {
                    console.log('Unspecified flightplan change received by view model.');
                    this.redrawFlightplan();
                },
                (err) => {
                    this._obsErrors.next("Error receiving unspecified change update in view model.");
                },
                () => { }
            );
        }
    }

}
