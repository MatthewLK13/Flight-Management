import type { ArrivalTimelineItem } from './arrivals';
import { getArrivalRoutePoints } from '../map/airfieldGeometry';

// Right-hand 25R threshold on the native 2048 × 1413 parking chart.
export const ARRIVAL_25R_THRESHOLD_X = 1660;

export function arrivalThresholdClearAt(arrival: ArrivalTimelineItem): number {
  if (!Number.isFinite(arrival.approachStart) || !Number.isFinite(arrival.touchdown)) return Infinity;
  const radius = arrival.wakeCategory === 'H' ? 15 : 9;
  const approach = getArrivalRoutePoints(arrival.stand, arrival.exitBranch).approach;
  const start = approach[0], end = approach.at(-1)!;
  const progress = Math.max(0, Math.min(1, (start.x - (ARRIVAL_25R_THRESHOLD_X - radius)) / (start.x - end.x)));
  return arrival.approachStart + (arrival.touchdown - arrival.approachStart) * progress;
}

/** Apply the scenario's approach priority at the start of the departure roll. */
export function releaseTakeoffRoll(desired: number, arrivals: ArrivalTimelineItem[]): number {
  let start = desired;
  for (const arrival of [...arrivals].sort((a, b) => a.approachStart - b.approachStart)) {
    const clearAt = arrivalThresholdClearAt(arrival);
    if (start >= arrival.approachStart && start < clearAt) start = clearAt;
  }
  return start;
}

/** A later surface retiming must not introduce an approach across a booked roll start. */
export function arrivalDelayForBookedRolls(arrival: ArrivalTimelineItem, delay: number, rollStarts: number[]): number {
  let adjusted = delay;
  const clearAt = arrivalThresholdClearAt(arrival);
  for (const roll of [...rollStarts].sort((a, b) => a - b)) {
    if (roll >= arrival.approachStart + adjusted && roll < clearAt + adjusted) {
      adjusted = roll + 2000 - arrival.approachStart;
    }
  }
  return adjusted;
}
