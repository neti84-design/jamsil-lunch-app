import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  CONCEPT_LABELS,
  CUISINES,
  GROUP_SIZES,
  SEATING_LABELS,
  type Concept,
  type Cuisine,
  type SeatingType,
} from '../types';
import { DISH_TAGS, type DishTag } from '../lib/dish';
import { useSite, type Site } from '../lib/sites';

export interface Filters {
  /** 인당 예산 상한. Infinity = 제한 없음 */
  maxPrice: number;
  cuisines: Cuisine[];
  dishes: DishTag[];
  concepts: Concept[];
  seating: SeatingType | null;
  /** 단체석 선택 시 필요한 인원 */
  groupSize: number;
  /** 도보 상한(분). 99 = 전체 */
  maxWalk: number;
  /** 지도 탭의 도보 상한(분). 검색 목록과 따로 저장 */
  mapMaxWalk: number;
  /** 배달 되는 곳만 */
  delivery: boolean;
  sort: 'stars' | 'walk' | 'rating' | 'price';
  query: string;
  /** 지금 영업 중(또는 영업시간 미확인)인 곳만 */
  openNow: boolean;
  /** 건물·상가 (장미상가, 롯데월드몰 …) */
  building: string | null;
}

export const NO_LIMIT = 1_000_000;
export const ALL_WALK = 99;

/** 처음 기준: 인당 1.2만원(영등포는 1만원 — defaultFilters) · 도보 10분 이내 */
export const DEFAULT_FILTERS: Filters = {
  maxPrice: 12000,
  cuisines: [],
  dishes: [],
  concepts: [],
  seating: null,
  groupSize: 6,
  maxWalk: 10,
  mapMaxWalk: 10,
  delivery: false,
  sort: 'stars',
  query: '',
  openNow: false,
  building: null,
};

/** 근무지별 처음 기준 (식대만 다르다) */
export function defaultFilters(site: Site): Filters {
  return { ...DEFAULT_FILTERS, maxPrice: site.defaultBudget };
}

const PRICE_STEPS = [8000, 10000, 12000, 15000, 20000, 30000, NO_LIMIT];
const WALK_STEPS = [5, 10, 15, 20, ALL_WALK];


/** 검색창 바로 아래 정렬 칩 */
const SORT_LABELS: Record<Filters['sort'], string> = {
  stars: '별점순',
  walk: '가까운순',
  rating: '평점순',
  price: '저렴한순',
};

export function priceLabel(p: number): string {
  if (p >= NO_LIMIT) return '예산 전체';
  return `~${(p / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
}
export function walkLabel(m: number): string {
  return m >= ALL_WALK ? '거리 전체' : `도보 ${m}분 이내`;
}

/** 도보 조건이 들어 있는 칸 — 검색 목록은 maxWalk, 지도는 mapMaxWalk */
export type WalkKey = 'maxWalk' | 'mapMaxWalk';

/** 현재 적용 중인 조건을 한 줄로 */
export function describeFilters(f: Filters, walkKey: WalkKey = 'maxWalk'): string {
  const parts = [priceLabel(f.maxPrice), walkLabel(f[walkKey])];
  if (f.cuisines.length) parts.push(f.cuisines.join('·'));
  if (f.dishes.length) parts.push(f.dishes.join('·'));
  if (f.concepts.length) parts.push(f.concepts.map((c) => CONCEPT_LABELS[c].label).join('·'));
  if (f.seating === 'group') parts.push(`단체 ${f.groupSize}명+`);
  else if (f.seating) parts.push(SEATING_LABELS[f.seating].label);
  if (f.building) parts.push(f.building);
  if (f.openNow) parts.push('영업 중');
  if (f.delivery) parts.push('배달');
  if (f.query.trim()) parts.push(`"${f.query.trim()}"`);
  return parts.join(' · ');
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  totalCount: number;
  /** 필터에 보여줄 주요장소(건물) 목록 */
  buildings: { name: string; emoji: string; count: number }[];
  /** 검색창 */
  searchBox: ReactNode;
  /** 세부조건 펼침 여부. 목록을 내리면 App 에서 접는다 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 도보 칩이 바꿀 칸 (지도 탭은 mapMaxWalk) */
  walkKey?: WalkKey;
  /** PC 화면: 세부조건을 늘 펼쳐 두고 접기·끌기 없이 */
  pinned?: boolean;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** 위로 이만큼(px) 쓸어 올리면 세부조건을 접는다 */
const SWIPE_CLOSE_PX = 50;
/** 세부조건 영역 최대 높이 (화면 높이 비율) */
const PANEL_MAX_VH = 0.5;

export function FilterBar({ filters, onChange, resultCount, totalCount, buildings, searchBox, open: openProp, onOpenChange, walkKey = 'maxWalk', pinned = false }: Props) {
  const open = pinned || openProp;
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const defaults = defaultFilters(useSite());
  // 지금 화면에서 안 쓰는 도보 칸은 비교에서 뺀다
  const other: WalkKey = walkKey === 'maxWalk' ? 'mapMaxWalk' : 'maxWalk';
  const isDefault =
    JSON.stringify({ ...filters, query: '', sort: 'stars', [other]: defaults[other] }) === JSON.stringify(defaults);
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  /** free: 세부조건 목록 밖(검색줄·세부조건 버튼)에서 시작한 터치 → 스크롤과 상관없이 바로 끌어서 접기 */
  const touch = useRef<{ y: number; free: boolean; startedAtBottom: boolean; dragging: boolean } | null>(null);
  /** 펼쳤을 때의 높이(px) */
  const [fullHeight, setFullHeight] = useState(0);
  /** 손가락으로 끌고 있는 거리(px, 위로 = 음수) */
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = innerRef.current;
      if (el) setFullHeight(Math.min(el.scrollHeight, Math.round(window.innerHeight * PANEL_MAX_VH)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [filters, buildings.length]);

  const innerAtBottom = () => {
    const el = innerRef.current;
    return !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  };

  const height = open ? Math.max(0, fullHeight + Math.min(0, drag)) : 0;
  // 접히면서 내용이 위로 밀려 올라가는 느낌
  const shift = open ? Math.min(0, drag) : -fullHeight;

  return (
    <section
      className={'filters' + (open ? ' open' : '') + (pinned ? ' pinned' : '')}
      aria-label="검색"
      onTouchStart={(e) => {
        if (pinned) return;
        const free = !innerRef.current?.contains(e.target as Node);
        touch.current = { y: e.touches[0].clientY, free, startedAtBottom: innerAtBottom(), dragging: false };
      }}
      onTouchMove={(e) => {
        const t = touch.current;
        if (!t || !open) return;
        const dy = e.touches[0].clientY - t.y;
        // 세부조건을 끝까지 본 상태(또는 목록 밖)에서 위로 끌면 손가락을 따라 접힌다
        if (dy < 0 && (t.free || (t.startedAtBottom && innerAtBottom()))) {
          if (!t.dragging) {
            t.dragging = true;
            setDragging(true);
          }
          setDrag(dy);
        }
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dy = e.changedTouches[0].clientY - t.y;
        setDragging(false);
        setDrag(0);
        if (open && t.dragging && dy < -SWIPE_CLOSE_PX) onOpenChange(false);
        // 접힌 상태에서 손잡이를 아래로 끌면 펼친다
        else if (!open && dy > SWIPE_CLOSE_PX) onOpenChange(true);
      }}
      onTouchCancel={() => {
        touch.current = null;
        setDragging(false);
        setDrag(0);
      }}
    >
      {searchBox}

      {(filters.building || filters.dishes.length > 0) && (
        <div className="quick-row">
          {filters.building && (
            <button className="chip sm on" onClick={() => set({ building: null })} aria-label={`${filters.building} 조건 빼기`}>
              🏢 {filters.building} ✕
            </button>
          )}
          {filters.dishes.map((d) => (
            <button key={d} className="chip sm on" onClick={() => set({ dishes: toggle(filters.dishes, d) })} aria-label={`${d} 조건 빼기`}>
              {d} ✕
            </button>
          ))}
        </div>
      )}

      <div className="quick-row">
        {(Object.keys(SORT_LABELS) as Filters['sort'][]).map((k) => (
          <button key={k} className={'chip sm' + (filters.sort === k ? ' on' : '')} onClick={() => set({ sort: k })}>
            {SORT_LABELS[k]}
          </button>
        ))}
        <button
          className={'chip sm' + (filters.openNow ? ' on' : '')}
          title="지금 영업 중인 곳만 (영업시간이 확인 안 된 곳은 포함)"
          onClick={() => set({ openNow: !filters.openNow })}
        >
          🟢 영업 중
        </button>
        <button
          className={'chip sm' + (filters.delivery ? ' on' : '')}
          title="배달 되는 곳만 (조사로 확인됐거나 누군가 '배달 돼요'를 체크한 곳)"
          onClick={() => set({ delivery: !filters.delivery })}
        >
          🛵 배달
        </button>
      </div>

      <div
        className={'filter-panel' + (dragging ? ' dragging' : '')}
        ref={panelRef}
        style={pinned ? undefined : { height }}
        aria-hidden={!open}
      >
        <div
          className="filter-panel-inner"
          ref={innerRef}
          style={pinned ? undefined : { maxHeight: fullHeight || undefined, transform: `translateY(${shift}px)` }}
        >
      <div className="filter-group">
        <span className="filter-label">인당 예산</span>
        <div className="chips">
          {PRICE_STEPS.map((p) => (
            <button
              key={p}
              className={'chip' + (filters.maxPrice === p ? ' on' : '')}
              onClick={() => set({ maxPrice: p })}
            >
              {p >= NO_LIMIT ? '전체' : priceLabel(p)}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">도보</span>
        <div className="chips">
          {WALK_STEPS.map((m) => (
            <button key={m} className={'chip' + (filters[walkKey] === m ? ' on' : '')} onClick={() => set({ [walkKey]: m })}>
              {m >= ALL_WALK ? '전체' : `${m}분 이내`}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">종류</span>
        <div className="chips">
          <button className={'chip' + (filters.cuisines.length === 0 ? ' on' : '')} onClick={() => set({ cuisines: [] })}>
            전체
          </button>
          {CUISINES.map((c) => (
            <button
              key={c}
              className={'chip' + (filters.cuisines.includes(c) ? ' on' : '')}
              onClick={() => set({ cuisines: toggle(filters.cuisines, c) })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">메뉴</span>
        <div className="chips">
          {DISH_TAGS.map((d) => (
            <button
              key={d}
              className={'chip' + (filters.dishes.includes(d) ? ' on' : '')}
              onClick={() => set({ dishes: toggle(filters.dishes, d) })}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">방문 목적</span>
        <div className="chips">
          {(Object.keys(CONCEPT_LABELS) as Concept[]).map((k) => (
            <button
              key={k}
              className={'chip' + (filters.concepts.includes(k) ? ' on' : '')}
              title={CONCEPT_LABELS[k].desc}
              onClick={() => set({ concepts: toggle(filters.concepts, k) })}
            >
              {CONCEPT_LABELS[k].emoji} {CONCEPT_LABELS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">좌석·편의</span>
        <div className="chips">
          {(Object.keys(SEATING_LABELS) as SeatingType[]).map((k) => (
            <button
              key={k}
              className={'chip' + (filters.seating === k ? ' on' : '')}
              title={SEATING_LABELS[k].desc}
              onClick={() => set({ seating: filters.seating === k ? null : k })}
            >
              {SEATING_LABELS[k].emoji} {SEATING_LABELS[k].label}
              {k === 'group' && filters.seating === 'group' && <> {filters.groupSize}명+</>}
            </button>
          ))}
          {filters.seating === 'group' && (
            <span className="chips sub-chips" aria-label="단체 인원">
              {GROUP_SIZES.map((n) => (
                <button
                  key={n}
                  className={'chip sm' + (filters.groupSize === n ? ' on' : '')}
                  onClick={() => set({ groupSize: n })}
                >
                  {n}명
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {buildings.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">주요장소</span>
          <div className="chips">
            <button className={'chip' + (!filters.building ? ' on' : '')} onClick={() => set({ building: null })}>
              전체
            </button>
            {buildings.map((b) => (
              <button
                key={b.name}
                className={'chip' + (filters.building === b.name ? ' on' : '')}
                onClick={() => set({ building: filters.building === b.name ? null : b.name })}
              >
                {b.emoji} {b.name} <span className="small">{b.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-row between">
        <div className="filter-desc small">기준: {describeFilters(filters, walkKey)}</div>
        {!isDefault && (
          <button
            className="link"
            onClick={() => onChange({ ...defaults, query: filters.query, sort: filters.sort, [other]: filters[other] })}
          >
            초기화
          </button>
        )}
      </div>
        </div>
      </div>

      {!pinned && (
      <div className="filter-foot">
        <button
          className={'filter-handle' + (open ? ' open' : '')}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
        >
          세부조건{!isDefault && <span className="dot" aria-label="적용 중" />}
          <span className={'chevron' + (open ? ' up' : '')} aria-hidden />
        </button>
        <span className="result-meta">
          <strong>{resultCount}</strong>
          <span className="small">/{totalCount}곳</span>
        </span>
      </div>
      )}
    </section>
  );
}
