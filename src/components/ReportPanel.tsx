import { useState } from 'react';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
import { WAIT_LABELS, type WaitLevel } from '../types';
import { LIVE_WINDOW_MS, loadNickname, saveNickname, timeAgo, type NewReport, type Report } from '../lib/reports';

interface Props {
  restaurantId: string;
  reports: Report[];
  mode: 'supabase' | 'local';
  now: number;
  onAdd: (r: NewReport) => Promise<unknown>;
}

const LEVELS: Exclude<WaitLevel, 'unknown'>[] = ['low', 'medium', 'high'];

export function ReportPanel({ restaurantId, reports, mode, now, onAdd }: Props) {
  const mine = reports.filter((r) => r.restaurantId === restaurantId);
  const waits = mine.filter((r) => r.kind === 'wait').slice(0, 5);
  const reviews = mine.filter((r) => r.kind === 'review');
  const live = waits.find((r) => now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS);

  const [nick, setNick] = useState(loadNickname);
  const [level, setLevel] = useState<Exclude<WaitLevel, 'unknown'> | null>(null);
  const [minutes, setMinutes] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'wait' | 'review' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submitWait = async () => {
    if (!level || busy) return;
    setBusy('wait');
    setErr(null);
    try {
      saveNickname(nick);
      await onAdd({
        restaurantId,
        kind: 'wait',
        waitLevel: level,
        waitMinutes: minutes ? Number(minutes) : null,
        nickname: nick || null,
      });
      setLevel(null);
      setMinutes('');
    } catch (e) {
      setErr('제보 실패: ' + errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const submitReview = async () => {
    if (!rating || busy) return;
    setBusy('review');
    setErr(null);
    try {
      saveNickname(nick);
      await onAdd({ restaurantId, kind: 'review', rating, comment: comment.trim() || null, nickname: nick || null });
      setRating(0);
      setComment('');
    } catch (e) {
      setErr('후기 등록 실패: ' + errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="report">
        <h4>
          🔴 실시간 웨이팅 제보
          {mode === 'local' && (
            <span className="badge warn" title="Supabase 키를 설정하면 팀원과 공유됩니다">
              이 기기에만 저장
            </span>
          )}
        </h4>
        {live ? (
          <p className="live-now">
            <strong style={{ color: WAIT_LABELS[live.waitLevel!].color }}>{WAIT_LABELS[live.waitLevel!].label}</strong>
            {live.waitMinutes != null && <> · 약 {live.waitMinutes}분</>} · {timeAgo(live.createdAt, now)}
            {live.nickname && <span className="small"> · {live.nickname}</span>}
          </p>
        ) : (
          <p className="small">최근 3시간 안에 제보가 없어요. 지금 가셨다면 알려주세요!</p>
        )}
        {waits.length > 1 && (
          <ul className="report-list">
            {waits.slice(1).map((r) => (
              <li key={r.id}>
                <span style={{ color: WAIT_LABELS[r.waitLevel!].color }}>{WAIT_LABELS[r.waitLevel!].label}</span>
                {r.waitMinutes != null && <> {r.waitMinutes}분</>} · {timeAgo(r.createdAt, now)}
                {r.nickname && <span className="small"> · {r.nickname}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="report-form">
          <div className="chips">
            {LEVELS.map((l) => (
              <button key={l} className={'chip' + (level === l ? ' on' : '')} onClick={() => setLevel(l)}>
                {WAIT_LABELS[l].label}
              </button>
            ))}
            <input
              className="mini"
              type="number"
              min={0}
              max={180}
              placeholder="분"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="chips">
            <input className="mini wide" placeholder="닉네임(선택)" maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} />
            <button className="btn primary sm" disabled={!level || busy === 'wait'} onClick={submitWait}>
              {busy === 'wait' ? '보내는 중…' : '지금 웨이팅 제보'}
            </button>
          </div>
        </div>
      </section>

      <section className="report">
        <h4>
          💬 팀 후기 {reviews.length > 0 && <span className="badge">{reviews.length}개</span>}
        </h4>
        {reviews.length === 0 && <p className="small">아직 후기가 없어요. 첫 후기를 남겨주세요.</p>}
        <ul className="report-list">
          {reviews.slice(0, 10).map((r) => (
            <li key={r.id}>
              <span className="stars">{'★'.repeat(r.rating ?? 0)}</span>
              {r.comment && <> {r.comment}</>}
              <span className="small">
                {' '}
                · {r.nickname || '익명'} · {timeAgo(r.createdAt, now)}
              </span>
            </li>
          ))}
        </ul>
        <div className="report-form">
          <div className="chips" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={'star-btn' + (n <= rating ? ' on' : '')}
                onClick={() => setRating(n)}
                aria-label={`${n}점`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            maxLength={300}
            placeholder="한 줄 후기 (예: 12시 10분 도착, 5분 기다림. 제육 양 많음)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="chips">
            <input className="mini wide" placeholder="닉네임(선택)" maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} />
            <button className="btn primary sm" disabled={!rating || busy === 'review'} onClick={submitReview}>
              {busy === 'review' ? '등록 중…' : '후기 등록'}
            </button>
          </div>
        </div>
        {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
      </section>
    </>
  );
}
