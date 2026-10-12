/** 잠실역 (2·8호선) 중심 좌표 */
export const JAMSIL_STATION = { lat: 37.5133, lng: 127.1001 } as const;

/** 출발 위치: 본사 — 롯데캐슬골드 (올림픽로 269, 잠실역 8번 출구). 도보 시간은 여기서 잰다 */
export const OFFICE = { lat: 37.5141, lng: 127.1017 } as const;

/** 잠실사거리 큰길 — 올림픽로(동서) 남쪽 경계 위도, 송파대로(남북) 서쪽 경계 경도 */
const OLYMPIC_RO_LAT = 37.5134;
const SONGPA_DAERO_LNG = 127.1004;
/** 큰길(올림픽로·송파대로)을 지하도/횡단보도로 건너는 데 드는 시간(분) */
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
 * 본사에서 걸어가는 시간(분).
 * 직선거리 × 1.25 에, 잠실사거리 큰길을 건너야 하면 +3분, 큰 쇼핑몰 안이면 건물 안 이동 시간을 더한다.
 */
export function walkMinutesFrom(lat: number | null, lng: number | null, fallback?: number | null, insideMin = 0): number | null {
  if (lat != null && lng != null) {
    const m = haversineMeters(OFFICE.lat, OFFICE.lng, lat, lng);
    // 직선거리 → 실제 도보는 보통 1.25배
    let min = (m * 1.25) / WALK_M_PER_MIN;
    if (lat < OLYMPIC_RO_LAT || lng < SONGPA_DAERO_LNG) min += ROAD_CROSS_MIN;
    return Math.max(1, Math.round(min + insideMin));
  }
  return fallback != null ? fallback + insideMin : null;
}

export function minutesToMeters(min: number): number {
  return (min * WALK_M_PER_MIN) / 1.25;
}
