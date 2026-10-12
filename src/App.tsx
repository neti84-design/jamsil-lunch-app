import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { RESTAURANTS } from './data';
import { ALL_WALK, DEFAULT_FILTERS, FilterBar, NO_LIMIT, type Filters } from './components/FilterBar';
import { RestaurantCard } from './components/RestaurantCard';
import { RestaurantDetail } from './components/RestaurantDetail';
import { AdminPanel } from './components/AdminPanel';
import { MapView } from './components/MapView';
import { LiveTicker } from './components/LiveTicker';
import { SearchBox } from './components/SearchBox';
import { BottomNav, type Tab } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { TowerLogo } from './components/TowerLogo';
import { MapSheet } from './components/MapSheet';
import { ShareTalk } from './components/ShareTalk';
import { TodayPick } from './components/TodayPick';
import { VoteHome } from './components/VoteHome';
import { VotePanel, type VoteView } from './components/VotePanel';
import { useReports } from './hooks/useReports';
import { useTalk } from './hooks/useTalk';
import { useVotes } from './hooks/useVotes';
import { fetchLunchWeather, type LunchWeather } from './lib/weather';
import { dayTheme, pickForToday } from './lib/recommend';
import { walkMinutesFrom } from './lib/geo';
import { dishTags, type DishTag } from './lib/dish';
import { bigBuildings, buildingOf, insideMinutes } from './lib/buildings';
import { maybeOpen } from './lib/hours';
import { makeNameMatcher, makeQueryMatcher } from './lib/search';
import type { ReportSummary } from './lib/reports';
import { SEATING_LABELS, hasDelivery, type Restaurant } from './types';

const FAV_KEY = 'jamsil-lunch:favorites';
// 기본값(1.2만원·도보 10분)이 바뀌어 저장 키도 새로 — 예전 저장본은 버린다
const FILTER_KEY = 'jamsil-lunch:filters-v4';
const RECENT_KEY = 'jamsil-lunch:recent';
const SEARCH_KEY = 'jamsil-lunch:searches';
const VOTE_DRAFT_KEY = 'jamsil-lunch:vote-draft';
/** 오늘의 추천을 "이 중에서 투표"로 담을 때 몇 곳까지 */
const VOTE_FROM_PICKS = 4;
const MAX_RECENT = 10;
const MAX_SEARCHES = 10;
/** 검색 목록은 한 번에 이만큼씩 그린다 (식당이 1,000곳이 넘어서) */
const PAGE_SIZE = 40;

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

function matches(
  r: Restaurant,
  walk: number | null,
  f: Filters,
  now: number,
  queryOk: (r: Restaurant) => boolean,
  summary: ReportSummary | undefined,
): boolean {
  // 가격 미확인 가게는 예산을 고르면 숨긴다
  if (r.priceRange ? r.priceRange[0] > f.maxPrice : f.maxPrice < NO_LIMIT) return false;
  if (f.cuisines.length && !f.cuisines.includes(r.cuisine)) return false;
  if (f.dishes.length) {
    const tags = dishTags(r);
    if (!f.dishes.some((d) => tags.includes(d))) return false;
  }
  if (f.concepts.length && !f.concepts.some((c) => r.concepts.includes(c))) return false;
  if (f.delivery && !hasDelivery(r, summary?.delivery)) return false;
  if (f.seating === 'room' && !r.seating.room) return false;
  if (f.seating === 'group') {
    if (!r.seating.group) return false;
    // 인원 정보가 없는 곳은 "가능" 쪽으로 보여주되, 숫자가 있으면 그 이하만
    if (r.seating.groupSize != null && r.seating.groupSize < f.groupSize) return false;
  }
  if (walk != null && walk > f.maxWalk) return false;
  if (f.openNow && !maybeOpen(r, now)) return false;
  if (f.building && buildingOf(r) !== f.building) return false;
  if (!queryOk(r)) return false;
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

/** 동료 추천매장 점수: 다른 사람들의 관심 저장 + 숨은/역시맛집 체크 + 별점 */
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

/** history.state 에 넣는 화면 정보 */
interface NavState {
  tab: Tab;
  depth: number;
  /** 열려 있는 식당 상세 */
  detail?: string;
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(() => {
    const f = loadJSON(FILTER_KEY, DEFAULT_FILTERS);
    // 예전 버전에 있던 '혼밥' 좌석 조건 등 지금 없는 값은 버린다
    return f.seating && !(f.seating in SEATING_LABELS) ? { ...f, seating: null } : f;
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadJSON<string[]>(FAV_KEY, [])));
  const [recentIds, setRecentIds] = useState<string[]>(() => loadJSON<string[]>(RECENT_KEY, []));
  const [searches, setSearches] = useState<string[]>(() => loadJSON<string[]>(SEARCH_KEY, []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  /** 홈에서 몇 단계 들어왔는지 (0 이면 뒤로가기 버튼 없음) */
  const [depth, setDepth] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  /** 탭별 스크롤 위치 — 뒤로 돌아오면 보던 위치로 */
  const scrollByTab = useRef(new Map<Tab, number>());
  const nextScroll = useRef(0);
  const lastScroll = useRef(0);
  const live = useReports();
  const talk = useTalk(live.adminToken);
  /** 지도에서 누른 식당 (아래 패널로 보여줌, 새 창으로 열지 않음) */
  const [mapSelId, setMapSelId] = useState<string | null>(null);
  /** 관심매장 탭: 나의 관심매장 / 동료 추천매장 */
  const [favView, setFavView] = useState<'mine' | 'peers'>('mine');
  /** 점심 투표 화면. 공유 링크(?vote=…)로 들어오면 바로 그 투표를 연다 */
  const [voteView, setVoteView] = useState<VoteView | null>(() => {
    const id = new URLSearchParams(location.search).get('vote');
    return id ? { mode: 'poll', id } : null;
  });
  const [voteDraft, setVoteDraft] = useState<string[]>(() => loadJSON<string[]>(VOTE_DRAFT_KEY, []));
  const votes = useVotes(voteView?.mode === 'poll' ? voteView.id : null);
  const [weather, setWeather] = useState<LunchWeather | null>(null);

  useEffect(() => saveJSON(FILTER_KEY, filters), [filters]);
  useEffect(() => saveJSON(FAV_KEY, [...favorites]), [favorites]);
  useEffect(() => saveJSON(RECENT_KEY, recentIds), [recentIds]);
  useEffect(() => saveJSON(SEARCH_KEY, searches), [searches]);
  useEffect(() => saveJSON(VOTE_DRAFT_KEY, voteDraft), [voteDraft]);

  // 링크로 받은 투표는 내 목록에 남기고, 주소창의 ?vote= 는 지운다
  const { remember: rememberPoll } = votes;
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('vote');
    if (!id) return;
    rememberPoll(id);
    history.replaceState(history.state, '', location.pathname);
  }, [rememberPoll]);

  // 점심때 날씨 (실패하면 요일 추천만)
  useEffect(() => {
    const ac = new AbortController();
    fetchLunchWeather(ac.signal)
      .then(setWeather)
      .catch((e: unknown) => {
        if (!ac.signal.aborted) console.warn('[jamsil-lunch] 날씨 불러오기 실패:', e);
      });
    return () => ac.abort();
  }, []);

  const walkById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of RESTAURANTS) m.set(r.id, walkMinutesFrom(r.lat, r.lng, r.walkMinutes, insideMinutes(r)));
    return m;
  }, []);
  const byId = useMemo(() => new Map(RESTAURANTS.map((r) => [r.id, r])), []);
  const buildings = useMemo(() => bigBuildings(RESTAURANTS), []);

  /** 조건에 맞는 식당을 정렬해서. 지도는 도보 조건으로 mapMaxWalk 를 쓴다 */
  const run = (f: Filters) => {
    const queryOk = makeQueryMatcher(f.query, RESTAURANTS);
    const list = RESTAURANTS.filter((r) => matches(r, walkById.get(r.id) ?? null, f, live.now, queryOk, live.summaries.get(r.id)));
    const walkOf = (r: Restaurant) => walkById.get(r.id) ?? 99;
    const nameHit = makeNameMatcher(f.query);
    list.sort((a, b) => {
      // 이름으로 찾은 가게가 메뉴·종류로 걸린 가게보다 먼저
      const byName = Number(nameHit(b)) - Number(nameHit(a));
      if (byName) return byName;
      if (f.sort === 'walk') return walkOf(a) - walkOf(b);
      if (f.sort === 'price') return (a.priceRange?.[0] ?? Infinity) - (b.priceRange?.[0] ?? Infinity) || walkOf(a) - walkOf(b);
      if (f.sort === 'rating') {
        const rt = (r: Restaurant) => live.summaries.get(r.id)?.avgRating ?? externalRating(r);
        return rt(b) - rt(a) || compareStars(a, b, live.summaries);
      }
      // 별점이 같으면 직접 정리한 곳(가격·메뉴 정보 있음)을 카카오에서 가져온 곳보다 먼저
      return compareStars(a, b, live.summaries) || Number(!!a.source) - Number(!!b.source) || walkOf(a) - walkOf(b);
    });
    return list;
  };
  const results = useMemo(
    () => run(filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, walkById, live.summaries, live.now],
  );
  const mapResults = useMemo(
    () => (tab === 'map' ? run({ ...filters, maxWalk: filters.mapMaxWalk }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, filters, walkById, live.summaries, live.now],
  );

  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [results]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const favoriteList = useMemo(() => RESTAURANTS.filter((r) => favorites.has(r.id)), [favorites]);
  const recentList = useMemo(() => recentIds.map((id) => byId.get(id)).filter((r): r is Restaurant => !!r), [recentIds, byId]);
  const nearbyOpen = useMemo(
    () =>
      // 카카오에서 가져온 곳은 영업시간을 몰라 "지금 영업 중"에 넣지 않는다
      RESTAURANTS.filter((r) => !r.source && maybeOpen(r, live.now) && walkById.get(r.id) != null)
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
  /** 오늘의 추천: 날씨가 특별하면 날씨, 아니면 요일 주제. 예산·도보는 지금 조건을 따른다 */
  const theme = useMemo(
    () => dayTheme(live.now, weather, filters.maxWalk >= ALL_WALK ? 15 : filters.maxWalk),
    [live.now, weather, filters.maxWalk],
  );
  const todayPicks = useMemo(() => {
    const base = { theme, now: live.now, budget: filters.maxPrice, walkById, summaries: live.summaries };
    const open = pickForToday(RESTAURANTS, { ...base, isOpen: (r) => maybeOpen(r, live.now) });
    // 영업 끝난 시간(저녁·주말)엔 영업시간과 상관없이 — 다음 점심 고민용
    return open.length >= 3 ? open : pickForToday(RESTAURANTS, { ...base, isOpen: () => true });
  }, [theme, live.now, live.summaries, filters.maxPrice, walkById]);

  const topRated = useMemo(
    () => [...RESTAURANTS].filter((r) => externalRating(r) > 0).sort((a, b) => externalRating(b) - externalRating(a)).slice(0, 10),
    [],
  );

  // ---------- 화면 이동 (브라우저/휴대폰 뒤로가기와 연동) ----------
  useEffect(() => {
    history.replaceState({ tab: 'home', depth: 0 } satisfies NavState, '');
    const onPop = (e: PopStateEvent) => {
      const st = (e.state as NavState | null) ?? { tab: 'home', depth: 0 };
      setTab((cur) => {
        if (cur !== st.tab) {
          if (mainRef.current) scrollByTab.current.set(cur, mainRef.current.scrollTop);
          nextScroll.current = scrollByTab.current.get(st.tab) ?? 0;
        }
        return st.tab;
      });
      setDepth(st.depth);
      setSelectedId(st.detail ?? null);
      setFiltersOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: nextScroll.current });
  }, [tab]);

  const push = (st: NavState) => {
    history.pushState(st, '');
    setDepth(st.depth);
  };

  const goBack = () => history.back();

  const open = (id: string | null) => {
    if (!id) {
      // 상세를 뒤로가기 기록으로 열었으면 기록도 하나 되돌린다
      if ((history.state as NavState | null)?.detail) history.back();
      else setSelectedId(null);
      return;
    }
    push({ tab, depth: depth + 1, detail: id });
    setSelectedId(id);
    setRecentIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT));
  };

  /** 지도 핀을 누르면: 말풍선 + 아래 패널(접힘). 최근 본 식당에도 남긴다 */
  const selectOnMap = useCallback((id: string) => {
    setMapSelId(id);
    setRecentIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT));
  }, []);
  const mapSelected = mapSelId ? (byId.get(mapSelId) ?? null) : null;

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

  /** 식당 상세의 "투표에 담기" — 다음에 만들 투표의 후보 */
  const toggleDraft = (id: string) =>
    setVoteDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
    if (t === tab) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // 홈은 쌓인 기록을 모두 되돌려 처음 상태로
    if (t === 'home' && depth > 0) {
      history.go(-depth);
      return;
    }
    if (mainRef.current) scrollByTab.current.set(tab, mainRef.current.scrollTop);
    nextScroll.current = 0;
    push({ tab: t, depth: depth + 1 });
    setTab(t);
  };

  /** 제목을 누르면 처음 화면으로 */
  const goHome = () => {
    setAdminOpen(false);
    setVoteView(null);
    setFiltersOpen(false);
    setFilters(DEFAULT_FILTERS);
    if (depth > 0) history.go(-depth);
    else mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
    // 목록 끝에 가까워지면 다음 묶음을 그린다
    const el = e.currentTarget;
    if (tab === 'search' && shown < results.length && el.scrollHeight - top - el.clientHeight < 800) setShown((n) => n + PAGE_SIZE);
  };

  const backButton = depth > 0 && (
    <button className="back-btn" onClick={goBack} aria-label="뒤로 가기">
      <span className="back-arrow" aria-hidden />
    </button>
  );

  const searchBox = (
    <SearchBox
      leading={tab === 'home' ? null : backButton}
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

  /** 오늘의 추천 탭: 날씨·요일 추천 + 점심 투표 */
  const todayView = (
    <div className="today-tab">
      <TodayPick
        theme={theme}
        weather={weather}
        picks={todayPicks}
        walkById={walkById}
        now={live.now}
        onSelect={open}
        onSeeAll={() => searchWith({ dishes: theme.dishes, maxWalk: theme.maxWalk, openNow: true })}
        onVote={() => {
          setVoteDraft(todayPicks.slice(0, VOTE_FROM_PICKS).map((r) => r.id));
          setVoteView({ mode: 'create' });
        }}
      />
      <VoteHome
        votes={votes}
        byId={byId}
        draftCount={voteDraft.length}
        onCreate={() => setVoteView({ mode: 'create' })}
        onOpen={(id) => setVoteView({ mode: 'poll', id })}
      />
    </div>
  );

  const ticker = <LiveTicker reports={live.reports} restaurants={RESTAURANTS} now={live.now} mode={live.mode} onSelect={open} />;

  const filterBar = (
    <FilterBar
      filters={filters}
      onChange={setFilters}
      walkKey={tab === 'map' ? 'mapMaxWalk' : 'maxWalk'}
      resultCount={tab === 'map' ? mapResults.length : results.length}
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
            <TowerLogo />
            <span className="brand-text">
              <h1>
                <span className="brand-name">
                  오늘<em>잠심</em>
                </span>
                <span className="brand-sub">잠실점심</span>
              </h1>
              <span className="tagline">구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!</span>
            </span>
          </a>
        </header>
      )}
      {tab === 'search' && filterBar}
      {tab === 'map' && filterBar}
      {tab === 'today' && (
        <header className="page-head">
          {backButton}
          <h2>☀️ 오늘의 추천</h2>
          <span className="small">날씨·요일에 맞춘 추천과 점심 투표</span>
        </header>
      )}
      {tab === 'favorites' && (
        <header className="page-head">
          {backButton}
          <h2>⭐ 관심매장</h2>
          <span className="small">
            {favView === 'mine' ? '카드의 ☆ 를 누르면 여기에 모여요' : '동료들이 관심 저장·맛집 체크·별점을 남긴 곳'}
          </span>
          <div className="chips fav-switch">
            <button className={'chip' + (favView === 'mine' ? ' on' : '')} onClick={() => setFavView('mine')}>
              ⭐ 나의 관심매장 {favoriteList.length}
            </button>
            <button className={'chip' + (favView === 'peers' ? ' on' : '')} onClick={() => setFavView('peers')}>
              👍 동료 추천매장 {recommended.length > 0 && recommended.length}
            </button>
          </div>
        </header>
      )}

      <main ref={mainRef} className={'main tab-' + tab} onScroll={onMainScroll}>
        {tab === 'home' && (
          <HomeView
            searchBox={searchBox}
            talk={<ShareTalk talk={talk} now={live.now} isAdmin={live.isAdmin} />}
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
              <>
                {results.slice(0, shown).map(card)}
                {shown < results.length && (
                  <button className="btn more-btn" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    더 보기 ({shown}/{results.length})
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'map' && (
          <div className="map-wrap">
            <MapView
              restaurants={mapResults}
              selectedId={mapSelId}
              onSelect={selectOnMap}
              maxWalk={filters.mapMaxWalk}
              walkById={walkById}
            />
            {mapSelected && (
              <MapSheet key={mapSelected.id} onClose={() => setMapSelId(null)}>
                <RestaurantDetail
                  variant="sheet"
                  r={mapSelected}
                  walk={walkById.get(mapSelected.id) ?? null}
                  favorite={favorites.has(mapSelected.id)}
                  budget={filters.maxPrice}
                  reports={live.reports}
                  summary={live.summaries.get(mapSelected.id)}
                  reportMode={live.mode}
                  reportLocalReason={live.localReason}
                  now={live.now}
                  isAdmin={live.isAdmin}
                  onAddReport={live.add}
                  onRemoveReport={live.remove}
                  onClose={() => setMapSelId(null)}
                  onToggleFavorite={() => toggleFav(mapSelected.id)}
                  inVote={voteDraft.includes(mapSelected.id)}
                  onToggleVote={() => toggleDraft(mapSelected.id)}
                />
              </MapSheet>
            )}
          </div>
        )}

        {tab === 'today' && todayView}

        {tab === 'favorites' && favView === 'mine' && (
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

        {tab === 'favorites' && favView === 'peers' && (
          <div className="card-list">
            {recommended.length === 0 ? (
              <>
                <div className="empty small">
                  아직 동료들의 추천이 없어요.
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

      {voteView && (
        <>
          <div className="backdrop" onClick={() => setVoteView(null)} />
          <VotePanel
            view={voteView}
            votes={votes}
            restaurants={RESTAURANTS}
            byId={byId}
            walkById={walkById}
            draft={voteDraft}
            onDraftChange={setVoteDraft}
            suggestions={[
              { label: '오늘의 추천', list: todayPicks },
              { label: '관심매장', list: favoriteList },
              { label: '최근 본 식당', list: recentList },
            ]}
            onCreated={(p) => setVoteView({ mode: 'poll', id: p.id })}
            onSelect={open}
            onClose={() => setVoteView(null)}
          />
        </>
      )}

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
            onClose={() => open(null)}
            onToggleFavorite={() => toggleFav(selected.id)}
            inVote={voteDraft.includes(selected.id)}
            onToggleVote={() => toggleDraft(selected.id)}
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
            talk={talk}
          />
        </>
      )}
    </div>
  );
}
