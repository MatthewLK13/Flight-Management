import type { TimelineItem } from './runSimulation';

export function clearanceRequestTime(tsat: number, dayStart: number): number {
  return Math.max(dayStart, tsat - 10 * 60_000);
}

export function tsatWaitMinutes(actualTakeoff: number, tsat: number): number {
  if (!Number.isFinite(actualTakeoff) || !Number.isFinite(tsat)) return 0;
  return Math.max(0, (actualTakeoff - tsat) / 60_000);
}

/** Use only the latest TSAT already issued at the replay cursor. CTOT revisions do not reset it. */
export function departureTsatAt(flight: TimelineItem, time: number): number {
  if (flight.weather) {
    const { previous, start, revisionAt } = flight.weather;
    if (time >= start && flight.reissuedTsat !== null && revisionAt !== null && time >= revisionAt) return flight.reissuedTsat;
    return departureTsatAt(previous, time);
  }
  return flight.reissuedTsat !== null && time >= (flight.returnEnd ?? -Infinity) ? flight.reissuedTsat : flight.tsat;
}

export function departureWaitMinutesAt(flight: TimelineItem, time: number): number {
  if (flight.weather && time < flight.weather.start) return departureWaitMinutesAt(flight.weather.previous, time);
  return tsatWaitMinutes(Math.min(time, flight.wheelsOff), departureTsatAt(flight, time));
}
