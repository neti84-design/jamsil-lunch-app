import type { Cuisine, Restaurant } from '../types';
import { MENU_PRICES } from './menuPrices';
import type { KakaoDetail } from './kakaoDetails';

/** 카카오 장소 한 줄: [카카오 id, 이름, 분류, 주소, 전화, 위도, 경도] */
export type KakaoRow = [string, string, string, string, string, number, number];

/** 근무지 하나의 카카오 자료 */
export interface KakaoSet {
  rows: KakaoRow[];
  details: Record<string, KakaoDetail>;
  photos: Record<string, string>;
}

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

type MenuFields = Pick<Restaurant, 'priceRange' | 'menu' | 'signature' | 'dataNotes'>;

/** 카카오맵 가게 정보(메뉴·가격) → 메뉴·가격대·대표 메뉴. 없으면 동료 자료 */
function kakaoMenuFields(kakaoId: string, details: Record<string, KakaoDetail>): MenuFields | null {
  const d = details[kakaoId];
  if (!d?.price || !d.menu?.length) return menuFields(kakaoId);
  const [lo, hi] = d.price;
  return {
    priceRange: [lo, hi],
    menu: d.menu.map(([name, price]) => ({ name, price })),
    // 대표 메뉴는 점심 가격대 안의 것으로
    signature: d.menu.filter(([, p]) => p >= lo && p <= hi).slice(0, 3).map(([name]) => name),
    dataNotes: '메뉴·가격·영업시간은 카카오맵 기준(2026-10)이에요. 방문 전 확인하세요.',
  };
}

/** 카카오맵 영업시간·별점 */
function kakaoHoursFields(
  kakaoId: string,
  details: Record<string, KakaoDetail>,
): Pick<Restaurant, 'hours' | 'breakTime' | 'closedDays'> | null {
  const d = details[kakaoId];
  return d?.hours ? { hours: d.hours, breakTime: d.breakTime ?? null, closedDays: d.closedDays ?? null } : null;
}

/** 동료 조사 메뉴·가격이 있으면 메뉴·가격대·대표 메뉴로 */
function menuFields(key: string): MenuFields | null {
  const rows = MENU_PRICES[key];
  if (!rows?.length) return null;
  const prices = rows.map(([, p]) => p);
  return {
    priceRange: [Math.min(...prices), Math.max(...prices)],
    menu: rows.map(([name, price]) => ({ name, price })),
    signature: rows.slice(0, 3).map(([name]) => name),
    dataNotes: '메뉴·가격은 동료가 정리한 "오늘 뭐 먹지" 자료 기준이에요. 방문 전 확인하세요.',
  };
}

export function fromKakao([id, placeName, category, address, phone, lat, lng]: KakaoRow, set: KakaoSet): Restaurant {
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
    ...kakaoMenuFields(id, set.details),
    ...kakaoHoursFields(id, set.details),
    concepts: [],
    seating: { group: null, solo: null },
    address,
    lat,
    lng,
    phone: phone || null,
    reservation: { method: 'unknown' },
    waiting: { level: 'unknown' },
    reviews: set.details[id]?.rating != null ? { kakaoRating: set.details[id].rating } : {},
    links: { kakaoMap: `https://place.map.kakao.com/${id}` },
    photo: set.photos[id] ?? null,
    source: 'kakao',
  };
}

/** 직접 정리한 곳은 조사값을 그대로 두고, 비어 있는 메뉴·영업시간·카카오 별점·사진만 채운다 */
export function fillCurated(r: Restaurant, set: KakaoSet): Restaurant {
  const kakaoId = r.links.kakaoMap?.match(/place\.map\.kakao\.com\/(\d+)/)?.[1];
  const out = { ...r };
  if (r.menu.length === 0) {
    const m = (kakaoId && kakaoMenuFields(kakaoId, set.details)) || menuFields(r.id);
    if (m) out.menu = m.menu;
  }
  if (!r.hours && kakaoId) Object.assign(out, kakaoHoursFields(kakaoId, set.details));
  const rating = kakaoId ? set.details[kakaoId]?.rating : undefined;
  if (rating != null && r.reviews.kakaoRating == null) out.reviews = { ...r.reviews, kakaoRating: rating };
  if (!r.photo && kakaoId && set.photos[kakaoId]) out.photo = set.photos[kakaoId];
  return out;
}
