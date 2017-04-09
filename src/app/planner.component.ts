import { Component, ViewChild, ElementRef } from '@angular/core';
import { OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Message } from 'primeng/primeng';
import { CheckboxModule } from 'primeng/primeng';
import { DropdownModule } from 'primeng/primeng';
import { SelectItem } from 'primeng/primeng';
import { FileUploadModule } from 'primeng/primeng';
import { Flightplan, Waypoint } from './flightplan';
import { FlightplanViewModel } from './flightplan-view-model';
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

@Component({
    selector: 'mission-planner',
    templateUrl: 'planner.component.html',
    styleUrls: ['app.scss', '../../node_modules/font-awesome/scss/font-awesome.scss'],
    host: { '(window:keydown)': 'hotkeys($event)' }
})
export class PlannerComponent implements OnInit {

    @ViewChild('kmzFileDialog') kmzFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html
    @ViewChild('mavlinkFileDialog') mavlinkFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html
    @ViewChild('jsonFileDialog') jsonFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html

    private _msgs: Message[] = [];
    private _loadKmzLabel: string = 'Load kmz file';
    private _loadMavlinkLabel: string = 'Load mavlink file';
    private _loadJsonLabel: string = 'Load flight plan';

    private _map: L.Map = null;
    private _mapLayers: LayerItem[] = [];

    // The flightpath definition model (from which a flightplan trajectory can be derived like offset curves from polygon)
    // private _flightpathDefinition: FlightpathDefinition = new FlightpathDefinition();

    // Flightplan model
    private _flightplan: Flightplan = null;

    // Flightplan view model
    private _flightplanViewModel: FlightplanViewModel = null;

    // Data which is input to a postprocessor instance
    private _velocities: SelectItem[] = [];
    private _selectedVelocity = 2;
    private _holdTimes: SelectItem[] = [];
    private _selectedHoldTime: number = 1;

    // Drop down options
    private _waypointDistances: SelectItem[] = [];
    private _waypointRadii: SelectItem[] = [];
    private _bearings: SelectItem[] = [];
    private _altitudes: SelectItem[] = [];

    constructor() {
        this.addFlightplanDropdownOptions();
        this.addPostprocessorDropdownOptions();
    }

    ngOnInit(): void {

        // Create a map instance
        this._map = L.map('mapid').setView([47.468722, 8.274975], 15);

        // Create a flightplan view model
        this._flightplanViewModel = new FlightplanViewModel(this._flightplan, this._map);

        // Register to receive view model error messages
        this._flightplanViewModel.errors().subscribe(
            (message: string) => {
                this.showError(message);
            },
            err => {
                this.showError(err);
            },
            () => { }
        );

        // Register to receive view model error messages
        this._flightplanViewModel.warnings().subscribe(
            (message: string) => {
                this.showWarning(message);
            },
            err => {
                this.showWarning(err);
            },
            () => { }
        );

        // Create the Leaflet Draw control toolbar on the map
        let drawControl = new L.Control.Draw({
            edit: {
                featureGroup: this._flightplanViewModel.featureGroup
            }
        });
        this._map.addControl(drawControl);

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

    addJsonFile(inputElement: HTMLInputElement): void {
        this.readJsonFile(this.jsonFileDialogElement.nativeElement).subscribe(
            (flightplan: Flightplan) => {
                this._flightplan = flightplan;
                this._flightplanViewModel.resetFlightplan(flightplan);
            },
            (error) => {
                console.log(error);
                this.showError(error);
            },
            () => { }
        );
    }

    readJsonFile(inputElement: HTMLInputElement): Observable<Flightplan> {
        return Observable.create((observer) => {
            if (this.isValidFileElement(inputElement)) {
                let reader: FileReader = new FileReader();
                reader.onload = (e) => {
                    try {
                        let fp = new Flightplan();
                        fp.fromJson(reader.result);
                        this.resetInputFileElement(this.jsonFileDialogElement.nativeElement, this._loadJsonLabel);
                        observer.next(fp);
                        observer.complete();
                    }
                    catch (err) {
                        this.resetInputFileElement(this.jsonFileDialogElement.nativeElement, this._loadJsonLabel);
                        let msg: string = 'Could not parse json content. ' + err.message;
                        console.error(msg);
                        observer.error(msg);
                    }
                };
                reader.onerror = (err) => {
                    this.resetInputFileElement(this.jsonFileDialogElement.nativeElement, this._loadJsonLabel);
                    let msg: string = 'FileReader error. ' + err.message;
                    console.error(msg);
                    observer.error(msg);
                };
                reader.readAsText(inputElement.files[0]);
            }
        });
    }

    addMavlinkFile(inputElement: HTMLInputElement): void {
        this.readMavlinkFile(this.mavlinkFileDialogElement.nativeElement).subscribe(
            (flightplan: Flightplan) => {
                this._flightplan = flightplan;
                this._flightplanViewModel.resetFlightplan(flightplan);
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
                        observer.next(fp);
                        observer.complete();
                    }
                    catch (err) {
                        this.resetInputFileElement(this.mavlinkFileDialogElement.nativeElement, this._loadMavlinkLabel);
                        let msg: string = 'Could not parse mavlink content. ' + err.message;
                        console.error(msg);
                        observer.error(msg);
                    }
                };
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
                this._flightplanViewModel.resetFlightplan(flightplan);
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
                        fp.parseKmz(content, flightplanName, this._flightplanViewModel.selectedBearing, this._flightplanViewModel.selectedWaypointRadius);
                        this.resetInputFileElement(this.kmzFileDialogElement.nativeElement, this._loadKmzLabel);
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
                this._flightplan.addWaypoints(this._flightplanViewModel.selectedWaypointDistance); // add waypoints every x meters
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
                this._flightplan.setWaypointRadius(this._flightplanViewModel.selectedWaypointRadius);
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
                this._flightplan.setAltitude(this._flightplanViewModel.selectedAltitude);
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
                this._flightplan.setBearing(this._flightplanViewModel.selectedBearing);
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

    saveFlightplanMavlink() {
        try {
            if (this._flightplan && this._flightplan.isValid) {
                let blob = new Blob([this._flightplan.mavlink], { type: "text/plain;charset=utf-8" });
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


    private _name: string = '';
    private _mavlink: string = '';
    private _takeOffPosition: Waypoint = null;
    private _touchDownPosition: Waypoint = null;

    saveFlightplanJson() {
        try {
            if (this._flightplan && this._flightplan.isValid) {
                let blob = new Blob([this._flightplan.toJson()], { type: "text/plain;charset=utf-8" });
                let filename: string = this._flightplan.name + ".flightplan.json";
                fileSaver.saveAs(blob, filename);
            }
            else {
                this.showError('No flight plan created yet or current flight plan is invalid.');
            }
        }
        catch (err) {
            console.log(err);
            this.showError(err);
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
    private showWarning(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'warn', summary: 'Warning', detail: message });
    }
    private showInfo(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'info', summary: 'Success', detail: message });
    }

    addFlightplanDropdownOptions(): void {

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
    }

    addPostprocessorDropdownOptions(): void {

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