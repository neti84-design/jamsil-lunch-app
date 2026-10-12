import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import {
  CONCEPT_LABELS,
  CUISINE_EMOJI,
  RESERVATION_LABELS,
  WAIT_LABELS,
  type Restaurant,
} from '../types';
import { formatWon, kakaoMapLink, naverBlogSearchLink, naverMapLink, telLink } from '../lib/links';
import { ReportPanel } from './ReportPanel';
import { OPEN_STATE_COLOR, openStatus } from '../lib/hours';
import { useTileStatus } from '../hooks/useTileStatus';
import type { LocalReason, NewReport, Report, ReportSummary } from '../lib/reports';

interface Props {
  r: Restaurant;
  walk: number | null;
  favorite: boolean;
  budget: number;
  reports: Report[];
  summary?: ReportSummary;
  reportMode: 'supabase' | 'local';
  reportLocalReason?: LocalReason;
  now: number;
  isAdmin: boolean;
  onAddReport: (r: NewReport) => Promise<unknown>;
  onRemoveReport: (id: string, asAdmin?: boolean) => Promise<unknown>;
  onClose: () => void;
  onToggleFavorite: () => void;
}

const REPO_ISSUES = 'https://github.com/neti84-design/jamsil-lunch-app/issues/new';

export function RestaurantDetail({
  r,
  walk,
  favorite,
  budget,
  reports,
  summary,
  reportMode,
  reportLocalReason,
  now,
  isAdmin,
  onAddReport,
  onRemoveReport,
  onClose,
  onToggleFavorite,
}: Props) {
  const wait = WAIT_LABELS[r.waiting.level];
  const res = RESERVATION_LABELS[r.reservation.method];
  const hasCoords = r.lat != null && r.lng != null;
  const tiles = useTileStatus();
  const hours = openStatus(r, now);
  const icon = L.divIcon({ className: 'pin selected', html: `<span>${CUISINE_EMOJI[r.cuisine]}</span>`, iconSize: [34, 34], iconAnchor: [17, 34] });

  return (
    <aside className="detail" role="dialog" aria-label={`${r.name} 상세`}>
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>
            {CUISINE_EMOJI[r.cuisine]} {r.name}
            {r.branch && <span className="branch"> {r.branch}</span>}
          </h2>
          <div className="sub">
            {r.cuisine} · {r.subcategory}
            {walk != null && <> · 잠실역 도보 {walk}분</>}
            {r.nearestExit && <> ({r.nearestExit})</>}
          </div>
        </div>
        <button className={'fav big' + (favorite ? ' on' : '')} onClick={onToggleFavorite} aria-label="찜">
          {favorite ? '★' : '☆'}
        </button>
      </header>

      <div className="detail-body">
        {hasCoords ? (
          <div className="mini-map">
            <MapContainer center={[r.lat!, r.lng!]} zoom={16} scrollWheelZoom={false} dragging={false} zoomControl={false} attributionControl={false} style={{ height: 180 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={tiles.handlers} />
              <Marker position={[r.lat!, r.lng!]} icon={icon} />
            </MapContainer>
            {tiles.blocked && <div className="note">※ 이 환경에서는 지도 타일이 차단되어 위치 핀만 표시됩니다.</div>}
            {r.approxLocation && <div className="note">※ 좌표는 주소 기준 근사치입니다. 정확한 위치는 네이버지도에서 확인하세요.</div>}
          </div>
        ) : (
          <div className="note">좌표 미등록 — 아래 네이버지도 버튼으로 확인하세요.</div>
        )}

        <div className="actions">
          <a className="btn naver" href={naverMapLink(r)} target="_blank" rel="noreferrer">
            네이버지도
          </a>
          <a className="btn kakao" href={kakaoMapLink(r)} target="_blank" rel="noreferrer">
            카카오맵
          </a>
          {r.phone ? (
            <a className="btn" href={telLink(r.phone)}>
              📞 {r.phone}
            </a>
          ) : (
            <span className="btn disabled">📞 번호 미확인</span>
          )}
        </div>

        <ReportPanel
          restaurantId={r.id}
          reports={reports}
          summary={summary}
          mode={reportMode}
          localReason={reportLocalReason}
          now={now}
          isAdmin={isAdmin}
          onAdd={onAddReport}
          onRemove={onRemoveReport}
        />

        <section>
          <h4>💰 가격</h4>
          <p className="price">
            인당 {formatWon(r.priceRange[0])}
            {r.priceRange[1] !== r.priceRange[0] && <> ~ {formatWon(r.priceRange[1])}</>}
            {r.priceRange[0] > budget && <span className="badge danger">예산 {formatWon(budget)} 초과</span>}
          </p>
          {r.menu.length > 0 && (
            <ul className="menu">
              {r.menu.map((m) => (
                <li key={m.name} className={m.price > budget ? 'over' : ''}>
                  <span>{m.name}</span>
                  <span>{formatWon(m.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="two-col">
          <div>
            <h4>⏳ 평소 웨이팅 (후기 기준)</h4>
            <p>
              <span className="badge" style={{ borderColor: wait.color, color: wait.color }}>
                {wait.label}
              </span>
              {r.waiting.peak && <> 피크 {r.waiting.peak}</>}
            </p>
            {r.waiting.notes && <p className="small">{r.waiting.notes}</p>}
          </div>
          <div>
            <h4>📅 예약</h4>
            <p>
              <strong>{res.label}</strong>
              <br />
              <span className="small">{r.reservation.notes ?? res.desc}</span>
            </p>
          </div>
        </section>

        <section className="two-col">
          <div>
            <h4>🪑 좌석·편의</h4>
            <p>
              {r.seating.group && (
                <span className="badge">
                  👥 단체석{r.seating.groupSize != null && <> 최대 {r.seating.groupSize}명{r.seating.estimated ? ' (추정)' : ''}</>}
                </span>
              )}
              {r.seating.room === true && <span className="badge">🚪 룸 있음</span>}
              {r.seating.room === false && <span className="badge soft">룸 없음</span>}
              {r.seating.room == null && <span className="badge soft">룸 미확인</span>}
              {r.seating.solo && <span className="badge">🧑 혼밥 OK</span>}
              {r.seating.group == null && r.seating.solo == null && <span className="small">정보 없음</span>}
            </p>
            {r.seating.notes && <p className="small">{r.seating.notes}</p>}
            {r.seating.estimated && r.seating.group && (
              <p className="small">단체 인원은 후기 기반 추정값이에요. 단체 방문 전 전화로 확인하세요.</p>
            )}
          </div>
          <div>
            <h4>🏷️ 방문 목적</h4>
            <p>
              {r.concepts.map((c) => (
                <span key={c} className="badge soft">
                  {CONCEPT_LABELS[c].emoji} {CONCEPT_LABELS[c].label}
                </span>
              ))}
            </p>
          </div>
        </section>

        <section>
          <h4>🕒 영업</h4>
          {hours.state !== 'unknown' && (
            <p className="open-now">
              <strong style={{ color: OPEN_STATE_COLOR[hours.state] }}>{hours.label}</strong>
              {hours.detail && <span className="small"> · {hours.detail}</span>}
            </p>
          )}
          <p className="small">
            {r.hours ?? '영업시간 미확인'}
            {r.breakTime && <> · 브레이크 {r.breakTime}</>}
            {r.closedDays && <> · 휴무 {r.closedDays}</>}
          </p>
          {r.address && <p className="small">📍 {r.address}</p>}
        </section>

        <section>
          <h4>⭐ 리뷰</h4>
          <p>
            {r.reviews.naverRating != null ? (
              <>
                네이버 {r.reviews.naverRating.toFixed(1)}
                {r.reviews.naverReviewCount != null && <> · 리뷰 {r.reviews.naverReviewCount.toLocaleString()}개</>}
              </>
            ) : (
              <span className="small">네이버 평점 미수집</span>
            )}
            {r.reviews.kakaoRating != null && <> · 카카오 {r.reviews.kakaoRating.toFixed(1)}</>}
            {r.reviews.diningcodeRating != null && <> · 다이닝코드 {r.reviews.diningcodeRating.toFixed(1)}</>}
          </p>
          {r.reviews.summary && <p>{r.reviews.summary}</p>}
          {r.reviews.highlights && r.reviews.highlights.length > 0 && (
            <ul className="highlights">
              {r.reviews.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          <p className="small">
            <a href={naverBlogSearchLink(r)} target="_blank" rel="noreferrer">
              네이버 블로그 후기 보기 →
            </a>
          </p>
        </section>

        {r.dataNotes && (
          <section>
            <h4>ℹ️ 참고</h4>
            <p className="small">{r.dataNotes}</p>
          </section>
        )}

        <footer className="detail-foot small">
          정보가 틀렸나요?{' '}
          <a href={`${REPO_ISSUES}?title=${encodeURIComponent(`[정보 수정] ${r.name}`)}`} target="_blank" rel="noreferrer">
            수정 제안하기
          </a>
        </footer>
      </div>
    </aside>
  );
}
