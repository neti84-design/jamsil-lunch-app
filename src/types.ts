export type Cuisine = '한식' | '일식' | '중식' | '양식' | '아시안' | '샐러드' | '분식' | '기타';

export type Concept = 'heavy' | 'hangover' | 'diet' | 'salad' | 'filling' | 'light' | 'quick';

export type SeatingType = 'group' | 'solo';

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
  /** 1인 점심 기준 최소/최대 금액 (원) */
  priceRange: [number, number];
  menu: MenuItem[];
  concepts: Concept[];
  seating: {
    group: boolean | null;
    solo: boolean | null;
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
}

export const CUISINES: Cuisine[] = ['한식', '일식', '중식', '양식', '아시안', '샐러드', '분식', '기타'];

export const CONCEPT_LABELS: Record<Concept, { label: string; emoji: string; desc: string }> = {
  heavy: { label: '헤비하게', emoji: '🍖', desc: '고기·기름진 든든한 한 끼' },
  hangover: { label: '해장', emoji: '🍲', desc: '국물로 속 풀기' },
  diet: { label: '다이어트', emoji: '🥗', desc: '저칼로리·가벼운 구성' },
  salad: { label: '샐러드', emoji: '🥬', desc: '샐러드·포케 전문' },
  filling: { label: '배부르게', emoji: '🍚', desc: '양 많고 리필 되는 곳' },
  light: { label: '가볍게', emoji: '🍜', desc: '부담 없는 한 그릇' },
  quick: { label: '빨리', emoji: '⚡', desc: '회전 빠름, 30분 컷' },
};

export const SEATING_LABELS: Record<SeatingType, { label: string; emoji: string }> = {
  group: { label: '단체석', emoji: '👥' },
  solo: { label: '혼밥', emoji: '🧑' },
};

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
