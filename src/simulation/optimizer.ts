export type OptimizableFlight = { id: string; ctot: number; ready?: number; taxi?: number };

/** Stable, bounded greedy ordering favoring ready aircraft and their CTOT slots. */
export function optimizeFlights<T extends OptimizableFlight>(flights: T[]): T[] {
  const pending = [...flights];
  const ordered: T[] = [];
  let availableAt = -Infinity;
  while (pending.length) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < pending.length; i += 1) {
      const flight = pending[i];
      const start = Math.max(flight.ready ?? -Infinity, availableAt);
      const score = Math.max(start + (flight.taxi ?? 0) * 60_000, flight.ctot - 5 * 60_000);
      if (score < bestScore) { bestScore = score; bestIndex = i; }
    }
    const [next] = pending.splice(bestIndex, 1);
    ordered.push(next);
    availableAt = Math.max(availableAt, next.ctot) + 2 * 60_000;
  }
  return ordered;
}
