import type { Restaurant } from '../types';
import { RESTAURANTS as CURATED } from './restaurants';
import { KAKAO_ROWS } from './kakaoPlaces';
import { KAKAO_DETAILS } from './kakaoDetails';
import { KAKAO_PHOTOS } from './kakaoPhotos';
import { LOTTE_WORLD_FLOORS } from './lotteWorldFloors';
import { fillCurated, fromKakao, type KakaoSet } from './build';

// 롯데월드 안(입장권 없이 가는 곳)은 주소 뒤에 층을 붙여 "롯데월드" 주요장소로 묶이게
const ROWS = KAKAO_ROWS.map((row): typeof row => {
  const floor = LOTTE_WORLD_FLOORS[row[0]];
  return floor ? [row[0], row[1], row[2], `${row[3]} 롯데월드 ${floor}`, row[4], row[5], row[6]] : row;
});

const SET: KakaoSet = { rows: ROWS, details: KAKAO_DETAILS, photos: KAKAO_PHOTOS, chainMenus: true };

/** 잠실본사: 직접 정리한 식당 + 카카오맵에서 가져온 주변 음식점 */
export const RESTAURANTS: Restaurant[] = [...CURATED.map((r) => fillCurated(r, SET)), ...SET.rows.map((row) => fromKakao(row, SET))];
