import type { ReactNode } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { DISH_EMOJI, DISH_TAGS, dishTags, type DishTag } from '../lib/dish';
import { OPEN_STATE_COLOR, openStatus } from '../lib/hours';
import { formatWon } from '../lib/links';

interface Props {
  /** 검색창 (App 에서 만들어 넘김) */
  searchBox: ReactNode;
  /** 실시간 웨이팅 */
  ticker: ReactNode;
  /** 가까운 매장 카드들 */
  nearby: ReactNode;
  restaurants: Restaurant[];
  recent: Restaurant[];
  buildings: { name: string; emoji: string; count: number }[];
  walkById: Map<string, number | null>;
  now: number;
  onDish: (d: DishTag) => void;
  onBuilding: (b: string) => void;
  onSelect: (id: string) => void;
  onSeeAll: () => void;
}

/** 홈: 검색 · 음식 카테고리 · 건물별 · 최근 본 식당 · 실시간 웨이팅 · 가까운 매장 */
export function HomeView({ searchBox, ticker, nearby, restaurants, recent, buildings, walkById, now, onDish, onBuilding, onSelect, onSeeAll }: Props) {
  const counts = new Map<DishTag, number>();
  for (const r of restaurants) for (const t of dishTags(r)) counts.set(t, (counts.get(t) ?? 0) + 1);

  return (
    <div className="home">
      <div className="home-search">{searchBox}</div>

      <section className="home-section">
        <div className="category-grid">
          {DISH_TAGS.map((d) => (
            <button key={d} className="category" onClick={() => onDish(d)} disabled={!counts.get(d)}>
              <span className="category-icon" aria-hidden>
                {DISH_EMOJI[d]}
              </span>
              <span className="category-label">{d}</span>
            </button>
          ))}
        </div>
      </section>

      {buildings.length > 0 && (
        <section className="home-section">
          <h3 className="section-title">🏢 건물별 모아보기</h3>
          <div className="building-row">
            {buildings.map((b) => (
              <button key={b.name} className="building-card" onClick={() => onBuilding(b.name)}>
                <span className="building-emoji" aria-hidden>
                  {b.emoji}
                </span>
                <strong>{b.name}</strong>
                <span className="small">{b.count}곳</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="home-section">
          <h3 className="section-title">최근 본 식당</h3>
          <div className="recent-row">
            {recent.map((r) => {
              const st = openStatus(r, now);
              const walk = walkById.get(r.id);
              return (
                <button key={r.id} className="recent-card" onClick={() => onSelect(r.id)}>
                  <span className="recent-thumb" aria-hidden>
                    {CUISINE_EMOJI[r.cuisine]}
                    {st.state !== 'unknown' && (
                      <span className="recent-state" style={{ background: OPEN_STATE_COLOR[st.state] }}>
                        {st.label}
                      </span>
                    )}
                  </span>
                  <strong className="recent-name">{r.name}</strong>
                  <span className="small recent-meta">
                    {formatWon(r.priceRange[0])}~{walk != null && ` · ${walk}분`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="home-section">{ticker}</section>

      <section className="home-section">
        <div className="section-head">
          <h3 className="section-title">📍 지금 영업 중 · 가까운 매장</h3>
          <button className="link-more" onClick={onSeeAll}>
            전체보기 ›
          </button>
        </div>
        <div className="card-list">{nearby}</div>
      </section>
    </div>
  );
}
