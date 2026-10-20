export type FlightRow = Record<string, unknown>;

import { isDomesticAirport, wakeCategory } from './aircraft';

const DOMESTIC_STANDS = [
  ...Array.from({ length: 24 }, (_, index) => String(index + 17)),
  ...Array.from({ length: 16 }, (_, index) => String(index + 71)),
  '77A', '79A', '81A',
  '104B', '104A', '103B', '103A', '102', '101', '100', '99', '98', '97', '96', '95', '94', '93', '92', '91',
];
const INTERNATIONAL_STANDS = Array.from({ length: 16 }, (_, index) => String(index + 1));
const DEPARTURE_TIME_FIELDS = ['ScheduledDeparture', 'STD', 'DepartureTime', 'DeliveryTime', 'Giờ khởi hành', 'STD (UTC)'];
const ARRIVAL_TIME_FIELDS = ['ATA', 'STA'];

function hashText(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function toDayString(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value > 20_000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (local) {
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return `${year}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
  }
  return '2023-11-03';
}

function sourceTime(row: FlightRow, day: string, fields: string[]): Date | null {
  for (const key of fields) {
    const value = row[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const date = new Date(`${day}T00:00:00`);
      date.setHours(value.getHours(), value.getMinutes(), value.getSeconds());
      return date;
    }
    if (typeof value === 'number' && value >= 0 && value < 1) {
      const date = new Date(`${day}T00:00:00`); date.setMinutes(Math.round(value * 1440)); return date;
    }
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      const time = text.match(/(?:^|T)(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
      if (time) {
        let hour = Number(time[1]);
        if (time[4]) hour = hour % 12 + (time[4].toUpperCase() === 'PM' ? 12 : 0);
        const date = new Date(`${day}T00:00:00`);
        date.setHours(hour, Number(time[2]), Number(time[3] ?? 0), 0);
        if (!Number.isNaN(date.getTime())) return date;
      }
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{2}-\d{2}/.test(text)) return parsed;
    }
  }
  return null;
}

type Prepared = { row: FlightRow; index: number; seed: number; identity: string; day: string; schedule: Date; ctot: Date | null; taxiMinutes: number; direction: 'DEP' | 'ARR'; international: boolean };

export function enrichFlights(rows: FlightRow[], sourceName = 'sample'): FlightRow[] {
  const prepared: Prepared[] = rows.map((row, index) => {
    const identity = String(row.CallSign ?? row.Callsign ?? row.FlightNo ?? `FL-${index + 1}`);
    const day = toDayString(row.FlyDate ?? row.Date);
    const seed = hashText(`${sourceName}|${day}|${identity}|${index}`);
    const direction: 'DEP' | 'ARR' = String(row.FlightDirection ?? row.SourceSheet ?? '').toUpperCase() === 'ARR'
      || (!isDepartureFromTsn(row) && String(row.AirportReceiptCode ?? '').toUpperCase() === 'VVTS') ? 'ARR' : 'DEP';
    const international = !isDomesticAirport(direction === 'ARR' ? row.AirportDeliveryCode : row.AirportReceiptCode);
    const fields = direction === 'ARR' ? ARRIVAL_TIME_FIELDS : DEPARTURE_TIME_FIELDS;
    const schedule = sourceTime(row, day, fields) ?? (() => {
      const date = new Date(`${day}T00:00:00`);
      date.setHours(5 + (seed % 18), Math.floor(seed / 18) % 60, 0, 0);
      return date;
    })();
    const taxiMinutes = Number(row.TaxiMinutes) || 5 + (Math.floor(seed / 19) % 8);
    const ctot = direction === 'DEP'
      ? row.CTOT ? new Date(String(row.CTOT)) : new Date(schedule.getTime() + (taxiMinutes + (Math.floor(seed / 11) % 11 - 3)) * 60_000)
      : null;
    return { row, index, seed, identity, day, schedule, ctot, taxiMinutes, direction, international };
  });
  const standAvailable = new Map<string, number>();
  const outputs = new Map<number, FlightRow>();
  const sorted = [...prepared].sort((a, b) => a.schedule.getTime() - b.schedule.getTime() || a.index - b.index);
  for (const item of sorted) {
    const eligible = item.international ? INTERNATIONAL_STANDS : DOMESTIC_STANDS;
    const existing = String(item.row.Stand ?? '').trim().toUpperCase();
    const rotated = [...eligible.slice(item.seed % eligible.length), ...eligible.slice(0, item.seed % eligible.length)];
    const assigned = existing && eligible.includes(existing) && (standAvailable.get(existing) ?? -Infinity) <= item.schedule.getTime()
      ? existing
      : rotated.find((stand) => (standAvailable.get(stand) ?? -Infinity) <= item.schedule.getTime())
        ?? rotated.reduce((best, stand) => (standAvailable.get(stand) ?? -Infinity) < (standAvailable.get(best) ?? -Infinity) ? stand : best);
    const standReady = Math.max(item.schedule.getTime(), standAvailable.get(assigned) ?? -Infinity);
    standAvailable.set(assigned, item.direction === 'ARR' ? standReady + 45 * 60_000 : standReady + 5 * 60_000);
    const departure = item.direction === 'DEP';
    outputs.set(item.index, {
      ...item.row,
      CallSign: item.identity,
      FlightDirection: item.direction,
      International: item.international,
      WakeCategory: wakeCategory(item.row.PlaneTypeCode ?? item.row.AircraftType),
      Stand: assigned,
      ScheduledDeparture: departure ? (item.row.ScheduledDeparture || item.schedule.toISOString()) : '',
      ScheduledArrival: !departure ? (item.row.ScheduledArrival || item.schedule.toISOString()) : '',
      CTOT: departure ? (item.ctot && !Number.isNaN(item.ctot.getTime()) ? item.ctot.toISOString() : item.schedule.toISOString()) : '',
      TSAT: departure ? (item.row.TSAT || new Date(standReady).toISOString()) : '',
      StandReadyAt: departure ? (item.row.StandReadyAt || new Date(standReady).toISOString()) : '',
      TaxiMinutes: item.row.TaxiMinutes || item.taxiMinutes,
      RunwayConfig: item.row.RunwayConfig || '25L-25R',
      TaxiRoute: item.row.TaxiRoute || (departure
        ? `Stand ${assigned} → đường lăn sân đỗ → TWY V → S6 → TWY S → S1 → RWY 25L`
        : `RWY 25R → P4 → P5 → chờ cắt RWY 25L → S8 → TWY V → Stand ${assigned}`),
      ActualTakeoff: item.row.ActualTakeoff || '',
      RunwayEntry: item.row.RunwayEntry || '',
      TakeoffRollStart: item.row.TakeoffRollStart || '',
      ReissuedCTOT: item.row.ReissuedCTOT || '',
      ReissuedTSAT: item.row.ReissuedTSAT || '',
      QueueOrder: item.row.QueueOrder || '',
      SimulationStatus: item.row.SimulationStatus || 'Mô phỏng',
    });
  }
  return rows.map((_, index) => outputs.get(index)!);
}

export function getFlightField(row: FlightRow, candidates: string[]): unknown {
  const lowered = new Map(Object.keys(row).map((key) => [key.trim().toLowerCase(), row[key]]));
  for (const field of candidates) {
    const value = lowered.get(field.toLowerCase());
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function isDepartureFromTsn(row: FlightRow): boolean {
  const origin = String(getFlightField(row, ['AirportDeliveryCode', 'DepartureAirport', 'Origin', 'ADEP', 'From']) ?? '').toUpperCase().trim();
  return origin === 'VVTS';
}

export function isArrivalAtTsn(row: FlightRow): boolean {
  const destination = String(getFlightField(row, ['AirportReceiptCode', 'ArrivalAirport', 'Destination', 'ADES', 'To']) ?? '').toUpperCase().trim();
  return destination === 'VVTS' && !isDepartureFromTsn(row);
}
