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
import * as leaflet from "leaflet";
let geolib = require('geolib');

interface LayerItem {
    name: string;
    value: leaflet.TileLayer;
}

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

    private _map: leaflet.Map = null;
    private _mapLayers: LayerItem[] = [];

    private _flightplanPolyline: leaflet.Polyline = null;
    private _flightplan: Flightplan = null;

    constructor() {

    }

    ngOnInit(): void {

        // Create a map instance
        this._map = leaflet.map('mapid').setView([47.468722, 8.274975], 13);


        // Google map imagery layer
        this._mapLayers.push({
            name: 'Google',
            value: leaflet.tileLayer(
                'http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                    maxZoom: 21,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
                })
        });

        // Agis map imagery layer
        this._mapLayers.push({
            name: 'Agis',
            value: leaflet.tileLayer(
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
                        let content: string = reader.result;
                        let fp = new Flightplan();
                        fp.parseKmz(content, inputElement.files[0].name);
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

    // ======== Generate Mavlink 

    generateMission() {
        try {
            console.log('generate mission called!');
            if (this._flightplan) {
                console.log('num waypoints 1: ' + this._flightplan.numWaypoints);
                this._flightplan.addWaypoints(5.0); // add waypoints every x meters
                console.log('num waypoints 2: ' + this._flightplan.numWaypoints);

                this.drawFlightplan(this._flightplan, this._map);
            }
            //flightPathAugmented.setWaypointAccuracy.bind(flightPathAugmented, 2.0),
            //flightPathAugmented.setAltitude.bind(flightPathAugmented, 8.0),
            //flightPathAugmented.setYaw.bind(flightPathAugmented, 180.0),
            // flightPathAugmented.writeBebopFlightPlan.bind(flightPathAugmented, outputDir + inputFilename + ".mavlink", 2.0, 1.0, false) // file, speed, hold-time, image hack
        }
        catch (err) {

        }
    }




    // =============================================


    private drawFlightplan(flightplan: Flightplan, map: leaflet.Map): void {

        // Remove any previous flightplan drawing from the map.
        if (this._flightplanPolyline) {
            this._flightplanPolyline.remove();
            this._flightplanPolyline = null;
        }

        // Render new flight plan if a valid one was passed.
        // if (flightplan && flightplan.isValid) {
        if (flightplan) {

            // Create array of LatLng from flightplan waypoints
            let lla: leaflet.LatLng[] = [];

            // Take-off position
            lla.push(leaflet.latLng(flightplan.takeOffPosition.latitude, flightplan.takeOffPosition.longitude, 0));

            // waypoints
            flightplan.waypoints.forEach(wp => {
                lla.push(leaflet.latLng(wp.latitude, wp.longitude, 0));
            });

            // Touchdown position
            lla.push(leaflet.latLng(flightplan.touchDownPosition.latitude, flightplan.touchDownPosition.longitude, 0));

            // Add the polyline to the map
            this._flightplanPolyline = leaflet.polyline(lla, { color: "red", lineJoin: "round", lineCap: "butt" }).addTo(this._map);

            // Add a circle for each waypoint
            lla.forEach(wp => {
                leaflet.circle(wp, 0.25).addTo(this._map);
            });

            // Center map on take-off
            this._map.panTo(leaflet.latLng(flightplan.takeOffPosition.latitude, flightplan.takeOffPosition.longitude));
        }
    }

    private showError(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'error', summary: 'Error', detail: message });
    }

    private showInfo(message: string): void {
        this._msgs = [];
        this._msgs.push({ severity: 'success', summary: 'Success', detail: message });
    }

}