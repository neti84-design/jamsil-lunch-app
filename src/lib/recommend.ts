import type { Concept, Restaurant } from '../types';
import { dishTags, type DishTag } from './dish';
import { buildingOf } from './buildings';
import type { ReportSummary } from './reports';
import type { LunchWeather } from './weather';

/** 오늘의 추천 주제: 날씨가 특별하면 날씨, 아니면 요일 */
export interface DayTheme {
  emoji: string;
  /** "비 오는 날엔 가까운 국물" 같은 한 줄 */
  reason: string;
  dishes: DishTag[];
  concepts: Concept[];
  /** 이 거리(분) 안에서만 고른다 */
  maxWalk: number;
  /** 비·눈 오는 날: 건물 안·지하로 갈 수 있는 곳 우선 */
  indoor: boolean;
}

export const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** 우산 없이(또는 지하·건물 안으로) 갈 수 있는 곳 */
const INDOOR_BUILDINGS = new Set(['롯데월드몰', '롯데백화점', '잠실역 지하상가', '캐슬플라자']);

const WEEKDAY_THEMES: Record<number, Omit<DayTheme, 'maxWalk' | 'indoor'>> = {
  1: { emoji: '💪', reason: '월요일엔 든든하게 시작', dishes: ['백반·정식', '국밥·탕', '돈까스'], concepts: ['filling'] },
  2: { emoji: '🍜', reason: '화요일은 부담 없는 한 그릇', dishes: ['면·국수', '라멘·우동', '쌀국수·태국'], concepts: ['light'] },
  3: { emoji: '🍖', reason: '수요일엔 고기로 힘내기', dishes: ['고기·구이', '돈까스'], concepts: ['heavy'] },
  4: { emoji: '🥢', reason: '목요일엔 색다른 메뉴로', dishes: ['중식·마라', '쌀국수·태국', '파스타', '초밥·회'], concepts: [] },
  5: { emoji: '🎉', reason: '불금 점심은 조금 특별하게', dishes: ['초밥·회', '파스타', '피자·버거', '고기·구이'], concepts: [] },
  0: { emoji: '😌', reason: '주말엔 편하게 한 끼', dishes: [], concepts: [] },
  6: { emoji: '😌', reason: '주말엔 편하게 한 끼', dishes: [], concepts: [] },
};

/** 한국 시간 기준 요일 (0 = 일) */
export function kstDay(now: number): number {
  return new Date(now + 9 * 3600_000).getUTCDay();
}

/** 한국 시간 기준 날짜 "2026-10-12" */
export function kstDate(now: number): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function dayTheme(now: number, w: LunchWeather | null, baseWalk: number): DayTheme {
  const day = kstDay(now);
  const wet = w && (w.kind === 'rain' || w.kind === 'snow' || w.kind === 'storm' || (w.rainChance ?? 0) >= 60);
  if (w && wet) {
    return {
      emoji: w.kind === 'snow' ? '❄️' : '☔',
      reason: `${w.kind === 'snow' ? '눈' : '비'} 오는 날엔 가까운 곳에서 따뜻한 국물`,
      dishes: ['국밥·탕', '라멘·우동', '샤브·전골', '면·국수'],
      concepts: ['hangover'],
      maxWalk: Math.min(baseWalk, 7),
      indoor: true,
    };
  }
  if (w && w.temp <= 5) {
    return {
      emoji: '🥶',
      reason: '쌀쌀한 날엔 뜨끈한 국물',
      dishes: ['국밥·탕', '샤브·전골', '라멘·우동', '쌀국수·태국'],
      concepts: ['hangover'],
      maxWalk: baseWalk,
      indoor: false,
    };
  }
  if (w && w.temp >= 27) {
    return {
      emoji: '🥵',
      reason: '더운 날엔 시원하고 가볍게',
      dishes: ['면·국수', '초밥·회', '샐러드·포케'],
      concepts: ['light', 'diet'],
      maxWalk: Math.min(baseWalk, 7),
      indoor: false,
    };
  }
  return { ...WEEKDAY_THEMES[day], maxWalk: baseWalk, indoor: false };
}

/** 날짜와 식당마다 고정된 0~1 값 — 같은 날엔 같은 추천, 날마다 조금씩 섞이게 */
function dailyJitter(date: string, id: string): number {
  let h = 2166136261;
  for (const ch of date + id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function rating(r: Restaurant): number {
  return r.reviews.naverRating ?? r.reviews.diningcodeRating ?? r.reviews.kakaoRating ?? 0;
}

interface PickOptions {
  theme: DayTheme;
  now: number;
  budget: number;
  walkById: Map<string, number | null>;
  summaries: Map<string, ReportSummary>;
  isOpen: (r: Restaurant) => boolean;
  /** 빼고 싶은 곳 (최근 투표로 간 곳 등) */
  exclude?: Set<string>;
  limit?: number;
}

/** 어제 추천에서 평점 하위 이 비율은 오늘 빼고 다른 곳으로 바꾼다 */
const ROTATE_RATIO = 0.6;
/** 며칠 전부터 차례로 계산해 "어제 추천"을 정확히 맞춘다 */
const ROTATE_DAYS = 7;

/** 주제·평점으로 매긴 점수 (날마다 섞는 값은 빼고) */
function baseScore(r: Restaurant, o: PickOptions): number | null {
  // 가격을 알고, 카카오에서 가져온 곳은 영업시간도 아는 곳만
  if ((r.source && !r.hours) || !r.priceRange || r.priceRange[0] > o.budget) return null;
  if (o.exclude?.has(r.id)) return null;
  const walk = o.walkById.get(r.id);
  if (walk == null || walk > o.theme.maxWalk) return null;
  if (!o.isOpen(r)) return null;
  const tags = dishTags(r);
  let score = 0;
  // 주제 메뉴가 가장 중요 (평점·거리 보너스는 보통 몇 점 안 됨)
  if (o.theme.dishes.some((d) => tags.includes(d))) score += 8;
  if (o.theme.concepts.some((c) => r.concepts.includes(c))) score += 2;
  if (o.theme.indoor) {
    const b = buildingOf(r);
    if (b && INDOOR_BUILDINGS.has(b)) score += 3;
    score += Math.max(0, 5 - walk) * 0.4;
  }
  const s = o.summaries.get(r.id);
  if (s) score += Math.min(3, (s.totalStars + (s.hidden + s.classic) * 2) / 5);
  const rt = rating(r);
  if (rt) score += Math.max(0, rt - 4) * 3;
  return score;
}

/** 그날 추천: 점수 + 날짜별 섞기. drop 에 든 곳은 자리가 남을 때만 */
function pickForDate(cands: { r: Restaurant; score: number }[], date: string, drop: Set<string>, limit: number): Restaurant[] {
  const ranked = cands
    .map((c) => ({ r: c.r, score: c.score + dailyJitter(date, c.r.id) * 2.5 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
  const fresh = ranked.filter((r) => !drop.has(r.id));
  return [...fresh, ...ranked.filter((r) => drop.has(r.id))].slice(0, limit);
}

/** 추천 중 평점이 상대적으로 낮은 하위 60% */
function lowerRated(picks: Restaurant[]): Set<string> {
  const n = Math.round(picks.length * ROTATE_RATIO);
  return new Set([...picks].sort((a, b) => rating(a) - rating(b)).slice(0, n).map((r) => r.id));
}

/**
 * 오늘의 추천 식당: 주제에 맞는 메뉴 + 평점·팀 별점 + 날마다 조금씩 섞기.
 * 같은 조건이면 어제 추천에서 평점 하위 60%는 오늘 다른 곳으로 바뀐다 (상위 40%는 다시 나올 수 있음)
 */
export function pickForToday(list: Restaurant[], o: PickOptions): Restaurant[] {
  const limit = o.limit ?? 6;
  const cands: { r: Restaurant; score: number }[] = [];
  for (const r of list) {
    const score = baseScore(r, o);
    if (score != null) cands.push({ r, score });
  }
  // 어제 추천도 그 전날 추천에 따라 달라지므로 며칠 전부터 차례로 계산
  let drop = new Set<string>();
  let picks: Restaurant[] = [];
  for (let back = ROTATE_DAYS; back >= 0; back--) {
    picks = pickForDate(cands, kstDate(o.now - back * 86400_000), drop, limit);
    drop = lowerRated(picks);
  }
  return picks;
}
