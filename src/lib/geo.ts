import { SITES, type Site } from './sites';

/** 날씨 등 근무지와 상관없는 곳에서 쓰는 서울 동쪽 기준점 (잠실본사) */
export const OFFICE = { lat: SITES.jamsil.office.lat, lng: SITES.jamsil.office.lng } as const;

/** 큰길을 지하도/횡단보도로 건너는 데 드는 시간(분) — 근무지마다 큰길 기준은 sites.ts */
const ROAD_CROSS_MIN = 3;

/** 도보 속도 (m/분) — 신호 대기 포함 보수적으로 */
export const WALK_M_PER_MIN = 67;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 근무지에서 걸어가는 시간(분).
 * 직선거리 × 1.25 에, 큰길(잠실사거리 등)을 건너야 하면 +3분, 큰 쇼핑몰 안이면 건물 안 이동 시간을 더한다.
 */
export function walkMinutesFrom(
  lat: number | null,
  lng: number | null,
  fallback?: number | null,
  insideMin = 0,
  site: Site = SITES.jamsil,
): number | null {
  if (lat != null && lng != null) {
    const m = haversineMeters(site.office.lat, site.office.lng, lat, lng);
    // 직선거리 → 실제 도보는 보통 1.25배
    let min = (m * 1.25) / WALK_M_PER_MIN;
    if (site.crossesRoad?.(lat, lng)) min += ROAD_CROSS_MIN;
    return Math.max(1, Math.round(min + insideMin));
  }
  return fallback != null ? fallback + insideMin : null;
}

export function minutesToMeters(min: number): number {
  return (min * WALK_M_PER_MIN) / 1.25;
}
