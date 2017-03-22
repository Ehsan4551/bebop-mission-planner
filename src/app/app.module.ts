import { NgModule } from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { GrowlModule } from 'primeng/primeng';

import { BooleanToRedGreenColor, FlightplanNameToDisplayName } from './custom-pipes';
import { AppComponent } from './app.component';
import { PlannerComponent } from './planner.component';

@NgModule({
    imports: [
        BrowserModule,
        CommonModule,
        FormsModule,
        GrowlModule
    ],
    declarations: [AppComponent,
        PlannerComponent,
        BooleanToRedGreenColor,
        FlightplanNameToDisplayName],
    bootstrap: [AppComponent]
})
export class AppModule { }