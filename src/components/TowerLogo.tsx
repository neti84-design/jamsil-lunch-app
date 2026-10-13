import type { SiteId } from '../lib/sites';

/** 근무지별 로고 그림: 잠실은 잠심이(지도 핀 요리사)와 뒤로 보이는 월드타워, 영등포는 영심이 */
const LOGO_SRC: Record<SiteId, string> = {
  jamsil: '/jamsil-logo.webp',
  ydp: '/ydp-logo.jpg',
};

export function TowerLogo({ size = 46, site = 'jamsil' }: { size?: number; site?: SiteId }) {
  return <img className="tower-logo" src={LOGO_SRC[site]} width={size} height={size} alt="" aria-hidden />;
}
