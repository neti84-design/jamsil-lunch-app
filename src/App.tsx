import { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { RESTAURANTS } from './data/restaurants';
import { DEFAULT_FILTERS, FilterBar, type Filters } from './components/FilterBar';
import { RestaurantCard } from './components/RestaurantCard';
import { RestaurantDetail } from './components/RestaurantDetail';
import { MapView } from './components/MapView';
import { LiveTicker } from './components/LiveTicker';
import { useReports } from './hooks/useReports';
import { walkMinutesFrom } from './lib/geo';
import type { Restaurant } from './types';

const FAV_KEY = 'jamsil-lunch:favorites';
const FILTER_KEY = 'jamsil-lunch:filters';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (parsed && typeof parsed === 'object') return { ...fallback, ...(parsed as object) };
    return fallback;
  } catch {
    return fallback;
  }
}

function matches(r: Restaurant, walk: number | null, f: Filters, favs: Set<string>): boolean {
  if (r.priceRange[0] > f.maxPrice) return false;
  if (f.cuisines.length && !f.cuisines.includes(r.cuisine)) return false;
  if (f.concepts.length && !f.concepts.some((c) => r.concepts.includes(c))) return false;
  if (f.seating === 'group' && !r.seating.group) return false;
  if (f.seating === 'solo' && !r.seating.solo) return false;
  if (walk != null && walk > f.maxWalk) return false;
  if (f.onlyFavorites && !favs.has(r.id)) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = [r.name, r.branch ?? '', r.subcategory, r.cuisine, ...r.signature, ...r.menu.map((m) => m.name)]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(() => loadJSON(FILTER_KEY, DEFAULT_FILTERS));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadJSON<string[]>(FAV_KEY, [])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const live = useReports();

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);
  useEffect(() => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
    } catch {
      /* ignore */
    }
  }, [favorites]);

  const walkById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of RESTAURANTS) m.set(r.id, walkMinutesFrom(r.lat, r.lng, r.walkMinutes));
    return m;
  }, []);

  const results = useMemo(() => {
    const list = RESTAURANTS.filter((r) => matches(r, walkById.get(r.id) ?? null, filters, favorites));
    const walk = (r: Restaurant) => walkById.get(r.id) ?? 99;
    list.sort((a, b) => {
      if (filters.sort === 'walk') return walk(a) - walk(b);
      if (filters.sort === 'price') return a.priceRange[0] - b.priceRange[0];
      const rt = (r: Restaurant) =>
        live.summaries.get(r.id)?.avgRating ?? r.reviews.naverRating ?? r.reviews.diningcodeRating ?? 0;
      return rt(b) - rt(a);
    });
    return list;
  }, [filters, favorites, walkById, live.summaries]);

  const selected = RESTAURANTS.find((r) => r.id === selectedId) ?? null;

  const toggleFav = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickRandom = () => {
    if (!results.length) return;
    const r = results[Math.floor(Math.random() * results.length)];
    setSelectedId(r.id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🍱</span>
          <div>
            <h1>잠실점심</h1>
            <p className="tagline">구내식당 공사 기간, 잠실역 도보 20분 안에서 인당 1.2만원으로 해결</p>
          </div>
        </div>
        <button className="btn primary" onClick={pickRandom} disabled={!results.length}>
          🎲 오늘 뭐 먹지?
        </button>
      </header>

      <FilterBar filters={filters} onChange={setFilters} resultCount={results.length} />

      <div className="mobile-tabs">
        <button className={mobileTab === 'list' ? 'on' : ''} onClick={() => setMobileTab('list')}>
          목록
        </button>
        <button className={mobileTab === 'map' ? 'on' : ''} onClick={() => setMobileTab('map')}>
          지도
        </button>
      </div>

      <main className={'layout tab-' + mobileTab}>
        <section className="list" aria-label="식당 목록">
          <LiveTicker reports={live.reports} restaurants={RESTAURANTS} now={live.now} mode={live.mode} onSelect={setSelectedId} />
          {results.length === 0 && (
            <div className="empty">
              조건에 맞는 식당이 없어요.
              <br />
              예산이나 도보 거리를 늘려보세요.
            </div>
          )}
          {results.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              walk={walkById.get(r.id) ?? null}
              selected={r.id === selectedId}
              favorite={favorites.has(r.id)}
              budget={filters.maxPrice}
              summary={live.summaries.get(r.id)}
              now={live.now}
              onSelect={() => setSelectedId(r.id)}
              onToggleFavorite={() => toggleFav(r.id)}
            />
          ))}
        </section>
        <section className="map-wrap" aria-label="지도">
          <MapView restaurants={results} selectedId={selectedId} onSelect={setSelectedId} maxWalk={filters.maxWalk} />
        </section>
      </main>

      {selected && (
        <>
          <div className="backdrop" onClick={() => setSelectedId(null)} />
          <RestaurantDetail
            r={selected}
            walk={walkById.get(selected.id) ?? null}
            favorite={favorites.has(selected.id)}
            budget={filters.maxPrice}
            reports={live.reports}
            reportMode={live.mode}
            reportLocalReason={live.localReason}
            now={live.now}
            onAddReport={live.add}
            onClose={() => setSelectedId(null)}
            onToggleFavorite={() => toggleFav(selected.id)}
          />
        </>
      )}

      <footer className="foot small">
        데이터는 블로그·지도 후기 기반 수집본입니다. 가격·영업시간은 방문 전 확인하세요. ·{' '}
        <a href="https://github.com/neti84-design/jamsil-lunch-app" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
