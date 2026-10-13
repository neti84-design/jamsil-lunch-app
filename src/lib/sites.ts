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
  /** 큰길을 건너야 하는 곳인지 (+3분). 없으면 직선거리만 */
  crossesRoad?: (lat: number, lng: number) => boolean;
}

export const SITES: Record<SiteId, Site> = {
  jamsil: {
    id: 'jamsil',
    label: '잠실본사',
    office: { lat: 37.5141, lng: 127.1017, popup: '출발: 본사 (롯데캐슬골드 · 8번 출구)' },
    station: { lat: 37.5133, lng: 127.1001, popup: '잠실역 (2·8호선)' },
    walkFrom: '본사에서',
    brand: { accent: '잠심', sub: '잠실점심', tagline: '구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!' },
    color: '#ff6b35',
    themeColor: '#f64610',
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
  },
};

/** 처음 여는 사람은 영등포맥스 기준 */
export const DEFAULT_SITE: SiteId = 'ydp';

const SITE_KEY = 'jamsil-lunch:site';

export function loadSite(): SiteId {
  try {
    const v = localStorage.getItem(SITE_KEY);
    if (v && v in SITES) return v as SiteId;
  } catch {
    /* 저장이 막혀 있으면 기본값 */
  }
  return DEFAULT_SITE;
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
