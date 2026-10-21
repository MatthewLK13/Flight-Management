import type { WakeCategory } from '../data/aircraft';
import { pointAlongPath, type MapPoint } from './parkingGeometry';
import { STAND_POINTS, INTERNATIONAL_BAYS, DOMESTIC_BAYS, HOLD_S1, P5_HOLD, RUNWAY_ENTRY, RUNWAY_END, taxiRoutes, runwayEntryPath, arrivalExitPaths } from './surfaceGraph';
export { pointAlongPath };
export type { MapPoint };
export const MAP_VIEWBOX = '0 0 2048 1413';
export const ARRIVAL_P5_HOLD = P5_HOLD;
export function getStandPoint(stand: string): MapPoint {
  const point = STAND_POINTS[stand.trim().toUpperCase()];
  if (!point) throw new Error(`Stand ${stand} chưa có tọa độ trên chart.`);
  return point;
}
export function getHoldingPoint(_runway: string): MapPoint { return HOLD_S1; }
export function getRunwaySegment(_runway: string) {
  return { entryPath: runwayEntryPath(), threshold: RUNWAY_ENTRY, rollEnd: RUNWAY_END };
}
export function getTaxiRoutePoints(stand: string, _runway: string): MapPoint[] { return taxiRoutes(stand)[0].points; }
export function getArrivalRoutePoints(stand: string, branch: 'P4' | 'P5' = 'P4') {
  const { exit, path } = arrivalExitPaths(branch);
  return {
    approach: [{ x: 1860, y: 227 }, { x: 1610, y: 227 }],
    landing: [{ x: 1610, y: 227 }, exit],
    toHold: path,
    fromHold: [P5_HOLD, { x: 473, y: 411 }, { x: 475, y: 495 }, ...taxiRoutes(stand, 'P5')[0].points.slice(1)],
  };
}
export function getNearestReturnStand(originalStand: string, unavailable: Set<string>, category: WakeCategory): string {
  const international = Number(originalStand) >= 1 && Number(originalStand) <= 16;
  const candidates = international ? [...INTERNATIONAL_BAYS] : category === 'H'
    ? Array.from({ length: 12 }, (_, index) => String(index + 23)) : [...DOMESTIC_BAYS];
  candidates.sort((a, b) => {
    const pa = getStandPoint(a), pb = getStandPoint(b);
    return Math.hypot(pa.x - HOLD_S1.x, pa.y - HOLD_S1.y) - Math.hypot(pb.x - HOLD_S1.x, pb.y - HOLD_S1.y);
  });
  return candidates.find((stand) => !unavailable.has(stand)) ?? candidates[0];
}
export function getTaxiRouteDescription(_runway: string, stand: string): string {
  return `Stand ${stand} → đường lăn sân đỗ → TWY V/S → S1 → RWY 25L`;
}
