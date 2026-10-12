import type { Cuisine, Restaurant } from '../types';
import { RESTAURANTS as CURATED } from './restaurants';
import { KAKAO_ROWS } from './kakaoPlaces';

/** 카카오 1차 분류 → 앱의 음식 종류 */
const CUISINE_OF: Record<string, Cuisine> = {
  한식: '한식',
  기사식당: '한식',
  샤브샤브: '한식',
  일식: '일식',
  중식: '중식',
  양식: '양식',
  패밀리레스토랑: '양식',
  패스트푸드: '양식',
  아시아음식: '아시안',
  샐러드: '샐러드',
  분식: '분식',
  도시락: '분식',
};

/** "명동할머니국수 잠실지하상가점" → ["명동할머니국수", "잠실지하상가점"] */
function splitBranch(placeName: string): [string, string | null] {
  const m = placeName.match(/^(.+?)\s+(\S+점)$/);
  return m ? [m[1], m[2]] : [placeName, null];
}

function fromKakao([id, placeName, category, address, phone, lat, lng]: (typeof KAKAO_ROWS)[number]): Restaurant {
  const cat = category.split('>');
  const [name, branch] = splitBranch(placeName);
  return {
    id: `kakao-${id}`,
    name,
    branch,
    cuisine: CUISINE_OF[cat[0]] ?? '기타',
    // 세 번째 단계는 대개 체인 이름이라 두 번째 단계까지만 ("돈까스,우동" → "돈까스·우동")
    subcategory: (cat[1] ?? cat[0]).replace(/,/g, '·'),
    signature: [],
    priceRange: null,
    menu: [],
    concepts: [],
    seating: { group: null, solo: null },
    address,
    lat,
    lng,
    phone: phone || null,
    reservation: { method: 'unknown' },
    waiting: { level: 'unknown' },
    reviews: {},
    links: { kakaoMap: `https://place.map.kakao.com/${id}` },
    source: 'kakao',
  };
}

/** 직접 정리한 식당 + 카카오맵에서 가져온 주변 음식점 */
export const RESTAURANTS: Restaurant[] = [...CURATED, ...KAKAO_ROWS.map(fromKakao)];
