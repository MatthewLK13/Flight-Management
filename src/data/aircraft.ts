export type WakeCategory = 'H' | 'M';

/** The demo supports the Heavy and Medium categories used in the flight workbook. */
export function wakeCategory(aircraftType: unknown): WakeCategory {
  const type = String(aircraftType ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(B74|B76|B77|B78|A33|A35)/.test(type)) return 'H';
  return 'M';
}

export function isDomesticAirport(code: unknown): boolean {
  return /^VV[A-Z0-9]{2}$/.test(String(code ?? '').trim().toUpperCase());
}

export function approachSpeedKts(category: WakeCategory | undefined): number {
  return category === 'H' ? 160 : category === 'M' ? 145 : 150;
}

export const TAXI_SPEED_KTS = 20;
