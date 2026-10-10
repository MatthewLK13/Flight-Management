import { describe, expect, it } from 'vitest';
import { enrichFlights, toDayString } from './enrichFlights';

describe('flight enrichment', () => {
  it('preserves source values and deterministically fills missing simulation fields', () => {
    const source = [{ CallSign: 'HVN123', PlaneTypeCode: 'A321', AirportDeliveryCode: 'VVTS', AirportReceiptCode: 'VVDN' }];
    const first = enrichFlights(source, 'sample.xls');
    const again = enrichFlights(source, 'sample.xls');
    expect(first[0].CallSign).toBe('HVN123');
    expect(first[0].CTOT).toBe(again[0].CTOT);
    expect(first[0].Stand).toBe(again[0].Stand);
    expect(first[0].SimulationStatus).toBe('Mô phỏng');
  });
});

describe('stand allocation', () => {
  it('assigns different compatible stands to overlapping departures', () => {
    const source = Array.from({ length: 30 }, (_, index) => ({
      CallSign: `VN${String(index + 1).padStart(3, '0')}`, PlaneTypeCode: 'A320',
      FlyDate: '03/11/23', DeliveryTime: '08:00', AirportDeliveryCode: 'VVTS', AirportReceiptCode: 'VVDN',
    }));
    const flights = enrichFlights(source, 'same-day.xls');
    expect(new Set(flights.map((flight) => flight.Stand)).size).toBe(30);
  });
});

  it('uses the source FlyDate and DeliveryTime format from the 7-day sample', () => {
    const [flight] = enrichFlights([{
      FlyDate: '05/11/23', DeliveryTime: '05:29', CallSign: 'VNA321',
      PlaneTypeCode: 'A321', AirportDeliveryCode: 'VVTS', AirportReceiptCode: 'VVDN',
    }], '7-day-sample.xls');
    expect(toDayString(flight.FlyDate)).toBe('2023-11-05');
    expect(new Date(String(flight.ScheduledDeparture)).getHours()).toBe(5);
    expect(new Date(String(flight.ScheduledDeparture)).getMinutes()).toBe(29);
  });

