import { useMemo, useState } from 'react';
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

  if (rows.length === 0) return null;
  return (
    <section className="home-section recent-reviews" aria-label="최근 후기">
      <div className="section-head">
        <h3 className="section-title">📝 최근 후기</h3>
        <span className="small">최근 {DAYS}일</span>
      </div>
      <ul className="rr-list">
        {rows.slice(0, shown).map(({ report: r, place }) => (
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
      {rows.length > STEP && (
        <button className="link-more rr-more" onClick={() => setShown((n) => (n >= rows.length ? STEP : n + STEP))}>
          {shown >= rows.length ? '접기 ‹' : `더보기 (${rows.length - shown}) ›`}
        </button>
      )}
    </section>
  );
}
