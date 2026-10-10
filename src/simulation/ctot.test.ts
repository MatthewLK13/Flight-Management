import { describe, expect, it } from 'vitest';
import { isWithinCtotWindow } from './ctot';

describe('CTOT window', () => {
  const ctot = new Date('2023-11-03T08:00:00');
  it('accepts the inclusive early and late boundaries from -5 to +10 minutes', () => {
    expect(isWithinCtotWindow(new Date(ctot.getTime() - 5 * 60_000), ctot)).toBe(true);
    expect(isWithinCtotWindow(new Date(ctot.getTime() + 10 * 60_000), ctot)).toBe(true);
  });
  it('rejects takeoff one minute outside either boundary', () => {
    expect(isWithinCtotWindow(new Date(ctot.getTime() - 6 * 60_000), ctot)).toBe(false);
    expect(isWithinCtotWindow(new Date(ctot.getTime() + 11 * 60_000), ctot)).toBe(false);
  });
});
