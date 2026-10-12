import { useState } from 'react';
import { CONCEPT_LABELS, CUISINES, SEATING_LABELS, type Concept, type Cuisine, type SeatingType } from '../types';

export interface Filters {
  maxPrice: number;
  cuisines: Cuisine[];
  concepts: Concept[];
  seating: SeatingType | null;
  maxWalk: number;
  sort: 'walk' | 'rating' | 'price';
  query: string;
  onlyFavorites: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  maxPrice: 12000,
  cuisines: [],
  concepts: [],
  seating: null,
  maxWalk: 20,
  sort: 'walk',
  query: '',
  onlyFavorites: false,
};

const PRICE_STEPS = [8000, 10000, 12000, 15000, 20000];
const WALK_STEPS = [5, 10, 15, 20, 30];

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterBar({ filters, onChange, resultCount }: Props) {
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
              ~{(p / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">메뉴</span>
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
        <span className="filter-label">컨셉</span>
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
        <span className="filter-label">좌석</span>
        <div className="chips">
          {(Object.keys(SEATING_LABELS) as SeatingType[]).map((k) => (
            <button
              key={k}
              className={'chip' + (filters.seating === k ? ' on' : '')}
              onClick={() => set({ seating: filters.seating === k ? null : k })}
            >
              {SEATING_LABELS[k].emoji} {SEATING_LABELS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">도보</span>
        <div className="chips">
          {WALK_STEPS.map((m) => (
            <button key={m} className={'chip' + (filters.maxWalk === m ? ' on' : '')} onClick={() => set({ maxWalk: m })}>
              {m === 30 ? '전체' : `${m}분 이내`}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row between">
        <div className="chips">
          <span className="filter-label">정렬</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
            <option value="walk">가까운 순</option>
            <option value="rating">평점 순</option>
            <option value="price">저렴한 순</option>
          </select>
          <button
            className={'chip' + (filters.onlyFavorites ? ' on' : '')}
            onClick={() => set({ onlyFavorites: !filters.onlyFavorites })}
          >
            ⭐ 찜만
          </button>
        </div>
        <div className="result-meta">
          <strong>{resultCount}</strong>곳
          {!isDefault && (
            <button className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
              초기화
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
