import { CONCEPT_LABELS, CUISINE_EMOJI, WAIT_LABELS, type Restaurant } from '../types';
import { formatWon } from '../lib/links';

interface Props {
  r: Restaurant;
  walk: number | null;
  selected: boolean;
  favorite: boolean;
  budget: number;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

export function RestaurantCard({ r, walk, selected, favorite, budget, onSelect, onToggleFavorite }: Props) {
  const overBudget = r.priceRange[0] > budget;
  const partlyOver = !overBudget && r.priceRange[1] > budget;
  const wait = WAIT_LABELS[r.waiting.level];

  return (
    <article className={'card' + (selected ? ' selected' : '')} onClick={onSelect}>
      <div className="card-head">
        <span className="cuisine-emoji" aria-hidden>
          {CUISINE_EMOJI[r.cuisine]}
        </span>
        <div className="card-title">
          <h3>
            {r.name}
            {r.branch && <span className="branch"> {r.branch}</span>}
          </h3>
          <div className="sub">
            {r.cuisine} · {r.subcategory}
            {walk != null && <> · 도보 {walk}분</>}
            {r.nearestExit && <> · {r.nearestExit}</>}
          </div>
        </div>
        <button
          className={'fav' + (favorite ? ' on' : '')}
          aria-label={favorite ? '찜 해제' : '찜하기'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>

      <div className="card-body">
        <div className="price">
          {formatWon(r.priceRange[0])}
          {r.priceRange[1] !== r.priceRange[0] && <> ~ {formatWon(r.priceRange[1])}</>}
          {overBudget && <span className="badge danger">예산 초과</span>}
          {partlyOver && <span className="badge warn">일부 메뉴 초과</span>}
        </div>
        <div className="signature">{r.signature.slice(0, 3).join(' · ')}</div>
      </div>

      <div className="card-foot">
        <span className="badge" style={{ borderColor: wait.color, color: wait.color }}>
          웨이팅 {wait.label}
        </span>
        {r.reviews.naverRating != null ? (
          <span className="badge">
            ⭐ {r.reviews.naverRating.toFixed(1)}
            {r.reviews.naverReviewCount != null && <> ({r.reviews.naverReviewCount.toLocaleString()})</>}
          </span>
        ) : (
          r.reviews.diningcodeRating != null && <span className="badge">⭐ {r.reviews.diningcodeRating.toFixed(1)} (다이닝코드)</span>
        )}
        {r.seating.group && <span className="badge">👥 단체</span>}
        {r.seating.solo && <span className="badge">🧑 혼밥</span>}
        {r.concepts.slice(0, 2).map((c) => (
          <span key={c} className="badge soft">
            {CONCEPT_LABELS[c].emoji} {CONCEPT_LABELS[c].label}
          </span>
        ))}
      </div>
    </article>
  );
}
