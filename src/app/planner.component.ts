import { Component, ViewChild, ElementRef } from '@angular/core';
import { OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Message } from 'primeng/primeng';
import { DropdownModule } from 'primeng/primeng';
import { SelectItem } from 'primeng/primeng';
import { FileUploadModule } from 'primeng/primeng';
import { FlightplanService } from 'bebop-bridge-shared';
import { Flightplan, Waypoint } from 'bebop-bridge-shared';
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

    private _msgs: Message[] = [];
    private _enableUpload: boolean = false;
    private _loadKmzLabel: string = 'Load kmz file';

    private _map: L.Map = null;
    private _mapLayers: LayerItem[] = [];
    private _polygonDrawer = null;

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
    private _velocities: SelectItem[] = [];
    private _selectedVelocity = 2;
    private _holdTimes: SelectItem[] = [];
    private _selectedHoldTime: number = 1;

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

        // Create a polygon 'handler'
        this._polygonDrawer = new L.Draw.Polygon(this._map, drawControl.options.polyline);

        this._map.on(L.Draw.Event.CREATED, (e: any) => {
            let type = e.layerType;
            let layer = e.layer; // a layer is a shape e.g. Polyline
            if (type === 'marker') {

            }
            else if(type === 'polygon'){
                console.log("Polygon drawn!");
                let latlngs = layer.getLatLngs();
                console.log('latlngs: ' + JSON.stringify(latlngs));
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

    /**
     * Start drawing a polygon.
     */
    addPolygon(): void{
        this._polygonDrawer.enable();
    }

    // Add flight plan functionality ====================================

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
            if (this.isValidKmzFileElement(inputElement)) {
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

    isValidKmzFileElement(inputElement: HTMLInputElement) {
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