import { useMemo, useState } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { deviceId } from '../lib/reports';
import { makeNameMatcher } from '../lib/search';
import { formatWon } from '../lib/links';
import {
  CANDIDATE_TEXT_MAX,
  DEFAULT_POLL_TITLE,
  POLL_MAX,
  POLL_MIN,
  POLL_TITLE_MAX,
  candidateText,
  pollDateLabel,
  pollLink,
  tally,
  textCandidate,
  voterCount,
  type Poll,
} from '../lib/vote';
import type { Votes } from '../hooks/useVotes';
import { useSite } from '../lib/sites';
import { shareWithApp } from '../lib/share';

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

/** 후보 이름: 식당이면 이모지·이름, 직접 입력이면 그 글자 */
function candidateLabel(id: string, byId: Map<string, Restaurant>): string {
  const t = candidateText(id);
  if (t != null) return `✏️ ${t}`;
  const r = byId.get(id);
  return r ? `${CUISINE_EMOJI[r.cuisine]} ${r.name}` : '(목록에 없는 식당)';
}

/** 이름으로 식당 찾아 담기 + 직접 입력(사람 이름 등) + 추천·관심매장 빠르게 담기 */
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
  /** 식당 id 또는 직접 입력 후보 id */
  onPick: (id: string) => void;
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

  const typed = q.trim().slice(0, CANDIDATE_TEXT_MAX);
  const typedId = typed ? textCandidate(typed) : null;
  const addTyped = () => {
    if (!typedId || exclude.has(typedId)) return;
    onPick(typedId);
    setQ('');
  };

  if (full) return <p className="small">후보는 {POLL_MAX}개까지 올릴 수 있어요.</p>;

  return (
    <div className="vote-picker">
      <input
        className="mini grow vote-search"
        placeholder="식당 찾기 · 사람 이름 등 직접 입력"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && found.length === 0) addTyped();
        }}
        enterKeyHint="done"
      />
      {found.length > 0 && (
        <ul className="vote-found">
          {found.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  onPick(r.id);
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
      {typedId && !exclude.has(typedId) && (
        <ul className="vote-found">
          <li>
            <button onClick={addTyped}>
              <span>✏️ "{typed}" 그대로 후보로</span>
              <span className="vote-add">+ 담기</span>
            </button>
          </li>
        </ul>
      )}
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
                    <button key={r.id} className="chip sm" onClick={() => onPick(r.id)}>
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
            {view.mode === 'create'
              ? '식당이나 사람 이름 등 후보를 담고 투표를 만들면 링크로 공유할 수 있어요'
              : '원하는 후보를 눌러 투표 (여러 개 골라도 돼요)'}
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
  // 다른 근무지 식당은 빠지고, 직접 입력한 후보는 그대로
  const picked = draft.filter((id) => candidateText(id) != null || byId.has(id));

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await votes.createPoll(title.trim() || DEFAULT_POLL_TITLE, picked);
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
          후보 {picked.length}개 <span className="small">({POLL_MIN}~{POLL_MAX}개)</span>
        </h4>
        {picked.length === 0 ? (
          <p className="small">
            아래에서 식당을 담거나, 식당 상세의 "🗳️ 투표에 담기"를 눌러 보세요. "누가 정할까?"처럼 사람 이름을 직접 적어도 돼요.
          </p>
        ) : (
          <ul className="vote-list">
            {picked.map((id) => {
              const r = byId.get(id);
              return (
                <li key={id} className="vote-row static">
                  <span className="vote-name">
                    {candidateLabel(id, byId)}
                    {r && <span className="small vote-meta">{metaOf(r, walkById.get(id))}</span>}
                  </span>
                  <button className="link del" onClick={() => onDraftChange(draft.filter((x) => x !== id))}>
                    빼기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <CandidatePicker
          restaurants={restaurants}
          exclude={new Set(draft)}
          suggestions={suggestions}
          full={picked.length >= POLL_MAX}
          onPick={(id) => onDraftChange([...draft, id])}
        />
      </section>

      <button className="btn primary vote-create" disabled={busy || picked.length < POLL_MIN} onClick={() => void create()}>
        {picked.length < POLL_MIN ? `후보를 ${POLL_MIN}개 이상 담아 주세요` : `투표 만들기 (${picked.length}개)`}
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
  const site = useSite();

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
    const names = poll.candidates.map((rid) => candidateText(rid) ?? byId.get(rid)?.name).filter(Boolean);
    const m = await shareWithApp({
      text: `🗳️ ${poll.title}\n${names.length ? `후보: ${names.join(', ')}\n` : ''}눌러서 투표해 주세요!`,
      url: pollLink(poll.id),
      site: site.id,
    });
    if (m) setMsg(m);
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
                  {candidateLabel(rid, byId)}
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
            onPick={(cid) => void run(() => votes.addCandidate(poll.id, cid))}
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
