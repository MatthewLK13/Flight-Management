export type FlightRow = Record<string, unknown>;

// Departure stand identifiers present on the supplied TSN PARKING CHART.
// This domestic departure demo uses Ground 1 and Ground 2 domestic stands.
// Ground 2 demo assignments are limited to stands 17–40 around DOM PAX.
// Stands 1–16 are on the International side; 41–54 are outside this demo's
// selected DOM PAX area. 55–70 and 87–90 are not stands on this chart.
const STANDS = [
  ...Array.from({ length: 24 }, (_, index) => String(index + 17)),
  ...Array.from({ length: 16 }, (_, index) => String(index + 71)),
  '77A', '79A', '81A',
  '104B', '104A', '103B', '103A', '102', '101', '100', '99', '98', '97', '96', '95', '94', '93', '92', '91',
];
const WIDE_BODY_STANDS = ['23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'];
const TIME_FIELDS = ['ScheduledDeparture', 'STD', 'DepartureTime', 'DeliveryTime', 'Giờ khởi hành', 'STD (UTC)'];

function hashText(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function toDayString(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20_000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (local) {
    const day = Number(local[1]); const month = Number(local[2]);
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '2023-11-03';
}

function sourceTime(row: FlightRow, day: string): Date | null {
  for (const key of TIME_FIELDS) {
    const value = row[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
    if (typeof value === 'number' && value >= 0 && value < 1) {
      const date = new Date(`${day}T00:00:00`); date.setMinutes(Math.round(value * 1440)); return date;
    }
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      const time = text.match(/(?:^|T)(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
      if (time) {
        const date = new Date(`${day}T00:00:00`);
        date.setHours(Number(time[1]), Number(time[2]), Number(time[3] ?? 0), 0);
        if (!Number.isNaN(date.getTime())) return date;
      }
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{2}-\d{2}/.test(text)) return parsed;
    }
  }
  return null;
}

type Prepared = { row: FlightRow; index: number; seed: number; identity: string; day: string; schedule: Date; ctot: Date; taxiMinutes: number };

export function enrichFlights(rows: FlightRow[], sourceName = 'sample'): FlightRow[] {
  const prepared: Prepared[] = rows.map((row, index) => {
    const identity = String(row.CallSign ?? row.Callsign ?? row.FlightNo ?? `FL-${index + 1}`);
    const day = toDayString(row.FlyDate ?? row.Date);
    const seed = hashText(`${sourceName}|${day}|${identity}|${index}`);
    const schedule = sourceTime(row, day) ?? (() => {
      const date = new Date(`${day}T00:00:00`);
      date.setHours(5 + (seed % 18), Math.floor(seed / 18) % 60, 0, 0); return date;
    })();
    const ctot = row.CTOT ? new Date(String(row.CTOT)) : new Date(schedule.getTime() + (Math.floor(seed / 11) % 16 - 5) * 60_000);
    return { row, index, seed, identity, day, schedule, ctot, taxiMinutes: Number(row.TaxiMinutes) || 5 + (Math.floor(seed / 19) % 8) };
  });
  const standAvailable = new Map<string, number>();
  const outputs = new Map<number, FlightRow>();
  const sorted = [...prepared].sort((a, b) => a.schedule.getTime() - b.schedule.getTime() || a.index - b.index);
  for (const item of sorted) {
    const type = String(item.row.PlaneTypeCode ?? item.row.AircraftType ?? '').toUpperCase();
    const eligible = /A380|B747|B777|B787|A330|A350|B76|B77/.test(type) ? WIDE_BODY_STANDS : STANDS;
    const existing = String(item.row.Stand ?? '');
    const rotated = [...eligible.slice(item.seed % eligible.length), ...eligible.slice(0, item.seed % eligible.length)];
    const assigned = existing && eligible.includes(existing) && (standAvailable.get(existing) ?? -Infinity) <= item.schedule.getTime()
      ? existing
      : rotated.find((stand) => (standAvailable.get(stand) ?? -Infinity) <= item.schedule.getTime()) ?? rotated.reduce((best, stand) => (standAvailable.get(stand) ?? -Infinity) < (standAvailable.get(best) ?? -Infinity) ? stand : best);
    const standReady = Math.max(item.schedule.getTime() - item.taxiMinutes * 60_000, standAvailable.get(assigned) ?? -Infinity);
    standAvailable.set(assigned, item.schedule.getTime() + 45 * 60_000);
    const taxiRoute = item.row.TaxiRoute ?? `Stand ${assigned} → đường lăn sân đỗ → TWY V → S6 → TWY S → S1 → RWY 25L`;
    outputs.set(item.index, {
      ...item.row,
      CallSign: item.identity,
      ScheduledDeparture: item.row.ScheduledDeparture ?? item.schedule.toISOString(),
      CTOT: Number.isNaN(item.ctot.getTime()) ? item.schedule.toISOString() : item.ctot.toISOString(),
      Stand: assigned,
      StandReadyAt: item.row.StandReadyAt ?? new Date(standReady).toISOString(),
      TaxiMinutes: item.row.TaxiMinutes ?? item.taxiMinutes,
      RunwayConfig: item.row.RunwayConfig ?? '25L-25R',
      TaxiRoute: taxiRoute,
      ActualTakeoff: item.row.ActualTakeoff ?? '',
      RunwayEntry: item.row.RunwayEntry ?? '',
      TakeoffRollStart: item.row.TakeoffRollStart ?? '',
      ReissuedCTOT: item.row.ReissuedCTOT ?? '',
      QueueOrder: item.row.QueueOrder ?? '',
      SimulationStatus: item.row.SimulationStatus ?? 'Mô phỏng',
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
