import { describe, expect, it } from 'vitest';
import { reserveCrossingsBeforeDeparture } from './runwayCoordination';
import { runSimulation } from './runSimulation';
import { scheduleArrivals } from './arrivals';
import { applyWeatherPeriods } from './weather';
import { RUNWAY_MOVEMENT_MS, TAKEOFF_ROLL_MS } from './movementPhysics';

const minute = 60_000;

describe('P5 crossing priority', () => {
  it('serves waiting arrivals after the occupied runway is released and before the next departure', () => {
    const priority = reserveCrossingsBeforeDeparture(11.5 * minute, 11 * minute,
      [{ id: 'ARR1', p5HoldAt: 10 * minute }, { id: 'ARR2', p5HoldAt: 10.5 * minute }]);
    expect(priority.entry).toBe(13 * minute);
    expect(priority.served).toEqual(['ARR1', 'ARR2']);
  });

  it('computes takeoff time once per entry candidate across a large crossing calendar', () => {
    let calls = 0;
    const requests = Array.from({ length: 100 }, (_, i) => ({ id: `ARR${i}`, p5HoldAt: (100 + i) * minute,
      crossingStart: (100 + i) * minute, crossingEnd: (101 + i) * minute }));
    reserveCrossingsBeforeDeparture(10 * minute, 0, requests, entry => { calls += 1; return entry + minute; });
    expect(calls).toBe(1);
  });

  it('does not hold a departure for an arrival that has not reached P5', () => {
    expect(reserveCrossingsBeforeDeparture(11 * minute, 10 * minute,
      [{ id: 'ARR', p5HoldAt: 12 * minute }])).toEqual({ entry: 11 * minute, served: [] });
  });

  it('does not let a departure overtake an arrival retimed during weather recovery', () => {
    const tuples = [[28.05,38.35,5.14],[24.54,41.27,4.29],[7.44,36.32,5.6],[.82,53.34,6.49],
      [22.04,51.87,3.77],[6.86,40.13,7.48],[22.22,39.79,7.07]];
    const departures = runSimulation(tuples.map(([ready, ctot, taxiMinutes], i) => ({
      id: `D${i}`, callsign: `D${i}`, aircraftType: 'A321', wakeCategory: 'M' as const,
      stand: String(71 + i), readyAt: ready * minute, ctot: ctot * minute, taxiMinutes, row: {},
    }))).flights;
    const arrivals = scheduleArrivals([40.39,30.86,26.64,39.09,30.93].map((time, i) => ({
      CallSign: `A${i}`, Stand: String(16 + i), PlaneTypeCode: 'A321',
      ScheduledArrival: new Date(time * minute).toISOString(),
    })), departures);
    const result = applyWeatherPeriods(departures, arrivals, [{ start: 5 * minute, end: 25 * minute }], '25L-25R');
    for (const arrival of result.arrivals) for (const departure of result.flights) {
      expect(departure.runwayEntryStart < arrival.p5HoldAt || departure.runwayEntryStart >= arrival.crossingEnd,
        `${arrival.callsign}/${departure.callsign}`).toBe(true);
    }
  });

  it('retains P5 priority when departure clearances resume after weather', () => {
    const template = runSimulation([{
      id: 'DEP', callsign: 'DEP', aircraftType: 'A321', wakeCategory: 'M', stand: '73',
      readyAt: 50 * minute, ctot: 80 * minute, taxiMinutes: 8, row: {},
    }]).flights[0];
    const departure = (id: string, wheelsOff: number) => ({ ...template, id, callsign: id,
      taxiStart: 50 * minute, tsat: 50 * minute, wheelsOff,
      runwayEntryStart: wheelsOff - RUNWAY_MOVEMENT_MS, takeoffRollStart: wheelsOff - TAKEOFF_ROLL_MS });
    const current = departure('CURRENT', 71 * minute);
    const next = departure('NEXT', 73 * minute);
    const arrival = { ...scheduleArrivals([{ CallSign: 'ARR', Stand: '75', PlaneTypeCode: 'A321',
      ScheduledArrival: new Date(60 * minute).toISOString() }], [])[0],
      p5HoldAt: 70 * minute, crossingStart: 75 * minute, crossingEnd: 75 * minute + 45_000,
      standArrival: 80 * minute };
    const result = applyWeatherPeriods([current, next], [arrival],
      [{ start: 70.5 * minute, end: 70.75 * minute }], '25L-25R');
    const crossing = result.arrivals[0];
    expect(result.flights[0].wheelsOff).toBe(current.wheelsOff);
    expect(crossing.crossingStart).toBeGreaterThanOrEqual(current.wheelsOff + 10_000);
    expect(crossing.crossingEnd).toBeLessThanOrEqual(result.flights.find(f => f.id === 'NEXT')!.runwayEntryStart);
  });
});
