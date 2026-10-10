import { describe, expect, it } from 'vitest';
import { optimizeFlights } from './optimizer';

describe('flight ordering heuristic', () => {
  it('is deterministic and retains every flight', () => {
    const flights = [{ id: 'a', ctot: 300 }, { id: 'b', ctot: 100 }, { id: 'c', ctot: 200 }];
    const result = optimizeFlights(flights);
    expect(result.map((flight) => flight.id).sort()).toEqual(['a', 'b', 'c']);
    expect(optimizeFlights(flights).map((flight) => flight.id)).toEqual(result.map((flight) => flight.id));
  });
});
