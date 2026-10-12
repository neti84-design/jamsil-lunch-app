import { useState } from 'react';
import { TASTE_TAG_LABELS, WAIT_LABELS, type TasteTag } from '../types';
import {
  LIVE_WINDOW_MS,
  deviceId,
  levelFromNumbers,
  timeAgo,
  waitText,
  type LocalReason,
  type NewReport,
  type Report,
  type ReportSummary,
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

function toInt(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function ReportPanel({ restaurantId, reports, summary, mode, localReason, now, isAdmin, onAdd, onRemove }: Props) {
  const me = deviceId();
  const mine = reports.filter((r) => r.restaurantId === restaurantId);
  const waits = mine.filter((r) => r.kind === 'wait').slice(0, 5);
  const reviews = mine.filter((r) => r.kind === 'review');
  const live = waits.find((r) => now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS);

  const [teams, setTeams] = useState('');
  const [minutes, setMinutes] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'wait' | 'review' | 'tag' | 'del' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const t = toInt(teams);
  const mnt = toInt(minutes);
  const level = levelFromNumbers(t, mnt);

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

  const submitWait = () =>
    run(
      'wait',
      async () => {
        if (!level) return;
        await onAdd({ restaurantId, kind: 'wait', waitLevel: level, waitTeams: t, waitMinutes: mnt });
        setTeams('');
        setMinutes('');
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

  const toggleTag = (tag: TasteTag) =>
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
          🔴 실시간 웨이팅
          {mode === 'local' && (
            <span className="badge warn" title="Supabase 키를 설정하면 팀원과 공유됩니다">
              이 기기에만 저장{localReason ? ` · ${LOCAL_REASON_LABEL[localReason]}` : ''}
            </span>
          )}
        </h4>
        {live ? (
          <p className="live-now">
            <strong style={{ color: WAIT_LABELS[live.waitLevel ?? 'unknown'].color }}>
              {waitText(live) || WAIT_LABELS[live.waitLevel ?? 'unknown'].label}
            </strong>{' '}
            · {timeAgo(live.createdAt, now)}
          </p>
        ) : (
          <p className="small">최근 3시간 안에 제보가 없어요. 지금 줄 서 있다면 알려주세요!</p>
        )}
        {waits.length > 1 && (
          <ul className="report-list">
            {waits.slice(1).map((r) => (
              <li key={r.id}>
                <span style={{ color: WAIT_LABELS[r.waitLevel ?? 'unknown'].color }}>
                  {waitText(r) || WAIT_LABELS[r.waitLevel ?? 'unknown'].label}
                </span>{' '}
                · {timeAgo(r.createdAt, now)}
              </li>
            ))}
          </ul>
        )}
        <div className="one-line-form">
          <span className="small">앞에</span>
          <input
            className="mini"
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            placeholder="0"
            aria-label="앞에 몇 팀"
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
          />
          <span className="small">팀 · 약</span>
          <input
            className="mini"
            type="number"
            inputMode="numeric"
            min={0}
            max={180}
            placeholder="0"
            aria-label="예상 대기 분"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <span className="small">분</span>
          <button className="btn primary sm" disabled={!level || busy === 'wait'} onClick={submitWait}>
            {busy === 'wait' ? '…' : '제보'}
          </button>
        </div>
        {level && (
          <p className="small">
            → 웨이팅 <strong style={{ color: WAIT_LABELS[level].color }}>{WAIT_LABELS[level].label}</strong> 으로 올라가요
          </p>
        )}
      </section>

      <section className="report">
        <h4>🍽️ 먹어봤다면 체크</h4>
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
        <p className="small">한 기기당 한 번씩만 세요. 다시 누르면 취소돼요.</p>
      </section>

      <section className="report">
        <h4>
          💬 한 줄 후기 {reviews.length > 0 && <span className="badge">{reviews.length}개</span>}
          {isAdmin && <span className="badge team">관리자</span>}
        </h4>
        <div className="one-line-form">
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
        {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
      </section>
    </>
  );
}
