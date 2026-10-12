import { useCallback, useEffect, useMemo, useState } from 'react';
import { deviceId } from '../lib/reports';
import { createVoteBackend, forgetPoll, loadMyPolls, rememberPoll, type Poll, type PollVote } from '../lib/vote';

/** 점심 투표: 이 기기에서 만들었거나 열어 본 투표들 + 지금 열어 둔 투표 실시간 */
export function useVotes(openId: string | null) {
  const [backend] = useState(createVoteBackend);
  const [myIds, setMyIds] = useState<string[]>(loadMyPolls);
  const [polls, setPolls] = useState<Map<string, Poll>>(() => new Map());
  const [votes, setVotes] = useState<PollVote[]>([]);
  /** 불러오기를 마친 투표 id (없는 투표 구분용) */
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const putPoll = useCallback((p: Poll) => setPolls((prev) => new Map(prev).set(p.id, p)), []);
  const putVote = useCallback((v: PollVote) => setVotes((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v])), []);

  const load = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        const r = await backend.listPolls(ids);
        const want = new Set(ids);
        setPolls((prev) => {
          const next = new Map(prev);
          for (const p of r.polls) next.set(p.id, p);
          return next;
        });
        setVotes((prev) => [...prev.filter((v) => !want.has(v.pollId)), ...r.votes]);
        setLoaded((prev) => new Set([...prev, ...ids]));
        setError(null);
      } catch (e) {
        console.warn('[jamsil-lunch] 투표 불러오기 실패:', e);
        setError('투표를 불러오지 못했어요');
      }
    },
    [backend],
  );

  useEffect(() => {
    void load(myIds);
  }, [load, myIds]);

  // 열어 둔 투표는 다른 사람이 찍는 표가 바로 보이게
  useEffect(() => {
    if (!openId) return;
    void load([openId]);
    let off: () => void = () => {};
    try {
      off = backend.subscribe(openId, {
        poll: putPoll,
        vote: putVote,
        voteRemoved: (id) => setVotes((prev) => prev.filter((v) => v.id !== id)),
      });
    } catch (e) {
      console.warn('[jamsil-lunch] 투표 실시간 구독 실패:', e);
    }
    return off;
  }, [backend, openId, load, putPoll, putVote]);

  const createPoll = useCallback(
    async (title: string, candidates: string[]) => {
      const p = await backend.createPoll(title, candidates);
      putPoll(p);
      setLoaded((prev) => new Set(prev).add(p.id));
      setMyIds(rememberPoll(p.id));
      return p;
    },
    [backend, putPoll],
  );

  /** 링크로 들어온 투표를 내 목록에 남긴다 */
  const remember = useCallback((id: string) => {
    if (!loadMyPolls().includes(id)) setMyIds(rememberPoll(id));
  }, []);

  const forget = useCallback((id: string) => setMyIds(forgetPoll(id)), []);

  const toggleVote = useCallback(
    async (pollId: string, restaurantId: string) => {
      const me = deviceId();
      const mine = votes.find((v) => v.pollId === pollId && v.restaurantId === restaurantId && v.deviceId === me);
      if (mine) {
        await backend.removeOwnVote(mine.id);
        setVotes((prev) => prev.filter((v) => v.id !== mine.id));
      } else {
        putVote(await backend.vote(pollId, restaurantId));
      }
    },
    [backend, votes, putVote],
  );

  const addCandidate = useCallback(
    async (pollId: string, restaurantId: string) => putPoll(await backend.addCandidate(pollId, restaurantId)),
    [backend, putPoll],
  );

  /** 내 목록의 투표, 최근 것이 위로 */
  const myPolls = useMemo(
    () => myIds.map((id) => polls.get(id)).filter((p): p is Poll => !!p).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [myIds, polls],
  );

  return { mode: backend.mode, polls, votes, loaded, myPolls, error, createPoll, remember, forget, toggleVote, addCandidate };
}

export type Votes = ReturnType<typeof useVotes>;
