import type { Restaurant } from '../types';
import { candidateText, pollDateLabel, tally, voterCount } from '../lib/vote';
import type { Votes } from '../hooks/useVotes';

interface Props {
  votes: Votes;
  byId: Map<string, Restaurant>;
  /** 투표 만들기에 담아 둔 후보 수 */
  draftCount: number;
  onCreate: () => void;
  onOpen: (id: string) => void;
}

/** 오늘의 추천 탭: 점심 투표 — 새 투표 만들기 + 내가 만들었거나 받은 투표 */
export function VoteHome({ votes, byId, draftCount, onCreate, onOpen }: Props) {
  const recent = votes.myPolls.slice(0, 3);
  return (
    <section className="home-section" aria-label="점심 투표">
      <div className="section-head">
        <h3 className="section-title">🗳️ 점심 투표</h3>
        {votes.mode === 'local' && <span className="small">이 기기에만 저장</span>}
      </div>
      <div className="vote-home">
        {recent.map((p) => {
          const list = votes.votes.filter((v) => v.pollId === p.id);
          const lead = tally(p, list)[0];
          const leader = lead && lead.count > 0 ? (candidateText(lead.id) ?? byId.get(lead.id)?.name) : null;
          return (
            <div key={p.id} className="vote-home-item">
              <button className="vote-home-open" onClick={() => onOpen(p.id)}>
                <strong>{p.title}</strong>
                <span className="small">
                  {pollDateLabel(p.createdAt)} · {voterCount(p, list)}명 참여
                  {leader && <> · 👑 {leader}</>}
                </span>
              </button>
              <button className="link del" onClick={() => votes.forget(p.id)} aria-label="목록에서 빼기">
                ✕
              </button>
            </div>
          );
        })}
        <button className="btn sm primary vote-new" onClick={onCreate}>
          + 투표 만들기{draftCount > 0 && ` (담은 후보 ${draftCount})`}
        </button>
      </div>
    </section>
  );
}
