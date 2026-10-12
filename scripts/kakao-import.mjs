#!/usr/bin/env node
/**
 * 카카오맵 음식점 전체 가져오기 → src/data/kakaoPlaces.ts
 *
 * 사용법:
 *   KAKAO_REST_KEY=발급받은키 node scripts/kakao-import.mjs          # 기본 반경 1000m
 *   KAKAO_REST_KEY=발급받은키 node scripts/kakao-import.mjs 800      # 반경 지정 (m)
 *
 * - 본사(롯데캐슬골드) 기준 반경 안의 카카오 "음식점"(FD6) 을 전부 모읍니다.
 *   카카오 API 는 한 번에 45곳까지만 주므로 영역을 4등분해 가며 빠짐없이 수집합니다.
 * - 술집·간식(카페·베이커리 등)·구내식당·식품판매, 세부 분류가 없는 곳은 뺍니다.
 * - src/data/restaurants.ts 에 직접 정리한 식당(카카오맵 링크로 연결된 곳)은 빼서 중복을 막습니다.
 * - 카카오엔 가격·메뉴·영업시간이 없어서, 앱에선 "가격 미확인"으로 보이고 예산 필터를 걸면 숨겨집니다.
 *   직접 조사한 정보를 넣고 싶으면 그 식당을 restaurants.ts 로 옮겨 적으세요 (카카오맵 링크를 넣으면 여기서 자동 제외).
 */
import fs from 'node:fs';

const KEY = process.env.KAKAO_REST_KEY;
const RADIUS = Number(process.argv[2]) || 1000;
// 본사(롯데캐슬골드) — src/lib/geo.ts 의 OFFICE 와 같은 값
const OFFICE = { lat: 37.5141, lng: 127.1017 };
const EXCLUDE = /^(술집|간식|구내식당|식품판매|카페)$/;

const dLat = RADIUS / 111000;
const dLng = RADIUS / (111000 * Math.cos((OFFICE.lat * Math.PI) / 180));

async function page(rect, p) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
  url.search = new URLSearchParams({ category_group_code: 'FD6', rect: rect.join(','), page: String(p), size: '15' }).toString();
  const res = await fetch(url, { headers: KEY ? { Authorization: `KakaoAK ${KEY}` } : {} });
  if (!res.ok) throw new Error(`카카오 API ${res.status}: ${await res.text()}`);
  return res.json();
}

const found = new Map();
async function grab(x1, y1, x2, y2) {
  const rect = [x1, y1, x2, y2];
  const first = await page(rect, 1);
  if (first.meta.total_count > 45) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    await grab(x1, y1, mx, my);
    await grab(mx, y1, x2, my);
    await grab(x1, my, mx, y2);
    await grab(mx, my, x2, y2);
    return;
  }
  for (const d of first.documents) found.set(d.id, d);
  for (let p = 2, end = first.meta.is_end; !end && p <= 3; p++) {
    const j = await page(rect, p);
    for (const d of j.documents) found.set(d.id, d);
    end = j.meta.is_end;
  }
}

function meters(lat, lng) {
  const t = Math.PI / 180;
  const a = Math.sin(((lat - OFFICE.lat) * t) / 2) ** 2 + Math.cos(OFFICE.lat * t) * Math.cos(lat * t) * Math.sin(((lng - OFFICE.lng) * t) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

await grab(OFFICE.lng - dLng, OFFICE.lat - dLat, OFFICE.lng + dLng, OFFICE.lat + dLat);

// 직접 정리한 식당과 겹치는 카카오 장소 id
const curated = fs.readFileSync(new URL('../src/data/restaurants.ts', import.meta.url), 'utf8');
const curatedIds = new Set([...curated.matchAll(/place\.map\.kakao\.com\/(\d+)/g)].map((m) => m[1]));

const rows = [];
for (const d of found.values()) {
  const cat = d.category_name.split(' > ').slice(1); // ["한식", "해장국", "달래해장"]
  if (!cat[0] || EXCLUDE.test(cat[0]) || curatedIds.has(d.id)) continue;
  const lat = Number(d.y);
  const lng = Number(d.x);
  if (meters(lat, lng) > RADIUS) continue;
  // [카카오 id, 이름, 분류(> 로 연결), 주소, 전화, 위도, 경도]
  rows.push([d.id, d.place_name, cat.join('>'), d.road_address_name || d.address_name, d.phone || '', +lat.toFixed(6), +lng.toFixed(6)]);
}
rows.sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));

const out = `// 자동 생성: scripts/kakao-import.mjs (카카오맵 음식점, 본사 반경 ${RADIUS}m, ${new Date().toISOString().slice(0, 10)})
// 직접 고치지 말고 스크립트를 다시 돌리세요. 정보를 보강하려면 그 식당을 restaurants.ts 로 옮겨 적으면 됩니다.
// [카카오 id, 이름, 분류, 주소, 전화, 위도, 경도]
export const KAKAO_ROWS: [string, string, string, string, string, number, number][] = [
${rows.map((r) => '  ' + JSON.stringify(r)).join(',\n')},
];
`;
fs.writeFileSync(new URL('../src/data/kakaoPlaces.ts', import.meta.url), out);
console.log(`카카오 음식점 ${found.size}곳 중 ${rows.length}곳 저장 (직접 정리한 ${curatedIds.size}곳·술집·간식 등 제외)`);
