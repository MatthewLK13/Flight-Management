import { isWithinCtotWindow } from './ctot';
import { optimizeFlights } from './optimizer';
import { wakeCategory, type WakeCategory } from '../data/aircraft';
import { getNearestReturnStand } from '../map/airfieldGeometry';

import { RUNWAY_MOVEMENT_MS, TAKEOFF_ROLL_MS } from './movementPhysics';
export { RUNWAY_MOVEMENT_MS, TAKEOFF_ROLL_MS };

export type ScheduledFlight = {
  id: string; callsign: string; aircraftType: string; stand: string; wakeCategory: WakeCategory;
  readyAt: number; ctot: number; taxiMinutes: number; row: Record<string, unknown>;
  forceCtotMiss?: boolean;
};
export type TimelineItem = ScheduledFlight & {
  surfacePlan?: import('./surfaceTraffic').SurfacePlan;
  weather?: import('./weather').WeatherDepartureState;
  order: number; wheelsOff: number; taxiStart: number; waitMinutes: number;
  runwayEntryStart: number; takeoffRollStart: number;
  missedCtot: boolean; reissuedCtot: number | null; tsat: number; reissuedTsat: number | null;
  returnStart: number | null; returnEnd: number | null; returnStand: string | null; secondTaxiStart: number | null; status: string;
};
export type SimulationResult = {
  flights: TimelineItem[]; totalWaitMinutes: number; missedCtot: number;
  reissuedCtot: number; completed: number; durationMinutes: number;
};

type QueueEntry = {
  flight: ScheduledFlight; slot: number; hadMissed: boolean;
  taxiStart: number; taxiComplete: number; returnStart?: number; returnEnd?: number; returnStand?: string; secondTaxiStart?: number;
};

function dateNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toScheduledFlights(rows: Record<string, unknown>[]): ScheduledFlight[] {
  return rows.map((row, index) => {
    const scheduled = dateNumber(row.ScheduledDeparture, Date.parse('2023-11-03T05:00:00Z') + index * 180_000);
    const ctot = dateNumber(row.CTOT, scheduled);
    const taxiMinutes = Math.max(3, Math.min(20, Number(row.TaxiMinutes) || 8));
    const standReady = dateNumber(row.StandReadyAt, scheduled - taxiMinutes * 60_000);
    const aircraftType = String(row.PlaneTypeCode ?? row.AircraftType ?? 'A320');
    return {
      id: String(row.CallSign ?? `FLT-${index + 1}`) + `-${index}`,
      callsign: String(row.CallSign ?? `FLT-${index + 1}`),
      aircraftType, wakeCategory: wakeCategory(aircraftType),
      forceCtotMiss: String(row.Compliance ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ') === 'khong tuan thu',
      stand: String(row.Stand ?? '—'), readyAt: Math.max(scheduled - taxiMinutes * 60_000, standReady), ctot, taxiMinutes, row,
    };
  });
}

function runOrderedSimulation(ordered: ScheduledFlight[]): SimulationResult {
  if (!ordered.length) return { flights: [], totalWaitMinutes: 0, missedCtot: 0, reissuedCtot: 0, completed: 0, durationMinutes: 0 };
  const pending = [...ordered];
  const arrivals: QueueEntry[] = [];
  let taxiwayAvailable = Math.min(...ordered.map((flight) => flight.readyAt));
  while (pending.length) {
    let nextIndex = pending.findIndex((flight) => flight.readyAt <= taxiwayAvailable);
    if (nextIndex < 0) {
      taxiwayAvailable = Math.min(...pending.map((flight) => flight.readyAt));
      nextIndex = pending.findIndex((flight) => flight.readyAt <= taxiwayAvailable);
    }
    const [flight] = pending.splice(nextIndex, 1);
    const taxiStart = taxiwayAvailable;
    arrivals.push({ flight, slot: flight.ctot, hadMissed: false, taxiStart, taxiComplete: taxiStart + flight.taxiMinutes * 60_000 });
    taxiwayAvailable += 120_000;
  }
  arrivals.sort((a, b) => a.taxiComplete - b.taxiComplete || a.flight.id.localeCompare(b.flight.id));

  const holdingQueue: QueueEntry[] = [];
  const returnReservations = new Map<string, number>();
  const result: TimelineItem[] = [];
  let runwayAvailable = -Infinity;
  let nextArrival = 0;
  let clock = arrivals[0]?.taxiComplete ?? 0;
  while (nextArrival < arrivals.length || holdingQueue.length) {
    if (!holdingQueue.length && nextArrival < arrivals.length) clock = Math.max(clock, arrivals[nextArrival].taxiComplete);
    while (nextArrival < arrivals.length && arrivals[nextArrival].taxiComplete <= clock) holdingQueue.push(arrivals[nextArrival++]);
    if (!holdingQueue.length) continue;

    if (result.at(-1)?.wakeCategory === 'H' && holdingQueue[0].flight.wakeCategory === 'H') {
      const mediumIndex = holdingQueue.findIndex((entry) => entry.flight.wakeCategory === 'M');
      if (mediumIndex >= 0) holdingQueue.unshift(holdingQueue.splice(mediumIndex, 1)[0]);
      else {
        const nextMedium = arrivals.slice(nextArrival).find((entry) => entry.flight.wakeCategory === 'M');
        if (!nextMedium) throw new Error('Không thể xếp hai tàu H không liên tiếp: hàng chờ không còn tàu M.');
        clock = Math.max(clock, nextMedium.taxiComplete);
        continue;
      }
    }

    const item = holdingQueue.shift()!;
    const earliestTakeoff = Math.max(item.taxiComplete + RUNWAY_MOVEMENT_MS, runwayAvailable, item.slot - 5 * 60_000);
    while (nextArrival < arrivals.length && arrivals[nextArrival].taxiComplete <= earliestTakeoff) holdingQueue.push(arrivals[nextArrival++]);
    const forcedMiss = Boolean(item.flight.forceCtotMiss && !item.hadMissed);
    const originalWindowMissed = forcedMiss || !isWithinCtotWindow(new Date(earliestTakeoff), new Date(item.slot));
    if (originalWindowMissed && !item.hadMissed) {
      const returnStart = Math.max(item.taxiComplete, item.slot + 10 * 60_000 + 1);
      const returnEnd = returnStart + item.flight.taxiMinutes * 60_000;
      const unavailable = new Set([...returnReservations].filter(([, until]) => until > returnStart).map(([stand]) => stand));
      const returnStand = getNearestReturnStand(item.flight.stand, unavailable, item.flight.wakeCategory);
      const secondTaxiStart = Math.max(returnEnd + 2 * 60_000, earliestTakeoff + holdingQueue.length * RUNWAY_MOVEMENT_MS);
      const newSlot = secondTaxiStart + item.flight.taxiMinutes * 60_000 + RUNWAY_MOVEMENT_MS;
      returnReservations.set(returnStand, newSlot);
      const reissued: QueueEntry = {
        ...item, slot: newSlot, hadMissed: true, taxiComplete: secondTaxiStart + item.flight.taxiMinutes * 60_000,
        returnStart, returnEnd, returnStand, secondTaxiStart,
      };
      let insertion = nextArrival;
      while (insertion < arrivals.length && arrivals[insertion].taxiComplete <= reissued.taxiComplete) insertion += 1;
      arrivals.splice(insertion, 0, reissued);
      // A forced scenario waits for expiry without blocking other valid slots.
      if (!forcedMiss) clock = Math.max(clock, returnStart);
      continue;
    }
    const wheelsOff = earliestTakeoff;
    const reissuedCtot = item.hadMissed ? wheelsOff : null;
    const flight = item.flight;
    const waitMinutes = Math.max(0, (wheelsOff - flight.readyAt - flight.taxiMinutes * 60_000 - RUNWAY_MOVEMENT_MS) / 60_000);
    runwayAvailable = wheelsOff + RUNWAY_MOVEMENT_MS;
    clock = runwayAvailable;
    result.push({
      ...flight, order: result.length + 1, taxiStart: item.taxiStart, wheelsOff, waitMinutes,
      missedCtot: item.hadMissed, runwayEntryStart: wheelsOff - RUNWAY_MOVEMENT_MS,
      takeoffRollStart: wheelsOff - TAKEOFF_ROLL_MS, reissuedCtot,
      tsat: item.taxiStart, reissuedTsat: item.secondTaxiStart ?? null,
      returnStart: item.returnStart ?? null, returnEnd: item.returnEnd ?? null,
      returnStand: item.returnStand ?? null, secondTaxiStart: item.secondTaxiStart ?? null,
      status: item.hadMissed ? 'Không tuân thủ CTOT' : waitMinutes > 0.1 ? 'Đang chờ' : 'Đúng CTOT',
    });
  }
  result.sort((a, b) => a.wheelsOff - b.wheelsOff || a.id.localeCompare(b.id));
  result.forEach((flight, index) => { flight.order = index + 1; });
  const totalWaitMinutes = result.reduce((sum, flight) => sum + flight.waitMinutes, 0);
  return {
    flights: result, totalWaitMinutes, missedCtot: result.filter((flight) => flight.missedCtot).length,
    reissuedCtot: result.filter((flight) => flight.reissuedCtot !== null).length,
    completed: result.length, durationMinutes: result.length ? (result.at(-1)!.wheelsOff - result[0].readyAt) / 60_000 : 0,
  };
}

export function runSimulation(flights: ScheduledFlight[], proposed = false): SimulationResult {
  if (!proposed) {
    return runOrderedSimulation([...flights].sort((a, b) => a.ctot - b.ctot || a.readyAt - b.readyAt || a.id.localeCompare(b.id)));
  }
  const baselineOrder = [...flights].sort((a, b) => a.ctot - b.ctot || a.readyAt - b.readyAt || a.id.localeCompare(b.id));
  const baseline = runOrderedSimulation(baselineOrder);
  const greedyOrder = optimizeFlights(flights.map((flight) => ({ ...flight, ctot: flight.ctot, ready: flight.readyAt, taxi: flight.taxiMinutes })));
  const readyOrder = [...flights].sort((a, b) => a.readyAt - b.readyAt || a.ctot - b.ctot || a.id.localeCompare(b.id));
  const candidates = [runOrderedSimulation(greedyOrder), runOrderedSimulation(readyOrder), baseline];
  candidates.sort((a, b) => a.totalWaitMinutes - b.totalWaitMinutes || a.missedCtot - b.missedCtot);
  return candidates[0];
}

export function improvementPercent(baseline: number, proposed: number): number {
  return baseline <= 0 ? 0 : Math.max(0, ((baseline - proposed) / baseline) * 100);
}


