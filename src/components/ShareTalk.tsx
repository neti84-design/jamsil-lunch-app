import { useLayoutEffect, useRef, useState } from 'react';
import { deviceId, timeAgo } from '../lib/reports';
import { TALK_COMMENT_MAX, type TalkComment, type TalkPost } from '../lib/talk';
import type { Talk } from '../hooks/useTalk';
import { HScroll } from './HScroll';

interface Props {
  talk: Talk;
  now: number;
  isAdmin: boolean;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** 한 화면(장)에 보이는 질문 수 — 더 있으면 옆으로 넘긴다 */
const PER_PAGE = 2;

/** 홈 맨 위: 질문·공지 한 줄 → 바로 밑에 사람들 답(옆으로 넘기기) → [답하기]. 최신 글부터 2개씩 한 장 */
export function ShareTalk({ talk, now, isAdmin }: Props) {
  const pagerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  // 장마다 높이가 달라서, 지금 보는 장 높이에 맞춘다 (짧은 장 밑에 빈칸이 생기지 않게)
  useLayoutEffect(() => {
    const el = pagerRef.current;
    const cur = el?.children[page] as HTMLElement | undefined;
    if (el && cur) el.style.height = cur.offsetHeight + 'px';
  });
  if (talk.posts.length === 0) return null;
  const pages: TalkPost[][] = [];
  for (let i = 0; i < talk.posts.length; i += PER_PAGE) pages.push(talk.posts.slice(i, i + PER_PAGE));
  const onScroll = () => {
    const el = pagerRef.current;
    if (el) setPage(Math.round(el.scrollLeft / (el.clientWidth + 12))); // 12 = 장 사이 간격
  };
  return (
    <section className="home-section talk" aria-label="공유톡">
      <div className="section-head">
        <h3 className="section-title">💬 공유톡</h3>
        {talk.mode === 'local' && <span className="small">이 기기에만 저장</span>}
        {pages.length > 1 && (
          <span className="small talk-page">
            {Math.min(page, pages.length - 1) + 1}/{pages.length} · 옆으로 넘기기
          </span>
        )}
      </div>
      <div className="talk-pager" ref={pagerRef} onScroll={onScroll}>
        {pages.map((ps, i) => (
          <div key={i} className="talk-list talk-page-item">
            {ps.map((p) => (
              <TalkItem
                key={p.id}
                post={p}
                comments={talk.comments.filter((c) => c.postId === p.id)}
                talk={talk}
                now={now}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function TalkItem({ post, comments, talk, now, isAdmin }: { post: TalkPost; comments: TalkComment[]; talk: Talk; now: number; isAdmin: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 한 줄에 다 안 보이는 글은 누르면 펼쳐 보기 */
  const [expanded, setExpanded] = useState(false);
  /** 답 쓰는 칸은 [답하기]를 눌렀을 때만 */
  const [writing, setWriting] = useState(false);
  const me = deviceId();
  const ownPost = post.deviceId != null && post.deviceId === me;
  const sorted = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    void run(async () => {
      await talk.addComment(post.id, body);
      setText('');
      setWriting(false);
    });
  };

  const remove = (c: TalkComment) => {
    const own = c.deviceId === me;
    if (!own && !confirm('관리자 권한으로 이 댓글을 지울까요?')) return;
    void run(() => talk.removeComment(c.id, !own));
  };

  return (
    <article className={'talk-item' + (post.allowComments ? '' : ' notice')}>
      <div className="talk-q">
        <span className="talk-q-icon" aria-hidden>
          {post.allowComments ? '🙋' : '📢'}
        </span>
        <span className={'talk-q-text' + (expanded ? ' open' : '')} onClick={() => setExpanded((v) => !v)}>
          {post.body}
        </span>
        {post.allowComments && !writing && (
          <button className="btn sm talk-reply" onClick={() => setWriting(true)}>
            답하기
          </button>
        )}
        {ownPost && !isAdmin && (
          <span className="talk-admin">
            <button
              className="link del"
              disabled={busy}
              onClick={() => confirm('내가 올린 공유톡을 지울까요?') && void run(() => talk.removePost(post.id, true))}
            >
              삭제
            </button>
          </span>
        )}
        {isAdmin && (
          <span className="talk-admin">
            <button className="link" disabled={busy} onClick={() => void run(() => talk.setPostComments(post.id, !post.allowComments))}>
              {post.allowComments ? '댓글 닫기' : '댓글 열기'}
            </button>
            <button
              className="link del"
              disabled={busy}
              onClick={() => confirm('이 공유톡을 댓글까지 모두 지울까요?') && void run(() => talk.removePost(post.id))}
            >
              삭제
            </button>
          </span>
        )}
      </div>

      {sorted.length > 0 && (
        <HScroll className="talk-strip" label="답글 (옆으로 넘기기)" auto>
          {sorted.map((c) => {
            const own = c.deviceId === me;
            return (
              <span key={c.id} className={'talk-chip' + (own ? ' own' : '')}>
                <span className="talk-chip-text">{c.body}</span>
                <span className="talk-chip-time">{timeAgo(c.createdAt, now)}</span>
                {(own || isAdmin) && (
                  <button className="talk-chip-del" disabled={busy} onClick={() => remove(c)} aria-label="댓글 지우기">
                    ✕
                  </button>
                )}
              </span>
            );
          })}
        </HScroll>
      )}
      {post.allowComments && writing && (
        <form
          className="one-line-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="mini grow"
            placeholder="한 줄로 답하기"
            maxLength={TALK_COMMENT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
            autoFocus
          />
          <button type="button" className="btn sm" onClick={() => setWriting(false)}>
            취소
          </button>
          <button className="btn sm primary" disabled={busy || !text.trim()}>
            등록
          </button>
        </form>
      )}

      {err && <p className="small error">{err}</p>}
    </article>
  );
}
