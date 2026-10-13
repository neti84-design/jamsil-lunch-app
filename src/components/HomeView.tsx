import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Restaurant } from '../types';
import { Thumb } from './Thumb';
import { HScroll } from './HScroll';
import { DISH_EMOJI, DISH_TAGS, dishTags, type DishTag } from '../lib/dish';
import { OPEN_STATE_COLOR, openStatus } from '../lib/hours';
import { formatWon } from '../lib/links';

interface Props {
  /** 공유톡 (홈 맨 위) */
  talk: ReactNode;
  /** 실시간 웨이팅 */
  ticker: ReactNode;
  /** 요즘 관심 · 평점 좋은 매장 카드들 */
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

/** 옆으로 넘기는 줄의 위치 — 식당·건물을 보고 돌아와도 보던 곳에서 이어지게 (홈은 탭을 옮기면 다시 그려진다) */
const scrollXByRow = new Map<string, number>();

function useKeepScrollX(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = scrollXByRow.get(key) ?? 0;
  }, [key]);
  const onScroll = () => {
    if (ref.current) scrollXByRow.set(key, ref.current.scrollLeft);
  };
  return { ref, onScroll };
}

/** 홈: 음식 카테고리 · 주요장소 · 최근 본 식당 · 실시간 웨이팅 · 요즘 관심·평점 좋은 매장 */
export function HomeView({ talk, ticker, nearby, restaurants, recent, buildings, walkById, now, onDish, onBuilding, onSelect, onSeeAll }: Props) {
  const { ref: buildingRef, onScroll: onBuildingScroll } = useKeepScrollX('buildings');
  const { ref: recentRef, onScroll: onRecentScroll } = useKeepScrollX('recent');
  // 옆으로 밀기 힘든 사람을 위해 주요장소를 한 번에 펼쳐 볼 수 있게
  const [allBuildings, setAllBuildings] = useState(false);
  const counts = new Map<DishTag, number>();
  for (const r of restaurants) for (const t of dishTags(r)) counts.set(t, (counts.get(t) ?? 0) + 1);

  return (
    <div className="home">
      {talk}

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
          <div className="section-head">
            <h3 className="section-title">📍 주요장소</h3>
            <button className="link-more" onClick={() => setAllBuildings((v) => !v)} aria-expanded={allBuildings}>
              {allBuildings ? '접기 ‹' : '전체보기 ›'}
            </button>
          </div>
          <HScroll className={'building-row' + (allBuildings ? ' all' : '')} scrollRef={buildingRef} onScroll={onBuildingScroll}>
            {buildings.map((b) => (
              <button key={b.name} className="building-card" onClick={() => onBuilding(b.name)}>
                <span className="building-emoji" aria-hidden>
                  {b.emoji}
                </span>
                <strong>{b.name}</strong>
                <span className="building-count">식당 {b.count}곳</span>
              </button>
            ))}
          </HScroll>
        </section>
      )}

      {recent.length > 0 && (
        <section className="home-section">
          <h3 className="section-title">최근 본 식당</h3>
          <HScroll className="recent-row" scrollRef={recentRef} onScroll={onRecentScroll}>
            {recent.map((r) => {
              const st = openStatus(r, now);
              const walk = walkById.get(r.id);
              return (
                <button key={r.id} className="recent-card" onClick={() => onSelect(r.id)}>
                  <span className="recent-thumb" aria-hidden>
                    <Thumb r={r} width={108} height={84} />
                    {st.state !== 'unknown' && (
                      <span className="recent-state" style={{ background: OPEN_STATE_COLOR[st.state] }}>
                        {st.label}
                      </span>
                    )}
                  </span>
                  <strong className="recent-name">{r.name}</strong>
                  <span className="small recent-meta">
                    {r.priceRange ? `${formatWon(r.priceRange[0])}~` : r.subcategory}{walk != null && ` · ${walk}분`}
                  </span>
                </button>
              );
            })}
          </HScroll>
        </section>
      )}

      <section className="home-section">{ticker}</section>

      <section className="home-section">
        <div className="section-head">
          <h3 className="section-title">🔥 요즘 관심 · 평점 좋은 매장</h3>
          <button className="link-more" onClick={onSeeAll}>
            전체보기 ›
          </button>
        </div>
        <div className="card-list">{nearby}</div>
      </section>
    </div>
  );
}
