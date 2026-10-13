import type { Restaurant } from '../types';
import { Thumb } from './Thumb';
import { formatWon } from '../lib/links';
import { WEEKDAY_NAMES, kstDay, type DayTheme, type Taste } from '../lib/recommend';
import type { LunchWeather } from '../lib/weather';
import { HScroll } from './HScroll';

interface Props {
  theme: DayTheme;
  weather: LunchWeather | null;
  /** 날씨·요일에 맞춘 추천 */
  picks: Restaurant[];
  /** 내 관심매장과 닮은 곳 (날씨 추천과 안 겹침) */
  tastePicks: Restaurant[];
  /** 내 관심매장 취향 (없으면 null) */
  taste: Taste | null;
  favCount: number;
  walkById: Map<string, number | null>;
  now: number;
  onSelect: (id: string) => void;
  /** 이 주제로 검색 목록 보기 */
  onSeeAll: () => void;
  /** 추천 식당으로 바로 투표 만들기 */
  onVote: () => void;
}

/** 옆으로 넘기는 추천 카드 한 줄 */
function PickRow({ list, walkById, onSelect }: { list: Restaurant[]; walkById: Map<string, number | null>; onSelect: (id: string) => void }) {
  return (
    <HScroll className="recent-row">
      {list.map((r) => {
        const walk = walkById.get(r.id);
        return (
          <button key={r.id} className="recent-card" onClick={() => onSelect(r.id)}>
            <span className="recent-thumb" aria-hidden>
              <Thumb r={r} width={108} height={84} />
            </span>
            <strong className="recent-name">{r.name}</strong>
            <span className="small recent-meta">
              {r.priceRange ? `${formatWon(r.priceRange[0])}~` : r.subcategory}
              {walk != null && ` · ${walk}분`}
            </span>
          </button>
        );
      })}
    </HScroll>
  );
}

/** 오늘의 추천 탭: 날씨·요일 추천 한 줄 + 내 취향 추천 한 줄 */
export function TodayPick({ theme, weather, picks, tastePicks, taste, favCount, walkById, now, onSelect, onSeeAll, onVote }: Props) {
  if (picks.length === 0 && tastePicks.length === 0) return null;
  return (
    <section className="home-section" aria-label="오늘의 추천">
      <div className="section-head">
        <h3 className="section-title">
          {theme.emoji} 오늘의 추천
        </h3>
        <button className="link-more" onClick={onSeeAll}>
          더보기 ›
        </button>
      </div>
      <div className="today-box">
        <p className="today-reason">
          {weather && (
            <span className="today-weather">
              {weather.emoji} {weather.label} {weather.temp}°
              {weather.rainChance != null && weather.rainChance >= 30 && <> · 비 {weather.rainChance}%</>}
            </span>
          )}
          <span className="today-day">{WEEKDAY_NAMES[kstDay(now)]}요일</span>
          <strong>{theme.reason}</strong>
        </p>
        {picks.length > 0 && <PickRow list={picks} walkById={walkById} onSelect={onSelect} />}

        <div className="today-sub">
          <h4>⭐ 내 취향 추천</h4>
          <span className="small">
            {taste ? `관심매장 ${favCount}곳과 비슷한 메뉴·위치` : '관심매장(☆)을 저장하면 내 취향에 맞춰 골라 드려요'}
          </span>
        </div>
        {taste &&
          (tastePicks.length > 0 ? (
            <PickRow list={tastePicks} walkById={walkById} onSelect={onSelect} />
          ) : (
            <p className="small today-empty">지금 조건(예산·도보)에 맞는 비슷한 곳이 아직 없어요</p>
          ))}

        <button className="btn sm today-vote" onClick={onVote}>
          🗳️ 이 중에서 투표 만들기
        </button>
      </div>
    </section>
  );
}
