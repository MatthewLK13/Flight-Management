import type { WakeCategory } from '../data/aircraft';
import { pointAlongPath, type MapPoint } from './parkingGeometry';

export { pointAlongPath };
export type { MapPoint };

// Overlay coordinates follow the 1901 × 1312 viewBox of PARKING_CHART_clean.png.
export const MAP_VIEWBOX = '0 0 1901 1312';
const HOLD_S1: MapPoint = { x: 1830, y: 450 };
const RUNWAY_ENTRY: MapPoint = { x: 1790, y: 382 };
export const ARRIVAL_P5_HOLD: MapPoint = { x: 390, y: 335 };

function curve(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint, steps = 10): MapPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps; const u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
  });
}

const upperT3 = ['86', '85', '84', '83', '82', '81', '80', '79', '78', '77', '76', '75', '74', '73', '72', '71'];
const lowerT3 = ['104B', '104A', '103B', '103A', '102', '101', '100', '99', '98', '97', '96', '95', '94', '93', '92', '91'];
const domesticPier: Record<string, MapPoint> = Object.fromEntries(
  Object.entries({
    '17': [1340, 675], '18': [1310, 708], '19': [1280, 741], '20': [1250, 774],
    '21': [1220, 807], '22': [1190, 840], '23': [1290, 828], '24': [1295, 854],
    '25': [1272, 880], '26': [1249, 906], '27': [1226, 932], '28': [1203, 958],
    '29': [1295, 650], '30': [1265, 684], '31': [1235, 718], '32': [1205, 752],
    '33': [1175, 786], '34': [1145, 820], '35': [1220, 650], '36': [1190, 686],
    '37': [1160, 722], '38': [1130, 758], '39': [1130, 794], '40': [1130, 830],
  } as Record<string, [number, number]>).map(([stand, [x, y]]) => [
    stand, { x: x * 1901 / 2048, y: y * 1312 / 1413 },
  ]),
);

export function getStandPoint(stand: string): MapPoint {
  const name = stand.trim().toUpperCase();
  const upper = upperT3.indexOf(name);
  if (upper >= 0) return { x: 615 + upper * 29.2, y: 562 };
  const lower = lowerT3.indexOf(name);
  if (lower >= 0) return { x: 615 + lower * 29.2, y: 608 };
  if (['77A', '79A', '81A'].includes(name)) {
    const base = upperT3.indexOf(name.slice(0, -1));
    return { x: 615 + base * 29.2, y: 585 };
  }
  const number = Number(name);
  if (number >= 1 && number <= 8) return { x: 1720 - (number - 1) * 39, y: 548 };
  if (number >= 9 && number <= 16) return { x: 1560 - (number - 9) * 33, y: 600 };
  return domesticPier[name] ?? { x: 1120, y: 650 };
}

export function getHoldingPoint(_runway: string): MapPoint { return HOLD_S1; }

export function getRunwaySegment(_runway: string): { entryPath: MapPoint[]; threshold: MapPoint; rollEnd: MapPoint } {
  return {
    entryPath: curve(HOLD_S1, { x: 1820, y: 438 }, { x: 1810, y: 382 }, RUNWAY_ENTRY),
    threshold: RUNWAY_ENTRY,
    rollEnd: { x: 40, y: 382 },
  };
}

export function getTaxiRoutePoints(stand: string, _runway: string): MapPoint[] {
  const start = getStandPoint(stand);
  const number = Number(stand);
  const connector = number >= 1 && number <= 16 ? 1510 : 1150;
  const apronJoin = { x: start.x, y: 520 };
  const onV = { x: connector - 50, y: 520 };
  const onS = { x: connector, y: 450 };
  return [start, apronJoin, onV,
    ...curve(onV, { x: connector - 30, y: 520 }, { x: connector, y: 460 }, onS),
    HOLD_S1];
}

export function getArrivalRoutePoints(stand: string): { approach: MapPoint[]; landing: MapPoint[]; toHold: MapPoint[]; fromHold: MapPoint[] } {
  const standPoint = getStandPoint(stand);
  const exit = { x: 430, y: 210 };
  const p4 = { x: 390, y: 290 };
  return {
    approach: [{ x: 1840, y: 210 }, { x: 1690, y: 210 }],
    landing: [{ x: 1690, y: 210 }, exit],
    toHold: [exit, ...curve(exit, { x: 420, y: 235 }, { x: 390, y: 250 }, p4), ARRIVAL_P5_HOLD],
    fromHold: [ARRIVAL_P5_HOLD, { x: 390, y: 382 }, { x: 390, y: 450 }, { x: 390, y: 520 },
      { x: standPoint.x, y: 520 }, standPoint],
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
