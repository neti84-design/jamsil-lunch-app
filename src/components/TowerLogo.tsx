/** 롯데월드타워 실루엣 로고 (노을 하늘 배경) */
export function TowerLogo({ size = 46 }: { size?: number }) {
  return (
    <svg className="tower-logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="tl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb36b" />
          <stop offset="0.55" stopColor="#ff7a45" />
          <stop offset="1" stopColor="#ff5a5f" />
        </linearGradient>
        <linearGradient id="tl-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#fff4ec" />
          <stop offset="1" stopColor="#ffd9c4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#tl-sky)" />
      {/* 해 */}
      <circle cx="35" cy="15" r="5" fill="#fff3b0" opacity="0.9" />
      {/* 낮은 건물들 */}
      <path d="M4 48V36h6v-4h5v16zM33 48V34h5v-3h6v17z" fill="#ffffff" opacity="0.35" />
      {/* 타워: 위로 갈수록 가늘어지는 곡선, 꼭대기는 갈라진 모양 */}
      <path d="M17 48C18.4 34 20.6 18 22.6 6.5L23.6 9.5V6l.8-2 .8 2v3.5l1-3C28.2 18 29.6 34 31 48z" fill="url(#tl-glass)" />
      <path d="M24.4 9v39" stroke="#ff8a5c" strokeWidth="0.7" opacity="0.6" />
      <path d="M20 30h8.8M19.3 38h10.3M21 22h6.6M22 14.5h4.8" stroke="#ff8a5c" strokeWidth="0.5" opacity="0.45" />
    </svg>
  );
}
