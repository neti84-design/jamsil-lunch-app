import type { SiteId } from '../lib/sites';

/** 근무지별 색: 잠실은 노을, 영등포는 초록 */
const PALETTE: Record<SiteId, { sky: [string, string, string]; glass: string; line: string; sun: string }> = {
  jamsil: { sky: ['#ffb36b', '#ff7a45', '#ff5a5f'], glass: '#ffd9c4', line: '#ff8a5c', sun: '#fff3b0' },
  ydp: { sky: ['#9be3b0', '#34b36b', '#178a48'], glass: '#c9f0d6', line: '#2e9e5e', sun: '#f4ffb0' },
};

/** 잠실: 타워 실루엣 로고 (노을 하늘) · 영등포: 영심이 그림 */
export function TowerLogo({ size = 46, site = 'jamsil' }: { size?: number; site?: SiteId }) {
  // 영등포(오늘영심)는 영심이 그림
  if (site === 'ydp') return <img className="tower-logo" src="/ydp-logo.jpg" width={size} height={size} alt="" aria-hidden />;
  const c = PALETTE[site];
  const sky = `tl-sky-${site}`;
  const glass = `tl-glass-${site}`;
  return (
    <svg className="tower-logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.sky[0]} />
          <stop offset="0.55" stopColor={c.sky[1]} />
          <stop offset="1" stopColor={c.sky[2]} />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor={c.glass} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${sky})`} />
      {/* 해 */}
      <circle cx="35" cy="15" r="5" fill={c.sun} opacity="0.9" />
      {/* 낮은 건물들 */}
      <path d="M4 48V36h6v-4h5v16zM33 48V34h5v-3h6v17z" fill="#ffffff" opacity="0.35" />
      {/* 타워: 위로 갈수록 가늘어지는 곡선, 꼭대기는 갈라진 모양 */}
      <path d="M17 48C18.4 34 20.6 18 22.6 6.5L23.6 9.5V6l.8-2 .8 2v3.5l1-3C28.2 18 29.6 34 31 48z" fill={`url(#${glass})`} />
      <path d="M24.4 9v39" stroke={c.line} strokeWidth="0.7" opacity="0.6" />
      <path d="M20 30h8.8M19.3 38h10.3M21 22h6.6M22 14.5h4.8" stroke={c.line} strokeWidth="0.5" opacity="0.45" />
    </svg>
  );
}
