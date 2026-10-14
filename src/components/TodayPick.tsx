import { useState } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { Thumb } from './Thumb';
import { formatWon } from '../lib/links';
import { WEEKDAY_NAMES, kstDay, type DayTheme, type Taste } from '../lib/recommend';
import type { LunchWeather } from '../lib/weather';
import { useSite } from '../lib/sites';
import { shareWithApp } from '../lib/share';
import { ShareButton } from './ShareButton';

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
  /** 추천 기본 조건: 인당 예산(원)·도보(분) */
  budget: number;
  walk: number;
  /** 다른 추천 묶음이 더 있나 */
  canRefresh: boolean;
  onSelect: (id: string) => void;
  /** 다른 추천 묶음 보기 */
  onRefresh: () => void;
  /** 이 주제로 검색 목록 보기 */
  onSeeAll: () => void;
  /** 추천 식당으로 바로 투표 만들기 */
  onVote: () => void;
}

function metaOf(r: Restaurant, walk: number | null | undefined) {
  return (
    <>
      {r.priceRange ? `${formatWon(r.priceRange[0])}~` : r.subcategory}
      {walk != null && ` · ${walk}분`}
    </>
  );
}

/** 한눈에 보는 추천 카드 묶음 (3칸 격자) */
function PickGrid({ list, walkById, onSelect }: { list: Restaurant[]; walkById: Map<string, number | null>; onSelect: (id: string) => void }) {
  return (
    <div className="today-grid">
      {list.map((r) => (
        <button key={r.id} className="today-card" onClick={() => onSelect(r.id)}>
          <span className="today-thumb" aria-hidden>
            <Thumb r={r} width={120} height={90} />
          </span>
          <strong className="recent-name">{r.name}</strong>
          <span className="small recent-meta">{metaOf(r, walkById.get(r.id))}</span>
        </button>
      ))}
    </div>
  );
}

/** 오늘의 추천 탭: 날씨·요일 추천 + 내 취향 추천. 랜덤으로 딱 한 곳만 골라 볼 수도 있다 */
export function TodayPick({
  theme,
  weather,
  picks,
  tastePicks,
  taste,
  favCount,
  walkById,
  now,
  budget,
  walk,
  canRefresh,
  onSelect,
  onRefresh,
  onSeeAll,
  onVote,
}: Props) {
  /** 랜덤으로 뽑은 한 곳 (없으면 전체 보기) */
  const [luckyId, setLuckyId] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const site = useSite();
  if (picks.length === 0 && tastePicks.length === 0) return null;

  const pool = picks.length > 0 ? picks : tastePicks;
  const lucky = luckyId ? pool.find((r) => r.id === luckyId) ?? null : null;
  const draw = () => {
    // 방금 뽑힌 곳은 빼고 (한 곳뿐이면 그대로)
    const others = pool.length > 1 ? pool.filter((r) => r.id !== luckyId) : pool;
    setLuckyId(others[Math.floor(Math.random() * others.length)].id);
  };
  /** 지금 보이는 추천 전체(랜덤으로 뽑았으면 그 한 곳)를 글로 묶어 공유 */
  const share = async () => {
    const line = (r: Restaurant, i: number) => {
      const w = walkById.get(r.id);
      const facts = [r.priceRange ? `${formatWon(r.priceRange[0])}~` : r.subcategory, w != null && `도보 ${w}분`].filter(Boolean);
      return `${i + 1}. ${CUISINE_EMOJI[r.cuisine]} ${r.name}${r.branch ? ' ' + r.branch : ''} · ${facts.join(' · ')}`;
    };
    const head = [
      `${theme.emoji} 오늘의 점심 추천 (${WEEKDAY_NAMES[kstDay(now)]}요일${weather ? ` · ${weather.emoji} ${weather.label} ${weather.temp}°` : ''})`,
      theme.reason,
    ];
    const body = lucky
      ? ['🎲 오늘 점심은 여기!', line(lucky, 0)]
      : [
          ...(picks.length ? ['', ...picks.map(line)] : []),
          ...(taste && tastePicks.length ? ['', '♥ 내 취향 추천', ...tastePicks.map(line)] : []),
        ];
    setShareMsg(await shareWithApp({ text: [...head, ...body].join('\n'), site: site.id }));
  };
  const refresh = () => {
    setLuckyId(null);
    onRefresh();
  };

  return (
    <section className="home-section" aria-label="오늘의 추천">
      <div className="section-head">
        <h3 className="section-title">
          {theme.emoji} 오늘의 추천
        </h3>
        <span className="section-head-actions">
          <ShareButton onClick={() => void share()} label="오늘의 추천 공유하기" />
          <button className="link-more" onClick={onSeeAll}>
            더보기 ›
          </button>
        </span>
      </div>
      <div className="today-box">
        <p className="small today-note">
          기본 조건값으로 설정됩니다 (도보 {walk}분, {budget / 10000}만원 예산)
        </p>
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

        <div className="today-actions">
          {lucky ? (
            <button className="btn sm" onClick={() => setLuckyId(null)}>
              전체 보기
            </button>
          ) : (
            canRefresh && (
              <button className="btn sm" onClick={refresh}>
                🔄 새로고침
              </button>
            )
          )}
          <button className="btn sm primary" onClick={draw}>
            🎲 {lucky ? '다시 뽑기' : '랜덤뽑기'}
          </button>
        </div>
        {shareMsg && <p className="small share-msg">{shareMsg}</p>}

        {lucky ? (
          <button className="today-lucky" onClick={() => onSelect(lucky.id)}>
            <span className="today-lucky-thumb" aria-hidden>
              <Thumb r={lucky} width={320} height={180} />
            </span>
            <span className="small today-lucky-label">오늘 점심은 여기!</span>
            <strong className="today-lucky-name">{lucky.name}</strong>
            <span className="small">
              {lucky.subcategory} · {metaOf(lucky, walkById.get(lucky.id))}
            </span>
          </button>
        ) : (
          <>
            {picks.length > 0 && <PickGrid list={picks} walkById={walkById} onSelect={onSelect} />}

            <div className="today-sub">
              <h4>♥ 내 취향 추천</h4>
              <span className="small">
                {taste ? `찜한 식당 ${favCount}곳과 비슷한 메뉴·위치` : '식당을 찜(♡)하면 내 취향에 맞춰 골라 드려요'}
              </span>
            </div>
            {taste &&
              (tastePicks.length > 0 ? (
                <PickGrid list={tastePicks} walkById={walkById} onSelect={onSelect} />
              ) : (
                <p className="small today-empty">기본 조건(예산·도보)에 맞는 비슷한 곳이 아직 없어요</p>
              ))}

            <button className="btn sm today-vote" onClick={onVote}>
              🗳️ 이 중에서 투표 만들기
            </button>
          </>
        )}
      </div>
    </section>
  );
}
