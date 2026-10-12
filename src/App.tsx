import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { RESTAURANTS } from './data/restaurants';
import { DEFAULT_FILTERS, FilterBar, type Filters } from './components/FilterBar';
import { RestaurantCard } from './components/RestaurantCard';
import { RestaurantDetail } from './components/RestaurantDetail';
import { AdminPanel } from './components/AdminPanel';
import { MapView } from './components/MapView';
import { LiveTicker } from './components/LiveTicker';
import { SearchBox } from './components/SearchBox';
import { BottomNav, type Tab } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { useReports } from './hooks/useReports';
import { walkMinutesFrom } from './lib/geo';
import { dishTags, type DishTag } from './lib/dish';
import { bigBuildings, buildingOf } from './lib/buildings';
import { maybeOpen } from './lib/hours';
import type { ReportSummary } from './lib/reports';
import type { Restaurant } from './types';

const FAV_KEY = 'jamsil-lunch:favorites';
const FILTER_KEY = 'jamsil-lunch:filters-v3';
const RECENT_KEY = 'jamsil-lunch:recent';
const SEARCH_KEY = 'jamsil-lunch:searches';
const MAX_RECENT = 10;
const MAX_SEARCHES = 10;

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
  if (f.building && buildingOf(r) !== f.building) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = [r.name, r.branch ?? '', buildingOf(r) ?? '', r.subcategory, r.cuisine, ...r.signature, ...r.menu.map((m) => m.name), ...dishTags(r)]
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

/** 추천매장 점수: 다른 사람들의 관심 저장 + 숨은/역시맛집 체크 + 별점 */
function recommendScore(x?: ReportSummary): number {
  return x ? x.favs * 3 + (x.hidden + x.classic) * 2 + x.totalStars : 0;
}

function saveJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(() => loadJSON(FILTER_KEY, DEFAULT_FILTERS));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadJSON<string[]>(FAV_KEY, [])));
  const [recentIds, setRecentIds] = useState<string[]>(() => loadJSON<string[]>(RECENT_KEY, []));
  const [searches, setSearches] = useState<string[]>(() => loadJSON<string[]>(SEARCH_KEY, []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const mainRef = useRef<HTMLElement>(null);
  const lastScroll = useRef(0);
  const live = useReports();

  useEffect(() => saveJSON(FILTER_KEY, filters), [filters]);
  useEffect(() => saveJSON(FAV_KEY, [...favorites]), [favorites]);
  useEffect(() => saveJSON(RECENT_KEY, recentIds), [recentIds]);
  useEffect(() => saveJSON(SEARCH_KEY, searches), [searches]);

  const walkById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of RESTAURANTS) m.set(r.id, walkMinutesFrom(r.lat, r.lng, r.walkMinutes));
    return m;
  }, []);
  const byId = useMemo(() => new Map(RESTAURANTS.map((r) => [r.id, r])), []);
  const buildings = useMemo(() => bigBuildings(RESTAURANTS), []);

  const results = useMemo(() => {
    const list = RESTAURANTS.filter((r) => matches(r, walkById.get(r.id) ?? null, filters, live.now));
    const walkOf = (r: Restaurant) => walkById.get(r.id) ?? 99;
    list.sort((a, b) => {
      if (filters.sort === 'walk') return walkOf(a) - walkOf(b);
      if (filters.sort === 'price') return a.priceRange[0] - b.priceRange[0];
      if (filters.sort === 'rating') {
        const rt = (r: Restaurant) => live.summaries.get(r.id)?.avgRating ?? externalRating(r);
        return rt(b) - rt(a) || compareStars(a, b, live.summaries);
      }
      return compareStars(a, b, live.summaries) || walkOf(a) - walkOf(b);
    });
    return list;
  }, [filters, walkById, live.summaries, live.now]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const favoriteList = useMemo(() => RESTAURANTS.filter((r) => favorites.has(r.id)), [favorites]);
  const recentList = useMemo(() => recentIds.map((id) => byId.get(id)).filter((r): r is Restaurant => !!r), [recentIds, byId]);
  const nearbyOpen = useMemo(
    () =>
      RESTAURANTS.filter((r) => maybeOpen(r, live.now) && walkById.get(r.id) != null)
        .sort((a, b) => walkById.get(a.id)! - walkById.get(b.id)!)
        .slice(0, 5),
    [live.now, walkById],
  );
  const recommended = useMemo(
    () =>
      RESTAURANTS.filter((r) => {
        const s = live.summaries.get(r.id);
        // 내 관심 저장만 있는 곳은 "다른 사람" 추천이 아니므로 뺀다
        return recommendScore(s) - (s?.myTags.fav ? 3 : 0) > 0;
      }).sort((a, b) => recommendScore(live.summaries.get(b.id)) - recommendScore(live.summaries.get(a.id))),
    [live.summaries],
  );
  const topRated = useMemo(
    () => [...RESTAURANTS].filter((r) => externalRating(r) > 0).sort((a, b) => externalRating(b) - externalRating(a)).slice(0, 10),
    [],
  );

  const open = (id: string | null) => {
    setSelectedId(id);
    if (id) setRecentIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT));
  };

  // 관심 저장을 공유 저장소에도 남겨 "추천매장" 집계에 쓴다 (실패해도 내 관심 목록은 그대로)
  const publishFav = (id: string, on: boolean) => {
    const mine = live.summaries.get(id)?.myTags.fav;
    if (on && !mine) live.add({ restaurantId: id, kind: 'tag', tag: 'fav' }).catch((e) => console.warn('[jamsil-lunch] 관심 공유 실패:', e));
    if (!on && mine) live.remove(mine).catch((e) => console.warn('[jamsil-lunch] 관심 공유 해제 실패:', e));
  };

  // 예전에 저장한 관심 매장도 한 번 공유
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || live.status !== 'ready') return;
    synced.current = true;
    for (const id of favorites) if (!live.summaries.get(id)?.myTags.fav) publishFav(id, true);
    // 불러오기가 끝난 순간 한 번만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.status]);

  const toggleFav = (id: string) => {
    const on = !favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    publishFav(id, on);
  };

  const goTab = (t: Tab) => {
    if (t === tab) mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    else mainRef.current?.scrollTo({ top: 0 });
    setTab(t);
  };

  /** 제목을 누르면 처음 화면으로 */
  const goHome = () => {
    setSelectedId(null);
    setAdminOpen(false);
    setFiltersOpen(false);
    setFilters(DEFAULT_FILTERS);
    goTab('home');
  };

  const searchWith = (patch: Partial<Filters>) => {
    setFilters({ ...DEFAULT_FILTERS, ...patch });
    setFiltersOpen(false);
    goTab('search');
  };

  const submitSearch = (q: string) => {
    const t = q.trim();
    if (t) setSearches((prev) => [t, ...prev.filter((x) => x !== t)].slice(0, MAX_SEARCHES));
    if (tab !== 'search') goTab('search');
    else mainRef.current?.scrollTo({ top: 0 });
    setFiltersOpen(false);
  };

  /** 목록을 손가락으로 밀어 올리면(아래로 스크롤) 펼쳐 둔 세부조건을 접는다 */
  const onMainScroll = (e: UIEvent<HTMLElement>) => {
    const top = e.currentTarget.scrollTop;
    if (filtersOpen && top - lastScroll.current > 8) setFiltersOpen(false);
    lastScroll.current = top;
  };

  const searchBox = (
    <SearchBox
      value={filters.query}
      onChange={(q) => setFilters((f) => ({ ...f, query: q }))}
      onSubmit={submitSearch}
      history={searches}
      onRemoveHistory={(q) => setSearches((prev) => prev.filter((x) => x !== q))}
      onClearHistory={() => setSearches([])}
    />
  );

  const card = (r: Restaurant) => (
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
  );

  const ticker = <LiveTicker reports={live.reports} restaurants={RESTAURANTS} now={live.now} mode={live.mode} onSelect={open} />;

  const filterBar = (
    <FilterBar
      filters={filters}
      onChange={setFilters}
      resultCount={results.length}
      totalCount={RESTAURANTS.length}
      buildings={buildings}
      searchBox={searchBox}
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
    />
  );

  return (
    <div className="app">
      {tab === 'home' && (
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
            <span className="brand-text">
              <h1>
                오늘잠심<span className="brand-sub">잠실점심</span>
              </h1>
              <span className="tagline">구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!</span>
            </span>
          </a>
        </header>
      )}
      {tab === 'search' && filterBar}
      {tab === 'map' && filterBar}
      {tab === 'favorites' && (
        <header className="page-head">
          <h2>⭐ 나의 관심매장</h2>
          <span className="small">{favoriteList.length}곳 · 카드의 ☆ 를 누르면 여기에 모여요</span>
        </header>
      )}
      {tab === 'recommend' && (
        <header className="page-head">
          <h2>👍 추천매장</h2>
          <span className="small">다른 사람들이 관심 저장·맛집 체크·별점을 남긴 곳</span>
        </header>
      )}

      <main ref={mainRef} className={'main tab-' + tab} onScroll={onMainScroll}>
        {tab === 'home' && (
          <HomeView
            searchBox={searchBox}
            ticker={ticker}
            nearby={nearbyOpen.map(card)}
            restaurants={RESTAURANTS}
            recent={recentList}
            buildings={buildings}
            walkById={walkById}
            now={live.now}
            onDish={(d: DishTag) => searchWith({ dishes: [d] })}
            onBuilding={(b) => searchWith({ building: b })}
            onSelect={open}
            onSeeAll={() => searchWith({ sort: 'walk', openNow: true })}
          />
        )}

        {tab === 'search' && (
          <div className="card-list">
            {results.length === 0 ? (
              <div className="empty">
                조건에 맞는 식당이 없어요.
                <br />
                검색어나 세부조건을 바꿔보세요.
              </div>
            ) : (
              results.map(card)
            )}
          </div>
        )}

        {tab === 'map' && (
          <div className="map-wrap">
            <MapView restaurants={results} selectedId={selectedId} onSelect={open} maxWalk={filters.maxWalk} />
          </div>
        )}

        {tab === 'favorites' && (
          <div className="card-list">
            {favoriteList.length === 0 ? (
              <div className="empty">
                아직 저장한 곳이 없어요.
                <br />
                마음에 드는 식당 카드의 ☆ 를 눌러보세요.
              </div>
            ) : (
              favoriteList.map(card)
            )}
          </div>
        )}

        {tab === 'recommend' && (
          <div className="card-list">
            {recommended.length === 0 ? (
              <>
                <div className="empty small">
                  아직 다른 사람의 추천이 없어요.
                  <br />
                  관심 저장(☆)·숨은맛집/역시맛집 체크·별점이 모이면 여기에 떠요.
                </div>
                <h3 className="section-title">대신, 평점 높은 곳</h3>
                {topRated.map(card)}
              </>
            ) : (
              recommended.map((r) => {
                const s = live.summaries.get(r.id)!;
                const others = s.favs - (s.myTags.fav ? 1 : 0);
                return (
                  <div key={r.id} className="recommend-item">
                    <div className="recommend-why small">
                      {others > 0 && <span>⭐ 관심 {others}명</span>}
                      {s.hidden > 0 && <span>🤫 숨은맛집 {s.hidden}</span>}
                      {s.classic > 0 && <span>👍 역시맛집 {s.classic}</span>}
                      {s.reviewCount > 0 && <span>★ {s.avgRating!.toFixed(1)} ({s.reviewCount})</span>}
                    </div>
                    {card(r)}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab !== 'map' && (
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
        )}
      </main>

      <BottomNav tab={tab} favCount={favorites.size} onChange={goTab} />

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
            onAddReport={live.add}
            onRemoveReport={live.remove}
            onClose={() => setSelectedId(null)}
            onToggleFavorite={() => toggleFav(selected.id)}
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
