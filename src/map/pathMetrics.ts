import type { MapPoint } from './parkingGeometry';

const cache = new WeakMap<MapPoint[], { total: number; distances: number[] }>();
/** Cached arc length interpolation for immutable chart paths. */
export function pointOnPath(points: MapPoint[], progress: number): MapPoint {
  if (points.length === 1 || progress <= 0) return points[0];
  if (progress >= 1) return points.at(-1)!;
  let metrics = cache.get(points);
  if (!metrics) {
    const distances = [0];
    for (let i = 1; i < points.length; i += 1) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    metrics = { distances, total: distances.at(-1)! }; cache.set(points, metrics);
  }
  const target = metrics.total * progress;
  let low = 1, high = points.length - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (metrics.distances[middle] < target) low = middle + 1; else high = middle; }
  const distance = metrics.distances[low] - metrics.distances[low - 1];
  const ratio = distance ? (target - metrics.distances[low - 1]) / distance : 0;
  return { x: points[low - 1].x + (points[low].x - points[low - 1].x) * ratio, y: points[low - 1].y + (points[low].y - points[low - 1].y) * ratio };
}
