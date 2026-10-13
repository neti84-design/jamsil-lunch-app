import { useEffect, useMemo, useRef, useState } from 'react';
import type { Restaurant } from '../types';
import { timeAgo, type Report } from '../lib/reports';

interface Props {
  reports: Report[];
  /** 지금 근무지 식당 (다른 근무지 후기는 안 보여 준다) */
  restaurants: Restaurant[];
  now: number;
  onSelect: (id: string) => void;
}

/** 최근 이만큼 안에 쓴 후기만 */
const DAYS = 3;
/** 한 번에 보여 줄 줄 수 (더보기마다 이만큼 더) */
const STEP = 3;
/** 전광판처럼 한 줄씩 올라가는 간격·속도 */
const ROLL_MS = 3000;
const ROLL_ANIM_MS = 500;

/** 공유톡 아래: 최근 3일 후기 — 매장 이름 → 별점·한 줄. 매장을 누르면 매장 정보로 */
export function RecentReviews({ reports, restaurants, now, onSelect }: Props) {
  const [shown, setShown] = useState(STEP);
  const rows = useMemo(() => {
    const byId = new Map(restaurants.map((r) => [r.id, r]));
    const since = now - DAYS * 86_400_000;
    return reports
      .filter((r) => r.kind === 'review' && byId.has(r.restaurantId) && Date.parse(r.createdAt) >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ report: r, place: byId.get(r.restaurantId)! }));
  }, [reports, restaurants, now]);

  // 접힌 상태에서 줄이 STEP 보다 많으면 병원 대기자 전광판처럼 한 줄씩 위로 올라간다
  const expanded = shown > STEP;
  const roll = !expanded && rows.length > STEP;
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  const paused = useRef(false);
  useEffect(() => {
    if (!roll || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (!paused.current && !document.hidden) setSliding(true);
    }, ROLL_MS);
    return () => clearInterval(t);
  }, [roll]);
  useEffect(() => {
    if (!sliding) return;
    // 한 줄 올라간 뒤 맨 위 줄을 뒤로 돌린다
    const t = setTimeout(() => {
      setOffset((o) => (o + 1) % rows.length);
      setSliding(false);
    }, ROLL_ANIM_MS);
    return () => clearTimeout(t);
  }, [sliding, rows.length]);

  if (rows.length === 0) return null;
  const visible = roll
    ? Array.from({ length: STEP + 1 }, (_, i) => rows[(offset + i) % rows.length])
    : rows.slice(0, shown);
  return (
    <section className="home-section recent-reviews" aria-label="최근 후기">
      <div className="section-head">
        <h3 className="section-title">📝 최근 후기</h3>
        <span className="small">최근 {DAYS}일</span>
      </div>
      <div
        className={'rr-window' + (roll ? ' roll' : '')}
        onPointerEnter={() => (paused.current = true)}
        onPointerLeave={() => (paused.current = false)}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => (paused.current = false)}
      >
        <ul className={'rr-list' + (sliding ? ' sliding' : '')}>
          {visible.map(({ report: r, place }) => (
            <li key={r.id}>
              <button className="rr-row" onClick={() => onSelect(place.id)}>
                <strong className="rr-name">
                  {place.name}
                  {place.branch && <span className="small"> {place.branch}</span>}
                </strong>
                <span className="rr-review">
                  <span className="stars">{'★'.repeat(r.rating ?? 0)}</span>
                  {r.comment && <span className="rr-comment"> {r.comment}</span>}
                </span>
                <span className="rr-time small">{timeAgo(r.createdAt, now)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {rows.length > STEP && (
        // 한 번이라도 펼치면 접기를 바로 옆에 — 조금만 보고 닫을 수 있게
        <div className="rr-more-row">
          {shown < rows.length && (
            <button className="link-more rr-more" onClick={() => setShown((n) => n + STEP)}>
              더보기 ({rows.length - shown}) ›
            </button>
          )}
          {expanded && (
            <button className="link-more rr-more" onClick={() => setShown(STEP)}>
              접기 ‹
            </button>
          )}
        </div>
      )}
    </section>
  );
}
