import { useMemo, useState } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { deviceId } from '../lib/reports';
import { makeNameMatcher } from '../lib/search';
import { formatWon } from '../lib/links';
import { DEFAULT_POLL_TITLE, POLL_MAX, POLL_MIN, POLL_TITLE_MAX, pollDateLabel, pollLink, tally, voterCount, type Poll } from '../lib/vote';
import type { Votes } from '../hooks/useVotes';

export type VoteView = { mode: 'create' } | { mode: 'poll'; id: string };

interface Props {
  view: VoteView;
  votes: Votes;
  restaurants: Restaurant[];
  byId: Map<string, Restaurant>;
  walkById: Map<string, number | null>;
  /** 투표 만들기에 담아 둔 후보 */
  draft: string[];
  onDraftChange: (ids: string[]) => void;
  /** 빠르게 담을 수 있는 곳 (오늘의 추천, 관심매장) */
  suggestions: { label: string; list: Restaurant[] }[];
  onCreated: (p: Poll) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function metaOf(r: Restaurant, walk: number | null | undefined): string {
  const parts = [r.subcategory || r.cuisine];
  if (r.priceRange) parts.push(`${formatWon(r.priceRange[0])}~`);
  if (walk != null) parts.push(`도보 ${walk}분`);
  return parts.join(' · ');
}

/** 이름으로 식당 찾아 담기 + 추천·관심매장 빠르게 담기 */
function CandidatePicker({
  restaurants,
  exclude,
  suggestions,
  full,
  onPick,
}: {
  restaurants: Restaurant[];
  exclude: Set<string>;
  suggestions: Props['suggestions'];
  full: boolean;
  onPick: (r: Restaurant) => void;
}) {
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    if (!q.trim()) return [];
    const hit = makeNameMatcher(q);
    // 직접 정리한 곳(가격 정보 있음)을 먼저
    return restaurants
      .filter((r) => !exclude.has(r.id) && hit(r))
      .sort((a, b) => Number(!!a.source) - Number(!!b.source))
      .slice(0, 8);
  }, [q, restaurants, exclude]);

  if (full) return <p className="small">후보는 {POLL_MAX}곳까지 올릴 수 있어요.</p>;

  return (
    <div className="vote-picker">
      <input
        className="mini grow vote-search"
        placeholder="식당 이름으로 찾아 담기"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
      />
      {found.length > 0 && (
        <ul className="vote-found">
          {found.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  onPick(r);
                  setQ('');
                }}
              >
                <span>
                  {CUISINE_EMOJI[r.cuisine]} {r.name}
                  {r.branch && <span className="small"> {r.branch}</span>}
                </span>
                <span className="vote-add">+ 담기</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && found.length === 0 && <p className="small">"{q.trim()}" 이름의 식당이 없어요.</p>}
      {suggestions.map(
        (s) =>
          s.list.some((r) => !exclude.has(r.id)) && (
            <div key={s.label} className="vote-suggest">
              <span className="small">{s.label}</span>
              <div className="chips">
                {s.list
                  .filter((r) => !exclude.has(r.id))
                  .slice(0, 8)
                  .map((r) => (
                    <button key={r.id} className="chip sm" onClick={() => onPick(r)}>
                      + {r.name}
                    </button>
                  ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}

/** 점심 투표: 만들기 / 투표하기·결과 보기 */
export function VotePanel(props: Props) {
  const { view, onClose } = props;
  return (
    <aside className="detail vote-panel" role="dialog" aria-label="점심 투표">
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>🗳️ 점심 투표</h2>
          <div className="sub">
            {view.mode === 'create' ? '후보를 담고 투표를 만들면 링크로 공유할 수 있어요' : '가고 싶은 곳을 눌러 투표 (여러 곳 골라도 돼요)'}
          </div>
        </div>
      </header>
      <div className="detail-body">{view.mode === 'create' ? <CreatePoll {...props} /> : <PollView {...props} id={view.id} />}</div>
    </aside>
  );
}

function CreatePoll({ votes, restaurants, byId, walkById, draft, onDraftChange, suggestions, onCreated }: Props) {
  const [title, setTitle] = useState(DEFAULT_POLL_TITLE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const picked = draft.map((id) => byId.get(id)).filter((r): r is Restaurant => !!r);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await votes.createPoll(title.trim() || DEFAULT_POLL_TITLE, picked.map((r) => r.id));
      onDraftChange([]);
      onCreated(p);
    } catch (e) {
      setErr('투표를 만들지 못했어요: ' + errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section>
        <h4>제목</h4>
        <input className="mini grow vote-title-input" maxLength={POLL_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />
      </section>

      <section>
        <h4>
          후보 {picked.length}곳 <span className="small">({POLL_MIN}~{POLL_MAX}곳)</span>
        </h4>
        {picked.length === 0 ? (
          <p className="small">아래에서 식당을 담거나, 식당 상세의 "🗳️ 투표에 담기"를 눌러 보세요.</p>
        ) : (
          <ul className="vote-list">
            {picked.map((r) => (
              <li key={r.id} className="vote-row static">
                <span className="vote-name">
                  {CUISINE_EMOJI[r.cuisine]} {r.name}
                  <span className="small vote-meta">{metaOf(r, walkById.get(r.id))}</span>
                </span>
                <button className="link del" onClick={() => onDraftChange(draft.filter((x) => x !== r.id))}>
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}
        <CandidatePicker
          restaurants={restaurants}
          exclude={new Set(draft)}
          suggestions={suggestions}
          full={picked.length >= POLL_MAX}
          onPick={(r) => onDraftChange([...draft, r.id])}
        />
      </section>

      <button className="btn primary vote-create" disabled={busy || picked.length < POLL_MIN} onClick={() => void create()}>
        {picked.length < POLL_MIN ? `후보를 ${POLL_MIN}곳 이상 담아 주세요` : `투표 만들기 (${picked.length}곳)`}
      </button>
      {votes.mode === 'local' && <p className="small">지금은 이 기기에만 저장돼요 (Supabase 연결 전). 링크를 보내도 다른 사람은 볼 수 없어요.</p>}
      {err && <p className="small error">{err}</p>}
    </>
  );
}

function PollView({ id, votes, restaurants, byId, walkById, suggestions, onSelect }: Props & { id: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const poll = votes.polls.get(id);

  if (!poll) {
    return votes.loaded.has(id) ? (
      <div className="empty">
        투표를 찾을 수 없어요.
        <br />
        지워졌거나 잘못된 링크예요.
      </div>
    ) : (
      <div className="empty small">{votes.error ?? '불러오는 중…'}</div>
    );
  }

  const me = deviceId();
  const list = votes.votes.filter((v) => v.pollId === poll.id);
  const mine = new Set(list.filter((v) => v.deviceId === me).map((v) => v.restaurantId));
  const rows = tally(poll, list);
  const top = rows[0]?.count ?? 0;
  const people = voterCount(poll, list);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = pollLink(poll.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: poll.title, text: `🗳️ ${poll.title}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg('링크를 복사했어요. 단톡방에 붙여 넣으세요!');
    } catch (e) {
      // 공유 창을 닫은 경우는 조용히
      if (e instanceof Error && e.name === 'AbortError') return;
      setMsg(`링크: ${url}`);
    }
  };

  return (
    <>
      <section className="vote-head">
        <h3>{poll.title}</h3>
        <p className="small">
          {pollDateLabel(poll.createdAt)} · {people}명 참여
        </p>
        <button className="btn sm primary" onClick={() => void share()}>
          🔗 링크 공유
        </button>
      </section>

      <ul className="vote-list">
        {rows.map(({ id: rid, count }) => {
          const r = byId.get(rid);
          const on = mine.has(rid);
          const lead = count > 0 && count === top;
          return (
            <li key={rid} className={'vote-row' + (on ? ' on' : '') + (lead ? ' lead' : '')}>
              <button className="vote-pick" disabled={busy} onClick={() => void run(() => votes.toggleVote(poll.id, rid))} aria-pressed={on}>
                <span className="vote-bar" style={{ width: top ? `${(count / top) * 100}%` : 0 }} aria-hidden />
                <span className="vote-check" aria-hidden>
                  {on ? '✓' : ''}
                </span>
                <span className="vote-name">
                  {lead && '👑 '}
                  {r ? `${CUISINE_EMOJI[r.cuisine]} ${r.name}` : '(목록에 없는 식당)'}
                  {r && <span className="small vote-meta">{metaOf(r, walkById.get(rid))}</span>}
                </span>
                <span className="vote-count">{count}</span>
              </button>
              {r && (
                <button className="link vote-info" onClick={() => onSelect(rid)}>
                  정보
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <section>
          <h4>후보 추가</h4>
          <CandidatePicker
            restaurants={restaurants}
            exclude={new Set(poll.candidates)}
            suggestions={suggestions}
            full={poll.candidates.length >= POLL_MAX}
            onPick={(r) => void run(() => votes.addCandidate(poll.id, r.id))}
          />
        </section>
      ) : (
        poll.candidates.length < POLL_MAX && (
          <button className="btn sm" onClick={() => setAdding(true)}>
            + 후보 추가
          </button>
        )
      )}
      {votes.mode === 'local' && <p className="small">이 기기에만 저장된 투표예요 (Supabase 연결 전).</p>}
      {msg && <p className="small">{msg}</p>}
    </>
  );
}
