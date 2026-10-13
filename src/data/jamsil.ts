import type { Restaurant } from '../types';
import { RESTAURANTS as CURATED } from './restaurants';
import { KAKAO_ROWS } from './kakaoPlaces';
import { KAKAO_DETAILS } from './kakaoDetails';
import { KAKAO_PHOTOS } from './kakaoPhotos';
import { fillCurated, fromKakao, type KakaoSet } from './build';

const SET: KakaoSet = { rows: KAKAO_ROWS, details: KAKAO_DETAILS, photos: KAKAO_PHOTOS };

/** 잠실본사: 직접 정리한 식당 + 카카오맵에서 가져온 주변 음식점 */
export const RESTAURANTS: Restaurant[] = [...CURATED.map((r) => fillCurated(r, SET)), ...SET.rows.map((row) => fromKakao(row, SET))];
