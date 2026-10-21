import type { MapPoint } from '../map/parkingGeometry';
import { pointOnPath as pointAlongPath } from '../map/pathMetrics';
import { taxiRoutes, pathLength, STAND_POINTS } from '../map/surfaceGraph';
import { getArrivalRoutePoints, getRunwaySegment, getNearestReturnStand } from '../map/airfieldGeometry';
import { taxiDuration, landingRollDuration, RUNWAY_ENTRY_MS, TAKEOFF_ROLL_MS, RUNWAY_CLEARANCE_MS, takeoffDistanceProgress } from './movementPhysics';
import type { TimelineItem } from './runSimulation';
import type { ArrivalTimelineItem } from './arrivals';

export type SurfaceLeg = { start: number; end: number; points: MapPoint[]; phase: string };
export type SurfacePlan = { visibleFrom: number; visibleUntil: number; legs: SurfaceLeg[]; route: string };
type Sample = MapPoint & { radius: number };
const STEP = 2000;
const CELL = 40;
const MAX_RESCHEDULE_MS = 48 * 60 * 60_000;

// Space-time reservations cover the rendered trajectories, including junctions
// shared by differently named routes. No aircraft can pass through a waiting one.
class Reservations {
  lastConflictDelay = STEP;
  private cells = new Map<string, Sample[]>();
  private parked = new Map<string, (Sample & { start: number; end: number })[]>();
  private moving = new Map<string, (Sample & { time: number })[]>();
  private key(t: number, x: number, y: number) { return `${t}:${x}:${y}`; }
  private conflict(releaseAt: number, candidateAt: number): false {
    this.lastConflictDelay = Math.max(STEP, releaseAt + STEP - candidateAt);
    return false;
  }
  private neighbours(point: MapPoint): string[] {
    const x = Math.floor(point.x / CELL), y = Math.floor(point.y / CELL), keys: string[] = [];
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) keys.push(`${x + dx}:${y + dy}`);
    return keys;
  }
  private samples(item: SurfaceLeg, visit: (time: number, point: MapPoint) => boolean): boolean {
    for (let time = Math.floor(item.start / STEP); time <= Math.ceil(item.end / STEP); time += 1) {
      const progress = Math.max(0, Math.min(1, (time * STEP - item.start) / Math.max(1, item.end - item.start)));
      if (!visit(time, pointAlongPath(item.points, progress))) return false;
    }
    return true;
  }
  available(legs: SurfaceLeg[], radius: number): boolean {
    this.lastConflictDelay = STEP;
    const near = (a: MapPoint, b: Sample) => Math.hypot(a.x - b.x, a.y - b.y) < radius + b.radius;
    for (const item of legs) {
      if (item.end <= item.start) continue;
      if (item.points.length === 1) {
        const point = item.points[0];
        for (const key of this.neighbours(point)) {
          for (const other of this.parked.get(key) ?? []) if (item.start < other.end + STEP && item.end > other.start - STEP && near(point, other)) return this.conflict(other.end, item.start);
          for (const other of this.moving.get(key) ?? []) if (other.time * STEP >= item.start - STEP && other.time * STEP <= item.end + STEP && near(point, other)) return this.conflict(other.time * STEP, item.start);
        }
      } else if (!this.samples(item, (time, point) => {
        for (const key of this.neighbours(point)) {
          for (const other of this.parked.get(key) ?? []) if (time * STEP >= other.start - STEP && time * STEP <= other.end + STEP && near(point, other)) return this.conflict(other.end, time * STEP);
          for (let dt = -1; dt <= 1; dt += 1) for (const other of this.cells.get(`${time + dt}:${key}`) ?? []) if (near(point, other)) return this.conflict((time + dt + 1) * STEP, time * STEP);
        }
        return true;
      })) return false;
    }
    return true;
  }
  reserve(legs: SurfaceLeg[], radius: number) {
    for (const item of legs) {
      if (item.end <= item.start) continue;
      if (item.points.length === 1) {
        const point = item.points[0], key = `${Math.floor(point.x / CELL)}:${Math.floor(point.y / CELL)}`;
        const entries = this.parked.get(key) ?? [];
        entries.push({ ...point, radius, start: item.start, end: item.end }); this.parked.set(key, entries);
      } else this.samples(item, (time, point) => {
        const x = Math.floor(point.x / CELL), y = Math.floor(point.y / CELL), key = this.key(time, x, y);
        const cell = this.cells.get(key) ?? [];
        cell.push({ ...point, radius }); this.cells.set(key, cell);
        const spatial = `${x}:${y}`, entries = this.moving.get(spatial) ?? [];
        entries.push({ ...point, radius, time }); this.moving.set(spatial, entries); return true;
      });
    }
  }
}

const leg = (start: number, end: number, points: MapPoint[], phase: string): SurfaceLeg => ({ start, end, points, phase });
const parked = (stand: string, start: number, end: number) => leg(start, end, [STAND_POINTS[stand]], `tại stand ${stand}`);

export function surfacePosition(plan: SurfacePlan, time: number) {
  const item = plan.legs.find((part) => time < part.end) ?? plan.legs.at(-1)!;
  const progress = (time - item.start) / Math.max(1, item.end - item.start);
  const point = pointAlongPath(item.points, progress);
  const next = pointAlongPath(item.points, Math.min(1, progress + 0.005));
  const previous = pointAlongPath(item.points, Math.max(0, progress - 0.005));
  return { point, phase: item.phase, rotation: item.points.length < 2 ? 0 : Math.atan2(next.x - previous.x, previous.y - next.y) * 180 / Math.PI };
}

export function planSurfaceTraffic(departures: TimelineItem[], inbound: ArrivalTimelineItem[], runway: string) {
  const reservations = new Reservations();
  let runwayAvailable = -Infinity;
  const flights = [...departures].sort((a, b) => a.wheelsOff - b.wheelsOff).map((source) => {
    if (!Number.isFinite(source.wheelsOff)) return source;
    let chosen: TimelineItem | undefined;
    const radius = source.wakeCategory === 'H' ? 15 : 9;
    const standChoices = [source.stand];
    let delay = Math.max(0, runwayAvailable - source.runwayEntryStart);
    // Delay is allocated before pushback, never by freezing an aircraft on a junction.
    while (!chosen && delay < MAX_RESCHEDULE_MS) {
      let nextDelay = Infinity;
      for (const stand of standChoices) {
        for (const route of taxiRoutes(stand)) {
          const taxiMs = taxiDuration(pathLength(route.points));
          const entry = Math.max(source.runwayEntryStart + delay, source.readyAt + taxiMs);
          const legs: SurfaceLeg[] = [];
          let taxiStart = entry - taxiMs;
          const groundMiss = entry + RUNWAY_ENTRY_MS + TAKEOFF_ROLL_MS > source.ctot + 600_000;
          let returnStart = source.returnStart ?? (groundMiss ? Math.max(source.ctot + 600_001, source.readyAt + taxiMs) : null);
          let returnEnd = source.returnEnd, secondTaxiStart = source.secondTaxiStart;
          const returnStand = source.returnStand ?? (groundMiss ? getNearestReturnStand(stand, new Set(), source.wakeCategory) : null);
          if (returnStart !== null && returnStand) {
            // The scripted expiry occurs at S1; schedule its first taxi just in time.
            returnStart += delay;
            taxiStart = Math.max(source.readyAt, returnStart - taxiMs);
            returnStart = taxiStart + taxiMs;
            legs.push(parked(stand, Math.max(source.readyAt - 120_000, taxiStart - 120_000), taxiStart));
            legs.push(leg(taxiStart, returnStart, route.points, 'lăn ra điểm chờ S1'));
            const back = taxiRoutes(returnStand, 'S1')[0].points;
            returnEnd = returnStart + taxiDuration(pathLength(back));
            legs.push(leg(returnStart, returnEnd, back, 'không tuân thủ CTOT · quay về vị trí đỗ'));
            secondTaxiStart = Math.max(returnEnd + 120_000, entry - taxiDuration(pathLength(taxiRoutes(returnStand)[0].points)));
            legs.push(parked(returnStand, returnEnd, secondTaxiStart));
            const outbound = taxiRoutes(returnStand)[0].points;
            legs.push(leg(secondTaxiStart, secondTaxiStart + taxiDuration(pathLength(outbound)), outbound, 'lăn theo TSAT mới'));
          } else {
            legs.push(parked(stand, Math.max(source.readyAt - 120_000, taxiStart - 120_000), taxiStart));
            legs.push(leg(taxiStart, entry, route.points, 'lăn ra điểm chờ S1'));
          }
          const runwayEntryStart = Math.max(entry, legs.at(-1)!.end);
          if (legs.at(-1)!.end < runwayEntryStart) legs.push(leg(legs.at(-1)!.end, runwayEntryStart, [route.points.at(-1)!], 'chờ tại S1'));
          const segment = getRunwaySegment(runway);
          const takeoffRollStart = runwayEntryStart + RUNWAY_ENTRY_MS, wheelsOff = takeoffRollStart + TAKEOFF_ROLL_MS;
          legs.push(leg(runwayEntryStart, takeoffRollStart, segment.entryPath, 'vào đường băng 25L'));
          // Reservation samples follow the same acceleration as the animation.
          const rollLegs = Array.from({ length: Math.ceil(TAKEOFF_ROLL_MS / STEP) }, (_, i) => {
            const start = i * STEP, end = Math.min(TAKEOFF_ROLL_MS, (i + 1) * STEP);
            return leg(takeoffRollStart + start, takeoffRollStart + end,
              [pointAlongPath([segment.threshold, segment.rollEnd], takeoffDistanceProgress(start / TAKEOFF_ROLL_MS)),
                pointAlongPath([segment.threshold, segment.rollEnd], takeoffDistanceProgress(end / TAKEOFF_ROLL_MS))], 'cất cánh 25L');
          });
          if (!reservations.available([...legs, ...rollLegs], radius)) {
            nextDelay = Math.min(nextDelay, delay + Math.max(10_000, reservations.lastConflictDelay));
            continue;
          }
          reservations.reserve([...legs, ...rollLegs], radius);
          const revised = source.missedCtot || wheelsOff > source.ctot + 600_000;
          chosen = { ...source, stand, taxiStart, taxiMinutes: taxiMs / 60_000, runwayEntryStart, takeoffRollStart, wheelsOff,
            returnStart, returnEnd, returnStand, secondTaxiStart,
            tsat: taxiStart, reissuedTsat: revised ? secondTaxiStart ?? taxiStart : null,
            reissuedCtot: revised ? wheelsOff : source.reissuedCtot,
            missedCtot: revised, status: revised ? 'Không tuân thủ CTOT' : source.status, waitMinutes: Math.max(0, (wheelsOff - source.readyAt - taxiMs) / 60_000),
            surfacePlan: { visibleFrom: legs[0].start, visibleUntil: wheelsOff + 8000, legs, route: route.label } };
          runwayAvailable = wheelsOff + RUNWAY_CLEARANCE_MS;
          break;
        }
        if (chosen) break;
      }
      if (!chosen) delay = Number.isFinite(nextDelay) ? nextDelay : delay + 10_000;
    }
    if (!chosen) throw new Error(`Không tìm được đường lăn an toàn cho ${source.callsign} trong 48 giờ. Hãy kiểm tra mật độ lịch và vị trí đỗ.`);
    return chosen;
  });
  let landingAvailable = -Infinity;
  const arrivals = [...inbound].sort((a, b) => a.touchdown - b.touchdown).map((source) => {
    let chosen: ArrivalTimelineItem | undefined;
    let delay = Math.max(0, landingAvailable - source.touchdown);
    while (!chosen && delay < MAX_RESCHEDULE_MS) {
      let nextDelay = Infinity;
      for (const branch of ['P4', 'P5'] as const) {
        const route = getArrivalRoutePoints(source.stand, branch);
        const landingEnd = source.touchdown + delay + landingRollDuration(pathLength(route.landing), source.approachSpeedKts);
        const p5HoldAt = landingEnd + taxiDuration(pathLength(route.toHold));
        // Recompute the crossing against the final runway schedule. Carrying
        // the preliminary queue wait forward would add that same wait again
        // every time the arrival is retimed for a surface conflict.
        let crossingStart = p5HoldAt;
        for (const flight of flights) if (crossingStart + 45_000 > flight.runwayEntryStart && crossingStart < flight.wheelsOff + RUNWAY_CLEARANCE_MS) crossingStart = flight.wheelsOff + RUNWAY_CLEARANCE_MS;
        const crossingEnd = crossingStart + 45_000;
        const standArrival = crossingEnd + taxiDuration(pathLength(route.fromHold.slice(2)));
        const legs = [leg(source.approachStart + delay, source.touchdown + delay, route.approach, 'tiếp cận 25R'),
          leg(source.touchdown + delay, landingEnd, route.landing, 'hạ cánh 25R'),
          leg(landingEnd, p5HoldAt, route.toHold, `lăn theo ${branch} đến điểm chờ P5`),
          leg(p5HoldAt, crossingStart, [route.toHold.at(-1)!], 'dừng trước 25L tại P5'),
          leg(crossingStart, crossingEnd, route.fromHold.slice(0, 3), 'cắt qua 25L'),
          leg(crossingEnd, standArrival, route.fromHold.slice(2), `lăn vào stand ${source.stand}`),
          parked(source.stand, standArrival, standArrival + 45 * 60_000)];
        const radius = source.wakeCategory === 'H' ? 15 : 9;
        if (!reservations.available(legs, radius)) {
          nextDelay = Math.min(nextDelay, delay + reservations.lastConflictDelay);
          continue;
        }
        reservations.reserve(legs, radius);
        chosen = { ...source, approachStart: source.approachStart + delay, touchdown: source.touchdown + delay, landingEnd,
          p5HoldAt, crossingStart, crossingEnd, standArrival, exitBranch: branch,
          surfacePlan: { visibleFrom: source.approachStart + delay, visibleUntil: legs.at(-1)!.end, legs, route: branch } };
        landingAvailable = landingEnd + 60_000;
        break;
      }
      if (!chosen) delay = Number.isFinite(nextDelay) ? nextDelay : delay + STEP;
    }
    if (!chosen) throw new Error(`Không tìm được đường lăn an toàn cho ${source.callsign}.`);
    return chosen;
  });
  return { flights, arrivals };
}
