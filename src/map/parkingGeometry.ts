export type MapPoint = { x: number; y: number };

// Overlay coordinates use a 1901 × 1312 viewBox over the source chart.
// Taxiway S is the horizontal taxi lane below RWY 07R/25L.
const TWY_V_Y = 520;
const TWY_S_Y = 450;
const HOLD_S1: MapPoint = { x: 1830, y: TWY_S_Y };
const HOLD_S8: MapPoint = { x: 390, y: TWY_S_Y };
const ENTRY_25L: MapPoint = { x: 1790, y: 382 }; // Curved S1 connector joins the runway near its right end
const ENTRY_07R: MapPoint = { x: 390, y: 382 }; // Intersection takeoff via TWY S8

// Ground 2 domestic stands shown around DOM PAX TERMINAL. The chart's apron is
// angled; each group below follows a separate stand row instead of stacking
// neighboring rows on the same diagonal. Stands 41–54 are outside this demo's
// selected DOM PAX area and 1–16 are on the International Terminal side.
// These bay centers were measured on the 2048 × 1413 source chart. The map
// overlay uses a 1901 × 1312 viewBox, so convert both axes before rendering.
const GROUND_2_SOURCE_POINTS: Record<string, MapPoint> = {
  // Outer row beside the DOM terminal, stands 17–22.
  '17': { x: 1340, y: 675 }, '18': { x: 1310, y: 708 }, '19': { x: 1280, y: 741 }, '20': { x: 1250, y: 774 },
  '21': { x: 1220, y: 807 }, '22': { x: 1190, y: 840 },
  // Lower/east row, stands 23–28.
  '23': { x: 1290, y: 828 }, '24': { x: 1295, y: 854 }, '25': { x: 1272, y: 880 },
  '26': { x: 1249, y: 906 }, '27': { x: 1226, y: 932 }, '28': { x: 1203, y: 958 },
  // Inner row, stands 29–34.
  '29': { x: 1295, y: 650 }, '30': { x: 1265, y: 684 }, '31': { x: 1235, y: 718 }, '32': { x: 1205, y: 752 },
  '33': { x: 1175, y: 786 }, '34': { x: 1145, y: 820 },
  // West row, stands 35–40.
  '35': { x: 1220, y: 650 }, '36': { x: 1190, y: 686 }, '37': { x: 1160, y: 722 }, '38': { x: 1130, y: 758 },
  '39': { x: 1130, y: 794 }, '40': { x: 1130, y: 830 },
};
const GROUND_2_STAND_POINTS = Object.fromEntries(
  Object.entries(GROUND_2_SOURCE_POINTS).map(([stand, point]) => [
    stand,
    { x: point.x * 1901 / 2048, y: point.y * 1312 / 1413 },
  ]),
) as Record<string, MapPoint>;

function cubicCurve(start: MapPoint, control1: MapPoint, control2: MapPoint, end: MapPoint, segments = 12): MapPoint[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
    };
  });
}

export function getHoldingPoint(runway: string): MapPoint {
  return runway === '25L-25R' ? HOLD_S1 : HOLD_S8;
}

export function getStandPoint(stand: string): MapPoint {
  const normalized = stand.trim().toUpperCase();
  const ground1Rows = [
    ['86', '85', '84', '83', '82', '81', '80', '79', '78', '77', '76', '75', '74', '73', '72', '71'],
    ['104B', '104A', '103B', '103A', '102', '101', '100', '99', '98', '97', '96', '95', '94', '93', '92', '91'],
  ];
  const ground1Auxiliary = ['81A', '79A', '77A'];
  const auxiliaryIndex = ground1Auxiliary.indexOf(normalized);
  if (auxiliaryIndex >= 0) {
    const column = ground1Rows[0].indexOf(normalized.slice(0, -1));
    return { x: 615 + column * 29.2, y: 585 };
  }
  const ground1Row = ground1Rows.findIndex((row) => row.includes(normalized));
  if (ground1Row >= 0) {
    // The chart has two rows of 16 stands in Ground 1, rather than one
    // continuous 37-stand row. Centers follow the chart's individual bays.
    const column = ground1Rows[ground1Row].indexOf(normalized);
    return { x: 615 + column * 29.2, y: ground1Row === 0 ? 562 : 608 };
  }

  return GROUND_2_STAND_POINTS[normalized] ?? { x: 1200, y: 800 };
}

export function getTaxiRouteDescription(runway: string, stand: string): string {
  const apronRoute = `Stand ${stand} → đường lăn sân đỗ → TWY V → S6 → TWY S`;
  return runway === '25L-25R'
    ? `${apronRoute} → S1 → RWY 25L`
    : `${apronRoute} → S8 → RWY 07R`;
}

export function getRunwaySegment(runway: string): { entryPath: MapPoint[]; threshold: MapPoint; rollEnd: MapPoint } {
  return runway === '25L-25R'
    ? {
        // Trace the charted bend from S1: sweep diagonally up-left, then align westbound.
        entryPath: cubicCurve(HOLD_S1, { x: 1820, y: 438 }, { x: 1810, y: 382 }, ENTRY_25L),
        threshold: ENTRY_25L,
        // Continue through the gray runway-ahead pavement at the west end before the aircraft leaves the chart.
        rollEnd: { x: 40, y: 382 },
      }
    : {
        entryPath: [HOLD_S8, ENTRY_07R],
        threshold: ENTRY_07R,
        rollEnd: { x: 1830, y: 382 },
      };
}

export function getTaxiRoutePoints(stand: string, runway: string): MapPoint[] {
  const start = getStandPoint(stand);
  const hold = getHoldingPoint(runway);
  // Exit the stand to TWY V, follow V to the curved S6 connector, then join
  // the charted TWY S centerline. The connector sweeps right as it turns north.
  const vJoinX = 1100;
  const route: MapPoint[] = [start, { x: start.x, y: TWY_V_Y }, { x: vJoinX, y: TWY_V_Y }];
  route.push(...cubicCurve({ x: vJoinX, y: TWY_V_Y }, { x: 1110, y: TWY_V_Y }, { x: 1142, y: TWY_S_Y }, { x: 1150, y: TWY_S_Y }, 10));

  if (route.at(-1)!.y !== hold.y || route.at(-1)!.x !== hold.x) route.push(hold);
  return route;
}

export function pointAlongPath(points: MapPoint[], progress: number): MapPoint {
  if (!points.length) return { x: 0, y: 0 };
  if (progress <= 0 || points.length === 1) return points[0];
  if (progress >= 1) return points[points.length - 1];
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const fullLength = lengths.reduce((total, length) => total + length, 0);
  let remaining = fullLength * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return points[points.length - 1];
}
