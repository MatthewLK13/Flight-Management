import { describe, expect, it } from 'vitest';
import { enrichFlights } from './enrichFlights';

const occupied = Array.from({ length: 8 }, (_, i) => ({
  CallSign: `ARR${i}`, FlyDate: '01/10/26', PlaneTypeCode: 'A321',
  AirportDeliveryCode: 'RJAA', AirportReceiptCode: 'VVTS',
  ScheduledArrival: '2026-10-01T08:00:00Z', FlightDirection: 'ARR',
}));
const departure = {
  CallSign: 'DEP1', FlyDate: '01/10/26', PlaneTypeCode: 'A321',
  AirportDeliveryCode: 'VVTS', AirportReceiptCode: 'RJAA',
  ScheduledDeparture: '2026-10-01T08:00:00Z', FlightDirection: 'DEP', TaxiMinutes: 8,
};

describe('synthetic CTOT after stand allocation', () => {
  it('creates a feasible synthetic slot when all international stands are occupied', () => {
    const row = enrichFlights([...occupied, departure]).at(-1)!;
    const ready = new Date(String(row.StandReadyAt)).getTime();
    expect(ready).toBeGreaterThan(Date.parse(departure.ScheduledDeparture));
    expect(new Date(String(row.CTOT)).getTime()).toBeGreaterThan(ready);
  });

  it('preserves an explicitly supplied CTOT even if the stand is not ready', () => {
    const ctot = '2026-10-01T08:10:00.000Z';
    const row = enrichFlights([...occupied, { ...departure, CTOT: ctot }]).at(-1)!;
    expect(row.CTOT).toBe(ctot);
    expect(new Date(String(row.StandReadyAt)).getTime()).toBeGreaterThan(Date.parse(ctot));
  });
});
