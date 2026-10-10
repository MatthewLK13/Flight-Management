import { isWithinCtotWindow } from './ctot';
import { optimizeFlights } from './optimizer';

export const RUNWAY_MOVEMENT_MS = 2 * 60_000;
export const TAKEOFF_ROLL_MS = 60_000;

export type ScheduledFlight = {
  id: string; callsign: string; aircraftType: string; stand: string;
  readyAt: number; ctot: number; taxiMinutes: number; row: Record<string, unknown>;
};
export type TimelineItem = ScheduledFlight & {
  order: number; wheelsOff: number; taxiStart: number; waitMinutes: number;
  runwayEntryStart: number; takeoffRollStart: number;
  missedCtot: boolean; reissuedCtot: number | null; status: string;
};
export type SimulationResult = {
  flights: TimelineItem[]; totalWaitMinutes: number; missedCtot: number;
  reissuedCtot: number; completed: number; durationMinutes: number;
};

type QueueEntry = {
  flight: ScheduledFlight; slot: number; hadMissed: boolean;
  taxiStart: number; taxiComplete: number;
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
    return {
      id: String(row.CallSign ?? `FLT-${index + 1}`) + `-${index}`,
      callsign: String(row.CallSign ?? `FLT-${index + 1}`),
      aircraftType: String(row.PlaneTypeCode ?? row.AircraftType ?? 'A320'),
      stand: String(row.Stand ?? '—'), readyAt: Math.max(scheduled - taxiMinutes * 60_000, standReady), ctot, taxiMinutes, row,
    };
  });
}

function runOrderedSimulation(ordered: ScheduledFlight[]): SimulationResult {
  // Dispatch only aircraft that are ready. A future flight must never block
  // the taxiway or count as part of the physical runway holding queue.
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
    taxiwayAvailable += RUNWAY_MOVEMENT_MS;
  }
  arrivals.sort((a, b) => a.taxiComplete - b.taxiComplete || a.flight.id.localeCompare(b.flight.id));

  const holdingQueue: QueueEntry[] = [];
  const result: TimelineItem[] = [];
  let runwayAvailable = -Infinity;
  let nextArrival = 0;
  let clock = arrivals[0]?.taxiComplete ?? 0;
  while (nextArrival < arrivals.length || holdingQueue.length) {
    if (!holdingQueue.length && nextArrival < arrivals.length) clock = Math.max(clock, arrivals[nextArrival].taxiComplete);
    while (nextArrival < arrivals.length && arrivals[nextArrival].taxiComplete <= clock) holdingQueue.push(arrivals[nextArrival++]);
    if (!holdingQueue.length) continue;

    const item = holdingQueue.shift()!;
    const earliestTakeoff = Math.max(item.taxiComplete + RUNWAY_MOVEMENT_MS, runwayAvailable, item.slot - 5 * 60_000);
    // Include aircraft that have actually reached the holding point before
    // this slot. Only these aircraft can be ahead of a missed-CTOT flight.
    while (nextArrival < arrivals.length && arrivals[nextArrival].taxiComplete <= earliestTakeoff) holdingQueue.push(arrivals[nextArrival++]);
    const originalWindowMissed = !isWithinCtotWindow(new Date(earliestTakeoff), new Date(item.slot));
    if (originalWindowMissed && !item.hadMissed) {
      const nextSlot = earliestTakeoff + holdingQueue.length * RUNWAY_MOVEMENT_MS;
      holdingQueue.push({ ...item, slot: nextSlot, hadMissed: true });
      clock = Math.max(clock, Math.min(earliestTakeoff, item.slot + 10 * 60_000));
      continue;
    }
    const wheelsOff = earliestTakeoff;
    // New CTOT is finalized at the next usable slot after the current
    // holding queue. If intervening traffic shifted it, update the slot.
    const reissuedCtot = item.hadMissed ? wheelsOff : null;
    const flight = item.flight;
    const waitMinutes = Math.max(0, (wheelsOff - flight.readyAt - flight.taxiMinutes * 60_000 - RUNWAY_MOVEMENT_MS) / 60_000);
    const missedCtot = item.hadMissed;
    runwayAvailable = wheelsOff + RUNWAY_MOVEMENT_MS;
    clock = runwayAvailable;
    result.push({
      ...flight, order: result.length + 1, taxiStart: item.taxiStart, wheelsOff, waitMinutes, missedCtot,
      // One minute for the curved S1 entry, then one minute along the runway.
      runwayEntryStart: wheelsOff - RUNWAY_MOVEMENT_MS,
      takeoffRollStart: wheelsOff - TAKEOFF_ROLL_MS,
      reissuedCtot, status: missedCtot ? 'Lỡ CTOT · cấp lại' : waitMinutes > 0.1 ? 'Đang chờ' : 'Đúng CTOT',
    });
  }
  result.sort((a, b) => a.wheelsOff - b.wheelsOff || a.id.localeCompare(b.id));
  result.forEach((flight, index) => { flight.order = index + 1; });
  const totalWaitMinutes = result.reduce((sum, flight) => sum + flight.waitMinutes, 0);
  return {
    flights: result, totalWaitMinutes, missedCtot: result.filter((f) => f.missedCtot).length,
    reissuedCtot: result.filter((f) => f.reissuedCtot !== null).length,
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


