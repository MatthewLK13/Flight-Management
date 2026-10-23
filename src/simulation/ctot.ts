export function isWithinCtotWindow(actualTakeoff: Date, ctot: Date): boolean {
  const delta = actualTakeoff.getTime() - ctot.getTime();
  return delta >= -5 * 60_000 && delta <= 10 * 60_000;
}

/** Count delay only when the actual takeoff violates its original CTOT window. */
export function ctotDelayMinutes(actualTakeoff: number, originalCtot: number): number {
  if (!Number.isFinite(actualTakeoff) || !Number.isFinite(originalCtot)
    || isWithinCtotWindow(new Date(actualTakeoff), new Date(originalCtot))) return 0;
  return Math.max(0, (actualTakeoff - originalCtot) / 60_000);
}
