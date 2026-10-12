import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { RESTAURANTS } from './data/restaurants';
import { DEFAULT_FILTERS, FilterBar, describeFilters, type Filters } from './components/FilterBar';
import { RestaurantCard } from './components/RestaurantCard';
import { RestaurantDetail } from './components/RestaurantDetail';
import { AdminPanel } from './components/AdminPanel';
import { MapView } from './components/MapView';
import { LiveTicker } from './components/LiveTicker';
import { FavoritesPanel } from './components/FavoritesPanel';
import { useReports } from './hooks/useReports';
import { walkMinutesFrom } from './lib/geo';
import { dishTags } from './lib/dish';
import { maybeOpen } from './lib/hours';
import type { ReportSummary } from './lib/reports';
import type { Restaurant } from './types';

const FAV_KEY = 'jamsil-lunch:favorites';
const FILTER_KEY = 'jamsil-lunch:filters-v3';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (parsed && typeof parsed === 'object') {
      // 저장본에 예전 버전의 키가 섞여 있어도 지금 쓰는 키만 가져온다
      const out = { ...fallback } as Record<string, unknown>;
      for (const k of Object.keys(out)) if (k in parsed) out[k] = (parsed as Record<string, unknown>)[k];
      return out as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function matches(r: Restaurant, walk: number | null, f: Filters, now: number): boolean {
  if (r.priceRange[0] > f.maxPrice) return false;
  if (f.cuisines.length && !f.cuisines.includes(r.cuisine)) return false;
  if (f.dishes.length) {
    const tags = dishTags(r);
    if (!f.dishes.some((d) => tags.includes(d))) return false;
  }
  if (f.concepts.length && !f.concepts.some((c) => r.concepts.includes(c))) return false;
  if (f.seating === 'solo' && !r.seating.solo) return false;
  if (f.seating === 'room' && !r.seating.room) return false;
  if (f.seating === 'group') {
    if (!r.seating.group) return false;
    // 인원 정보가 없는 곳은 "가능" 쪽으로 보여주되, 숫자가 있으면 그 이하만
    if (r.seating.groupSize != null && r.seating.groupSize < f.groupSize) return false;
  }
  if (walk != null && walk > f.maxWalk) return false;
  if (f.openNow && !maybeOpen(r, now)) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = [r.name, r.branch ?? '', r.subcategory, r.cuisine, ...r.signature, ...r.menu.map((m) => m.name), ...dishTags(r)]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function externalRating(r: Restaurant): number {
  return r.reviews.naverRating ?? r.reviews.diningcodeRating ?? r.reviews.kakaoRating ?? 0;
}

/** "별점 많은 순": 팀 별점 합계 → 맛집 체크 수 → 평균 → 외부 평점 */
function compareStars(a: Restaurant, b: Restaurant, s: Map<string, ReportSummary>): number {
  const sa = s.get(a.id);
  const sb = s.get(b.id);
  const score = (x?: ReportSummary) => (x ? x.totalStars + (x.hidden + x.classic) * 2 : 0);
  const d = score(sb) - score(sa);
  if (d) return d;
  const avg = (sb?.avgRating ?? 0) - (sa?.avgRating ?? 0);
  if (avg) return avg;
  return externalRating(b) - externalRating(a);
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(() => loadJSON(FILTER_KEY, DEFAULT_FILTERS));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadJSON<string[]>(FAV_KEY, [])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const listRef = useRef<HTMLElement>(null);
  const lastScroll = useRef(0);
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
    const list = RESTAURANTS.filter((r) => matches(r, walkById.get(r.id) ?? null, filters, live.now));
    const walk = (r: Restaurant) => walkById.get(r.id) ?? 99;
    list.sort((a, b) => {
      if (filters.sort === 'walk') return walk(a) - walk(b);
      if (filters.sort === 'price') return a.priceRange[0] - b.priceRange[0];
      if (filters.sort === 'rating') {
        const rt = (r: Restaurant) => live.summaries.get(r.id)?.avgRating ?? externalRating(r);
        return rt(b) - rt(a) || compareStars(a, b, live.summaries);
      }
      return compareStars(a, b, live.summaries) || walk(a) - walk(b);
    });
    return list;
  }, [filters, walkById, live.summaries, live.now]);

  const selected = RESTAURANTS.find((r) => r.id === selectedId) ?? null;

  const open = (id: string | null) => {
    setPickNote(null);
    setSelectedId(id);
  };

  const toggleFav = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const favoriteList = useMemo(() => RESTAURANTS.filter((r) => favorites.has(r.id)), [favorites]);

  const pickRandom = () => {
    if (!results.length) return;
    // 지금 문 닫은 곳(영업 종료·휴무·브레이크)은 빼고 뽑는다. 다 닫았으면 전체에서.
    const openNow = results.filter((r) => maybeOpen(r, live.now));
    const pool = openNow.length ? openNow : results;
    const r = pool[Math.floor(Math.random() * pool.length)];
    const closedOut = results.length - pool.length;
    setPickNote(
      `지금 조건(${describeFilters(filters)})에 맞는 ${results.length}곳` +
        (closedOut ? ` 중 지금 문 닫은 ${closedOut}곳을 뺀 ${pool.length}곳` : '') +
        `에서 무작위로 뽑았어요. 조건을 바꾸면 후보도 달라져요.`,
    );
    setSelectedId(r.id);
  };

  /** 제목을 누르면 처음 화면으로 */
  const goHome = () => {
    setSelectedId(null);
    setPickNote(null);
    setFavOpen(false);
    setAdminOpen(false);
    setFiltersOpen(false);
    setFilters(DEFAULT_FILTERS);
    setMobileTab('list');
    listRef.current?.scrollTo({ top: 0 });
  };

  /** 목록을 손가락으로 밀어 올리면(아래로 스크롤) 펼쳐 둔 상세 조건을 접는다 */
  const onListScroll = (e: UIEvent<HTMLElement>) => {
    const top = e.currentTarget.scrollTop;
    if (filtersOpen && top - lastScroll.current > 8) setFiltersOpen(false);
    lastScroll.current = top;
  };

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          title="처음 화면으로"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          <span className="logo">🍱</span>
          <span className="brand-text">
            <h1>
              오늘잠심<span className="brand-sub">잠실점심</span>
            </h1>
            <span className="tagline">구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!</span>
          </span>
        </a>
        <div className="top-actions">
          <button className="btn fav-btn" onClick={() => setFavOpen(true)} aria-label={`관심 저장 ${favorites.size}곳`}>
            ⭐<span className="count">{favorites.size}</span>
          </button>
          <button
            className="btn primary"
            onClick={pickRandom}
            disabled={!results.length}
            title={`현재 조건에 맞는 ${results.length}곳 중 지금 영업 중인 곳에서 무작위`}
          >
            🎲 오늘 뭐 먹지?
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={results.length}
        totalCount={RESTAURANTS.length}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />

      <div className="mobile-tabs">
        <button className={mobileTab === 'list' ? 'on' : ''} onClick={() => setMobileTab('list')}>
          목록
        </button>
        <button className={mobileTab === 'map' ? 'on' : ''} onClick={() => setMobileTab('map')}>
          지도
        </button>
      </div>

      <main className={'layout tab-' + mobileTab}>
        <section className="list" aria-label="식당 목록" ref={listRef} onScroll={onListScroll}>
          <LiveTicker reports={live.reports} restaurants={RESTAURANTS} now={live.now} mode={live.mode} onSelect={open} />
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
              onSelect={() => open(r.id)}
              onToggleFavorite={() => toggleFav(r.id)}
            />
          ))}
          <footer className="foot small">
            데이터는 블로그·지도 후기 기반 수집본입니다. 가격·영업시간은 방문 전 확인하세요. ·{' '}
            <a href="https://github.com/neti84-design/jamsil-lunch-app" target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            ·{' '}
            <button className="link" onClick={() => setAdminOpen(true)}>
              {live.isAdmin ? '관리자 모드' : '관리자'}
            </button>
          </footer>
        </section>
        <section className="map-wrap" aria-label="지도">
          <MapView restaurants={results} selectedId={selectedId} onSelect={open} maxWalk={filters.maxWalk} />
        </section>
      </main>

      {selected && (
        <>
          <div className="backdrop" onClick={() => open(null)} />
          <RestaurantDetail
            r={selected}
            walk={walkById.get(selected.id) ?? null}
            favorite={favorites.has(selected.id)}
            budget={filters.maxPrice}
            reports={live.reports}
            summary={live.summaries.get(selected.id)}
            reportMode={live.mode}
            reportLocalReason={live.localReason}
            now={live.now}
            isAdmin={live.isAdmin}
            pickNote={pickNote}
            onAddReport={live.add}
            onRemoveReport={live.remove}
            onClose={() => open(null)}
            onToggleFavorite={() => toggleFav(selected.id)}
          />
        </>
      )}

      {favOpen && (
        <>
          <div className="backdrop" onClick={() => setFavOpen(false)} />
          <FavoritesPanel
            restaurants={favoriteList}
            walkById={walkById}
            budget={filters.maxPrice}
            summaries={live.summaries}
            now={live.now}
            onSelect={(id) => {
              setFavOpen(false);
              open(id);
            }}
            onToggleFavorite={toggleFav}
            onClose={() => setFavOpen(false)}
          />
        </>
      )}

      {adminOpen && (
        <>
          <div className="backdrop" onClick={() => setAdminOpen(false)} />
          <AdminPanel
            reports={live.reports}
            restaurants={RESTAURANTS}
            now={live.now}
            isAdmin={live.isAdmin}
            onLogin={live.loginAdmin}
            onLogout={live.logoutAdmin}
            onRemove={live.remove}
            onClose={() => setAdminOpen(false)}
          />
        </>
      )}
    </div>
  );
}
