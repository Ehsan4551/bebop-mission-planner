import { Component, ViewChild, ElementRef } from '@angular/core';
import { OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Message } from 'primeng/primeng';
import { DropdownModule } from 'primeng/primeng';
import { SelectItem } from 'primeng/primeng';
import { FileUploadModule } from 'primeng/primeng';
import { Flightplan, Waypoint } from './flightplan';
import { ConnectableObservable } from 'rxjs/observable/ConnectableObservable';
import * as fileSaver from "file-saver";

// Leaflet dependencies
import "leaflet";
import "leaflet-draw";
let L = require("leaflet");
let leafletDraw = require('leaflet-draw'); // Some stuff is not in the typings (yet). E.g. L.Draw.Polyline
interface LayerItem {
    name: string;
    value: L.TileLayer;
}

import { FlightpathDefinition } from './flightpath-definition';

// Polygon offset
let Offset = require('polygon-offset');

// Geolib
let geolib = require('geolib');


@Component({
    selector: 'mission-planner',
    templateUrl: 'planner.component.html',
    styleUrls: ['app.scss', '../../node_modules/font-awesome/scss/font-awesome.scss'],
    host: { '(window:keydown)': 'hotkeys($event)' }
})
export class PlannerComponent implements OnInit {

    @ViewChild('kmzFileDialog') kmzFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html
    @ViewChild('mavlinkFileDialog') mavlinkFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html

    private _msgs: Message[] = [];
    private _loadKmzLabel: string = 'Load kmz file';
    private _loadMavlinkLabel: string = 'Load mavlink file';

    private _map: L.Map = null;
    private _mapLayers: LayerItem[] = [];

    // FlightpathDefinition
    private _polygonDrawer = null;
    private _flightlevelPointsDrawer = null;
    private _addingEnvelope: boolean = false;
    private _addingFlightLevelPoints: boolean = false;

    // 'ViewModel' Data of flightpath definition
    private _polygon = null; // a L.Polygon
    private _flightLevelPoints = []; // array of L.Marker
    private _selectedFlightLevelPoint = null; // a L.Marker from above array

    // The flightpath definiton.
    private _flightpathDefinition: FlightpathDefinition = new FlightpathDefinition();

    private _flightplanPolyline: L.Polyline = null;
    private _flightplanWaypoints: L.Circle[] = [];
    private _flightplanBearings: L.Polyline[] = [];
    private _flightplanMarkers: L.Marker[] = [];

    private _flightplan: Flightplan = null;

    private _waypointDistances: SelectItem[] = [];
    private _selectedWaypointDistance: number = 5;
    private _bearings: SelectItem[] = [];
    private _selectedBearing: number = 0;
    private _waypointRadii: SelectItem[] = [];
    private _selectedWaypointRadius: number = 2;
    private _altitudes: SelectItem[] = [];
    private _selectedAltitude = 8;
    private _selectedFlightLevelDefaultAltitude = 8;
    private _velocities: SelectItem[] = [];
    private _selectedVelocity = 2;
    private _holdTimes: SelectItem[] = [];
    private _selectedHoldTime: number = 1;

    private _tagFlightLevelPoint: string = 'flight-level-point';
    private _tagFlightEnvelope: string = 'flight-envelope-polygon';

    constructor() {

        this.addDropdownOptions();
    }

    ngOnInit(): void {

        // Create a map instance
        this._map = L.map('mapid').setView([47.468722, 8.274975], 15);

        // Leaflet-draw =============================================

        // FeatureGroup is to store editable layers
        let drawnItems = L.featureGroup();
        this._map.addLayer(drawnItems);
        //drawnItems.addTo(this._map);
        let drawControl = new L.Control.Draw({
            edit: {
                featureGroup: drawnItems
            }
        });
        this._map.addControl(drawControl);

        // If clicking on one of the features drawn with leaflet-draw.
        drawnItems.on('click', (e: any) => {
            let layer = e.layer;
            if (layer.hasOwnProperty("tag")) {
                // If clicking on the flight envelope polygon
                if (layer.tag == this._tagFlightEnvelope) {
                    this.toggleEditFlightPolygon(layer);
                }
                // If clicking on a flight level point
                else if (layer.tag == this._tagFlightLevelPoint) {
                    this.toggleEditFlightLevelPoint(layer);
                }
            }
        });

        // Create a polygon 'handler'
        this._polygonDrawer = new L.Draw.Polygon(this._map);

        // Create point 'handler'
        this._flightlevelPointsDrawer = new L.Draw.Marker(this._map);
        this._flightlevelPointsDrawer.options.repeatMode = true;

        // this._map.on('click', (e: any) => {
        //     console.log("I was clicked: " + e.latlng.toString());
        // });

        this._map.on(L.Draw.Event.CREATED, (e: any) => {
            let type = e.layerType;
            let layer = e.layer; // a layer is a shape e.g. Polyline
            if (type === 'marker') {
                if (this._addingFlightLevelPoints) {
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
            }
            else if (type === 'polygon') {
                // Setting newly drawn flightpath envelope polygon
                if (this._addingEnvelope) {
                    this._addingEnvelope = false;
                    // remove old polygon from map
                    this.removeFlightPolygon();
                    // store new polygon
                    this._polygon = layer;
                    this._polygon.tag = this._tagFlightEnvelope; // add a tag, so later we know what this is.
                    // add points of new polygon to flightpath definition.
                    this.updateFlightEnvelope(layer, this._flightpathDefinition);
                }
            }
            drawnItems.addLayer(layer);
        });

        // Eof Leaflet-draw =============================================

        // Google map imagery layer
        this._mapLayers.push({
            name: 'Google',
            value: L.tileLayer(
                'http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                    maxZoom: 21,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
                })
        });

        // Agis map imagery layer
        this._mapLayers.push({
            name: 'Agis',
            value: L.tileLayer(
                'http://mapproxy.osm.ch:8080/tiles/AGIS2014/EPSG900913/{z}/{x}/{y}.png?origin=nw', { // http://mapproxy.osm.ch/demo -> 2014
                    //private _mapSource: string = 'http://mapproxy.osm.ch:8080/tiles/AGIS2016/EPSG900913/{z}/{x}/{y}.png?origin=nw'; // http://mapproxy.osm.ch/demo -> 2016
                    maxZoom: 18,
                    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                    '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                    'Imagery © <a href="http://mapbox.com">Mapbox</a>',
                    id: 'mapbox.streets'
                })
        });

        // Use the first array entry as the default map
        this._mapLayers[0].value.addTo(this._map);


    }

    // ==================== Drawing Flightpath definition ===================


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
        })
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
            this.showError("No flight level point selected.");
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
        this.removeFlightPolygon()
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
            this.updateFlightEnvelope(polygon, this._flightpathDefinition);
        }
        // Cannot edit if no envelope created
        else {
            this.showError("No flight path envelope selected. Create one first.");
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
            this.updateFlightEnvelope(this._polygon, this._flightpathDefinition);
        }
    }

    // Geneating flight path stuff

    createOffsetCurves(): void {

        // // Test Polygon Offset: =====
        // if (this._flightpathDefinition.envelope) {

        //     let latlngs = this._flightpathDefinition.envelope.getLatLngs(); // is a 2-d array of coordinates of shapes [[{"lat":47.47,"lng":8.2}, ...], [...]]

        //     // assuming 1 shape only
        //     let points = [];
        //     latlngs.forEach((shape) => {
        //         shape.forEach((latLng) => {
        //             points.push([latLng.lat, latLng.lng]);
        //         });
        //         // add the first as the last (required by polygon-offset)
        //         if (points.length > 0) {
        //             points.push([points[0][0], points[0][1]]);
        //         }
        //     });
        //     console.log('array: ' + points.length);

        //     let offset = new Offset();
        //     let padding = offset.data(points).padding(0.001); // is a 3-d array: 2d-coordinates for n contours [[[x, y], [x, y], ...], [[x, y], ...]]
        //     console.log('Padding points: ' + JSON.stringify(padding));
        //     console.log('length 0: ' + padding.length);
        //     console.log('length 1: ' + padding[0].length);

        //     // assuming there results only one contour..
        //     let lla: L.LatLng[] = [];
        //     padding.forEach((contour) => {
        //         contour.forEach((pnt) => {
        //             console.log('pnt: ' + pnt[0] + ' ' + pnt[1]);
        //             lla.push(L.latLng(pnt[0], pnt[1]));
        //         });
        //     });
        //     L.polyline(lla, { color: "red", lineJoin: "round", lineCap: "butt" }).addTo(this._map);
        // }

    }

    // Add flight plan functionality ====================================

    addMavlinkFile(inputElement: HTMLInputElement): void {
        this.readMavlinkFile(this.mavlinkFileDialogElement.nativeElement).subscribe(
            (flightplan: Flightplan) => {
                this._flightplan = flightplan;
                this.drawFlightplan(this._flightplan, this._map);
            },
            (error) => {
                console.log(error);
                this.showError(error);
            },
            () => { }
        );
    }

    readMavlinkFile(inputElement: HTMLInputElement): Observable<Flightplan> {
        return Observable.create((observer) => {
            if (this.isValidFileElement(inputElement)) {
                let reader: FileReader = new FileReader();
                reader.onload = (e) => {
                    try {
                        let fp = new Flightplan(reader.result);
                        this.resetInputFileElement(this.mavlinkFileDialogElement.nativeElement, this._loadMavlinkLabel);
                        console.log('Read flightplan (mavlink): ' + JSON.stringify(fp));
                        observer.next(fp);
                        observer.complete();
                    }
                    catch (err) {
                        this.resetInputFileElement(this.mavlinkFileDialogElement.nativeElement, this._loadMavlinkLabel);
                        let msg: string = 'Could not parse mavlink content. ' + err.message;
                        console.error(msg);
                        observer.error(msg);
                    }
                }
                reader.onerror = (err) => {
                    this.resetInputFileElement(this.mavlinkFileDialogElement.nativeElement, this._loadMavlinkLabel);
                    let msg: string = 'FileReader error. ' + err.message;
                    console.error(msg);
                    observer.error(msg);
                };
                reader.readAsText(inputElement.files[0]);
            }
        });
    }

    addKmzFile(inputElement: HTMLInputElement): void {
        // (don't need to use inputElement)
        this.readKmzFile(this.kmzFileDialogElement.nativeElement).subscribe(
            (flightplan: Flightplan) => {
                this._flightplan = flightplan;
                this.drawFlightplan(this._flightplan, this._map);
            },
            (error) => {
                console.log(error);
                this.showError(error);
            },
            () => { }
        );
    }

    readKmzFile(inputElement: HTMLInputElement): Observable<Flightplan> {
        return Observable.create((observer) => {
            if (this.isValidFileElement(inputElement)) {
                let reader: FileReader = new FileReader();
                reader.onload = (e) => {
                    try {
                        // create a name for the flight plan
                        let flightplanName: string = inputElement.files[0].name.replace(".kmz", "");
                        // let currentdate = new Date();
                        // flightplanName += "_" + currentdate.getFullYear() + '-'
                        //     + (currentdate.getMonth() + 1) + "-"
                        //     + currentdate.getDate() + "_"
                        //     + currentdate.getHours()
                        //     + currentdate.getMinutes()
                        //     + currentdate.getSeconds();
                        // process file content
                        let content: string = reader.result;
                        let fp = new Flightplan();
                        fp.parseKmz(content, flightplanName, this._selectedBearing, this._selectedWaypointRadius);
                        this.resetInputFileElement(this.kmzFileDialogElement.nativeElement, this._loadKmzLabel);
                        console.log('Read flightplan (kmz): ' + JSON.stringify(fp));
                        observer.next(fp);
                        observer.complete();
                    }
                    catch (err) {
                        this.resetInputFileElement(this.kmzFileDialogElement.nativeElement, this._loadKmzLabel);
                        let msg: string = 'Could not parse kmz content. ' + err.message;
                        console.error(msg);
                        observer.error(msg);
                    }
                };
                reader.onerror = (err) => {
                    this.resetInputFileElement(this.kmzFileDialogElement.nativeElement, this._loadKmzLabel);
                    let msg: string = 'FileReader error. ' + err.message;
                    console.error(msg);
                    observer.error(msg);
                };
                reader.readAsText(inputElement.files[0]);
            }
            else {
                this.resetInputFileElement(this.kmzFileDialogElement.nativeElement, this._loadKmzLabel);
                observer.error("No valid file has been selected.");
            }
        });
    }

    isValidFileElement(inputElement: HTMLInputElement) {
        return !!(inputElement && inputElement.files && inputElement.files[0]); // && inputElement.files[0].name.endsWith('.mavlink') === true);
    }

    resetInputFileElement(inputElement: HTMLInputElement, labelText: string) {
        if (inputElement) {
            inputElement.value = "";
            if (inputElement.nextElementSibling) {
                inputElement.nextElementSibling.innerHTML = labelText;
            }
        }
    }

    // ===============================

    // uses this._selectedWaypointDistance
    addIntermediateWaypoints() {
        try {
            if (this._flightplan) {
                this._flightplan.addWaypoints(this._selectedWaypointDistance); // add waypoints every x meters
                this.drawFlightplan(this._flightplan, this._map);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    setWaypointRadius() {
        try {
            if (this._flightplan) {
                this._flightplan.setWaypointRadius(this._selectedWaypointRadius);
                this.drawFlightplan(this._flightplan, this._map);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    setAltitude(altitude: number) {
        try {
            if (this._flightplan) {
                this._flightplan.setAltitude(this._selectedAltitude);
                this.drawFlightplan(this._flightplan, this._map);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    setBearing(bearing: number) {
        try {
            if (this._flightplan) {
                this._flightplan.setBearing(this._selectedBearing);
                this.drawFlightplan(this._flightplan, this._map);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    setBearingToCenter() {
        try {
            if (this._flightplan) {
                this._flightplan.setBearingToCenter();
                this.drawFlightplan(this._flightplan, this._map);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    generateMavlink() {
        try {
            if (this._flightplan) {
                console.log('Generating mavlink with velocity ' + this._selectedVelocity + ' and waypoint hold time ' + this._selectedHoldTime);
                this._flightplan.updateMavlink(this._selectedVelocity, this._selectedHoldTime);
                // show the flightplan
                console.log("Generated mavlink code: ");
                console.log(this._flightplan.mavlink);
            }
            else {
                this.showError('No mission loaded');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }

    saveFlightplan() {
        try {
            if (this._flightplan && this._flightplan.isValid) {
                let blob = new Blob([this._flightplan.mavlink], { type: "text/plain;charset=utf-8" });
                let currentdate = new Date();
                let filename: string = this._flightplan.name + ".mavlink";
                fileSaver.saveAs(blob, filename);
            }
            else {
                this.showError('No mission loaded or no mavlink generated yet.');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
        }
    }


    // =============================================

    private drawFlightplan(flightplan: Flightplan, map: L.Map): void {

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
        this._flightplanMarkers.forEach((mm) => {
            mm.remove();
            mm = null;
        });
        this._flightplanMarkers = [];

        // Render new flight plan if a valid one was passed.
        // if (flightplan && flightplan.isValid) {
        if (flightplan) {

            // Create array of LatLng from flightplan waypoints
            let lla: L.LatLng[] = [];

            // Take-off position
            lla.push(L.latLng(flightplan.takeOffPosition.latitude, flightplan.takeOffPosition.longitude, 0));

            // waypoints
            flightplan.waypoints.forEach(wp => {
                lla.push(L.latLng(wp.latitude, wp.longitude, 0));
            });

            // Touchdown position
            lla.push(L.latLng(flightplan.touchDownPosition.latitude, flightplan.touchDownPosition.longitude, 0));

            // Add the polyline to the map
            this._flightplanPolyline = L.polyline(lla, { color: "red", lineJoin: "round", lineCap: "butt" }).addTo(this._map);

            // Add a waypoint radius for each waypoint
            for (let i = 0; i < flightplan.numWaypoints; i++) {
                let wp: Waypoint = flightplan.waypoints[i];
                let center = new L.LatLng(wp.latitude, wp.longitude);
                this._flightplanWaypoints.push(L.circle(center, wp.radius).addTo(this._map));
            }

            // Add bearing indicator for each waypoint
            for (let i = 0; i < flightplan.numWaypoints; i++) {
                let wp: Waypoint = flightplan.waypoints[i];
                let endpoint = geolib.computeDestinationPoint(wp, wp.radius * 2.0, wp.orientation);
                console.log('wp: ' + JSON.stringify(wp));
                console.log('end: ' + JSON.stringify(endpoint));
                let line: L.LatLng[] = [];
                line.push(L.latLng(wp.latitude, wp.longitude));
                line.push(L.latLng(endpoint.latitude, endpoint.longitude));
                this._flightplanBearings.push(L.polyline(line, { color: "yellow", lineJoin: "round", lineCap: "butt" }).addTo(this._map));
            }

            // Add altitude markers 
            for (let i = 0; i < flightplan.numWaypoints; i++) {
                let wp: Waypoint = flightplan.waypoints[i];
                let endpoint = geolib.computeDestinationPoint(wp, wp.radius * 2.0, wp.orientation);
                console.log('wp: ' + JSON.stringify(wp));
                console.log('end: ' + JSON.stringify(endpoint));
                let center: L.LatLng = L.latLng(wp.latitude, wp.longitude);
                let marker = L.marker([wp.latitude, wp.longitude], { opacity: 0.01 }); //opacity may be set to zero
                marker.bindTooltip("WP: " + i.toString() + ", Altitude: " + wp.altitude.toString(), { permanent: false, className: "my-label", offset: [0, 0] });
                this._flightplanMarkers.push(marker.addTo(this._map));
            }

            // Center map on take-off location
            this._map.panTo(L.latLng(flightplan.takeOffPosition.latitude, flightplan.takeOffPosition.longitude));
        }
    }

    updateFlightEnvelope(layer, fpd: FlightpathDefinition): void {
        if (layer == null) {
            fpd.clearEnvelope();
            console.log('Flight envelope coordinate array: ' + '[[]]');
            return;
        }
        // add here the coordinates of the polygon to the flightpath definition
        // getLatLngs is a 2-d array of coordinates of shapes [[{"lat":47.47,"lng":8.2}, ...], [...]]
        // we expect only 1 shape in this layer.                   
        let latlngs = layer.getLatLngs(); // is a 2-d array of coordinates of shapes [[{"lat":47.47,"lng":8.2}, ...], [...]]
        if (latlngs.length !== 1) {
            this.showError("More than 1 polygon drawn.");
        }
        else {
            latlngs.forEach((shape) => {
                let points = [];
                shape.forEach((latLng) => {
                    points.push([latLng.lat, latLng.lng]);
                });
                // add the first as the last (required by polygon-offset)
                if (points.length > 0) {
                    points.push([points[0][0], points[0][1]]);
                }
                console.log('Flight envelope coordinate array: ' + JSON.stringify(points));
                fpd.envelope = points;
            });
        }
    }

    hotkeys(event) {
        // // ALT + t
        // if (event.keyCode === 84 && event.altKey) {
        //     this.takeoff();
        // }
    }

    private showError(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'error', summary: 'Error', detail: message });
    }

    private showInfo(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'success', summary: 'Success', detail: message });
    }

    private addDropdownOptions(): void {
        this._waypointDistances.push({ label: '1', value: 1 });
        this._waypointDistances.push({ label: '2', value: 2 });
        this._waypointDistances.push({ label: '3', value: 3 });
        this._waypointDistances.push({ label: '5', value: 5 });
        this._waypointDistances.push({ label: '8', value: 8 });
        this._waypointDistances.push({ label: '13', value: 13 });

        this._bearings.push({ label: 'N', value: 0 });
        this._bearings.push({ label: 'NE', value: 45 });
        this._bearings.push({ label: 'E', value: 90 });
        this._bearings.push({ label: 'SE', value: 135 });
        this._bearings.push({ label: 'S', value: 180 });
        this._bearings.push({ label: 'SW', value: 225 });
        this._bearings.push({ label: 'W', value: 270 });
        this._bearings.push({ label: 'NW', value: 315 });

        this._waypointRadii.push({ label: '1', value: 1 });
        this._waypointRadii.push({ label: '2', value: 2 });
        this._waypointRadii.push({ label: '3', value: 3 });
        this._waypointRadii.push({ label: '5', value: 5 });

        this._altitudes.push({ label: '1', value: 1 });
        this._altitudes.push({ label: '2', value: 2 });
        this._altitudes.push({ label: '3', value: 3 });
        this._altitudes.push({ label: '4', value: 4 });
        this._altitudes.push({ label: '5', value: 5 });
        this._altitudes.push({ label: '6', value: 6 });
        this._altitudes.push({ label: '7', value: 7 });
        this._altitudes.push({ label: '8', value: 8 });
        this._altitudes.push({ label: '9', value: 9 });
        this._altitudes.push({ label: '10', value: 10 });
        this._altitudes.push({ label: '12', value: 12 });
        this._altitudes.push({ label: '15', value: 15 });
        this._altitudes.push({ label: '18', value: 18 });
        this._altitudes.push({ label: '20', value: 20 });
        this._altitudes.push({ label: '25', value: 25 });

        this._velocities.push({ label: '1', value: 1 });
        this._velocities.push({ label: '2', value: 2 });
        this._velocities.push({ label: '3', value: 3 });
        this._velocities.push({ label: '5', value: 5 });
        this._velocities.push({ label: '8', value: 8 });

        this._holdTimes.push({ label: '1', value: 1 });
        this._holdTimes.push({ label: '2', value: 2 });
        this._holdTimes.push({ label: '3', value: 3 });
        this._holdTimes.push({ label: '5', value: 5 });
        this._holdTimes.push({ label: '8', value: 8 });
    }
}