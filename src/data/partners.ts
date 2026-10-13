import type { SiteId } from '../lib/sites';

/** 롯데 임직원 혜택을 주기로 한 매장 — 홈 아래 '요즘 관심 · 평점 좋은 매장' 맨 위에 고정된다 */
export interface Partner {
  site: SiteId;
  /** 앱 안 식당 id (식당 상세 주소창의 ?r= 값) */
  id: string;
  /** 카드 위에 한 줄 (추천 문구) */
  pitch: string;
  /** 카드 밑에 혜택 내용 */
  benefit: string;
  /** 이 날까지 보여 준다 (한국 날짜 "2026-11-30"). 없으면 계속 */
  until?: string;
}

/*
 * 예)
 * {
 *   site: 'jamsil',
 *   id: '조박사-토종순대국-잠실-장미상가점',
 *   pitch: '사장님이 롯데 식구들 위해 준비했어요',
 *   benefit: '5인 이상 정식 주문 시 10% 할인 · 사원증 보여 주세요',
 *   until: '2026-11-30',
 * },
 */
export const PARTNERS: Partner[] = [];
