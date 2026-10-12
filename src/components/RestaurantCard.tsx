import { CONCEPT_LABELS, CUISINE_EMOJI, TASTE_TAG_LABELS, WAIT_LABELS, hasDelivery, type Restaurant } from '../types';
import { formatWon } from '../lib/links';
import { timeAgo, waitText, type ReportSummary } from '../lib/reports';
import { OPEN_STATE_COLOR, openStatus } from '../lib/hours';

interface Props {
  r: Restaurant;
  walk: number | null;
  selected: boolean;
  favorite: boolean;
  budget: number;
  summary?: ReportSummary;
  now: number;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

export function RestaurantCard({ r, walk, selected, favorite, budget, summary, now, onSelect, onToggleFavorite }: Props) {
  const live = summary?.liveWait ?? null;
  const liveWait = live ? WAIT_LABELS[live.waitLevel ?? 'unknown'] : null;
  const overBudget = !!r.priceRange && r.priceRange[0] > budget;
  const partlyOver = !!r.priceRange && !overBudget && r.priceRange[1] > budget;
  const wait = WAIT_LABELS[r.waiting.level];
  const s = r.seating;
  const hours = openStatus(r, now);

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
          {r.priceRange ? (
            <>
              {formatWon(r.priceRange[0])}
              {r.priceRange[1] !== r.priceRange[0] && <> ~ {formatWon(r.priceRange[1])}</>}
            </>
          ) : (
            <span className="small">가격 미확인</span>
          )}
          {overBudget && <span className="badge danger">예산 초과</span>}
          {partlyOver && <span className="badge warn">일부 메뉴 초과</span>}
        </div>
        <div className="signature">{r.signature.slice(0, 3).join(' · ')}</div>
      </div>

      <div className="card-foot">
        {hours.state !== 'unknown' && (
          <span
            className="badge"
            title={hours.detail}
            style={{ borderColor: OPEN_STATE_COLOR[hours.state], color: OPEN_STATE_COLOR[hours.state] }}
          >
            {hours.label}
          </span>
        )}
        {live && liveWait ? (
          <span className="badge live" style={{ borderColor: liveWait.color, color: liveWait.color }}>
            🔴 {timeAgo(live.createdAt, now)} {waitText(live) || liveWait.label}
          </span>
        ) : (
          <span className="badge" style={{ borderColor: wait.color, color: wait.color }}>
            웨이팅 {wait.label}
          </span>
        )}
        {summary && summary.reviewCount > 0 && (
          <span className="badge team" title={`별점 합계 ${summary.totalStars}`}>
            ★ {summary.avgRating!.toFixed(1)} · 후기 {summary.reviewCount}
          </span>
        )}
        {summary && summary.hidden > 0 && (
          <span className="badge tag">
            {TASTE_TAG_LABELS.hidden.emoji} {TASTE_TAG_LABELS.hidden.label} {summary.hidden}
          </span>
        )}
        {summary && summary.classic > 0 && (
          <span className="badge tag">
            {TASTE_TAG_LABELS.classic.emoji} {TASTE_TAG_LABELS.classic.label} {summary.classic}
          </span>
        )}
        {r.reviews.naverRating != null ? (
          <span className="badge">
            네이버 {r.reviews.naverRating.toFixed(1)}
            {r.reviews.naverReviewCount != null && <> ({r.reviews.naverReviewCount.toLocaleString()})</>}
          </span>
        ) : (
          r.reviews.diningcodeRating != null && <span className="badge">다이닝코드 {r.reviews.diningcodeRating.toFixed(1)}</span>
        )}
        {s.group && (
          <span className="badge">
            👥 단체{s.groupSize != null && <> {s.groupSize}명{s.estimated ? '±' : ''}</>}
          </span>
        )}
        {s.room && <span className="badge">🚪 룸</span>}
        {hasDelivery(r, summary?.delivery) && <span className="badge delivery">🛵 배달</span>}
        {r.concepts.slice(0, 2).map((c) => (
          <span key={c} className="badge soft">
            {CONCEPT_LABELS[c].emoji} {CONCEPT_LABELS[c].label}
          </span>
        ))}
      </div>
    </article>
  );
}
