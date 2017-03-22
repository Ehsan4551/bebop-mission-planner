
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'booleanToRedGreenColor'
})
export class BooleanToRedGreenColor implements PipeTransform {
    transform(data: any, ...args: any[]): any {
        if (data) {
            return '#4CAF50';
        }
        else {
            return '#f44336';
        }
    }
}

@Pipe({
    name: 'flightplanNameToDisplayName'
})
export class FlightplanNameToDisplayName implements PipeTransform {
    transform(data: any, ...args: any[]): any {
        if (data === '') {
            return '[none]'; // no flight plan available
        }
        else {
            return data;
        }
    }
}

@Pipe({
    name: 'lastContactTimeToTrafficLightColor'
})
export class LastContactTimeToTrafficLightColor implements PipeTransform {
    transform(data: any, ...args: any[]): any {
        if (data < 5) {
            return '#4CAF50'; // green
        }
        else if (data < 30) {
            return '#fc8a25'; // orange
        }
        else {
            return '#f44336'; // red
        }
    }
}

@Pipe({
    name: 'connectionQualityProgressCircleConvert'
})
export class ConnectionQualityProgressCircleConvert implements PipeTransform {
    transform(value: number, ...args: any[]): any {
        let retVal = 0;
        if (value && !isNaN(value)) {
            // map an assumed range of -90dbm to -30dbm to 0 to 100 for progress circle
            let tmp = (value + 90);
            if (tmp > 0) {
                tmp = Math.round(100 * (tmp / 60));
                if (tmp > 100) {
                    retVal = 100;
                }
                else {
                    retVal = tmp;
                }
            }
        }
        return retVal;
    }
}

