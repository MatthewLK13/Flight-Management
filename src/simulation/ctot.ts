export function isWithinCtotWindow(actualTakeoff: Date, ctot: Date): boolean {
  const delta = actualTakeoff.getTime() - ctot.getTime();
  return delta >= -5 * 60_000 && delta <= 10 * 60_000;
}
