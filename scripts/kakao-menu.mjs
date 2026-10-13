#!/usr/bin/env node
/**
 * 카카오맵 가게 정보(메뉴·가격·영업시간·평점) 가져오기 → src/data/kakaoDetails.ts
 * 가게 사진(음식 → 간판 → 내부) 주소 → src/data/kakaoPhotos.ts
 *
 * 사용법:
 *   node scripts/kakao-menu.mjs            # 받아 둔 것은 다시 받지 않음
 *   node scripts/kakao-menu.mjs --fresh    # 전부 새로 받기
 *   SITE=ydp node scripts/kakao-menu.mjs   # 영등포맥스 (src/data/ydp/)
 *
 * - src/data/kakaoPlaces.ts 의 카카오 id(+ restaurants.ts 의 카카오맵 링크) 마다 카카오맵 가게 페이지가 쓰는 정보(place-api.map.kakao.com)를 읽습니다.
 *   공식 API 가 아니라서 카카오가 형식을 바꾸면 이 스크립트를 고쳐야 할 수 있습니다.
 * - 받은 원본은 node_modules/.cache/kakao-panel/ 에 두고, 앱에 필요한 값만 추려 kakaoDetails.ts 로 씁니다.
 * - 메뉴가 없는 곳은 src/data/menuPrices.ts(동료 자료)가 있으면 그걸 씁니다 (src/data/index.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/kakao-panel');
// SITE=ydp 면 영등포맥스 데이터(src/data/ydp/)
const SITE = process.env.SITE || 'jamsil';
const DATA = path.join(ROOT, SITE === 'jamsil' ? 'src/data' : `src/data/${SITE}`);
const OUT = path.join(DATA, 'kakaoDetails.ts');
const PHOTO_OUT = path.join(DATA, 'kakaoPhotos.ts');
const FRESH = process.argv.includes('--fresh');
const CONCURRENCY = 4;
/** 메뉴는 앞에서부터 이만큼만 앱에 넣는다 */
const MAX_MENU = 12;

const kakaoIds = [...fs.readFileSync(path.join(DATA, 'kakaoPlaces.ts'), 'utf8').matchAll(/^\s*\["(\d+)",/gm)].map((m) => m[1]);
// 직접 정리한 곳도 카카오맵 링크가 있으면 받아서, 비어 있는 영업시간·메뉴만 채운다
const curatedIds =
  SITE === 'jamsil' ? [...fs.readFileSync(path.join(ROOT, 'src/data/restaurants.ts'), 'utf8').matchAll(/place\.map\.kakao\.com\/(\d+)/g)].map((m) => m[1]) : [];
const ids = [...new Set([...kakaoIds, ...curatedIds])];
fs.mkdirSync(CACHE, { recursive: true });

const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', pf: 'web', Referer: 'https://place.map.kakao.com/' };

/** place-api 에서 JSON 받기. 404 면 null, 실패하면 undefined */
async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // 연결이 끊기면(ECONNRESET 등) 잠시 쉬고 다시 시도
    const res = await fetch(url, { headers: HEADERS }).catch(() => null);
    if (res?.ok) return res.json();
    if (res?.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return undefined;
}

/** 받아 둔 게 있으면 그걸, 없으면 받아서 필요한 부분만 저장 */
async function cached(file, load) {
  file = path.join(CACHE, file);
  if (!FRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keep = await load();
  if (keep !== undefined) fs.writeFileSync(file, JSON.stringify(keep));
  return keep ?? null;
}

async function fetchPanel(id) {
  const keep = await cached(`${id}.json`, async () => {
    const d = await getJson(`https://place-api.map.kakao.com/places/panel3/${id}`);
    return d && { menu: d.menu?.menus?.items ?? [], open_hours: d.open_hours ?? null, score: d.kakaomap_review?.score_set ?? null };
  });
  if (keep === null) console.warn(`  ${id}: 받기 실패`);
  return keep;
}

/**
 * 가게 사진 고르기: 음식 사진 → 없으면 외부(간판) → 없으면 내부.
 * 카카오맵이 사진마다 붙여 둔 분류(tag)로 고르고, 메뉴판·가격표처럼 글씨만 있는 사진은 쓰지 않는다
 */
const PHOTO_TAGS = ['FOOD', 'OUTDOOR', 'INDOOR'];
/** PNG·GIF 는 대개 가격표·할인 안내 같은 편집 이미지라 건너뛴다 (찍은 사진은 JPEG) */
const GRAPHIC = /\.(png|gif)(\?|$)/i;
async function fetchPhoto(id) {
  return cached(`photo-${id}.json`, async () => {
    for (const tag of PHOTO_TAGS) {
      const d = await getJson(`https://place-api.map.kakao.com/places/tab/photos/${id}?tag=${tag}`);
      if (d === undefined) return undefined;
      const url = d?.photos?.find((p) => p.media_type === 'PHOTO' && p.url && !GRAPHIC.test(p.url))?.url;
      if (url) return { url, tag };
    }
    return { url: null };
  });
}

// ---------- 메뉴 → 점심 가격 ----------
/** 음료·술·사이드·추가 메뉴는 가격대 계산에서 뺀다 */
const SIDE = /공기밥|사리|추가|음료|콜라|사이다|제로|소주|맥주|막걸리|하이볼|와인|사케|토핑|곱빼기|생수|커피|아메리카노|에이드|주스|맥콜|환타/;
/** 1인 점심으로 보기 어려운 큰 메뉴(전골 대·수육 등) */
const MAX_LUNCH = 30000;
const MIN_MAIN = 3500;

function menuOf(items) {
  return items
    .filter((i) => i.name && typeof i.price === 'number' && i.price > 0)
    .map((i) => [i.name.trim(), i.price]);
}

function lunchRange(menu) {
  const mains = menu.filter(([n, p]) => !SIDE.test(n) && p >= MIN_MAIN && p <= MAX_LUNCH).map(([, p]) => p);
  if (!mains.length) return null;
  mains.sort((a, b) => a - b);
  // 위쪽 끝은 비싼 단품 하나에 끌려가지 않게 상위 80% 지점
  return [mains[0], mains[Math.min(mains.length - 1, Math.floor(mains.length * 0.8))]];
}

// ---------- 영업시간 → "월~금 11:00-22:00, 토 11:00-21:00" ----------
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function rangeOf(text) {
  const m = text?.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** 요일 번호 목록 → "월~금", "토·일", "월·수" */
function daysLabel(days) {
  const idx = days.map((d) => ORDER.indexOf(d)).sort((a, b) => a - b);
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([a, b]) => (a === b ? DAYS[ORDER[a]] : b === a + 1 ? `${DAYS[ORDER[a]]}·${DAYS[ORDER[b]]}` : `${DAYS[ORDER[a]]}~${DAYS[ORDER[b]]}`))
    .join('·');
}

/** 월요일부터 셌을 때 가장 앞선 요일 */
const firstDay = (days) => Math.min(...days.map((d) => ORDER.indexOf(d)));

function hoursOf(open) {
  const days = open?.week_from_today?.week_periods?.flatMap((p) => p.days ?? []) ?? [];
  if (!days.length) return null;
  const byTime = new Map();
  const off = [];
  const breaks = new Map();
  for (const d of days) {
    const day = DAYS.indexOf(d.day_of_the_week_desc?.[0]);
    if (day < 0) continue;
    if (d.off_days_desc) {
      off.push(day);
      continue;
    }
    const t = /24시간/.test(d.on_days?.start_end_time_desc ?? '') ? '00:00-24:00' : rangeOf(d.on_days?.start_end_time_desc);
    if (!t) continue;
    byTime.set(t, [...(byTime.get(t) ?? []), day]);
    const br = rangeOf(d.on_days?.break_times_desc?.[0]);
    if (br) breaks.set(br, [...(breaks.get(br) ?? []), day]);
  }
  if (!byTime.size) return null;
  const hours = [...byTime]
    .sort((a, b) => firstDay(a[1]) - firstDay(b[1]))
    .map(([t, ds]) => (ds.length === 7 ? `매일 ${t}` : `${daysLabel(ds)} ${t}`))
    .join(', ');
  // 앱은 브레이크타임을 하나만 읽는다: 가장 많은 요일에 있는 것, 평일에만 있으면 "평일"
  let breakTime = null;
  const top = [...breaks].sort((a, b) => b[1].length - a[1].length)[0];
  if (top) breakTime = top[1].every((d) => d >= 1 && d <= 5) ? `평일 ${top[0]}` : top[0];
  return { hours, breakTime, closedDays: off.length ? daysLabel(off) : null };
}

/** 사진 주소: https 로 (http 이미지는 https 페이지에서 막힌다) */
function photoOf(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url.replace(/^http:/, 'https:') : null;
}

// ---------- 실행 ----------
const out = {};
const photos = {};
let done = 0;
let withMenu = 0;
let withHours = 0;
const queue = [...ids];
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const d = await fetchPanel(id);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${ids.length}`);
    const photo = photoOf((await fetchPhoto(id))?.url);
    if (photo) photos[id] = photo;
    if (!d) continue;
    const menu = menuOf(d.menu);
    const price = lunchRange(menu);
    const h = hoursOf(d.open_hours);
    const score = d.score?.review_count >= 3 ? d.score.average_score : null;
    if (!price && !h && score == null) continue;
    if (price) withMenu++;
    if (h) withHours++;
    out[id] = {
      ...(price && { price, menu: menu.slice(0, MAX_MENU) }),
      ...(h && { hours: h.hours, ...(h.breakTime && { breakTime: h.breakTime }), ...(h.closedDays && { closedDays: h.closedDays }) }),
      ...(score != null && { rating: score, reviews: d.score.review_count }),
    };
  }
}
console.log(`카카오맵 가게 정보 ${ids.length}곳 받는 중…`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const keys = Object.keys(out).sort((a, b) => Number(a) - Number(b));
const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`).join('\n');
fs.writeFileSync(
  OUT,
  `// 자동 생성: scripts/kakao-menu.mjs (카카오맵 가게 정보, ${new Date().toISOString().slice(0, 10)})
// 직접 고치지 말고 스크립트를 다시 돌리세요. price = 1인 점심 가격대(음료·사이드·3만원 넘는 큰 메뉴 제외)
export interface KakaoDetail {
  price?: [number, number];
  menu?: [string, number][];
  hours?: string;
  breakTime?: string;
  closedDays?: string;
  /** 카카오맵 별점 (후기 3개 이상일 때) */
  rating?: number;
  reviews?: number;
}

export const KAKAO_DETAILS: Record<string, KakaoDetail> = {
${body}
};
`,
);
const photoKeys = Object.keys(photos).sort((a, b) => Number(a) - Number(b));
fs.writeFileSync(
  PHOTO_OUT,
  `// 자동 생성: scripts/kakao-menu.mjs (카카오맵 가게 사진: 음식 → 간판 → 내부, ${new Date().toISOString().slice(0, 10)})
// 직접 고치지 말고 스크립트를 다시 돌리세요. 사진은 올린 사람(카카오맵 후기·블로그·가게) 것이라 주소만 걸어 둔다
export const KAKAO_PHOTOS: Record<string, string> = {
${photoKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(photos[k])},`).join('\n')}
};
`,
);
console.log(`가게 사진 ${photoKeys.length}곳 → ${path.relative(ROOT, PHOTO_OUT)}`);
console.log(`완료: ${keys.length}곳 (메뉴·가격 ${withMenu}, 영업시간 ${withHours}) → ${path.relative(ROOT, OUT)}`);
