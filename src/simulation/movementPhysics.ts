import { pathLength, runwayEntryPath, RUNWAY_ENTRY, RUNWAY_END } from '../map/surfaceGraph';

export const KNOT_METRES_PER_SECOND = 1852 / 3600;
export const RUNWAY_LENGTH_METRES = 3059;
export const METRES_PER_PIXEL = RUNWAY_LENGTH_METRES / Math.abs(RUNWAY_ENTRY.x - RUNWAY_END.x);
export const TAXI_SPEED_KTS = 20;
export const TAKEOFF_TARGET_KTS = 150;
export const TAXI_METRES_PER_SECOND = TAXI_SPEED_KTS * KNOT_METRES_PER_SECOND;
export const TAKEOFF_METRES_PER_SECOND = TAKEOFF_TARGET_KTS * KNOT_METRES_PER_SECOND;
// Constant acceleration over the depicted runway: d = v_final * t / 2.
export const TAKEOFF_ROLL_MS = 2 * RUNWAY_LENGTH_METRES / TAKEOFF_METRES_PER_SECOND * 1000;
export const RUNWAY_ENTRY_MS = pathLength(runwayEntryPath()) * METRES_PER_PIXEL / TAXI_METRES_PER_SECOND * 1000;
export const RUNWAY_MOVEMENT_MS = RUNWAY_ENTRY_MS + TAKEOFF_ROLL_MS;
export const AIRBORNE_VISIBLE_MS = 8_000;
export const RUNWAY_CLEARANCE_MS = 12_000;
export const taxiDuration = (pixels: number) => pixels * METRES_PER_PIXEL / TAXI_METRES_PER_SECOND * 1000;
export const landingRollDuration = (pixels: number, approachKts: number) => pixels * METRES_PER_PIXEL / ((approachKts * KNOT_METRES_PER_SECOND + TAXI_METRES_PER_SECOND) / 2) * 1000;
export const takeoffDistanceProgress = (progress: number) => Math.max(0, Math.min(1, progress)) ** 2;
