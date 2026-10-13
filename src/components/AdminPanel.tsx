import { useEffect, useState } from 'react';
import type { Restaurant } from '../types';
import { timeAgo, waitText, type Report } from '../lib/reports';
import { TALK_POST_MAX } from '../lib/talk';
import { SITES, useSite, type SiteId } from '../lib/sites';
import { loadRestaurants } from '../data';
import type { Talk } from '../hooks/useTalk';

interface Props {
  reports: Report[];
  now: number;
  isAdmin: boolean;
  onLogin: (token: string) => Promise<boolean>;
  onLogout: () => void;
  onRemove: (id: string, asAdmin?: boolean) => Promise<unknown>;
  onClose: () => void;
  talk: Talk;
}

/** 관리자 화면: 모든 후기·제보를 한 번에 보고 지우기 */
export function AdminPanel({ reports, now, isAdmin, onLogin, onLogout, onRemove, onClose, talk }: Props) {
  const site = useSite();
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'talk' | 'review' | 'wait' | 'tag'>('talk');
  const [postText, setPostText] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  /** 후기·제보가 어느 식당인지 — 두 근무지 식당을 다 받아 와서 이름·근무지·주소로 보여 준다 (관리자 화면에서만) */
  const [byId, setById] = useState(new Map<string, { r: Restaurant; site: SiteId }>());
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const ids = Object.keys(SITES) as SiteId[];
    Promise.all(ids.map((id) => loadRestaurants(id).catch(() => [] as Restaurant[]))).then((lists) => {
      if (!alive) return;
      const m = new Map<string, { r: Restaurant; site: SiteId }>();
      lists.forEach((list, i) => list.forEach((r) => m.set(r.id, { r, site: ids[i] })));
      setById(m);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

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

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(`${label}: ` + (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  const createPost = () => {
    const body = postText.trim();
    if (!body) return;
    void run(async () => {
      await talk.createPost(body, allowComments);
      setPostText('');
    }, '올리기 실패');
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
          <div className="sub">공유톡을 올리고, 모든 후기·제보를 보고 부적절한 글을 지울 수 있어요</div>
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
              <button className={'chip' + (kind === 'talk' ? ' on' : '')} onClick={() => setKind('talk')}>
                💬 공유톡 {talk.posts.length}
              </button>
              {(['review', 'wait', 'tag'] as const).map((k) => (
                <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
                  {k === 'review' ? '후기' : k === 'wait' ? '웨이팅 제보' : '맛집 체크'}{' '}
                  {reports.filter((r) => r.kind === k).length}
                </button>
              ))}
            </div>
            {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
            {kind === 'talk' && (
              <section className="report">
                <h4>공유톡 올리기 · {site.label}</h4>
                <p className="small">
                  근무지를 {site.label}(으)로 고른 사람의 홈 검색창 바로 아래에 한 줄로 떠요. 질문이면 댓글을 받고, 단순 공지면 댓글을 닫아
                  두세요. 다른 근무지 글은 오른쪽 위에서 근무지를 바꿔서 올리고 관리해요.
                </p>
                <div className="one-line-form">
                  <input
                    className="mini grow"
                    placeholder="예: 롯데 임직원 할인되는 곳 알려주세요~!"
                    maxLength={TALK_POST_MAX}
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createPost()}
                  />
                  <button className="btn primary sm" disabled={busy || !postText.trim()} onClick={createPost}>
                    올리기
                  </button>
                </div>
                <label className="small talk-allow">
                  <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} /> 댓글 받기
                  {!allowComments && ' (꺼두면 단순 공지)'}
                </label>
                {talk.mode === 'local' && <p className="small">⚠️ Supabase 미연결 — 이 기기에만 저장돼요.</p>}
                {talk.error && <p className="small" style={{ color: 'var(--danger)' }}>{talk.error} (supabase/schema.sql v4 실행 필요)</p>}
                <ul className="report-list admin-list">
                  {talk.posts.map((p) => {
                    const n = talk.comments.filter((c) => c.postId === p.id).length;
                    return (
                      <li key={p.id}>
                        <div className="admin-row">
                          <div className="grow">
                            {p.allowComments ? '🙋' : '📢'} <strong>{p.body}</strong>
                            <div className="small">
                              {timeAgo(p.createdAt, now)} · {p.allowComments ? `댓글 받는 중 · ${n}개` : `댓글 닫힘${n ? ` · ${n}개` : ''}`}
                            </div>
                          </div>
                          <button
                            className="btn sm"
                            disabled={busy}
                            onClick={() => void run(() => talk.setPostComments(p.id, !p.allowComments), '변경 실패')}
                          >
                            {p.allowComments ? '댓글 닫기' : '댓글 열기'}
                          </button>
                          <button
                            className="btn sm danger"
                            disabled={busy}
                            onClick={() => confirm('이 공유톡을 댓글까지 모두 지울까요?') && void run(() => talk.removePost(p.id), '삭제 실패')}
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {kind !== 'talk' && list.length === 0 && <p className="small">아직 없어요.</p>}
            <ul className="report-list admin-list">
              {list.map((r) => {
                const hit = byId.get(r.restaurantId);
                const rest = hit?.r;
                return (
                  <li key={r.id}>
                    <div className="admin-row">
                      <div className="grow">
                        {hit && <span className={'admin-site site-' + hit.site}>{SITES[hit.site].label}</span>}
                        <strong>
                          {rest ? rest.name : byId.size ? r.restaurantId : '불러오는 중…'}
                          {rest?.branch && <span className="small"> {rest.branch}</span>}
                        </strong>
                        <span className="small"> · {timeAgo(r.createdAt, now)}</span>
                        {rest?.address && <div className="small">📍 {rest.address}</div>}
                        <div>
                          {r.kind === 'review' && (
                            <>
                              <span className="stars">{'★'.repeat(r.rating ?? 0)}</span> {r.comment}
                            </>
                          )}
                          {r.kind === 'wait' && <>{waitText(r)}</>}
                          {r.kind === 'tag' && <>{r.tag === 'hidden' ? '🤫 숨은맛집' : r.tag === 'fav' ? '⭐ 관심 저장' : r.tag === 'delivery' ? '🛵 배달 돼요' : '👍 역시맛집'}</>}
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
