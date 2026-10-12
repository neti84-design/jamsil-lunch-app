export type Tab = 'home' | 'search' | 'map' | 'favorites' | 'recommend';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'home', icon: '🏠', label: '홈' },
  { key: 'search', icon: '🔍', label: '검색' },
  { key: 'map', icon: '🗺️', label: '지도' },
  { key: 'favorites', icon: '⭐', label: '관심매장' },
  { key: 'recommend', icon: '👍', label: '추천매장' },
];

interface Props {
  tab: Tab;
  favCount: number;
  onChange: (t: Tab) => void;
}

export function BottomNav({ tab, favCount, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="메뉴">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={tab === t.key ? 'on' : ''}
          aria-current={tab === t.key ? 'page' : undefined}
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
