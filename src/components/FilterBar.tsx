import { useState } from 'react';
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
  sort: 'stars' | 'walk' | 'rating' | 'price';
  query: string;
  onlyFavorites: boolean;
}

export const NO_LIMIT = 1_000_000;
export const ALL_WALK = 99;

export const DEFAULT_FILTERS: Filters = {
  maxPrice: NO_LIMIT,
  cuisines: [],
  dishes: [],
  concepts: [],
  seating: null,
  groupSize: 6,
  maxWalk: ALL_WALK,
  sort: 'stars',
  query: '',
  onlyFavorites: false,
};

const PRICE_STEPS = [8000, 10000, 12000, 15000, 20000, 30000, NO_LIMIT];
const WALK_STEPS = [5, 10, 15, 20, ALL_WALK];

export const SORT_LABELS: Record<Filters['sort'], string> = {
  stars: '별점 많은 순',
  rating: '평점 높은 순',
  walk: '가까운 순',
  price: '저렴한 순',
};

export function priceLabel(p: number): string {
  if (p >= NO_LIMIT) return '예산 전체';
  return `~${(p / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
}
export function walkLabel(m: number): string {
  return m >= ALL_WALK ? '거리 전체' : `도보 ${m}분 이내`;
}

/** 현재 적용 중인 조건을 한 줄로 */
export function describeFilters(f: Filters): string {
  const parts = [priceLabel(f.maxPrice), walkLabel(f.maxWalk)];
  if (f.cuisines.length) parts.push(f.cuisines.join('·'));
  if (f.dishes.length) parts.push(f.dishes.join('·'));
  if (f.concepts.length) parts.push(f.concepts.map((c) => CONCEPT_LABELS[c].label).join('·'));
  if (f.seating === 'group') parts.push(`단체 ${f.groupSize}명+`);
  else if (f.seating) parts.push(SEATING_LABELS[f.seating].label);
  if (f.onlyFavorites) parts.push('찜만');
  if (f.query.trim()) parts.push(`"${f.query.trim()}"`);
  return parts.join(' · ');
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  totalCount: number;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterBar({ filters, onChange, resultCount, totalCount }: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <section className={'filters' + (open ? ' open' : '')} aria-label="필터">
      <div className="filter-row">
        <input
          className="search"
          type="search"
          placeholder="가게명·메뉴 검색 (예: 국밥, 돈까스)"
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <button className="chip mobile-only" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? '필터 접기 ▲' : '필터 ▼'}
        </button>
      </div>

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

      <div className="filter-group">
        <span className="filter-label">도보</span>
        <div className="chips">
          {WALK_STEPS.map((m) => (
            <button key={m} className={'chip' + (filters.maxWalk === m ? ' on' : '')} onClick={() => set({ maxWalk: m })}>
              {m >= ALL_WALK ? '전체' : `${m}분 이내`}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row between">
        <div className="chips">
          <span className="filter-label">정렬</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
            {(Object.keys(SORT_LABELS) as Filters['sort'][]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <button
            className={'chip' + (filters.onlyFavorites ? ' on' : '')}
            onClick={() => set({ onlyFavorites: !filters.onlyFavorites })}
          >
            ⭐ 찜만
          </button>
        </div>
        <div className="result-meta">
          <strong>{resultCount}</strong>
          <span className="small"> / {totalCount}곳</span>
          {!isDefault && (
            <button className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
              초기화
            </button>
          )}
        </div>
      </div>
      <div className="filter-desc small">기준: {describeFilters(filters)}</div>
    </section>
  );
}
