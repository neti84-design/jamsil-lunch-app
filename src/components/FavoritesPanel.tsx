import type { Restaurant } from '../types';
import type { ReportSummary } from '../lib/reports';
import { RestaurantCard } from './RestaurantCard';

interface Props {
  restaurants: Restaurant[];
  walkById: Map<string, number | null>;
  budget: number;
  summaries: Map<string, ReportSummary>;
  now: number;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
}

/** 오른쪽 상단 ⭐ 버튼으로 여는 "관심 저장" 목록 */
export function FavoritesPanel({ restaurants, walkById, budget, summaries, now, onSelect, onToggleFavorite, onClose }: Props) {
  return (
    <aside className="detail" role="dialog" aria-label="관심 저장">
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>⭐ 관심 저장 {restaurants.length}곳</h2>
          <div className="sub">카드의 ☆ 를 누르면 여기에 모여요. 이 기기에만 저장돼요.</div>
        </div>
      </header>
      <div className="detail-body">
        {restaurants.length === 0 ? (
          <div className="empty">
            아직 저장한 곳이 없어요.
            <br />
            마음에 드는 식당 카드의 ☆ 를 눌러보세요.
          </div>
        ) : (
          restaurants.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              walk={walkById.get(r.id) ?? null}
              selected={false}
              favorite
              budget={budget}
              summary={summaries.get(r.id)}
              now={now}
              onSelect={() => onSelect(r.id)}
              onToggleFavorite={() => onToggleFavorite(r.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
