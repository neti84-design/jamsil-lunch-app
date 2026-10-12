import type { Cuisine, Restaurant } from '../types';
import { buildingOf } from './buildings';
import { dishTags, type DishTag } from './dish';

/** 흔한 다른 표기 → 데이터에 쓰인 표기 */
const SPELLING: [RegExp, string][] = [
  [/자장/g, '짜장'],
  [/쨤뽕|잠뽕/g, '짬뽕'],
  [/돈가스|돈까쓰|돈카츠/g, '돈까스'],
  [/스파게티/g, '파스타'],
  [/햄버거/g, '버거'],
  [/스시/g, '초밥'],
  [/콩국수/g, '국수'],
  [/쉑쉑버거|쉑쉑|셰이크쉑|쉐잌쉑/g, '쉐이크쉑'],
];

/**
 * 검색어 → 메뉴 카테고리·음식 종류 연동.
 * "짜장면"을 치면 메뉴판에 짜장면이 안 적힌 중식당도, "중국집"을 치면 중식당 전체가 나온다.
 */
const LINKS: { re: RegExp; dishes?: DishTag[]; cuisines?: Cuisine[] }[] = [
  { re: /중국|중식|중화|짜장|짬뽕|탕수육|딤섬|볶음밥|양장피|깐풍|유린기|군만두|우육면/, cuisines: ['중식'] },
  { re: /마라|훠궈/, dishes: ['중식·마라'] },
  { re: /일식|일본|초밥|사시미|규동|가츠동|텐동/, dishes: ['초밥·회', '라멘·우동', '돈까스'], cuisines: ['일식'] },
  { re: /라멘|우동|소바/, dishes: ['라멘·우동'] },
  { re: /돈까스|카츠/, dishes: ['돈까스'] },
  { re: /한식|백반|정식|집밥|한정식/, dishes: ['백반·정식'], cuisines: ['한식'] },
  { re: /국밥|해장|순대국|설렁탕|곰탕|갈비탕|찌개|국물/, dishes: ['국밥·탕'] },
  { re: /고기|구이|삼겹|갈비|불고기|제육|한우/, dishes: ['고기·구이'] },
  { re: /(?<!쌀)국수|냉면|면요리/, dishes: ['면·국수'] },
  { re: /양식|파스타|스테이크|리조또|이탈리안/, dishes: ['파스타', '피자·버거'], cuisines: ['양식'] },
  { re: /피자|버거/, dishes: ['피자·버거'] },
  { re: /샐러드|포케|다이어트|건강식/, dishes: ['샐러드·포케'], cuisines: ['샐러드'] },
  { re: /분식|김밥|떡볶이|라볶이|순대|튀김/, dishes: ['분식·김밥'], cuisines: ['분식'] },
  { re: /도시락/, dishes: ['도시락'] },
  { re: /샤브|전골/, dishes: ['샤브·전골'] },
  { re: /쌀국수|베트남|태국|팟타이|아시안|동남아|월남쌈|분짜/, dishes: ['쌀국수·태국'], cuisines: ['아시안'] },
];

function normalize(s: string): string {
  let out = s.toLowerCase();
  for (const [re, to] of SPELLING) out = out.replace(re, to);
  return out;
}

const hayCache = new WeakMap<Restaurant, string>();

function hayOf(r: Restaurant): string {
  const hit = hayCache.get(r);
  if (hit != null) return hit;
  const text = [r.name, r.branch ?? '', buildingOf(r) ?? '', r.subcategory, r.cuisine, ...r.signature, ...r.menu.map((m) => m.name), ...dishTags(r)].join(' ');
  const hay = normalize(text) + ' ' + normalize(text).replace(/\s+/g, '');
  hayCache.set(r, hay);
  return hay;
}

/** "면" "집" 처럼 끝에 붙는 말을 떼어도 찾아보게 */
const SUFFIX = /(면|집|맛집|요리|전문점|식당)$/;

function tokenMatches(r: Restaurant, token: string): boolean {
  const hay = hayOf(r);
  if (hay.includes(token)) return true;
  const stem = token.replace(SUFFIX, '');
  if (stem.length >= 2 && hay.includes(stem)) return true;
  for (const l of LINKS) {
    if (!l.re.test(token)) continue;
    if (l.cuisines?.includes(r.cuisine)) return true;
    if (l.dishes) {
      const tags = dishTags(r);
      if (l.dishes.some((d) => tags.includes(d))) return true;
    }
  }
  return false;
}

/** 검색어를 띄어쓰기로 나눈 낱말 */
export function queryTokens(q: string): string[] {
  return normalize(q.trim())
    .split(/\s+/)
    .filter(Boolean);
}

/** 검색어가 가게 이름(+지점)에 그대로 들어 있는지 — 이름이 맞는 곳을 목록 맨 위로 올릴 때 */
export function makeNameMatcher(q: string): (r: Restaurant) => boolean {
  const needle = normalize(q).replace(/\s+/g, '');
  if (!needle) return () => false;
  return (r) => normalize(r.name + (r.branch ?? '')).replace(/\s+/g, '').includes(needle);
}

/**
 * 검색어의 낱말을 모두 만족하는 식당만 (낱말마다 메뉴 카테고리·종류로도 연결).
 * 어느 식당과도 안 맞는 낱말(오타 등)은 무시해, "중국집 짜장면 맛있는곳" 같은 검색도 결과가 나온다.
 */
export function makeQueryMatcher(q: string, all: Restaurant[]): (r: Restaurant) => boolean {
  const tokens = queryTokens(q);
  if (tokens.length === 0) return () => true;
  const useful = tokens.filter((t) => all.some((r) => tokenMatches(r, t)));
  // 하나도 안 맞으면 결과 없음
  if (useful.length === 0) return () => false;
  return (r) => useful.every((t) => tokenMatches(r, t));
}
