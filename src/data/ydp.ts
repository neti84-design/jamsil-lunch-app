import type { Restaurant } from '../types';
import { KAKAO_ROWS } from './ydp/kakaoPlaces';
import { KAKAO_DETAILS } from './ydp/kakaoDetails';
import { KAKAO_PHOTOS } from './ydp/kakaoPhotos';
import { fromKakao, type KakaoSet } from './build';

const SET: KakaoSet = { rows: KAKAO_ROWS, details: KAKAO_DETAILS, photos: KAKAO_PHOTOS, chainMenus: true };

/** 영등포맥스: 카카오맵에서 가져온 주변 음식점 */
export const RESTAURANTS: Restaurant[] = SET.rows.map((row) => fromKakao(row, SET));
