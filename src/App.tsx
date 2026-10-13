import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { loadRestaurants } from './data';
import { ALL_WALK, FilterBar, defaultFilters, NO_LIMIT, type Filters } from './components/FilterBar';
import { RestaurantCard } from './components/RestaurantCard';
import { RestaurantDetail } from './components/RestaurantDetail';
import { AdminPanel } from './components/AdminPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { MapView } from './components/MapView';
import { LiveTicker } from './components/LiveTicker';
import { SearchBox } from './components/SearchBox';
import { BottomNav, type Tab } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { TowerLogo } from './components/TowerLogo';
import { SiteSwitch } from './components/SiteSwitch';
import { MapSheet } from './components/MapSheet';
import { ShareTalk } from './components/ShareTalk';
import { RecentReviews } from './components/RecentReviews';
import { TodayPick } from './components/TodayPick';
import { VoteHome } from './components/VoteHome';
import { VotePanel, type VoteView } from './components/VotePanel';
import { useReports } from './hooks/useReports';
import { useTalk } from './hooks/useTalk';
import { useVotes } from './hooks/useVotes';
import { isWide, useWide } from './hooks/useWide';
import { SITES, SiteContext, loadSite, saveSite, type SiteId } from './lib/sites';
import { fetchLunchWeather, type LunchWeather } from './lib/weather';
import { dayTheme, kstDate, pickForTaste, pickForToday, tasteFrom } from './lib/recommend';
import { PARTNERS, type Partner } from './data/partners';
import { walkMinutesFrom } from './lib/geo';
import { dishTags, type DishTag } from './lib/dish';
import { bigBuildings, buildingOf, insideMinutes } from './lib/buildings';
import { maybeOpen, openStatus } from './lib/hours';
import { bumpView, loadViewCounts } from './lib/views';
import { applyFixes } from './lib/fixes';
import { makeNameMatcher, makeQueryMatcher } from './lib/search';
import { LIVE_WINDOW_MS, type ReportSummary } from './lib/reports';
import { hasDelivery, type Restaurant } from './types';

/** 만든 사람 (화면 맨 아래 작게) */
const MAKER = 'cjy1***';
const FAV_KEY = 'jamsil-lunch:favorites';
const RECENT_KEY = 'jamsil-lunch:recent';
const SEARCH_KEY = 'jamsil-lunch:searches';
const VOTE_DRAFT_KEY = 'jamsil-lunch:vote-draft';
/** 기기마다 다른 값 — 오늘의 추천을 휴대폰·PC 마다 조금씩 다르게 섞는다 */
const SEED_KEY = 'jamsil-lunch:seed';

function deviceSeed(): string {
  const fresh = Math.random().toString(36).slice(2, 10);
  try {
    const saved = localStorage.getItem(SEED_KEY);
    if (saved) return saved;
    localStorage.setItem(SEED_KEY, fresh);
  } catch {
    /* 저장이 막혀 있으면 이번 방문 동안만 */
  }
  return fresh;
}
/** 오늘의 추천을 "이 중에서 투표"로 담을 때 몇 곳까지 */
const VOTE_FROM_PICKS = 4;
/** 홈 아래 '추천': 최근 며칠 / 몇 곳 */
const BUZZ_DAYS = 14;
const BUZZ_SHOWN = 10;
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

/** 동료 추천매장 점수: 다른 사람들의 관심 저장 + 숨은맛집/또 갈래요 체크 + 별점 */
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
/** 홈 '추천'에 왜 올라왔는지 */
interface Why {
  favs: number;
  good: number;
  views: number;
  near: boolean;
}
interface BuzzItem {
  r: Restaurant;
  why: Why | null;
  partner: Partner | null;
}

interface NavState {
  tab: Tab;
  depth: number;
  /** 열려 있는 식당 상세 */
  detail?: string;
}

/** 데이터를 받기 전 빈 목록 (매번 새 배열을 만들지 않게) */
const NO_RESTAURANTS: Restaurant[] = [];

export default function App() {
  /** 근무지: 마지막에 고른 곳으로 열린다 (처음엔 영등포맥스) */
  const [siteId, setSiteId] = useState<SiteId>(loadSite);
  const site = SITES[siteId];
  /** 근무지별 식당 — 고른 근무지 것만 그때 받아 온다 */
  const [lists, setLists] = useState<Partial<Record<SiteId, Restaurant[]>>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTry, setLoadTry] = useState(0);
  const rawRestaurants = lists[siteId] ?? NO_RESTAURANTS;
  const loading = !lists[siteId];
  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    loadRestaurants(siteId)
      .then((list) => alive && setLists((prev) => ({ ...prev, [siteId]: list })))
      .catch((e: unknown) => {
        console.warn('[jamsil-lunch] 식당 데이터 불러오기 실패:', e);
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [siteId, loadTry]);
  // 조건은 열 때마다 기본값(식대·도보 10분)에서 시작한다 — 예전에 걸어 둔 메뉴·영업 중 등이 남아 있으면 헷갈려서.
  // 바꾼 조건은 앱을 쓰는 동안만 유지
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(SITES[siteId]));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(loadJSON<string[]>(FAV_KEY, [])));
  const [recentIds, setRecentIds] = useState<string[]>(() => loadJSON<string[]>(RECENT_KEY, []));
  const [searches, setSearches] = useState<string[]>(() => loadJSON<string[]>(SEARCH_KEY, []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const wide = useWide();
  /** 처음 화면: PC 는 지도·조건 화면, 휴대폰은 홈 */
  const [startTab] = useState<Tab>(() => (isWide() ? 'map' : 'home'));
  const [tab, setTab] = useState<Tab>(startTab);
  /** PC 의 지도·검색 화면: 지도 왼쪽 크게, 오른쪽에 조건과 식당 */
  const split = wide && (tab === 'map' || tab === 'search');
  /** 홈에서 몇 단계 들어왔는지 (0 이면 뒤로가기 버튼 없음) */
  const [depth, setDepth] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  /** 탭별 스크롤 위치 — 뒤로 돌아오면 보던 위치로 */
  const scrollByTab = useRef(new Map<Tab, number>());
  const nextScroll = useRef(0);
  const lastScroll = useRef(0);
  const live = useReports();
  /** 최근 2주 전체 사용자가 상세를 연 횟수 */
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    let alive = true;
    loadViewCounts().then((m) => alive && setViewCounts(m));
    return () => {
      alive = false;
    };
  }, []);
  /** 사용자 "직접 수정"(가격·영업시간)을 반영한 식당 */
  const restaurants = useMemo(() => applyFixes(rawRestaurants, live.reports), [rawRestaurants, live.reports]);
  const talk = useTalk(live.adminToken, siteId);
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
  const [seed] = useState(deviceSeed);

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

  // ?site= 링크로 들어왔으면 근무지는 이미 저장했으니 주소창에서 지운다 (새로고침해도 마지막에 고른 곳으로)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has('site')) return;
    q.delete('site');
    history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : ''));
  }, []);

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
    for (const r of restaurants) m.set(r.id, walkMinutesFrom(r.lat, r.lng, r.walkMinutes, insideMinutes(r), site));
    return m;
  }, [restaurants, site]);
  /** 받아 둔 근무지 식당 전부 (투표 링크·최근 본 식당) */
  // 직접 수정(가격·영업시간)을 반영한 것으로 — 열어 둔 식당 정보에도 바로 보이게
  const byId = useMemo(
    () => new Map(applyFixes(Object.values(lists).flat(), live.reports).map((r) => [r.id, r] as const)),
    [lists, live.reports],
  );
  // 근무지에서 가까운 건물부터
  const buildings = useMemo(() => bigBuildings(restaurants, site.office), [restaurants, site]);

  /** 조건에 맞는 식당을 정렬해서. 지도는 도보 조건으로 mapMaxWalk 를 쓴다 */
  const run = (f: Filters) => {
    const queryOk = makeQueryMatcher(f.query, restaurants);
    const list = restaurants.filter((r) => matches(r, walkById.get(r.id) ?? null, f, live.now, queryOk, live.summaries.get(r.id)));
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
    () => (tab === 'map' && !wide ? run({ ...filters, maxWalk: filters.mapMaxWalk }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, wide, filters, walkById, live.summaries, live.now],
  );

  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [results]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const favoriteList = useMemo(() => restaurants.filter((r) => favorites.has(r.id)), [restaurants, favorites]);
  // 최근 본 식당은 지금 근무지 것만
  const recentList = useMemo(() => {
    const here = new Set(restaurants.map((r) => r.id));
    return recentIds.filter((id) => here.has(id)).map((id) => byId.get(id)!);
  }, [recentIds, byId, restaurants]);
  const recommended = useMemo(
    () =>
      restaurants.filter((r) => {
        const s = live.summaries.get(r.id);
        // 내 관심 저장만 있는 곳은 "다른 사람" 추천이 아니므로 뺀다
        return recommendScore(s) - (s?.myTags.fav ? 3 : 0) > 0;
      }).sort((a, b) => recommendScore(live.summaries.get(b.id)) - recommendScore(live.summaries.get(a.id))),
    [restaurants, live.summaries],
  );
  /** 오늘의 추천: 날씨가 특별하면 날씨, 아니면 요일 주제. 예산·도보는 지금 조건을 따른다 */
  const theme = useMemo(
    () => dayTheme(live.now, weather, filters.maxWalk >= ALL_WALK ? 15 : filters.maxWalk),
    [live.now, weather, filters.maxWalk],
  );
  /** 이 기기 관심매장으로 만든 취향 — 오늘의 추천에서 비슷한 메뉴·위치를 더 올린다 */
  const taste = useMemo(() => tasteFrom(favoriteList), [favoriteList]);
  /** 오늘의 추천 두 줄: 날씨·요일 추천(취향 빼고) / 내 취향 추천(날씨 추천과 안 겹치게) */
  const { weatherPicks, tastePicks } = useMemo(() => {
    const base = { theme, now: live.now, budget: filters.maxPrice, walkById, summaries: live.summaries, seed };
    const openNow = (r: Restaurant) => maybeOpen(r, live.now);
    const open = pickForToday(restaurants, { ...base, isOpen: openNow });
    // 영업 끝난 시간(저녁·주말)엔 영업시간과 상관없이 — 다음 점심 고민용
    const anyHours = open.length < 3;
    const w = anyHours ? pickForToday(restaurants, { ...base, isOpen: () => true }) : open;
    const exclude = new Set(w.map((r) => r.id));
    const t = pickForTaste(restaurants, { ...base, taste, exclude, isOpen: anyHours ? () => true : openNow });
    return { weatherPicks: w, tastePicks: t };
  }, [restaurants, theme, live.now, live.summaries, filters.maxPrice, walkById, taste, seed]);
  const todayPicks = useMemo(() => [...weatherPicks, ...tastePicks], [weatherPicks, tastePicks]);

  const topRated = useMemo(
    () => [...restaurants].filter((r) => externalRating(r) > 0).sort((a, b) => externalRating(b) - externalRating(a)).slice(0, 10),
    [restaurants],
  );
  /**
   * 홈 아래 '추천' — 위에서부터
   * 1) 최근 2주 찜 많은 순 → 또 갈래요·숨은맛집·좋은 별점 많은 순
   * 2) 최근 2주 전체 사용자가 많이 본 순
   * 3) 가깝고 지금(또는 오늘) 영업하는 곳
   * 으로 BUZZ_SHOWN 곳을 채운다. 롯데 임직원 혜택 매장은 맨 위에 고정
   */
  const buzz = useMemo(() => {
    const since = live.now - BUZZ_DAYS * 86400_000;
    const here = new Set(restaurants.map((r) => r.id));
    const m = new Map<string, Why>();
    for (const rep of live.reports) {
      if (!here.has(rep.restaurantId)) continue;
      if (Date.parse(rep.createdAt) < since) continue;
      const fav = rep.kind === 'tag' && rep.tag === 'fav';
      const good =
        (rep.kind === 'tag' && (rep.tag === 'hidden' || rep.tag === 'classic')) || (rep.kind === 'review' && (rep.rating ?? 0) >= 4);
      if (!fav && !good) continue;
      const x = m.get(rep.restaurantId) ?? { favs: 0, good: 0, views: 0, near: false };
      if (fav) x.favs += 1;
      else x.good += 1;
      m.set(rep.restaurantId, x);
    }
    // 롯데 임직원 혜택 매장은 맨 위에 고정 (기간이 지나면 빠진다)
    const today = kstDate(live.now);
    const partners: BuzzItem[] = PARTNERS.filter((p) => p.site === siteId && byId.has(p.id) && (!p.until || today <= p.until)).map((p) => ({
      r: byId.get(p.id)!,
      why: null,
      partner: p,
    }));
    const seen = new Set(partners.map((x) => x.r.id));
    const out: BuzzItem[] = [...partners];
    const room = () => out.length < Math.max(BUZZ_SHOWN, partners.length);
    const add = (id: string, why: Why) => {
      if (seen.has(id) || !room()) return;
      seen.add(id);
      out.push({ r: byId.get(id)!, why, partner: null });
    };
    // 1) 찜 → 또 갈래요·숨은맛집
    for (const [id, why] of [...m.entries()].sort((a, b) => b[1].favs - a[1].favs || b[1].good - a[1].good)) add(id, why);
    // 2) 많이 본 매장
    for (const [id, views] of [...viewCounts.entries()].filter(([id]) => here.has(id)).sort((a, b) => b[1] - a[1]))
      add(id, { ...(m.get(id) ?? { favs: 0, good: 0, near: false }), views });
    // 3) 가깝고 영업하는 곳: 지금 영업 중 → 오늘 곧 영업 → 영업시간 미확인, 같은 묶음 안에서는 가까운 순
    const rank = (r: Restaurant) => {
      const st = openStatus(r, live.now).state;
      return st === 'open' || st === 'closing' ? 0 : st === 'before' || st === 'break' ? 1 : st === 'unknown' ? 2 : 9;
    };
    const near = restaurants
      .map((r) => ({ r, k: rank(r), w: walkById.get(r.id) ?? 99 }))
      .filter((x) => x.k < 9)
      .sort((a, b) => a.k - b.k || a.w - b.w);
    for (const { r } of near) add(r.id, { favs: 0, good: 0, views: 0, near: true });
    return out;
  }, [restaurants, byId, live.reports, live.now, viewCounts, walkById, siteId]);

  // ---------- 화면 이동 (브라우저/휴대폰 뒤로가기와 연동) ----------
  useEffect(() => {
    history.replaceState({ tab: startTab, depth: 0 } satisfies NavState, '');
    const onPop = (e: PopStateEvent) => {
      const st = (e.state as NavState | null) ?? { tab: startTab, depth: 0 };
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
  }, [startTab]);

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
    bumpView(id);
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

  /** 근무지 바꾸기: 건물·검색어는 그 동네 것이라 비우고, 열어 둔 식당은 닫는다 */
  const switchSite = (id: SiteId) => {
    if (id === siteId) return;
    setSiteId(id);
    saveSite(id);
    // 식대는 근무지마다 기본값이 달라서, 기본값 그대로였으면 새 근무지 기본값으로
    const budget = (f: Filters) => (f.maxPrice === SITES[siteId].defaultBudget ? SITES[id].defaultBudget : f.maxPrice);
    setFilters((f) => ({ ...f, maxPrice: budget(f), building: null, query: '' }));
    setMapSelId(null);
    if (selectedId) open(null);
  };

  // 근무지마다 색(테마)·제목·주소창 색
  useEffect(() => {
    document.documentElement.dataset.site = siteId;
    document.title = `오늘${site.brand.accent} — ${site.brand.sub}`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', site.themeColor);
  }, [siteId, site]);

  const goTab = (t: Tab) => {
    if (t === tab || (wide && t === 'search' && tab === 'map')) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // 처음 화면(휴대폰은 홈, PC 는 지도)은 쌓인 기록을 모두 되돌려 처음 상태로
    if (t === startTab && depth > 0) {
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
    setFilters(defaultFilters(site));
    if (depth > 0) history.go(-depth);
    else mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const searchWith = (patch: Partial<Filters>) => {
    setFilters({ ...defaultFilters(site), ...patch });
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
      leading={tab === 'home' || wide ? null : backButton}
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
        picks={weatherPicks}
        tastePicks={tastePicks}
        taste={taste}
        favCount={favoriteList.length}
        walkById={walkById}
        now={live.now}
        onSelect={open}
        onSeeAll={() => searchWith({ dishes: theme.dishes, maxWalk: theme.maxWalk, openNow: true })}
        onVote={() => {
          // 두 줄에서 고루 (내 취향 줄이 없으면 날씨 추천에서만)
          const half = tastePicks.length ? VOTE_FROM_PICKS / 2 : VOTE_FROM_PICKS;
          setVoteDraft([...weatherPicks.slice(0, half), ...tastePicks.slice(0, VOTE_FROM_PICKS - half)].map((r) => r.id));
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

  /** PC 지도 화면 오른쪽 목록: 끝에 가까워지면 다음 묶음 */
  const onSideScroll = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (shown < results.length && el.scrollHeight - el.scrollTop - el.clientHeight < 600) setShown((n) => n + PAGE_SIZE);
  };

  // 실시간 웨이팅은 지금 제보가 있을 때만 홈에 띄운다
  const hasLiveWait = live.reports.some(
    (r) => r.kind === 'wait' && live.now - Date.parse(r.createdAt) <= LIVE_WINDOW_MS && byId.has(r.restaurantId) && walkById.has(r.restaurantId),
  );
  const ticker = hasLiveWait ? (
    <LiveTicker reports={live.reports} restaurants={restaurants} now={live.now} mode={live.mode} onSelect={open} />
  ) : null;

  const filterBar = (
    <FilterBar
      filters={filters}
      onChange={setFilters}
      walkKey={tab === 'map' ? 'mapMaxWalk' : 'maxWalk'}
      resultCount={tab === 'map' ? mapResults.length : results.length}
      totalCount={restaurants.length}
      buildings={buildings}
      searchBox={searchBox}
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
    />
  );

  const brand = (
          <a
            className="brand"
            href="/"
            title="처음 화면으로"
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
          >
            <TowerLogo site={siteId} />
            <span className="brand-text">
              <h1>
                <span className="brand-name">
                  오늘<em>{site.brand.accent}</em>
                </span>
                <span className="brand-sub">{site.brand.sub}</span>
              </h1>
              <span className="tagline">{site.brand.tagline}</span>
            </span>
          </a>
  );

  /** PC 지도 화면 오른쪽 목록 카드: 누르면 지도에서 찾아 주고 바로 아래에 상세 */
  const sideCard = (r: Restaurant) => (
    <RestaurantCard
      key={r.id}
      r={r}
      walk={walkById.get(r.id) ?? null}
      selected={r.id === mapSelId}
      favorite={favorites.has(r.id)}
      budget={filters.maxPrice}
      summary={live.summaries.get(r.id)}
      now={live.now}
      onSelect={() => selectOnMap(r.id)}
      onToggleFavorite={() => toggleFav(r.id)}
    />
  );

  /** PC: 지도(왼쪽, 크게) | 조건 + 식당 목록·상세(오른쪽) */
  const splitView = (
    <div className="split">
      <div className="split-map map-wrap">
        <MapView restaurants={results} selectedId={mapSelId} onSelect={selectOnMap} maxWalk={filters.maxWalk} walkById={walkById} />
      </div>
      <aside className="split-side">
        <div className="split-cond">
          <FilterBar
            pinned
            filters={filters}
            onChange={setFilters}
            walkKey="maxWalk"
            resultCount={results.length}
            totalCount={restaurants.length}
            buildings={buildings}
            searchBox={searchBox}
            open
            onOpenChange={setFiltersOpen}
          />
        </div>
        <div className="split-results">
          <div className="split-results-head">
            {mapSelected ? (
              <button className="link-more" onClick={() => setMapSelId(null)}>
                ‹ 목록으로
              </button>
            ) : (
              <span className="small">카드나 지도 핀을 누르면 여기서 바로 자세히 볼 수 있어요</span>
            )}
            <span className="result-meta">
              <strong>{results.length}</strong>
              <span className="small">/{restaurants.length}곳</span>
            </span>
          </div>
          <div className="card-list split-list" hidden={!!mapSelected} onScroll={onSideScroll}>
            {results.length === 0 ? (
              <div className="empty">
                조건에 맞는 식당이 없어요.
                <br />
                검색어나 조건을 바꿔보세요.
              </div>
            ) : (
              <>
                {results.slice(0, shown).map(sideCard)}
                {shown < results.length && (
                  <button className="btn more-btn" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    더 보기 ({shown}/{results.length})
                  </button>
                )}
              </>
            )}
            <div className="credit">
              <button className="link" onClick={() => setFeedbackOpen(true)}>
                📮 제보·의견
              </button>{' '}
              · made by {MAKER}
            </div>
          </div>
          {mapSelected && (
            <RestaurantDetail
              key={mapSelected.id}
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
          )}
        </div>
      </aside>
    </div>
  );

  const siteSwitch = <SiteSwitch value={siteId} onChange={switchSite} />;

  return (
    <SiteContext.Provider value={site}>
    <div className={'app' + (wide ? ' wide' : '')}>
      {wide ? (
        <header className="wide-top">
          {brand}
          <div className="wide-top-right">
            <BottomNav variant="top" tab={tab} favCount={favoriteList.length} onChange={goTab} />
            {siteSwitch}
          </div>
        </header>
      ) : (
        tab === 'home' && (
          <header className="topbar">
            {brand}
            {siteSwitch}
          </header>
        )
      )}
      {!wide && tab === 'search' && filterBar}
      {!wide && tab === 'map' && filterBar}
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
          <h2>❤️ 찜한 식당</h2>
          <span className="small">
            {favView === 'mine' ? '카드의 ♡ 를 누르면 여기에 모여요' : '동료들이 찜·맛집 체크·별점을 남긴 곳'}
          </span>
          <div className="chips fav-switch">
            <button className={'chip' + (favView === 'mine' ? ' on' : '')} onClick={() => setFavView('mine')}>
              ♥ 내가 찜한 식당 {favoriteList.length}
            </button>
            <button className={'chip' + (favView === 'peers' ? ' on' : '')} onClick={() => setFavView('peers')}>
              👍 동료 추천 식당 {recommended.length > 0 && recommended.length}
            </button>
          </div>
        </header>
      )}

      <main ref={mainRef} className={'main tab-' + tab + (split ? ' tab-split' : '')} onScroll={onMainScroll}>
        {split && splitView}

        {tab === 'home' && (
          <HomeView
            talk={
              <>
                <ShareTalk talk={talk} now={live.now} isAdmin={live.isAdmin} />
                <RecentReviews reports={live.reports} restaurants={restaurants} now={live.now} onSelect={open} />
              </>
            }
            ticker={ticker}
            nearby={buzz.map(({ r, why, partner }) => (
              <div key={r.id} className={'recommend-item' + (partner ? ' partner' : '')}>
                {partner && (
                  <div className="recommend-why small">
                    <span>🎁 롯데 임직원 혜택</span>
                    <span className="partner-pitch">{partner.pitch}</span>
                  </div>
                )}
                {why && (
                  <div className="recommend-why small">
                    {why.favs > 0 && <span>♥ 최근 찜 {why.favs}</span>}
                    {why.good > 0 && <span>👍 좋았어요 {why.good}</span>}
                    {why.views > 0 && <span>많이 본 매장 {why.views}회</span>}
                    {why.near && <span>가까운 영업 매장</span>}
                  </div>
                )}
                {card(r)}
                {partner && (
                  <div className="partner-benefit">
                    {partner.benefit}
                    {partner.until && <span className="small"> · {partner.until.slice(5).replace('-', '/')}까지</span>}
                  </div>
                )}
              </div>
            ))}
            restaurants={restaurants}
            recent={recentList}
            buildings={buildings}
            walkById={walkById}
            now={live.now}
            onDish={(d: DishTag) => searchWith({ dishes: [d] })}
            onBuilding={(b) => searchWith({ building: b })}
            onSelect={open}
            onSeeAll={() => {
              setFavView('peers');
              goTab('favorites');
            }}
          />
        )}

        {tab === 'search' && !wide && (
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

        {tab === 'map' && !wide && (
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
                아직 찜한 식당이 없어요.
                <br />
                마음에 드는 식당 카드의 ♡ 를 눌러보세요.
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
                  찜(♡)·숨은맛집/또 갈래요 체크·별점이 모이면 여기에 떠요.
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
                      {others > 0 && <span>♥ 찜 {others}명</span>}
                      {s.hidden > 0 && <span>🤫 숨은맛집 {s.hidden}</span>}
                      {s.classic > 0 && <span>🔁 또 갈래요 {s.classic}</span>}
                      {s.reviewCount > 0 && <span>★ {s.avgRating!.toFixed(1)} ({s.reviewCount})</span>}
                    </div>
                    {card(r)}
                  </div>
                );
              })
            )}
          </div>
        )}

        {!split && tab !== 'map' && (
          <footer className="foot small">
            <div className="foot-note">블로그·지도 후기 기반 정보예요. 가격·영업시간은 방문 전 확인하세요.</div>
            <div className="foot-links">
              <button className="link" aria-expanded={howToOpen} onClick={() => setHowToOpen((v) => !v)}>
                사용방법
              </button>
              ·
              <button className="link" onClick={() => setFeedbackOpen(true)}>
                제보·의견
              </button>
              ·
              <button className="link" onClick={() => setAdminOpen(true)}>
                {live.isAdmin ? '관리자 모드' : '관리자'}
              </button>
            </div>
            {howToOpen && (
              <ol className="howto">
                <li>
                  세부조건 기본값은 인당 {site.defaultBudget / 10000}만원 이하 · 도보 10분 이내예요
                  {siteId === 'ydp' ? ' (영등포맥스 기준)' : ' (잠실본사 기준, 영등포맥스는 1만원)'}.
                </li>
                <li>오른쪽 위에서 근무지(잠실본사·영등포맥스)를 고르세요.</li>
                <li>홈에서 음식 종류·건물별로 둘러보거나, 검색에서 이름·메뉴로 찾으세요.</li>
                <li>세부조건에서 예산·도보 시간·종류를 바꾸고, 초기화로 기본값에 되돌릴 수 있어요.</li>
                <li>식당을 누르면 메뉴·가격·영업시간·웨이팅을 볼 수 있어요.</li>
                <li>다녀온 곳에 별점·한 줄 후기·웨이팅을 남겨 동료와 나눠 주세요.</li>
                <li>마음에 드는 곳은 하트로 찜하고, 오늘의 추천에서 점심 투표를 만들어 링크로 보내세요.</li>
              </ol>
            )}
            <div className="credit">made by {MAKER}</div>
          </footer>
        )}
      </main>

      {loading && (
        <div className="data-loading" role="status">
          {loadFailed ? (
            <>
              식당 정보를 불러오지 못했어요.
              <button className="btn sm" onClick={() => setLoadTry((n) => n + 1)}>
                다시 시도
              </button>
            </>
          ) : (
            <>🍱 {site.label} 주변 식당 불러오는 중…</>
          )}
        </div>
      )}

      {!wide && <BottomNav tab={tab} favCount={favoriteList.length} onChange={goTab} />}

      {voteView && (
        <>
          <div className="backdrop" onClick={() => setVoteView(null)} />
          <VotePanel
            view={voteView}
            votes={votes}
            restaurants={restaurants}
            byId={byId}
            walkById={walkById}
            draft={voteDraft}
            onDraftChange={setVoteDraft}
            suggestions={[
              { label: '오늘의 추천', list: todayPicks },
              { label: '찜한 식당', list: favoriteList },
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

      {feedbackOpen && (
        <>
          <div className="backdrop" onClick={() => setFeedbackOpen(false)} />
          <FeedbackPanel onAdd={live.add} onClose={() => setFeedbackOpen(false)} />
        </>
      )}

      {adminOpen && (
        <>
          <div className="backdrop" onClick={() => setAdminOpen(false)} />
          <AdminPanel
            reports={live.reports}
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
    </SiteContext.Provider>
  );
}
