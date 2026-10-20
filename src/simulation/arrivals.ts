import { approachSpeedKts, TAXI_SPEED_KTS, wakeCategory, type WakeCategory } from '../data/aircraft';
import { getArrivalRoutePoints, type MapPoint } from '../map/airfieldGeometry';
import type { TimelineItem } from './runSimulation';

export type ArrivalTimelineItem = {
  id: string; callsign: string; aircraftType: string; wakeCategory: WakeCategory; stand: string;
  international: boolean; touchdown: number; approachStart: number; landingEnd: number;
  p5HoldAt: number; crossingStart: number; crossingEnd: number; standArrival: number;
  approachSpeedKts: number; row: Record<string, unknown>;
};

function pathLength(points: MapPoint[]): number {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

export function scheduleArrivals(rows: Record<string, unknown>[], departures: TimelineItem[]): ArrivalTimelineItem[] {
  let crossingAvailable = -Infinity;
  const orderedRows = [...rows].sort((a, b) => {
    const timeA = new Date(String(a.ScheduledArrival ?? '')).getTime();
    const timeB = new Date(String(b.ScheduledArrival ?? '')).getTime();
    return timeA - timeB || String(a.CallSign ?? '').localeCompare(String(b.CallSign ?? ''));
  });
  return orderedRows.map((row, index) => {
    const touchdown = new Date(String(row.ScheduledArrival ?? '')).getTime();
    if (!Number.isFinite(touchdown)) throw new Error(`Giờ hạ cánh không hợp lệ: ${String(row.CallSign ?? index + 1)}`);
    const aircraftType = String(row.PlaneTypeCode ?? row.AircraftType ?? 'A320');
    const wake = wakeCategory(aircraftType);
    const stand = String(row.Stand ?? '—');
    const route = getArrivalRoutePoints(stand);
    const approachSpeed = approachSpeedKts(wake);
    const landingEnd = touchdown + 60_000;
    const p5HoldAt = landingEnd + 2 * 60_000;
    let crossingStart = Math.max(p5HoldAt, crossingAvailable);
    // The arrival may cross 25L only after a departing aircraft has passed P5.
    // At the map scale, P5 is about three quarters of the takeoff roll from S1.
    for (const departure of departures) {
      const p5Passed = departure.takeoffRollStart + 0.75 * (departure.wheelsOff - departure.takeoffRollStart);
      if (crossingStart < p5Passed + 10_000 && crossingStart + 45_000 > departure.runwayEntryStart) {
        crossingStart = p5Passed + 10_000;
      }
    }
    const crossingEnd = crossingStart + 45_000;
    crossingAvailable = crossingEnd + 15_000;
    // The 2025 plan is used as a visual scale; taxi speed is 20 kt after the crossing.
    const metresPerPixel = 3059 / 1910;
    const taxiDuration = Math.max(60_000, pathLength(route.fromHold.slice(3)) * metresPerPixel / 1852 / TAXI_SPEED_KTS * 3_600_000);
    return {
      id: `${String(row.CallSign ?? `ARR-${index + 1}`)}-arrival-${index}`,
      callsign: String(row.CallSign ?? `ARR-${index + 1}`), aircraftType, wakeCategory: wake,
      stand, international: Boolean(row.International), touchdown,
      approachStart: touchdown - 6 / approachSpeed * 3_600_000, landingEnd, p5HoldAt,
      crossingStart, crossingEnd, standArrival: crossingEnd + taxiDuration,
      approachSpeedKts: approachSpeed, row,
    };
  }).sort((a, b) => a.touchdown - b.touchdown || a.id.localeCompare(b.id));
}
