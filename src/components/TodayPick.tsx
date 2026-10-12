import { CUISINE_EMOJI, type Restaurant } from '../types';
import { formatWon } from '../lib/links';
import { WEEKDAY_NAMES, kstDay, type DayTheme } from '../lib/recommend';
import type { LunchWeather } from '../lib/weather';

interface Props {
  theme: DayTheme;
  weather: LunchWeather | null;
  picks: Restaurant[];
  walkById: Map<string, number | null>;
  now: number;
  onSelect: (id: string) => void;
  /** 이 주제로 검색 목록 보기 */
  onSeeAll: () => void;
  /** 추천 식당으로 바로 투표 만들기 */
  onVote: () => void;
}

/** 오늘의 추천 탭: 오늘 날씨·요일에 맞춘 추천 */
export function TodayPick({ theme, weather, picks, walkById, now, onSelect, onSeeAll, onVote }: Props) {
  if (picks.length === 0) return null;
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
        <div className="recent-row">
          {picks.map((r) => {
            const walk = walkById.get(r.id);
            return (
              <button key={r.id} className="recent-card" onClick={() => onSelect(r.id)}>
                <span className="recent-thumb" aria-hidden>
                  {CUISINE_EMOJI[r.cuisine]}
                </span>
                <strong className="recent-name">{r.name}</strong>
                <span className="small recent-meta">
                  {r.priceRange ? `${formatWon(r.priceRange[0])}~` : r.subcategory}
                  {walk != null && ` · ${walk}분`}
                </span>
              </button>
            );
          })}
        </div>
        <button className="btn sm today-vote" onClick={onVote}>
          🗳️ 이 중에서 투표 만들기
        </button>
      </div>
    </section>
  );
}
