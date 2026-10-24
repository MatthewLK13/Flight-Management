import { describe, expect, it } from 'vitest';
import { scheduleArrivals } from './arrivals';
import { arrivalThresholdClearAt, releaseTakeoffRoll } from './runwayCoordination';
import { toScheduledFlights, runSimulation } from './runSimulation';
import { planSurfaceTraffic } from './surfaceTraffic';
import { departurePosition } from '../map/playback';
import { getRunwaySegment } from '../map/airfieldGeometry';
import { RUNWAY_ENTRY_MS } from './movementPhysics';
import { applyWeatherPeriods } from './weather';

const arrivalAt = (time: number, type = 'A321') => scheduleArrivals([{
  CallSign: 'ARR1', Stand: '16', PlaneTypeCode: type, ScheduledArrival: new Date(time).toISOString(),
}], [])[0];

describe('25R arrival priority', () => {
  it('releases the departure only after the arriving aircraft has passed the threshold', () => {
    const arrival = arrivalAt(Date.parse('2026-10-01T08:10:00Z'));
    const clear = arrivalThresholdClearAt(arrival);
    expect(clear).toBeGreaterThan(arrival.approachStart);
    expect(clear).toBeLessThan(arrival.touchdown);
    expect(releaseTakeoffRoll(clear - 1, [arrival])).toBe(clear);
    expect(releaseTakeoffRoll(clear, [arrival])).toBe(clear);
    expect(releaseTakeoffRoll(arrival.approachStart - 1, [arrival])).toBe(arrival.approachStart - 1);
    // A future approach must not block the whole takeoff roll in advance.
    expect(releaseTakeoffRoll(arrival.approachStart - 30_000, [arrival])).toBe(arrival.approachStart - 30_000);
  });

  it('shows a stationary wait on 25L and protects the final retimed arrival schedule', () => {
    const raw = runSimulation(toScheduledFlights([{
      CallSign: 'DEP1', Stand: '71', PlaneTypeCode: 'A321',
      ScheduledDeparture: '2026-10-01T08:00:00Z', CTOT: '2026-10-01T08:10:00Z',
    }]));
    const alone = planSurfaceTraffic(raw.flights, [], '25L-25R').flights[0];
    const arrival = arrivalAt(alone.takeoffRollStart + 30_000);
    const plan = planSurfaceTraffic(raw.flights, [arrival], '25L-25R');
    const departure = plan.flights[0];
    const entryEnd = departure.runwayEntryStart + RUNWAY_ENTRY_MS;
    expect(departure.takeoffRollStart).toBeGreaterThan(entryEnd);
    const waiting = departurePosition(departure, (entryEnd + departure.takeoffRollStart) / 2, 0, '25L-25R');
    expect(waiting.point).toEqual(getRunwaySegment('25L-25R').threshold);
    expect(waiting.phase).toBe('chờ tàu đến vượt 25R');
    for (const inbound of plan.arrivals) {
      expect(departure.takeoffRollStart < inbound.approachStart
        || departure.takeoffRollStart >= arrivalThresholdClearAt(inbound)).toBe(true);
    }
  });

  it('retains the threshold rule when bad weather clears', () => {
    const minute = 60_000;
    const raw = runSimulation(toScheduledFlights([{
      CallSign: 'DEP1', Stand: '71', PlaneTypeCode: 'A321',
      ScheduledDeparture: 20 * minute, CTOT: 30 * minute,
    }]));
    const physical = planSurfaceTraffic(raw.flights, [arrivalAt(25 * minute)], '25L-25R');
    const recovered = applyWeatherPeriods(physical.flights, physical.arrivals,
      [{ start: 10 * minute, end: 35 * minute }], '25L-25R');
    for (const departure of recovered.flights) for (const arrival of recovered.arrivals) {
      expect(departure.takeoffRollStart < arrival.approachStart
        || departure.takeoffRollStart >= arrivalThresholdClearAt(arrival)).toBe(true);
    }
  });
});
