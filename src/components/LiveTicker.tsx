import { WAIT_LABELS, type Restaurant } from '../types';
import { LIVE_WINDOW_MS, timeAgo, waitText, type Report } from '../lib/reports';

interface Props {
  reports: Report[];
  restaurants: Restaurant[];
  now: number;
  mode: 'supabase' | 'local';
  onSelect: (id: string) => void;
}

const MAX_ROWS = 5;

/** 실시간 웨이팅 — 세로로 최근 5건 */
export function LiveTicker({ reports, restaurants, now, mode, onSelect }: Props) {
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const live = reports
    .filter((r) => r.kind === 'wait' && now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS && byId.has(r.restaurantId))
    .slice(0, MAX_ROWS);
  return (
    <div className="ticker">
      <div className="ticker-head">
        <span className="ticker-label">🔴 실시간 웨이팅</span>
        {mode === 'local' && <span className="badge warn">공유 미연결</span>}
      </div>
      {live.length === 0 ? (
        <div className="small">아직 제보가 없어요 · 식당 상세에서 "앞에 몇 팀"을 제보하면 여기에 떠요</div>
      ) : (
        <ul className="ticker-list">
          {live.map((r) => {
            const rest = byId.get(r.restaurantId)!;
            const w = WAIT_LABELS[r.waitLevel ?? 'unknown'];
            return (
              <li key={r.id}>
                <button className="ticker-item" onClick={() => onSelect(rest.id)}>
                  <strong className="ticker-name">{rest.name}</strong>
                  <span className="ticker-wait" style={{ color: w.color }}>
                    {waitText(r) || w.label}
                  </span>
                  <span className="small ticker-time">{timeAgo(r.createdAt, now)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
