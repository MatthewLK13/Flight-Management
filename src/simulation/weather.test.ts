import { describe, expect, it } from 'vitest';
import { runSimulation, type ScheduledFlight } from './runSimulation';
import { departurePosition } from '../map/playback';
import { applyWeatherPeriods, weatherStatus, weatherDclEvents } from './weather';
import { formatDclMessage } from '../dcl/dclScenario';
import { scheduleArrivals } from './arrivals';
import { readFileSync } from 'node:fs';
import { readFlightFile } from '../data/workbook';
import { isArrivalAtTsn, isDepartureFromTsn, toDayString } from '../data/enrichFlights';
import { toScheduledFlights } from './runSimulation';

const minute = 60_000;
const flight = (id: string, ready: number, ctot: number): ScheduledFlight => ({
  id, callsign: id, aircraftType: 'A321', wakeCategory: 'M', stand: '73',
  readyAt: ready * minute, ctot: ctot * minute, taxiMinutes: 8, row: {},
});

describe('manual adverse weather', () => {
  it('blocks new departures indefinitely while the clock can pass CTOT', () => {
    const base = runSimulation([flight('ONE', 10, 20)]).flights;
    const result = applyWeatherPeriods(base, [], [{ start: 11 * minute, end: null }], '25L-25R');
    const delayed = result.flights[0];
    expect(delayed.wheelsOff).toBe(Infinity);
    expect(weatherStatus(delayed, 30 * minute)?.missed).toBe(false);
    expect(weatherStatus(delayed, 31 * minute)?.missed).toBe(true);
    expect(delayed.reissuedCtot).toBeNull();
    expect(departurePosition(delayed, 50 * minute, 0, '25L-25R').phase).toContain('chờ TSAT/CTOT mới');
  });

  it('returns from the current position without a jump, then issues finite slots on recovery', () => {
    const base = runSimulation([flight('ONE', 10, 20)]).flights;
    const rain = applyWeatherPeriods(base, [], [{ start: 11 * minute, end: null }], '25L-25R').flights[0];
    const returning = rain.weather!;
    const before = departurePosition(rain, returning.returnStart! - 1, 0, '25L-25R').point;
    const after = departurePosition(rain, returning.returnStart!, 0, '25L-25R').point;
    expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(0.01);
    const recovered = applyWeatherPeriods(base, [], [{ start: 11 * minute, end: 50 * minute }], '25L-25R').flights[0];
    expect(recovered.reissuedTsat).toBeGreaterThanOrEqual(50 * minute);
    expect(recovered.reissuedCtot).toBeNull();
    const events = weatherDclEvents([recovered], [{ start: 11 * minute, end: 50 * minute }]);
    expect(events.every((event) => formatDclMessage(event.message).length > 1)).toBe(true);
    expect(events.some((event) => event.message.includes('TSAT REVISED'))).toBe(true);
    expect(recovered.runwayEntryStart).toBeGreaterThan(recovered.weather!.returnEnd!);
    expect(departurePosition(recovered, recovered.takeoffRollStart + 30_000, 0, '25L-25R').phase).toBe('cất cánh 25L');
  });

  it('keeps aircraft that have not started at their stand and preserves committed departures', () => {
    const base = runSimulation([flight('ONE', 10, 20), flight('TWO', 40, 50)]).flights;
    const result = applyWeatherPeriods(base, [], [{ start: 19 * minute, end: 70 * minute }], '25L-25R');
    expect(result.flights[0]).toBe(base[0]);
    const waiting = result.flights[1];
    expect(waiting.weather!.heldAtStand).toBe(true);
    expect(waiting.weather!.returnStand).toBe('73');
    expect(departurePosition(waiting, 65 * minute, 0, '25L-25R').phase).toContain('stand 73');
    expect(waiting.secondTaxiStart).toBeGreaterThanOrEqual(70 * minute);
  });

  it('lets a valid slot depart before an expired aircraft returning from its stand', () => {
    const base = runSimulation([flight('EXPIRED', 10, 20), flight('VALID', 20, 50)]).flights;
    const result = applyWeatherPeriods(base, [], [{ start: 11 * minute, end: 35 * minute }], '25L-25R');
    const valid = result.flights.find((item) => item.id === 'VALID')!;
    const expired = result.flights.find((item) => item.id === 'EXPIRED')!;
    expect(valid.weather?.missedAt).toBeNull();
    expect(valid.wheelsOff).toBeLessThanOrEqual(60 * minute);
    expect(valid.wheelsOff).toBeLessThan(expired.wheelsOff);
  });

  it('retains Medium aircraft needed between Heavy departures after rain', () => {
    const heavy = (id: string, ready: number, ctot: number): ScheduledFlight => ({
      ...flight(id, ready, ctot), aircraftType: 'B777', wakeCategory: 'H', stand: '23',
    });
    const base = runSimulation([heavy('H1', 10, 20), flight('M1', 12, 22), heavy('H2', 14, 24)]).flights;
    const result = applyWeatherPeriods(base, [], [{ start: 11 * minute, end: 50 * minute }], '25L-25R');
    expect(result.flights.every((item) => Number.isFinite(item.wheelsOff))).toBe(true);
    expect(result.flights.map((item) => item.wakeCategory)).toEqual(['H', 'M', 'H']);
  });

  it('preserves past positions across repeated weather toggles', () => {
    const base = runSimulation([flight('ONE', 10, 20)]).flights;
    const first = [{ start: 11 * minute, end: 50 * minute }];
    const initial = applyWeatherPeriods(base, [], first, '25L-25R').flights[0];
    const repeated = applyWeatherPeriods(base, [], [...first, { start: 51 * minute, end: 80 * minute }], '25L-25R').flights[0];
    expect(departurePosition(repeated, 35 * minute, 0, '25L-25R')).toEqual(departurePosition(initial, 35 * minute, 0, '25L-25R'));
    expect(repeated.wheelsOff).toBeGreaterThan(initial.wheelsOff);
  });

  it('does not rewrite earlier issued slots when a later brief shower has no impact', () => {
    const base = runSimulation([flight('ONE', 10, 20), flight('TWO', 12, 22)]).flights;
    const first = [{ start: 11 * minute, end: 50 * minute }];
    const initial = applyWeatherPeriods(base, [], first, '25L-25R');
    const repeated = applyWeatherPeriods(base, [], [...first, { start: 51 * minute, end: 51.5 * minute }], '25L-25R');
    for (const item of initial.flights) {
      const after = repeated.flights.find((candidate) => candidate.id === item.id)!;
      expect(after.reissuedCtot).toBe(item.reissuedCtot);
      expect(after.reissuedTsat).toBe(item.reissuedTsat);
    }
  });

  it('delays future arrivals and retains P5 runway crossing separation after recovery', () => {
    const base = runSimulation([flight('ONE', 10, 20)]).flights;
    const arrivals = scheduleArrivals([{
      CallSign: 'ARR', PlaneTypeCode: 'A321', Stand: '16', ScheduledArrival: new Date(25 * minute).toISOString(),
    }], base);
    const blocked = applyWeatherPeriods(base, arrivals, [{ start: 11 * minute, end: null }], '25L-25R');
    expect(blocked.arrivals[0].touchdown).toBe(Infinity);
    const recovered = applyWeatherPeriods(base, arrivals, [{ start: 11 * minute, end: 50 * minute }], '25L-25R');
    expect(recovered.arrivals[0].approachStart).toBeGreaterThanOrEqual(50 * minute);
    for (const dep of recovered.flights) {
      const arr = recovered.arrivals[0];
      expect(arr.crossingEnd <= dep.runwayEntryStart || arr.crossingStart >= dep.wheelsOff + 10_000).toBe(true);
    }
  });
});

describe('weather recovery with bundled workbooks', () => {
  it.each(['21102026.xlsx', 'chuyen-de.xlsx', '3-days.xls', '7-days.xls'])('recovers every departure in %s with valid slots and runway separation', async (filename) => {
    const bytes = readFileSync(`public/samples/${filename}`);
    const file = new File([bytes], filename);
    Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(bytes).buffer });
    const workbook = await readFlightFile(file);
    const counts = new Map<string, number>();
    for (const row of workbook.enrichedRows.filter(isDepartureFromTsn)) {
      const day = toDayString(row.FlyDate ?? row.Date);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const day = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const rows = workbook.enrichedRows.filter((row) => toDayString(row.FlyDate ?? row.Date) === day);
    const base = runSimulation(toScheduledFlights(rows.filter(isDepartureFromTsn)), true).flights;
    const arrivals = scheduleArrivals(rows.filter(isArrivalAtTsn), base);
    const start = base[0].taxiStart + minute;
    const plan = applyWeatherPeriods(base, arrivals, [{ start, end: start + 40 * minute }], '25L-25R');
    expect(plan.flights).toHaveLength(base.length);
    expect(plan.flights.every((item) => Number.isFinite(item.wheelsOff))).toBe(true);
    for (let index = 0; index < plan.flights.length; index += 1) {
      const item = plan.flights[index];
      if (item.reissuedTsat !== null) {
        expect(item.reissuedCtot).toBeNull();
        expect(item.wheelsOff).toBeGreaterThanOrEqual(item.reissuedTsat + item.taxiMinutes * minute);
      } else {
        const slot = item.reissuedCtot ?? item.ctot;
        expect(item.wheelsOff).toBeGreaterThanOrEqual(slot - 5 * minute);
        expect(item.wheelsOff).toBeLessThanOrEqual(slot + 10 * minute);
      }
      if (index > 0) {
        expect(item.runwayEntryStart).toBeGreaterThanOrEqual(plan.flights[index - 1].wheelsOff);
        expect(item.wakeCategory === 'H' && plan.flights[index - 1].wakeCategory === 'H').toBe(false);
      }
    }
    for (const arrival of plan.arrivals) {
      expect(Number.isFinite(arrival.standArrival)).toBe(true);
      for (const departure of plan.flights) {
        expect(arrival.crossingEnd <= departure.runwayEntryStart || arrival.crossingStart >= departure.wheelsOff + 10_000).toBe(true);
      }
    }
  });
});
