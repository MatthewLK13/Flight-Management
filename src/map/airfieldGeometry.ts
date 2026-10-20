import type { WakeCategory } from '../data/aircraft';
import { pointAlongPath, type MapPoint } from './parkingGeometry';

export { pointAlongPath };
export type { MapPoint };

// Coordinates refer to the cropped 2025 airfield drawing at 2080 × 905 pixels.
export const MAP_VIEWBOX = '0 0 2080 905';
const HOLD_S1: MapPoint = { x: 1985, y: 400 };
const RUNWAY_ENTRY: MapPoint = { x: 1945, y: 315 };
export const ARRIVAL_P5_HOLD: MapPoint = { x: 520, y: 275 };

function curve(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint, steps = 10): MapPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps; const u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
  });
}

const upperT3 = ['86', '85', '84', '83', '82', '81', '80', '79', '78', '77', '76', '75', '74', '73', '72', '71'];
const lowerT3 = ['104B', '104A', '103B', '103A', '102', '101', '100', '99', '98', '97', '96', '95', '94', '93', '92', '91'];
const domesticPier: Record<string, MapPoint> = {
  '17': { x: 1440, y: 530 }, '18': { x: 1424, y: 560 }, '19': { x: 1408, y: 590 },
  '20': { x: 1392, y: 620 }, '21': { x: 1376, y: 650 }, '22': { x: 1360, y: 680 },
  '23': { x: 1340, y: 710 }, '24': { x: 1324, y: 740 }, '25': { x: 1308, y: 770 },
  '26': { x: 1292, y: 800 }, '27': { x: 1276, y: 830 }, '28': { x: 1260, y: 860 },
  '29': { x: 1335, y: 540 }, '30': { x: 1319, y: 570 }, '31': { x: 1303, y: 600 },
  '32': { x: 1287, y: 630 }, '33': { x: 1271, y: 660 }, '34': { x: 1255, y: 690 },
  '35': { x: 1230, y: 560 }, '36': { x: 1214, y: 590 }, '37': { x: 1198, y: 620 },
  '38': { x: 1182, y: 650 }, '39': { x: 1166, y: 680 }, '40': { x: 1150, y: 710 },
};

export function getStandPoint(stand: string): MapPoint {
  const name = stand.trim().toUpperCase();
  const upper = upperT3.indexOf(name);
  if (upper >= 0) return { x: 735 + upper * 31, y: 500 };
  const lower = lowerT3.indexOf(name);
  if (lower >= 0) return { x: 735 + lower * 31, y: 555 };
  if (['77A', '79A', '81A'].includes(name)) {
    const base = upperT3.indexOf(name.slice(0, -1));
    return { x: 735 + base * 31, y: 530 };
  }
  const number = Number(name);
  if (number >= 9 && number <= 16) return { x: 1740 - (number - 9) * 40, y: 500 };
  if (number >= 1 && number <= 8) return { x: 1790 - (number - 1) * 41, y: 435 };
  return domesticPier[name] ?? { x: 1130, y: 520 };
}

export function getHoldingPoint(_runway: string): MapPoint { return HOLD_S1; }

export function getRunwaySegment(_runway: string): { entryPath: MapPoint[]; threshold: MapPoint; rollEnd: MapPoint } {
  return {
    entryPath: curve(HOLD_S1, { x: 1980, y: 370 }, { x: 1960, y: 330 }, RUNWAY_ENTRY),
    threshold: RUNWAY_ENTRY,
    rollEnd: { x: 35, y: 315 },
  };
}

export function getTaxiRoutePoints(stand: string, _runway: string): MapPoint[] {
  const start = getStandPoint(stand);
  const number = Number(stand);
  const connector = number >= 1 && number <= 16 ? 1765 : number >= 17 && number <= 40 ? 1260 : 850;
  const apronJoin = { x: Math.max(740, Math.min(1880, start.x)), y: 455 };
  const onV = { x: connector, y: 455 };
  const onS = { x: connector, y: 400 };
  return [start, apronJoin, onV, ...curve(onV, { x: connector + 15, y: 445 }, { x: connector + 15, y: 410 }, onS), HOLD_S1];
}

export function getArrivalRoutePoints(stand: string): { approach: MapPoint[]; landing: MapPoint[]; toHold: MapPoint[]; fromHold: MapPoint[] } {
  const standPoint = getStandPoint(stand);
  const exit = { x: 740, y: 140 };
  const p4 = { x: 600, y: 225 };
  return {
    approach: [{ x: 2050, y: 140 }, { x: 1820, y: 140 }],
    landing: [{ x: 1820, y: 140 }, exit],
    toHold: [exit, ...curve(exit, { x: 690, y: 140 }, { x: 655, y: 220 }, p4), { x: 520, y: 225 }, ARRIVAL_P5_HOLD],
    fromHold: [ARRIVAL_P5_HOLD, { x: 520, y: 315 }, { x: 520, y: 400 }, { x: 520, y: 455 },
      { x: Math.max(740, Math.min(1880, standPoint.x)), y: 455 }, standPoint],
  };
}

export function getNearestReturnStand(originalStand: string, unavailable: Set<string>, category: WakeCategory): string {
  const international = Number(originalStand) >= 1 && Number(originalStand) <= 16;
  const candidates = international
    ? Array.from({ length: category === 'H' ? 8 : 16 }, (_, index) => String(index + 1))
    : category === 'H'
      ? Array.from({ length: 12 }, (_, index) => String(index + 23))
      : [...Array.from({ length: 24 }, (_, index) => String(index + 17)), ...upperT3, ...lowerT3];
  const ranked = candidates.sort((a, b) => {
    const pa = getStandPoint(a), pb = getStandPoint(b);
    return Math.hypot(pa.x - HOLD_S1.x, pa.y - HOLD_S1.y) - Math.hypot(pb.x - HOLD_S1.x, pb.y - HOLD_S1.y);
  });
  return ranked.find((stand) => !unavailable.has(stand)) ?? ranked[0];
}

export function getTaxiRouteDescription(_runway: string, stand: string): string {
  return `Stand ${stand} → đường lăn sân đỗ → TWY V → TWY S → S1 → RWY 25L`;
}
