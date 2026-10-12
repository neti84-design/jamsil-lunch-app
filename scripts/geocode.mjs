#!/usr/bin/env node
/**
 * 주소 → 좌표 보정 스크립트 (카카오 로컬 API 사용)
 *
 * 사용법:
 *   KAKAO_REST_KEY=발급받은키 node scripts/geocode.mjs
 *
 * - src/data/restaurants.ts 안에서 address 는 있는데 lat/lng 가 없거나
 *   approxLocation: true 인 항목을 찾아 좌표를 채우고 approxLocation 을 false 로 바꿉니다.
 * - 카카오 디벨로퍼스(https://developers.kakao.com)에서 앱 만들고 REST API 키 발급.
 */
import fs from 'node:fs';

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY) {
  console.error('KAKAO_REST_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const FILE = new URL('../src/data/restaurants.ts', import.meta.url);
let src = fs.readFileSync(FILE, 'utf8');

// 아주 단순한 블록 파서: 각 항목의 address / lat / lng / approxLocation 을 정규식으로 다룸
const blocks = src.split(/\n  \{\n/).slice(1);
let changed = 0;

for (const block of blocks) {
  const addr = block.match(/address:\s*'([^']+)'/)?.[1];
  const approx = /approxLocation:\s*true/.test(block);
  const hasLat = /lat:\s*[0-9.]+/.test(block);
  if (!addr || (hasLat && !approx)) continue;

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`,
    { headers: { Authorization: `KakaoAK ${KEY}` } },
  );
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) {
    console.warn('좌표 못 찾음:', addr);
    continue;
  }
  const lat = Number(doc.y).toFixed(6);
  const lng = Number(doc.x).toFixed(6);
  let next = block
    .replace(/lat:\s*[0-9.null]+/, `lat: ${lat}`)
    .replace(/lng:\s*[0-9.null]+/, `lng: ${lng}`)
    .replace(/approxLocation:\s*true/, 'approxLocation: false');
  src = src.replace(block, next);
  changed++;
  console.log('✔', addr, lat, lng);
  await new Promise((r) => setTimeout(r, 120));
}

fs.writeFileSync(FILE, src);
console.log(`완료: ${changed}곳 갱신`);
