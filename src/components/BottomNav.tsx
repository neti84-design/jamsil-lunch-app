export type Tab = 'home' | 'search' | 'map' | 'today' | 'favorites';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'home', icon: '🏠', label: '홈' },
  { key: 'search', icon: '🔍', label: '검색' },
  { key: 'map', icon: '🗺️', label: '지도' },
  { key: 'today', icon: '☀️', label: '오늘의 추천' },
  { key: 'favorites', icon: '⭐', label: '관심매장' },
];

/** PC 화면 위쪽 메뉴: 검색은 지도 화면 오른쪽 조건에 합쳐져 있다 */
const WIDE_TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'map', icon: '🗺️', label: '지도로 찾기' },
  { key: 'today', icon: '☀️', label: '오늘의 추천' },
  { key: 'favorites', icon: '⭐', label: '관심매장' },
  { key: 'home', icon: '🏠', label: '홈·소식' },
];

interface Props {
  tab: Tab;
  favCount: number;
  onChange: (t: Tab) => void;
  /** 'top' = PC 화면 위쪽 메뉴 */
  variant?: 'bottom' | 'top';
}

export function BottomNav({ tab, favCount, onChange, variant = 'bottom' }: Props) {
  const top = variant === 'top';
  // PC 에서는 검색 탭도 지도 화면이다
  const cur = top && tab === 'search' ? 'map' : tab;
  return (
    <nav className={top ? 'top-nav' : 'bottom-nav'} aria-label="메뉴">
      {(top ? WIDE_TABS : TABS).map((t) => (
        <button
          key={t.key}
          className={cur === t.key ? 'on' : ''}
          aria-current={cur === t.key ? 'page' : undefined}
          onClick={() => onChange(t.key)}
        >
          <span className="nav-icon" aria-hidden>
            {t.icon}
            {t.key === 'favorites' && favCount > 0 && <span className="nav-count">{favCount}</span>}
          </span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
