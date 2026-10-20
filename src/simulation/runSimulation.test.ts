import { describe, expect, it } from 'vitest';
import { runSimulation, toScheduledFlights } from './runSimulation';


describe('runSimulation', () => {
  it('completes all flights and reports nonnegative wait and CTOT exceptions', () => {
    const flights = toScheduledFlights([
      { CallSign: 'VN100', ScheduledDeparture: '2023-11-03T08:00:00Z', CTOT: '2023-11-03T08:05:00Z', TaxiMinutes: 6 },
      { CallSign: 'QH200', ScheduledDeparture: '2023-11-03T08:01:00Z', CTOT: '2023-11-03T08:06:00Z', TaxiMinutes: 7 },
    ]);
    const result = runSimulation(flights);
    expect(result.completed).toBe(2);
    expect(result.totalWaitMinutes).toBeGreaterThanOrEqual(0);
    expect(result.flights[1].wheelsOff).toBeGreaterThan(result.flights[0].wheelsOff);
  });

  it('schedules runway entry and takeoff roll before wheels-off as movement time', () => {
    const [flight] = toScheduledFlights([
      { CallSign: 'VN300', ScheduledDeparture: '2023-11-03T08:00:00Z', CTOT: '2023-11-03T08:30:00Z', TaxiMinutes: 6 },
    ]);
    const result = runSimulation([flight]);
    const departure = result.flights[0];
    expect(departure.runwayEntryStart).toBeLessThan(departure.takeoffRollStart);
    expect(departure.takeoffRollStart).toBeLessThan(departure.wheelsOff);
    expect(departure.runwayEntryStart).toBeGreaterThanOrEqual(departure.taxiStart + flight.taxiMinutes * 60_000);
    expect(departure.wheelsOff - departure.takeoffRollStart).toBe(60_000);
  });
});

describe('holding point queue', () => {
  it('moves a missed CTOT flight to the queue tail and issues a new CTOT', () => {
    const flights = toScheduledFlights(Array.from({ length: 7 }, (_, i) => ({
      CallSign: `VN${String(i + 1).padStart(3, '0')}`,
      ScheduledDeparture: '2023-11-03T08:00:00Z',
      CTOT: '2023-11-03T08:00:00Z', TaxiMinutes: 2,
    })));
    const result = runSimulation(flights);
    const missed = result.flights.find((flight) => flight.missedCtot);
    expect(missed).toBeDefined();
    expect(missed?.order).toBeGreaterThan(5);
    expect(missed?.reissuedCtot).not.toBeNull();
  });
});

describe('wake category separation', () => {
  it('keeps a Medium aircraft between every pair of Heavy departures', () => {
    const flights = toScheduledFlights([
      { CallSign: 'H1', PlaneTypeCode: 'B788', ScheduledDeparture: '2023-11-03T08:00:00Z', CTOT: '2023-11-03T08:00:00Z', TaxiMinutes: 4 },
      { CallSign: 'H2', PlaneTypeCode: 'A350', ScheduledDeparture: '2023-11-03T08:00:00Z', CTOT: '2023-11-03T08:00:00Z', TaxiMinutes: 4 },
      { CallSign: 'M1', PlaneTypeCode: 'A320', ScheduledDeparture: '2023-11-03T08:00:00Z', CTOT: '2023-11-03T08:00:00Z', TaxiMinutes: 4 },
    ]);
    const result = runSimulation(flights);
    for (let index = 1; index < result.flights.length; index += 1) {
      expect(result.flights[index - 1].wakeCategory === 'H' && result.flights[index].wakeCategory === 'H').toBe(false);
    }
  });
});


describe('baseline comparison', () => {
  it('keeps the proposed schedule no worse than the baseline wait objective', () => {
    const flights = toScheduledFlights(Array.from({ length: 80 }, (_, index) => ({
      CallSign: `VN${index}`,
      ScheduledDeparture: new Date(Date.parse('2023-11-03T04:00:00Z') + ((index * 137) % 180) * 60_000).toISOString(),
      CTOT: new Date(Date.parse('2023-11-03T04:00:00Z') + ((index * 149) % 180) * 60_000).toISOString(),
      TaxiMinutes: 5 + (index % 7),
    })));
    expect(runSimulation(flights, true).totalWaitMinutes).toBeLessThanOrEqual(runSimulation(flights).totalWaitMinutes);
  });
});

describe('taxiway occupancy', () => {
  it('keeps departures at least two minutes apart at the shared taxiway entry', () => {
    const flights = toScheduledFlights(Array.from({ length: 3 }, (_, index) => ({
      CallSign: `VN${index + 1}`,
      ScheduledDeparture: '2023-11-03T08:00:00Z',
      CTOT: new Date(Date.parse('2023-11-03T08:30:00Z') + index * 60_000).toISOString(),
      TaxiMinutes: 8,
    })));
    const result = runSimulation(flights);
    expect(result.flights[1].taxiStart - result.flights[0].taxiStart).toBeGreaterThanOrEqual(2 * 60_000);
  });
});
