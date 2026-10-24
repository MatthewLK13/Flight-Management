// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readFlightFile } from '../data/workbook';
import { isArrivalAtTsn, isDepartureFromTsn, toDayString } from '../data/enrichFlights';
import { departurePosition, arrivalPosition } from '../map/playback';
import { runSimulation, toScheduledFlights } from './runSimulation';
import { planSurfaceTraffic } from './surfaceTraffic';
import { scheduleArrivals } from './arrivals';
import { RUNWAY_CLEARANCE_MS } from './movementPhysics';
import { arrivalThresholdClearAt } from './runwayCoordination';

it('plans a 650-movement day without collisions, repeated P5 waits, or overlapping runway operations', async () => {
  const bytes = readFileSync('public/samples/3-days.xls');
  const workbook = await readFlightFile(new File([bytes], '3-days.xls'));
  const rows = workbook.enrichedRows.filter((row) => toDayString(row.FlyDate ?? row.Date) === '2023-11-03');
  const raw = runSimulation(toScheduledFlights(rows.filter(isDepartureFromTsn)), true);
  const inbound = scheduleArrivals(rows.filter(isArrivalAtTsn), raw.flights);
  const started = performance.now();
  const plan = planSurfaceTraffic(raw.flights, inbound, '25L-25R');
  expect(performance.now() - started).toBeLessThan(30_000);
  expect(plan.flights).toHaveLength(329);
  expect(plan.arrivals).toHaveLength(321);
  for (let index = 1; index < plan.arrivals.length; index += 1) {
    expect(plan.arrivals[index].touchdown).toBeGreaterThanOrEqual(plan.arrivals[index - 1].landingEnd + 60_000);
  }
  for (const arrival of plan.arrivals) for (const departure of plan.flights) {
    expect(arrival.crossingEnd <= departure.runwayEntryStart || arrival.crossingStart >= departure.wheelsOff + RUNWAY_CLEARANCE_MS).toBe(true);
    expect(departure.takeoffRollStart < arrival.approachStart || departure.takeoffRollStart >= arrivalThresholdClearAt(arrival)).toBe(true);
  }
  const all = [...plan.flights, ...plan.arrivals].sort((a, b) => a.surfacePlan!.visibleFrom - b.surfacePlan!.visibleFrom);
  const end = Math.max(...all.map((flight) => flight.surfacePlan!.visibleUntil));
  let next = 0, active: typeof all = [];
  // Verify the actual renderer positions rather than the scheduler's internal samples.
  for (let time = all[0].surfacePlan!.visibleFrom; time < end; time += 1000) {
    while (next < all.length && all[next].surfacePlan!.visibleFrom <= time) active.push(all[next++]);
    active = active.filter((flight) => flight.surfacePlan!.visibleUntil > time);
    const positions = active.map((flight) => ({ flight, ...('wheelsOff' in flight ? departurePosition(flight, time, 0, '25L') : arrivalPosition(flight, time)) }));
    for (let i = 0; i < positions.length; i += 1) for (let j = i + 1; j < positions.length; j += 1) {
      const a = positions[i], b = positions[j];
      const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
      const minimum = (a.flight.wakeCategory === 'H' ? 15 : 9) + (b.flight.wakeCategory === 'H' ? 15 : 9) - 1;
      if (distance < minimum) throw new Error(`Overlap ${a.flight.id}/${b.flight.id} at ${new Date(time).toISOString()}: ${distance.toFixed(2)} px`);
    }
  }
}, 60_000);
