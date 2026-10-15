import { useState } from 'react';
import { TASTE_TAG_LABELS, type TasteTag } from '../types';
import {
  deviceId,
  levelFromNumbers,
  timeAgo,
  type LocalReason,
  type NewReport,
  type Report,
  type ReportSummary,
  type ReportTag,
} from '../lib/reports';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

interface Props {
  restaurantId: string;
  reports: Report[];
  summary?: ReportSummary;
  mode: 'supabase' | 'local';
  localReason?: LocalReason;
  now: number;
  isAdmin: boolean;
  onAdd: (r: NewReport) => Promise<unknown>;
  onRemove: (id: string, asAdmin?: boolean) => Promise<unknown>;
}

const LOCAL_REASON_LABEL: Record<LocalReason, string> = {
  unset: '키 없음',
  'invalid-url': 'URL 형식 오류',
  'init-failed': '연결 초기화 실패',
};

/** 줄 서 있는 사람이 한 손으로 한 번에 누르는 웨이팅 단추 */
const WAIT_QUICK: { label: string; teams: number | null; minutes: number | null }[] = [
  { label: '바로 입장', teams: 0, minutes: null },
  { label: '약 5분', teams: null, minutes: 5 },
  { label: '약 10분', teams: null, minutes: 10 },
  { label: '약 20분', teams: null, minutes: 20 },
  { label: '30분 이상', teams: null, minutes: 30 },
];

export function ReportPanel({ restaurantId, reports, summary, mode, localReason, now, isAdmin, onAdd, onRemove }: Props) {
  const me = deviceId();
  const mine = reports.filter((r) => r.restaurantId === restaurantId);
  const reviews = mine.filter((r) => r.kind === 'review');

  /** 방금 보낸 웨이팅 버튼 (잠깐 ✓ 표시) */
  const [sent, setSent] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'wait' | 'review' | 'tag' | 'del' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<unknown>, failLabel: string) => {
    if (busy) return;
    setBusy(kind);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(`${failLabel}: ${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const submitWait = (q: (typeof WAIT_QUICK)[number]) =>
    run(
      'wait',
      async () => {
        const level = levelFromNumbers(q.teams, q.minutes);
        if (!level) return;
        await onAdd({ restaurantId, kind: 'wait', waitLevel: level, waitTeams: q.teams, waitMinutes: q.minutes });
        setSent(q.label);
        setTimeout(() => setSent((cur) => (cur === q.label ? null : cur)), 3000);
      },
      '제보 실패',
    );

  const submitReview = () =>
    run(
      'review',
      async () => {
        if (!rating) return;
        await onAdd({ restaurantId, kind: 'review', rating, comment: comment.trim() || null });
        setRating(0);
        setComment('');
      },
      '후기 등록 실패',
    );

  const toggleTag = (tag: Exclude<ReportTag, 'fav'>) =>
    run(
      'tag',
      async () => {
        const existing = summary?.myTags[tag];
        if (existing) await onRemove(existing);
        else await onAdd({ restaurantId, kind: 'tag', tag });
      },
      '체크 실패',
    );

  const remove = (r: Report) =>
    run(
      'del',
      async () => {
        const own = r.deviceId === me;
        if (!own && !isAdmin) return;
        if (!own && !confirm('관리자 권한으로 이 후기를 삭제할까요?')) return;
        await onRemove(r.id, !own);
      },
      '삭제 실패',
    );

  return (
    <>
      <section className="report">
        <h4>
          🔴 지금 웨이팅 알려주기
          {mode === 'local' && (
            <span className="badge warn" title="Supabase 키를 설정하면 팀원과 공유됩니다">
              이 기기에만 저장{localReason ? ` · ${LOCAL_REASON_LABEL[localReason]}` : ''}
            </span>
          )}
        </h4>
        <p className="small">줄 서 있다면 한 번만 눌러 주세요. 3시간 동안 다른 사람에게 보여요.</p>
        <div className="chips wait-quick">
          {WAIT_QUICK.map((q) => (
            <button
              key={q.label}
              className={'chip' + (sent === q.label ? ' on' : '')}
              disabled={busy === 'wait'}
              onClick={() => submitWait(q)}
            >
              {sent === q.label ? '✓ ' : ''}
              {q.label}
            </button>
          ))}
        </div>
      </section>

      <section className="report">
        <h4>
          💬 한 줄 후기 {reviews.length > 0 && <span className="badge">{reviews.length}개</span>}
          {isAdmin && <span className="badge team">관리자</span>}
        </h4>
        {reviews.length === 0 && <p className="small">아직 후기가 없어요. 별점만 남겨도 돼요.</p>}
        <ul className="report-list">
          {reviews.slice(0, 20).map((r) => {
            const own = r.deviceId === me;
            return (
              <li key={r.id} className={own ? 'own' : ''}>
                <span className="stars">{'★'.repeat(r.rating ?? 0)}</span>
                {r.comment && <> {r.comment}</>}
                <span className="small">
                  {' '}
                  · {timeAgo(r.createdAt, now)}
                  {own && <span className="badge mine">내 후기</span>}
                </span>
                {(own || isAdmin) && (
                  <button className="link del" disabled={busy === 'del'} onClick={() => remove(r)} aria-label="후기 삭제">
                    삭제
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="small">🍽️ 먹어봤다면 체크 (다시 누르면 취소)</p>
        <div className="chips">
          {(Object.keys(TASTE_TAG_LABELS) as TasteTag[]).map((tag) => {
            const on = !!summary?.myTags[tag];
            const count = summary?.[tag] ?? 0;
            return (
              <button
                key={tag}
                className={'chip tag' + (on ? ' on' : '')}
                title={TASTE_TAG_LABELS[tag].desc}
                disabled={busy === 'tag'}
                onClick={() => toggleTag(tag)}
              >
                {TASTE_TAG_LABELS[tag].emoji} {TASTE_TAG_LABELS[tag].label} <strong>{count}</strong>
              </button>
            );
          })}
        </div>
        <div className="review-form">
          <span className="stars-input" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={'star-btn' + (n <= rating ? ' on' : '')} onClick={() => setRating(n)} aria-label={`${n}점`}>
                ★
              </button>
            ))}
          </span>
          <input
            className="mini grow"
            maxLength={300}
            placeholder="한 줄 후기 (예: 제육 양 많음, 12시 10분 5분 대기)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitReview();
            }}
          />
          <button className="btn primary sm" disabled={!rating || busy === 'review'} onClick={submitReview}>
            {busy === 'review' ? '…' : '등록'}
          </button>
        </div>
        {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
      </section>
    </>
  );
}
