import { describe, expect, it } from 'vitest';
import { getRunwaySegment, getStandPoint, getTaxiRoutePoints, pointAlongPath } from './parkingGeometry';

describe('PARKING CHART movement geometry', () => {
  it('starts at the assigned stand and follows the charted route to S1', () => {
    const start = getStandPoint('37');
    const route = getTaxiRoutePoints('37', '25L-25R');
    expect(start.y).toBeGreaterThan(500);
    expect(route[0]).toEqual(start);
    expect(route.at(-1)).toEqual({ x: 1830, y: 450 }); // taxi to the outermost-right S1 holding point
    expect(route).not.toContainEqual({ x: 1100, y: 515 });
    expect(route).not.toContainEqual({ x: 1132, y: 498 });
    expect(pointAlongPath(route, 1)).toEqual(route.at(-1));
    expect(pointAlongPath(route, 0)).toEqual(route[0]);
  });

  it('uses the S8 runway holding position for 07R, not the runway end', () => {
    const route = getTaxiRoutePoints('37', '07R-07L');
    expect(route).toContainEqual({ x: 390, y: 450 }); // follow S8 through TWY S
    expect(route.at(-1)).toEqual({ x: 390, y: 450 }); // hold at S8 before entering RWY 07R
  });

  it('uses opposite takeoff directions on runway 25L and 07R', () => {
    const runway25L = getRunwaySegment('25L-25R');
    const runway07R = getRunwaySegment('07R-07L');
    expect(runway25L.threshold.x).toBeGreaterThan(runway25L.rollEnd.x);
    expect(runway07R.threshold.x).toBeLessThan(runway07R.rollEnd.x);
    expect(runway25L.threshold.x).toBeGreaterThan(1500);
    expect(runway25L.entryPath.length).toBeGreaterThan(2);
    expect(runway25L.entryPath[0]).toEqual({ x: 1830, y: 450 });
    expect(runway25L.entryPath.at(-1)).toEqual(runway25L.threshold);
    expect(new Set(runway25L.entryPath.map((point) => point.x)).size).toBeGreaterThan(2); // rounded connector, not a vertical segment
    expect(runway07R.threshold.x).toBeLessThan(500);
    expect(runway25L.threshold.y).toBe(runway25L.rollEnd.y);
    expect(runway07R.threshold.y).toBe(runway07R.rollEnd.y);
  });
});
