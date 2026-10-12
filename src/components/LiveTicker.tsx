import { WAIT_LABELS, type Restaurant } from '../types';
import { LIVE_WINDOW_MS, timeAgo, type Report } from '../lib/reports';

interface Props {
  reports: Report[];
  restaurants: Restaurant[];
  now: number;
  mode: 'supabase' | 'local';
  onSelect: (id: string) => void;
}

export function LiveTicker({ reports, restaurants, now, mode, onSelect }: Props) {
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const live = reports
    .filter((r) => r.kind === 'wait' && now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS && byId.has(r.restaurantId))
    .slice(0, 6);
  if (live.length === 0) {
    return (
      <div className="ticker empty">
        🔴 실시간 제보 없음 · 식당 상세에서 웨이팅을 제보하면 여기에 떠요
        {mode === 'local' && <span className="badge warn">공유 미연결</span>}
      </div>
    );
  }
  return (
    <div className="ticker">
      <span className="ticker-label">🔴 실시간</span>
      {live.map((r) => {
        const rest = byId.get(r.restaurantId)!;
        const w = WAIT_LABELS[r.waitLevel!];
        return (
          <button key={r.id} className="ticker-item" onClick={() => onSelect(rest.id)}>
            <strong>{rest.name}</strong> <span style={{ color: w.color }}>{w.label}</span>
            {r.waitMinutes != null && <> {r.waitMinutes}분</>} <span className="small">{timeAgo(r.createdAt, now)}</span>
          </button>
        );
      })}
    </div>
  );
}
