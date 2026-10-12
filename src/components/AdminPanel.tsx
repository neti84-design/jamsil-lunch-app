import { useState } from 'react';
import type { Restaurant } from '../types';
import { timeAgo, waitText, type Report } from '../lib/reports';

interface Props {
  reports: Report[];
  restaurants: Restaurant[];
  now: number;
  isAdmin: boolean;
  onLogin: (token: string) => Promise<boolean>;
  onLogout: () => void;
  onRemove: (id: string, asAdmin?: boolean) => Promise<unknown>;
  onClose: () => void;
}

/** 관리자 화면: 모든 후기·제보를 한 번에 보고 지우기 */
export function AdminPanel({ reports, restaurants, now, isAdmin, onLogin, onLogout, onRemove, onClose }: Props) {
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'review' | 'wait' | 'tag'>('review');
  const byId = new Map(restaurants.map((r) => [r.id, r]));

  const login = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await onLogin(token.trim());
      setMsg(ok ? null : '비밀번호가 맞지 않아요');
    } catch (e) {
      setMsg('확인 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Report) => {
    if (!confirm('이 글을 삭제할까요? 되돌릴 수 없어요.')) return;
    setBusy(true);
    setMsg(null);
    try {
      await onRemove(r.id, true);
    } catch (e) {
      setMsg('삭제 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const list = reports.filter((r) => r.kind === kind).slice(0, 300);

  return (
    <aside className="detail admin" role="dialog" aria-label="관리자">
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>🛠️ 관리자</h2>
          <div className="sub">모든 후기·제보를 보고 부적절한 글을 지울 수 있어요</div>
        </div>
        {isAdmin && (
          <button className="link" onClick={onLogout}>
            로그아웃
          </button>
        )}
      </header>
      <div className="detail-body">
        {!isAdmin ? (
          <section className="report">
            <h4>관리자 비밀번호</h4>
            <div className="one-line-form">
              <input
                className="mini grow"
                type="password"
                placeholder="비밀번호"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void login()}
              />
              <button className="btn primary sm" disabled={!token.trim() || busy} onClick={login}>
                확인
              </button>
            </div>
            <p className="small">Supabase 의 app_config 테이블 admin_token 값입니다 (schema.sql 참고).</p>
            {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
          </section>
        ) : (
          <>
            <div className="chips">
              {(['review', 'wait', 'tag'] as const).map((k) => (
                <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
                  {k === 'review' ? '후기' : k === 'wait' ? '웨이팅 제보' : '맛집 체크'}{' '}
                  {reports.filter((r) => r.kind === k).length}
                </button>
              ))}
            </div>
            {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
            {list.length === 0 && <p className="small">아직 없어요.</p>}
            <ul className="report-list admin-list">
              {list.map((r) => {
                const rest = byId.get(r.restaurantId);
                return (
                  <li key={r.id}>
                    <div className="admin-row">
                      <div className="grow">
                        <strong>{rest?.name ?? r.restaurantId}</strong>
                        <span className="small"> · {timeAgo(r.createdAt, now)}</span>
                        <div>
                          {r.kind === 'review' && (
                            <>
                              <span className="stars">{'★'.repeat(r.rating ?? 0)}</span> {r.comment}
                            </>
                          )}
                          {r.kind === 'wait' && <>{waitText(r)}</>}
                          {r.kind === 'tag' && <>{r.tag === 'hidden' ? '🤫 숨은맛집' : r.tag === 'fav' ? '⭐ 관심 저장' : '👍 역시맛집'}</>}
                        </div>
                        <div className="small">기기 {r.deviceId?.slice(0, 8) ?? '-'}</div>
                      </div>
                      <button className="btn sm danger" disabled={busy} onClick={() => remove(r)}>
                        삭제
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
