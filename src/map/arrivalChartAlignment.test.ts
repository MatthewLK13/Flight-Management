import { describe, expect, it } from 'vitest';
import { getArrivalRoutePoints, type MapPoint } from './airfieldGeometry';
import { arrivalPosition } from './playback';
import { scheduleArrivals } from '../simulation/arrivals';

// Independently surveyed from PARKING_CHART_clean.png in its native 2048×1413 coordinates.
const chartLines: Record<'P4' | 'P5', MapPoint[]> = {
  P4: [[735,227],[710,233],[680,244],[650,260],[625,274],[600,287],[575,300],
    [550,310],[525,315],[500,315],[475,315],[459,319],[447,327],[440,332]].map(([x,y])=>({x,y})),
  P5: [[590,227],[565,229],[540,240],[515,253],[490,267],[475,278],
    [460,296],[450,315],[443,330],[440,332]].map(([x,y])=>({x,y})),
};
function distanceToLine(point: MapPoint, line: MapPoint[]): number {
  return Math.min(...line.slice(1).map((end, index) => {
    const start = line[index], dx = end.x - start.x, dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, ((point.x-start.x)*dx + (point.y-start.y)*dy) / (dx*dx+dy*dy)));
    return Math.hypot(point.x - start.x - t*dx, point.y - start.y - t*dy);
  }));
}

describe('arrival routes aligned to the parking chart', () => {
  it.each(['P4', 'P5'] as const)('follows the surveyed %s centreline rather than cutting across the apron', branch => {
    const route = getArrivalRoutePoints('16', branch);
    for (const point of route.toHold) expect(distanceToLine(point, chartLines[branch])).toBeLessThan(8);
    for (const point of chartLines[branch]) expect(distanceToLine(point, route.toHold)).toBeLessThan(8);
    expect(route.landing.at(-1)).toEqual(route.toHold[0]);
    expect(route.toHold.at(-1)).toEqual({ x:440, y:332 });
  });

  it('holds north of the P5 stop bar and crosses 25L on the P5/S8 axis', () => {
    const route = getArrivalRoutePoints('71');
    expect(route.fromHold.slice(0,3)).toEqual([{x:440,y:332},{x:440,y:411},{x:440,y:473}]);
    expect(route.fromHold.some(point=>point.x===580 && point.y===559)).toBe(true);
    expect(route.fromHold.at(-1)).toEqual({x:1155,y:590});
  });

  it('takes the actual S8 curve into V after crossing 25L', () => {
    const centreline = [[440,473],[440,488],[445,500],[475,519],[500,536],[525,549],[550,559],[580,559]]
      .map(([x,y])=>({x,y}));
    const route = getArrivalRoutePoints('16').fromHold.slice(2);
    const join = route.findIndex(point=>point.x===580 && point.y===559);
    for (const point of route.slice(0,join+1)) expect(distanceToLine(point,centreline)).toBeLessThan(6);
    for (const point of centreline) expect(distanceToLine(point,route.slice(0,join+1))).toBeLessThan(6);
  });

  it('keeps rendered aircraft on the surveyed route throughout the runway exit', () => {
    const flight = scheduleArrivals([{
      CallSign:'ALIGN', Stand:'16', PlaneTypeCode:'A321', ScheduledArrival:'2026-10-01T08:00:00Z',
    }], [])[0];
    for (let i=0; i<=100; i++) {
      const time = flight.landingEnd + (flight.p5HoldAt-flight.landingEnd)*i/100;
      expect(distanceToLine(arrivalPosition(flight,time).point,chartLines[flight.exitBranch!])).toBeLessThan(8);
    }
  });
});
