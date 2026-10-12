import type { Restaurant } from '../types';

/**
 * 식당이 몰려 있는 건물·상가. 주소/지점명/출구 안내에서 찾아낸다.
 * 필터에는 MIN_BUILDING_COUNT 곳 이상 모인 건물만 보여준다(데이터가 늘면 자동으로 추가됨).
 */
export const BUILDINGS: { name: string; emoji: string; re: RegExp }[] = [
  { name: '장미상가', emoji: '🌹', re: /장미\s*(아파트\s*)?[AB]?\s*상가|장미[AB]상가|장미상가|잠실장미점|올림픽로\s*35길\s*(104|112|124)(?!\d)/ },
  { name: '롯데월드몰', emoji: '🏬', re: /롯데월드몰|올림픽로 300(?!\d)/ },
  { name: '롯데백화점', emoji: '🛍️', re: /롯데백화점/ },
  { name: '잠실역 지하상가', emoji: '🚇', re: /잠실역\s*지하상가|잠실지하상가|잠실역 역사 내|올림픽로 지하 265(?!\d)/ },
  { name: '리센츠상가', emoji: '🏢', re: /리센츠/ },
  { name: '월드타워빌딩', emoji: '🏢', re: /송파대로 558|월드타워빌딩/ },
  { name: '시그마타워', emoji: '🏢', re: /시그마타워|올림픽로 289(?!\d)/ },
  { name: '현대타워', emoji: '🏢', re: /현대타워|올림픽로 293-19/ },
  { name: '타워730', emoji: '🏢', re: /타워730|송파대로 570/ },
  { name: '삼성생명빌딩', emoji: '🏢', re: /삼성생명|올림픽로 295(?!\d)/ },
  { name: '갤러리아팰리스', emoji: '🏬', re: /갤러리아\s*팰리스|올림픽로 212(?!\d)/ },
  { name: '캐슬플라자', emoji: '🏰', re: /캐슬플라자|올림픽로 269(?!\d)/ },
  { name: '홈플러스 잠실점', emoji: '🛒', re: /홈플러스 잠실/ },
];

/** 큰 쇼핑몰은 입구에서 식당가까지 건물 안을 한참 걸어야 한다 (분) */
const INSIDE_MIN: Record<string, number> = { 롯데월드몰: 4, 롯데백화점: 3 };

export function insideMinutes(r: Restaurant): number {
  const b = buildingOf(r);
  return b ? (INSIDE_MIN[b] ?? 0) : 0;
}

/** 이 수 이상 모인 건물만 필터·홈에 보여준다 */
export const MIN_BUILDING_COUNT = 3;

const cache = new WeakMap<Restaurant, string | null>();

export function buildingOf(r: Restaurant): string | null {
  if (cache.has(r)) return cache.get(r)!;
  const hay = [r.branch ?? '', r.address ?? '', r.nearestExit ?? ''].join(' ');
  const hit = BUILDINGS.find((b) => b.re.test(hay))?.name ?? null;
  cache.set(r, hit);
  return hit;
}

/** 필터로 보여줄 큰 건물 목록 (식당 수 많은 순) */
export function bigBuildings(list: Restaurant[]): { name: string; emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of list) {
    const b = buildingOf(r);
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return BUILDINGS.map((b) => ({ name: b.name, emoji: b.emoji, count: counts.get(b.name) ?? 0 }))
    .filter((b) => b.count >= MIN_BUILDING_COUNT)
    .sort((a, b) => b.count - a.count);
}
