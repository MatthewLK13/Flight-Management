import type { ArrivalTimelineItem } from '../simulation/arrivals';
import { TAKEOFF_ROLL_MS, type TimelineItem } from '../simulation/runSimulation';

export const TAKEOFF_VISIBLE_AFTER_MS = 30_000;
import { getArrivalRoutePoints, getHoldingPoint, getRunwaySegment, getStandPoint, getTaxiRoutePoints, pointAlongPath, type MapPoint } from './airfieldGeometry';

export type AircraftPosition = { point: MapPoint; phase: string; rotation: number };

export function departurePosition(flight: TimelineItem, time: number, queueIndex: number, runway: string): AircraftPosition {
  const stand = getStandPoint(flight.stand);
  const route = getTaxiRoutePoints(flight.stand, runway);
  const hold = getHoldingPoint(runway);
  const taxiEnd = flight.taxiStart + flight.taxiMinutes * 60_000;
  const runwaySegment = getRunwaySegment(runway);
  if (time < flight.taxiStart) return { point: stand, phase: `tại stand ${flight.stand}`, rotation: 0 };
  if (time < taxiEnd) return { point: pointAlongPath(route, (time - flight.taxiStart) / (taxiEnd - flight.taxiStart)), phase: 'đang lăn ra điểm chờ', rotation: 0 };
  if (flight.returnStart !== null && flight.returnEnd !== null && flight.secondTaxiStart !== null && flight.returnStand) {
    if (time < flight.returnStart) return { point: hold, phase: 'chờ tại S1', rotation: 0 };
    const returnRoute = [...getTaxiRoutePoints(flight.returnStand, runway)].reverse();
    if (time < flight.returnEnd) return { point: pointAlongPath(returnRoute, (time - flight.returnStart) / (flight.returnEnd - flight.returnStart)), phase: 'quay về vị trí đỗ', rotation: 0 };
    if (time < flight.secondTaxiStart) return { point: getStandPoint(flight.returnStand), phase: `chờ TSAT mới tại stand ${flight.returnStand}`, rotation: 0 };
    const secondTaxiEnd = flight.secondTaxiStart + flight.taxiMinutes * 60_000;
    if (time < secondTaxiEnd) return { point: pointAlongPath([...returnRoute].reverse(), (time - flight.secondTaxiStart) / (secondTaxiEnd - flight.secondTaxiStart)), phase: 'lăn ra lần hai', rotation: 0 };
  }
  if (time < flight.runwayEntryStart) return {
    point: queueIndex <= 0 ? hold : { x: hold.x - queueIndex * 25, y: hold.y }, phase: 'chờ tại S1', rotation: 0,
  };
  if (time < flight.takeoffRollStart) return {
    point: pointAlongPath(runwaySegment.entryPath, (time - flight.runwayEntryStart) / (flight.takeoffRollStart - flight.runwayEntryStart)),
    phase: 'vào đường băng 25L', rotation: -90,
  };
  if (time >= flight.wheelsOff) return { point: runwaySegment.rollEnd, phase: 'đã cất cánh 25L', rotation: -90 };
  return { point: pointAlongPath([runwaySegment.threshold, runwaySegment.rollEnd], (time - flight.takeoffRollStart) / TAKEOFF_ROLL_MS), phase: 'cất cánh 25L', rotation: -90 };
}

export function arrivalPosition(flight: ArrivalTimelineItem, time: number): AircraftPosition {
  const route = getArrivalRoutePoints(flight.stand);
  if (time >= flight.standArrival) return { point: route.fromHold.at(-1)!, phase: `đang đỗ tại stand ${flight.stand}`, rotation: 0 };
  if (time < flight.touchdown) return {
    point: pointAlongPath(route.approach, (time - flight.approachStart) / (flight.touchdown - flight.approachStart)),
    phase: 'tiếp cận 25R', rotation: -90,
  };
  if (time < flight.landingEnd) return {
    point: pointAlongPath(route.landing, (time - flight.touchdown) / (flight.landingEnd - flight.touchdown)),
    phase: 'hạ cánh 25R', rotation: -90,
  };
  if (time < flight.p5HoldAt) return {
    point: pointAlongPath(route.toHold, (time - flight.landingEnd) / (flight.p5HoldAt - flight.landingEnd)),
    phase: 'lăn theo P4 đến P5', rotation: 0,
  };
  if (time < flight.crossingStart) return { point: route.toHold.at(-1)!, phase: 'dừng trước 25L tại P5', rotation: 0 };
  if (time < flight.crossingEnd) return {
    point: pointAlongPath(route.fromHold.slice(0, 3), (time - flight.crossingStart) / (flight.crossingEnd - flight.crossingStart)),
    phase: 'cắt qua 25L', rotation: 0,
  };
  return {
    point: pointAlongPath(route.fromHold.slice(2), (time - flight.crossingEnd) / (flight.standArrival - flight.crossingEnd)),
    phase: `lăn vào stand ${flight.stand}`, rotation: 0,
  };
}
