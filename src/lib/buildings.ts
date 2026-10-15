import type { Restaurant } from '../types';
import { haversineMeters } from './geo';

/**
 * 식당이 몰려 있는 건물·상가. 주소/지점명/출구 안내에서 찾아낸다.
 * 필터에는 MIN_BUILDING_COUNT 곳 이상 모인 건물만 보여준다(데이터가 늘면 자동으로 추가됨).
 * after: 거리순과 상관없이 이 건물 바로 뒤에 보여준다
 */
export const BUILDINGS: { name: string; emoji: string; re: RegExp; after?: string }[] = [
  // 영등포맥스 주변 — 주소가 영등포 쪽에만 있는 것이라 잠실 건물보다 먼저 본다 (롯데백화점 영등포점이 잠실 롯데백화점으로 잡히지 않게)
  { name: '타임스퀘어', emoji: '🏬', re: /타임스퀘어|영중로 15(?!\d)/ },
  { name: '신세계백화점', emoji: '🛍️', re: /신세계백화점|신세계 ?영등포|영중로 9(?!\d)/ },
  { name: '영등포역·롯데백화점', emoji: '🚉', re: /경인로 846(?!\d)|롯데백화점 ?영등포/ },
  { name: '영등포역 지하상가', emoji: '🚇', re: /영등포역\s*지하|영등포지하(쇼핑|상가)|영중로 지하|경인로 지하/ },
  { name: '영등포맥스', emoji: '🛒', re: /롯데마트\s*맥스|롯데마트맥스|영중로 125(?!\d)/ },
  { name: '포레나 영등포', emoji: '🏢', re: /포레나|국회대로50길 20(?!\d)/ },
  { name: '홈플러스 문래점', emoji: '🛒', re: /홈플러스 ?문래|당산로 34(?!\d)/ },
  { name: '영등포시장', emoji: '🏮', re: /영등포(전통)?시장(?!역)/ },
  // 영등포맥스 근처 상가 건물 (주소로 찾음, 건물 이름은 카카오 주소 검색 기준)
  { name: '리마크빌 (영등포KT)', emoji: '🏢', re: /리마크빌|영등포\s*KT점|영중로 119(?!\d)/ },
  { name: '한양아이클래스', emoji: '🏢', re: /아이클래스|영신로 228-6(?!\d)/ },
  { name: '코오롱스타폴리스', emoji: '🏢', re: /스타폴리스|영신로 219(?!\d)/ },
  { name: '드림시드 상가', emoji: '🏘️', re: /드림시드|국회대로53길 30(?!\d)/ },
  { name: '삼환아파트 상가', emoji: '🏘️', re: /영중로 145(?!\d)/ },
  { name: '아크로타워스퀘어', emoji: '🏢', re: /아크로\s*타워\s*스퀘어|국회대로54길 10(?!\d)/ },
  { name: '래미안 상가 (당산)', emoji: '🏘️', re: /당산로 214(?!\d)/ },
  { name: '반도아이비밸리', emoji: '🏢', re: /아이비\s*밸리|영신로 166(?!\d)/ },
  { name: '당산 SK V1센터', emoji: '🏢', re: /SK\s*V1|당산로41길 11(?!\d)/ },
  { name: '당산역 해링턴타워', emoji: '🏢', re: /해링턴타워|당산로 205(?!\d)/ },
  { name: '당산 삼성쉐르빌', emoji: '🏢', re: /쉐르빌|당산로45길 1(?!\d)/ },
  { name: '장미상가', emoji: '🌹', re: /장미\s*(아파트\s*)?[AB]?\s*상가|장미[AB]상가|장미상가|잠실장미점|올림픽로\s*35길\s*(104|112|124)(?!\d)/ },
  // 롯데월드 지하·아이스링크·민속식당가 (어드벤처 입장권 없이). 층은 src/data/lotteWorldFloors.ts
  { name: '롯데월드 (입장 없이)', emoji: '🎡', re: /롯데월드 (지하[13]층|3층 민속식당가|웰빙센터)/ },
  { name: '롯데월드몰', emoji: '🏬', re: /롯데월드몰|올림픽로 300(?!\d)/, after: '롯데백화점' },
  { name: '롯데백화점', emoji: '🛍️', re: /롯데백화점/ },
  { name: '잠실역 지하상가', emoji: '🚇', re: /잠실역\s*지하상가|잠실지하상가|잠실역 역사 내|올림픽로 지하 265(?!\d)/ },
  { name: '리센츠상가', emoji: '🏢', re: /리센츠/ },
  { name: '월드타워빌딩', emoji: '🏢', re: /송파대로 558|월드타워빌딩/, after: '타워730 (구쿠팡)' },
  { name: '예전빌딩', emoji: '🏢', re: /예전빌딩|올림픽로\s*35다길\s*32(?!\d)/ },
  { name: '시그마타워', emoji: '🏢', re: /시그마타워|올림픽로 289(?!\d)/ },
  { name: '현대타워', emoji: '🏢', re: /현대타워|올림픽로 293-19/ },
  { name: '타워730 (구쿠팡)', emoji: '🏢', re: /타워730|송파대로 570/ },
  { name: '삼성생명빌딩', emoji: '🏢', re: /삼성생명|올림픽로 295(?!\d)/ },
  { name: '갤러리아팰리스', emoji: '🏬', re: /갤러리아\s*팰리스|올림픽로 212(?!\d)/ },
  { name: '캐슬플라자', emoji: '🏰', re: /캐슬플라자|올림픽로 269(?!\d)/ },
  { name: '홈플러스 잠실점', emoji: '🛒', re: /홈플러스\s*잠실|잠실\s*홈플러스|올림픽로\s*35가길\s*16(?!\d)/ },
  { name: '푸르지오월드마크', emoji: '🏢', re: /푸르지오\s*월드마크|올림픽로\s*35가길\s*9(?!\d)/ },
  { name: '더샵스타파크', emoji: '🏢', re: /스타파크|올림픽로\s*35가길\s*10(?!\d)/ },
  { name: '더샵스타리버', emoji: '🏢', re: /스타리버|올림픽로\s*35길\s*93(?!\d)/ },
];

/** 큰 쇼핑몰은 입구에서 식당가까지 건물 안을 한참 걸어야 한다 (분) */
const INSIDE_MIN: Record<string, number> = { 롯데월드몰: 4, '롯데월드 (입장 없이)': 4, 롯데백화점: 3, 타임스퀘어: 4, 신세계백화점: 3, '영등포역·롯데백화점': 3 };

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

/** 필터로 보여줄 큰 건물 목록 — 근무지(from)에서 가까운 건물부터 (없으면 식당 수 많은 순) */
export function bigBuildings(
  list: Restaurant[],
  from?: { lat: number; lng: number },
): { name: string; emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  // 건물 위치 = 그 건물 식당들 좌표의 평균
  const sum = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of list) {
    const b = buildingOf(r);
    if (!b) continue;
    counts.set(b, (counts.get(b) ?? 0) + 1);
    if (r.lat != null && r.lng != null) {
      const s = sum.get(b) ?? { lat: 0, lng: 0, n: 0 };
      sum.set(b, { lat: s.lat + r.lat, lng: s.lng + r.lng, n: s.n + 1 });
    }
  }
  const dist = (name: string) => {
    const s = sum.get(name);
    return from && s ? haversineMeters(from.lat, from.lng, s.lat / s.n, s.lng / s.n) : Infinity;
  };
  const shown = BUILDINGS.map((b) => ({ name: b.name, emoji: b.emoji, count: counts.get(b.name) ?? 0 }))
    .filter((b) => b.count >= MIN_BUILDING_COUNT)
    .sort((a, b) => dist(a.name) - dist(b.name) || b.count - a.count);
  // after 가 있는 건물은 그 건물 바로 뒤로 옮긴다
  for (const b of BUILDINGS) {
    if (!b.after) continue;
    const i = shown.findIndex((x) => x.name === b.name);
    if (i < 0 || !shown.some((x) => x.name === b.after)) continue;
    const [item] = shown.splice(i, 1);
    shown.splice(shown.findIndex((x) => x.name === b.after) + 1, 0, item);
  }
  return shown;
}
