import type { Restaurant } from '../types';

/**
 * 메뉴(요리) 태그 — 캐치테이블의 "메뉴" 세부 필터(국밥·탕, 돈까스, 라멘 …) 방식.
 * 데이터의 subcategory/signature 문자열에서 자동으로 뽑는다.
 */
export const DISH_TAGS = [
  '국밥·탕',
  '백반·정식',
  '고기·구이',
  '면·국수',
  '돈까스',
  '라멘·우동',
  '초밥·회',
  '중식·마라',
  '피자·버거',
  '파스타',
  '샐러드·포케',
  '분식·김밥',
  '도시락',
  '샤브·전골',
  '쌀국수·태국',
] as const;

export type DishTag = (typeof DISH_TAGS)[number];

const RULES: [DishTag, RegExp][] = [
  ['국밥·탕', /국밥|순대국|설렁탕|해장국|탕|순두부|해물/],
  ['백반·정식', /백반|정식|한정식|집밥|뷔페|보리밥/],
  ['고기·구이', /갈비|구이|삼겹|한우|불고기|제육|고기/],
  ['면·국수', /칼국수|막국수|냉면|국수|수제비/],
  ['돈까스', /돈까스|카츠|돈카츠/],
  ['라멘·우동', /라멘|우동|소바/],
  ['초밥·회', /초밥|스시|회|연어|사시미/],
  ['중식·마라', /마라|짬뽕|짜장|중식|중국|탕수육|딤섬/],
  ['피자·버거', /피자|버거|햄버거/],
  ['파스타', /파스타|스테이크|리조또/],
  ['샐러드·포케', /샐러드|포케/],
  ['분식·김밥', /분식|김밥|떡볶이|라면/],
  ['도시락', /도시락|한솥/],
  ['샤브·전골', /샤브|전골/],
  ['쌀국수·태국', /쌀국수|태국|베트남|팟타이|퍼/],
];

const cache = new WeakMap<Restaurant, DishTag[]>();

export function dishTags(r: Restaurant): DishTag[] {
  const hit = cache.get(r);
  if (hit) return hit;
  const hay = [r.subcategory, ...r.signature, ...r.menu.map((m) => m.name)].join(' ');
  const tags = RULES.filter(([, re]) => re.test(hay)).map(([t]) => t);
  // 아무 태그도 없으면 종류 기준으로 하나 붙여준다
  if (tags.length === 0) {
    if (r.cuisine === '한식') tags.push('백반·정식');
    if (r.cuisine === '중식') tags.push('중식·마라');
    if (r.cuisine === '샐러드') tags.push('샐러드·포케');
    if (r.cuisine === '분식') tags.push('분식·김밥');
  }
  cache.set(r, tags);
  return tags;
}

/** 홈 화면 카테고리 아이콘 */
export const DISH_EMOJI: Record<DishTag, string> = {
  '국밥·탕': '🍲',
  '백반·정식': '🍱',
  '고기·구이': '🥩',
  '면·국수': '🍜',
  돈까스: '🍖',
  '라멘·우동': '🍥',
  '초밥·회': '🍣',
  '중식·마라': '🥟',
  '피자·버거': '🍔',
  파스타: '🍝',
  '샐러드·포케': '🥗',
  '분식·김밥': '🍙',
  도시락: '🥡',
  '샤브·전골': '🫕',
  '쌀국수·태국': '🍛',
};
