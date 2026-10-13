import { createContext, useContext } from 'react';

/** 근무지: 잠실본사 / 영등포맥스. 오른쪽 위에서 바꾸고, 마지막에 고른 곳으로 다음에도 열린다 */
export type SiteId = 'jamsil' | 'ydp';

export interface Site {
  id: SiteId;
  /** 바꾸기 단추에 보이는 이름 */
  label: string;
  /** 출발 위치. 도보 시간은 여기서 잰다 */
  office: { lat: number; lng: number; popup: string };
  /** 가장 가까운 지하철역 (지도 표시) */
  station: { lat: number; lng: number; popup: string };
  /** 식당 상세의 "○○ 도보 N분" */
  walkFrom: string;
  /** 앱 이름: 오늘 + accent, 옆에 작은 sub */
  brand: { accent: string; sub: string; tagline: string };
  /** 지도 반경 원 등 CSS 밖에서 쓰는 강조색 */
  color: string;
  /** 브라우저 주소창 색 */
  themeColor: string;
  /** 처음 식대 조건 (인당, 원) */
  defaultBudget: number;
  /** 큰길을 건너야 하는 곳인지 (+3분). 없으면 직선거리만 */
  crossesRoad?: (lat: number, lng: number) => boolean;
}

export const SITES: Record<SiteId, Site> = {
  jamsil: {
    id: 'jamsil',
    label: '잠실본사',
    office: { lat: 37.5141, lng: 127.1017, popup: '출발: 본사 (롯데캐슬골드 · 8번 출구)' },
    station: { lat: 37.5133, lng: 127.1001, popup: '잠실역 (2·8호선)' },
    // 예전 화면 문구 그대로 (지금 쓰는 사람들이 보던 대로)
    walkFrom: '잠실역',
    brand: { accent: '잠심', sub: '잠실점심', tagline: '구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!' },
    color: '#ff6b35',
    themeColor: '#f64610',
    defaultBudget: 12000,
    // 잠실사거리 큰길 — 올림픽로(동서) 남쪽, 송파대로(남북) 서쪽이면 건너야 한다
    crossesRoad: (lat, lng) => lat < 37.5134 || lng < 127.1004,
  },
  ydp: {
    id: 'ydp',
    label: '영등포맥스',
    office: { lat: 37.527817, lng: 126.904683, popup: '출발: 영등포맥스 (영중로 125 · 롯데마트 맥스)' },
    station: { lat: 37.522709, lng: 126.90518, popup: '영등포시장역 (5호선)' },
    walkFrom: '맥스에서',
    brand: { accent: '영심', sub: '영등포점심', tagline: '짧아서 더 애절한 영등포 생활, 즐기자구요!' },
    color: '#1f9d55',
    themeColor: '#178a48',
    defaultBudget: 10000,
  },
};

/** 처음 여는 사람은 영등포맥스 기준 */
export const DEFAULT_SITE: SiteId = 'ydp';

const SITE_KEY = 'jamsil-lunch:site';
const KEY_PREFIX = 'jamsil-lunch:';

/**
 * 근무지가 생기기 전부터 쓰던 사람인지 — 이 기기에 앱 저장값(조건·관심매장 등)이 이미 있으면 잠실 사용자.
 * 앱이 저장값을 쓰기 전에 봐야 하므로 이 파일을 처음 불러올 때 한 번만 확인한다
 */
const EXISTING_USER = (() => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX) && k !== SITE_KEY) return true;
    }
  } catch {
    /* 저장이 막혀 있으면 새 사용자로 */
  }
  return false;
})();

function isSite(v: string | null): v is SiteId {
  return !!v && v in SITES;
}

/**
 * 열 때 근무지: 링크의 ?site=ydp|jamsil → 마지막에 고른 곳 →
 * 예전부터 쓰던 사람은 잠실 (지금 쓰는 사람 화면이 바뀌지 않게) → 처음 여는 사람은 영등포맥스
 */
export function loadSite(): SiteId {
  const fromLink = new URLSearchParams(location.search).get('site');
  if (isSite(fromLink)) {
    saveSite(fromLink);
    return fromLink;
  }
  try {
    const v = localStorage.getItem(SITE_KEY);
    if (isSite(v)) return v;
  } catch {
    /* 저장이 막혀 있으면 기본값 */
  }
  // 정한 근무지를 바로 저장한다 — 안 그러면 처음 온 사람도 다음엔 저장값이 생겨 "예전 사용자"(잠실)로 보인다
  const first = EXISTING_USER ? 'jamsil' : DEFAULT_SITE;
  saveSite(first);
  return first;
}

export function saveSite(id: SiteId) {
  try {
    localStorage.setItem(SITE_KEY, id);
  } catch {
    /* ignore */
  }
}

export const SiteContext = createContext<Site>(SITES[DEFAULT_SITE]);

export function useSite(): Site {
  return useContext(SiteContext);
}
