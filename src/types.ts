export type Cuisine = '한식' | '일식' | '중식' | '양식' | '아시안' | '샐러드' | '분식' | '기타';

export type Concept = 'heavy' | 'hangover' | 'diet' | 'salad' | 'filling' | 'light' | 'quick';

/** 좌석·편의 필터 (테이블링/캐치테이블의 "편의시설" 항목 참고) */
export type SeatingType = 'group' | 'room';

export type ReservationMethod =
  | 'phone'
  | 'naver'
  | 'catchtable'
  | 'tabling'
  | 'walk-in'
  | 'none'
  | 'unknown';

export type WaitLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface MenuItem {
  name: string;
  price: number;
}

export interface Restaurant {
  id: string;
  name: string;
  branch?: string | null;
  cuisine: Cuisine;
  subcategory: string;
  signature: string[];
  /** 1인 점심 기준 최소/최대 금액 (원). null = 미확인 (카카오에서 가져온 곳) */
  priceRange: [number, number] | null;
  menu: MenuItem[];
  concepts: Concept[];
  seating: {
    group: boolean | null;
    solo: boolean | null;
    /** 단체로 한 번에 앉을 수 있는 최대 인원 (추정값이면 estimated: true) */
    groupSize?: number | null;
    /** 별도 룸(프라이빗 공간) 유무. null = 미확인 */
    room?: boolean | null;
    /** 단체 인원·룸 정보가 후기 기반 추정인지 */
    estimated?: boolean;
    notes?: string | null;
  };
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** 좌표가 주소/랜드마크 기준 근사치인지 */
  approxLocation?: boolean;
  phone: string | null;
  hours?: string | null;
  breakTime?: string | null;
  closedDays?: string | null;
  reservation: {
    method: ReservationMethod;
    notes?: string | null;
  };
  waiting: {
    level: WaitLevel;
    peak?: string | null;
    notes?: string | null;
  };
  reviews: {
    naverRating?: number | null;
    naverReviewCount?: number | null;
    kakaoRating?: number | null;
    /** 다이닝코드 평점 (네이버 평점 미수집 시 대체) */
    diningcodeRating?: number | null;
    summary?: string | null;
    highlights?: string[];
  };
  /** 좌표가 없을 때 쓰는 도보 분 (조사값) */
  walkMinutes?: number | null;
  nearestExit?: string | null;
  links: {
    naverPlace?: string | null;
    kakaoMap?: string | null;
    others?: string[];
  };
  sources?: string[];
  dataNotes?: string | null;
  /** 배달 가능 (조사로 확인된 경우 true). 사람들의 "배달 돼요" 체크로도 표시된다 */
  delivery?: boolean | null;
  /** 'kakao' = 카카오맵에서 자동으로 가져온 곳 (가격·메뉴·영업시간 없음) */
  source?: 'kakao';
}

/** 음식 종류 — 캐치테이블·테이블링의 1차 분류와 같은 구분 */
export const CUISINES: Cuisine[] = ['한식', '일식', '중식', '양식', '아시안', '샐러드', '분식', '기타'];

/** 방문 목적 — 캐치테이블의 "방문 목적", 테이블링의 "이런 분께 추천" 태그 방식을 따름 */
export const CONCEPT_LABELS: Record<Concept, { label: string; emoji: string; desc: string }> = {
  quick: { label: '빠른 점심', emoji: '⚡', desc: '회전 빠름, 30분 안에 먹고 나오기' },
  filling: { label: '든든한 한 끼', emoji: '🍚', desc: '양 많고 리필 되는 곳' },
  heavy: { label: '고기·육식', emoji: '🍖', desc: '고기·튀김 등 묵직한 메뉴' },
  hangover: { label: '해장', emoji: '🍲', desc: '국물로 속 풀기' },
  light: { label: '가볍게', emoji: '🍜', desc: '부담 없는 한 그릇' },
  diet: { label: '건강식', emoji: '🥗', desc: '저칼로리·채소 위주' },
  salad: { label: '샐러드·포케', emoji: '🥬', desc: '샐러드·포케 전문점' },
};

export const SEATING_LABELS: Record<SeatingType, { label: string; emoji: string; desc: string }> = {
  group: { label: '단체석', emoji: '👥', desc: '여러 명이 한 번에 앉을 수 있는 곳' },
  room: { label: '룸', emoji: '🚪', desc: '별도 룸(프라이빗 공간)이 있는 곳' },
};

/** 단체석 인원 선택지 */
export const GROUP_SIZES = [4, 6, 8, 10, 12, 15, 20];

export const RESERVATION_LABELS: Record<ReservationMethod, { label: string; desc: string }> = {
  phone: { label: '전화 예약', desc: '전화로 미리 자리 잡기' },
  naver: { label: '네이버 예약', desc: '네이버 지도 > 예약 탭에서 예약' },
  catchtable: { label: '캐치테이블', desc: '캐치테이블 앱에서 예약/웨이팅' },
  tabling: { label: '테이블링', desc: '테이블링 앱으로 원격 줄서기' },
  'walk-in': { label: '바로 방문', desc: '예약 없이 가서 줄 서기' },
  none: { label: '예약 불가', desc: '예약 안 받음' },
  unknown: { label: '확인 필요', desc: '예약 방식 미확인 — 전화로 확인' },
};

export const WAIT_LABELS: Record<WaitLevel, { label: string; color: string }> = {
  low: { label: '거의 없음', color: 'var(--ok)' },
  medium: { label: '보통', color: 'var(--warn)' },
  high: { label: '길어요', color: 'var(--danger)' },
  unknown: { label: '미확인', color: 'var(--muted)' },
};

/** 먹어본 사람이 남기는 한 줄 평가 태그 */
export type TasteTag = 'hidden' | 'classic';
export const TASTE_TAG_LABELS: Record<TasteTag, { label: string; emoji: string; desc: string }> = {
  hidden: { label: '숨은맛집', emoji: '🤫', desc: '알려진 것보다 훨씬 맛있는 곳' },
  classic: { label: '역시맛집', emoji: '👍', desc: '기대한 만큼 맛있는 곳' },
};

export const CUISINE_EMOJI: Record<Cuisine, string> = {
  한식: '🍚',
  일식: '🍣',
  중식: '🥟',
  양식: '🍝',
  아시안: '🍜',
  샐러드: '🥗',
  분식: '🍢',
  기타: '🍽️',
};

/** 배달 가능 표시: 조사값이 true 이거나, 누군가 "배달 돼요"를 체크한 곳 */
export function hasDelivery(r: Restaurant, checks = 0): boolean {
  return r.delivery === true || checks > 0;
}
