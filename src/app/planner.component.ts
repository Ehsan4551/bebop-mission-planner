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
let geolib = require('geolib');

@Component({
    selector: 'mission-planner',
    templateUrl: 'planner.component.html',
    styleUrls: ['app.scss', '../../node_modules/font-awesome/scss/font-awesome.scss'],
    host: { '(window:keydown)': 'hotkeys($event)' }
})
export class PlannerComponent implements OnInit {

   // @ViewChild('flightplanFileDialog') flightplanFileDialogElement: ElementRef; // https://angular.io/docs/js/latest/api/core/index/ElementRef-class.html

    // private _flightplans: SelectItem[] = [];
    // private _selectedFlightplan: string = '';
    // private _msgs: Message[] = [];
    // private _enableUpload: boolean = false;
    // private _obsDistanceToTakeoff: ConnectableObservable<number> = null;

    constructor() {

     
    }

    ngOnInit(): void {

      
    }

   

}