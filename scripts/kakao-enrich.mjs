#!/usr/bin/env node
/**
 * 카카오 장소 검색으로 식당 데이터 보정 (좌표·카카오맵 링크·전화번호)
 *
 * 사용법:
 *   KAKAO_REST_KEY=발급받은키 node scripts/kakao-enrich.mjs            # 미리보기 (파일 안 바꿈)
 *   KAKAO_REST_KEY=발급받은키 node scripts/kakao-enrich.mjs --apply    # 확실한 매칭만 반영
 *   ... --apply --include-medium                                        # 주소가 달라도 이름이 맞으면 반영
 *   ... --report report.json                                            # 매칭 결과를 JSON 으로 저장
 *
 * - 식당 이름(+지점명)으로 본사 주변(반경 3km)을 키워드 검색해 후보를 고르고,
 *   등록된 주소(도로명+번지)와 비교해 확신도(high / medium / none)를 매깁니다.
 * - 반영 내용: lat/lng(카카오 좌표), approxLocation: false, links.kakaoMap(장소 페이지),
 *   phone(비어 있을 때만 채움, 이미 있으면 그대로 두고 다르면 리포트에만 표시).
 * - 카카오 디벨로퍼스(https://developers.kakao.com)에서 앱 만들고 REST API 키 발급.
 *   (요청에 Authorization 헤더를 넣어 주는 프록시 환경이면 키 없이도 동작)
 */
import fs from 'node:fs';

const KEY = process.env.KAKAO_REST_KEY;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_MEDIUM = args.includes('--include-medium');
const REPORT = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;

// 본사(롯데캐슬골드) — src/lib/geo.ts 의 OFFICE 와 같은 값
const OFFICE = { lat: 37.5141, lng: 127.1017 };

const FILE = new URL('../src/data/restaurants.ts', import.meta.url);
let src = fs.readFileSync(FILE, 'utf8');

const body = src
  .slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1)
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');
const restaurants = JSON.parse(body);

/**
 * 사람이 확인한 결과 (2026-10). 자동 판정보다 우선합니다.
 * - query: 카카오에 등록된 이름이 달라서 검색어를 바꿔야 하는 곳
 * - accept: 주소 번지가 달라도(같은 상가·몰, 지번 표기 등) 같은 가게로 확인됨
 * - skip: 같은 체인의 다른 지점만 잡히는 곳 → 주소 좌표만 보정
 */
const REVIEWED = {
  'kimmyeongja-gukbap-sigma': { query: '김명자굴국밥 잠실점' },
  'bobuseon-budae-bossam-sigma': { query: '보부선', accept: true },
  '잠실김밥-잠실새내-새마을시장': { query: '잠실김밥', accept: true },
  '제일맛있는집-잠실역-지하상가': { accept: true },
  '해주찹쌀순대-잠실새내': { accept: true },
  '복면옥-잠실점': { accept: true },
  '샐러디-잠실스타파크점': { accept: true },
  '이레칼국수-잠실-장미상가': { accept: true },
  '뽀빠이분식-장미상가': { accept: true },
  '연남토마-롯데캐슬잠실점': { accept: true },
  '88샤브-방이동': { accept: true },
  '담은갈비-송파잠실점': { accept: true },
  '간코-롯데월드몰점': { accept: true },
  '촙촙-롯데월드몰점': { accept: true },
  '야래향-잠실': { accept: true },
  '왁버거-잠실르엘점': { accept: true },
  '달래해장-잠실새내점': { skip: true }, // 방이본점만 검색됨
  '명동할머니국수-잠실장미점': { skip: true }, // 잠실지하상가점만 검색됨
  '샐러디-잠실삼전역점': { skip: true }, // 스타파크점만 검색됨
  '제주오전복-잠실롯데월드몰점': { skip: true }, // 카카오엔 올림픽로 240(롯데월드)로 등록, 몰(300)과 다름
};

const norm = (s) => (s ?? '').toLowerCase().replace(/[\s·.,()\-_'"&]/g, '');

/** "서울 송파구 올림픽로35길 112 장미상가 ..." → "올림픽로35길112" (도로명+건물번호) */
function roadKey(addr) {
  const m = (addr ?? '').match(/([가-힣0-9]+(?:로|길))\s*(?:지하\s*)?(\d+(?:-\d+)?)/);
  return m ? `${m[1]}${m[2]}` : null;
}

async function search(query) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.search = new URLSearchParams({
    query,
    x: String(OFFICE.lng),
    y: String(OFFICE.lat),
    radius: '3000',
    size: '15',
  }).toString();
  const res = await fetch(url, { headers: KEY ? { Authorization: `KakaoAK ${KEY}` } : {} });
  if (!res.ok) throw new Error(`카카오 API ${res.status}: ${await res.text()}`);
  return (await res.json()).documents ?? [];
}

function score(r, doc) {
  const name = norm(r.name);
  const place = norm(doc.place_name);
  const nameHit = REVIEWED[r.id]?.query || place.includes(name) || name.includes(place.replace(/(본점|.{1,10}점)$/, ''));
  if (!nameHit) return null;
  const ours = roadKey(r.address);
  const theirs = roadKey(doc.road_address_name);
  const addrHit = !!ours && ours === theirs;
  const branchHit = !!r.branch && norm(r.branch).split(/점|\(|\)/).some((t) => t.length >= 2 && place.includes(t));
  return { doc, addrHit, branchHit, s: (addrHit ? 10 : 0) + (branchHit ? 3 : 0) - Number(doc.distance || 0) / 1000 };
}

async function geocode(addr) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  // "올림픽로 289 잠실시그마타워 지하1층" → "서울 송파구 올림픽로 289" 까지만
  const m = addr.match(/^(.*?(?:로|길)\s+(?:지하\s*)?\d+(?:-\d+)?)/);
  url.search = new URLSearchParams({ query: m ? m[1] : addr }).toString();
  const res = await fetch(url, { headers: KEY ? { Authorization: `KakaoAK ${KEY}` } : {} });
  if (!res.ok) throw new Error(`카카오 API ${res.status}: ${await res.text()}`);
  return (await res.json()).documents?.[0] ?? null;
}

async function match(r) {
  const rev = REVIEWED[r.id] ?? {};
  if (rev.skip) return { confidence: 'skip' };
  const queries = rev.query ? [rev.query] : [r.branch ? `${r.name} ${r.branch}` : null, r.name].filter(Boolean);
  const seen = new Map();
  for (const q of queries) {
    for (const doc of await search(q)) seen.set(doc.id, doc);
    await new Promise((res) => setTimeout(res, 100));
  }
  const cands = [...seen.values()].map((d) => score(r, d)).filter(Boolean).sort((a, b) => b.s - a.s);
  if (!cands.length) return { confidence: 'none', candidates: [...seen.values()].slice(0, 3) };
  const best = cands[0];
  const confidence = best.addrHit || REVIEWED[r.id]?.accept ? 'high' : best.branchHit || cands.length === 1 ? 'medium' : 'low';
  return { confidence, best: best.doc, others: cands.slice(1, 3).map((c) => c.doc) };
}

/** id 로 해당 식당 블록의 텍스트를 찾아 필드를 바꿈 (주석·서식 유지) */
function patch(id, fn) {
  const start = src.indexOf(`"id": ${JSON.stringify(id)}`);
  if (start < 0) throw new Error(`id 못 찾음: ${id}`);
  const next = src.indexOf('\n  {\n', start);
  const end = next < 0 ? src.lastIndexOf(']') : next;
  src = src.slice(0, start) + fn(src.slice(start, end)) + src.slice(end);
}

const report = [];
const counts = { high: 0, medium: 0, low: 0, none: 0, skip: 0, geocoded: 0 };
for (const r of restaurants) {
  const m = await match(r);
  counts[m.confidence]++;
  const d = m.best;
  const phone = d?.phone || null;
  report.push({
    id: r.id,
    name: [r.name, r.branch].filter(Boolean).join(' '),
    address: r.address,
    confidence: m.confidence,
    kakao: d && { name: d.place_name, address: d.road_address_name || d.address_name, phone, url: d.place_url, x: d.x, y: d.y },
    phoneDiff: d && r.phone && phone && norm(r.phone) !== norm(phone) ? { ours: r.phone, kakao: phone } : undefined,
    others: (m.others ?? m.candidates ?? []).map((o) => `${o.place_name} (${o.road_address_name || o.address_name})`),
  });
  const tag = { high: '✔', medium: '△', low: '?', none: '✘', skip: '–' }[m.confidence];
  console.log(`${tag} ${r.name}${r.branch ? ` ${r.branch}` : ''} → ${d ? `${d.place_name} | ${d.road_address_name || d.address_name}` : '없음'}`);

  const ok = m.confidence === 'high' || (INCLUDE_MEDIUM && m.confidence === 'medium');
  if (!ok && r.address && r.approxLocation) {
    // 가게는 못 찾았어도 주소가 있으면 건물 좌표로 보정 (카카오맵 링크·전화는 그대로)
    const g = await geocode(r.address);
    if (g) {
      counts.geocoded++;
      console.log(`   ↳ 주소 좌표로 보정: ${g.address_name}`);
      if (APPLY) {
        patch(r.id, (block) =>
          block
            .replace(/"lat": [0-9.null]+/, `"lat": ${Number(g.y).toFixed(6)}`)
            .replace(/"lng": [0-9.null]+/, `"lng": ${Number(g.x).toFixed(6)}`)
            .replace(/"approxLocation": true/, '"approxLocation": false'),
        );
      }
    }
  }
  if (APPLY && ok) {
    patch(r.id, (block) => {
      let b = block
        .replace(/"lat": [0-9.null]+/, `"lat": ${Number(d.y).toFixed(6)}`)
        .replace(/"lng": [0-9.null]+/, `"lng": ${Number(d.x).toFixed(6)}`)
        .replace(/"approxLocation": true/, '"approxLocation": false')
        .replace(/"kakaoMap": null/, `"kakaoMap": ${JSON.stringify(d.place_url.replace(/^http:/, 'https:'))}`);
      if (!r.phone && phone) b = b.replace(/"phone": null/, `"phone": ${JSON.stringify(phone)}`);
      return b;
    });
  }
}

if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
if (APPLY) fs.writeFileSync(FILE, src);
console.log(`\n확실 ${counts.high} · 지점 일치 ${counts.medium} · 애매 ${counts.low} · 못 찾음 ${counts.none} · 건너뜀 ${counts.skip} · 주소 좌표 보정 ${counts.geocoded}${APPLY ? ' — 반영 완료' : ' (미리보기)'}`);
