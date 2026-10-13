import type { Restaurant } from '../types';
import { Thumb } from './Thumb';
import { formatWon } from '../lib/links';
import { WEEKDAY_NAMES, kstDay, tasteScore, type DayTheme, type Taste } from '../lib/recommend';
import type { LunchWeather } from '../lib/weather';
import { HScroll } from './HScroll';

interface Props {
  theme: DayTheme;
  weather: LunchWeather | null;
  picks: Restaurant[];
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

/** 오늘의 추천 탭: 오늘 날씨·요일에 맞춘 추천 */
/** 이만큼 닮았으면 "내 취향" 표시 */
const TASTE_MARK = 1.5;

export function TodayPick({ theme, weather, picks, taste, favCount, walkById, now, onSelect, onSeeAll, onVote }: Props) {
  if (picks.length === 0) return null;
  // 내 취향 표시가 붙은 곳을 앞으로 (옆으로 넘기지 않아도 보이게)
  const liked = (r: Restaurant) => tasteScore(r, taste) >= TASTE_MARK;
  const shown = [...picks.filter(liked), ...picks.filter((r) => !liked(r))];
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
        <p className="today-taste small">
          {taste
            ? `⭐ 내 관심매장 ${favCount}곳과 비슷한 메뉴·위치를 더 챙겨 골랐어요`
            : '☆ 관심매장을 저장하면 내 취향에 맞춰 추천해 드려요'}
        </p>
        <HScroll className="recent-row">
          {shown.map((r) => {
            const walk = walkById.get(r.id);
            return (
              <button key={r.id} className="recent-card" onClick={() => onSelect(r.id)}>
                <span className="recent-thumb" aria-hidden>
                  <Thumb r={r} width={108} height={84} />
                  {liked(r) && <span className="recent-state taste-mark">⭐ 내 취향</span>}
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
        <button className="btn sm today-vote" onClick={onVote}>
          🗳️ 이 중에서 투표 만들기
        </button>
      </div>
    </section>
  );
}
