/** 잠실역 (2·8호선) 중심 좌표 */
export const JAMSIL_STATION = { lat: 37.5133, lng: 127.1001 } as const;

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

export function walkMinutesFrom(lat: number | null, lng: number | null, fallback?: number | null): number | null {
  if (lat != null && lng != null) {
    const m = haversineMeters(JAMSIL_STATION.lat, JAMSIL_STATION.lng, lat, lng);
    // 직선거리 → 실제 도보는 보통 1.25배
    return Math.max(1, Math.round((m * 1.25) / WALK_M_PER_MIN));
  }
  return fallback ?? null;
}

export function minutesToMeters(min: number): number {
  return (min * WALK_M_PER_MIN) / 1.25;
}
