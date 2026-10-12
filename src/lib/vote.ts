import type { SupabaseClient } from '@supabase/supabase-js';
import { deviceId, supabaseClient } from './reports';
import { WEEKDAY_NAMES } from './recommend';

/** 점심 투표: 후보 식당 몇 곳을 올리고 링크로 공유, 가고 싶은 곳을 여러 개 고를 수 있다 */
export interface Poll {
  id: string;
  title: string;
  /** 후보 식당 id */
  candidates: string[];
  deviceId: string | null;
  createdAt: string; // ISO
}

export interface PollVote {
  id: string;
  pollId: string;
  restaurantId: string;
  deviceId: string;
  createdAt: string; // ISO
}

export const POLL_TITLE_MAX = 40;
export const POLL_MIN = 2;
export const POLL_MAX = 12;
export const DEFAULT_POLL_TITLE = '오늘 점심 어디 갈까요?';

export interface PollHandlers {
  poll: (p: Poll) => void;
  vote: (v: PollVote) => void;
  voteRemoved: (id: string) => void;
}

export interface VoteBackend {
  readonly mode: 'supabase' | 'local';
  createPoll(title: string, candidates: string[]): Promise<Poll>;
  /** 여러 투표를 한 번에 (홈 목록) */
  listPolls(ids: string[]): Promise<{ polls: Poll[]; votes: PollVote[] }>;
  addCandidate(pollId: string, restaurantId: string): Promise<Poll>;
  vote(pollId: string, restaurantId: string): Promise<PollVote>;
  removeOwnVote(id: string): Promise<void>;
  subscribe(pollId: string, h: PollHandlers): () => void;
}

/** "10/12 (월)" — 한국 시간 기준 */
export function pollDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAY_NAMES[d.getUTCDay()]})`;
}

/** 공유 링크 */
export function pollLink(id: string): string {
  return `${location.origin}/?vote=${id}`;
}

// ---------- 내가 만들었거나 열어 본 투표 (이 기기) ----------
const MY_POLLS_KEY = 'jamsil-lunch:my-polls';
const MAX_MY_POLLS = 10;

export function loadMyPolls(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MY_POLLS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function rememberPoll(id: string): string[] {
  const next = [id, ...loadMyPolls().filter((x) => x !== id)].slice(0, MAX_MY_POLLS);
  try {
    localStorage.setItem(MY_POLLS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
export function forgetPoll(id: string): string[] {
  const next = loadMyPolls().filter((x) => x !== id);
  try {
    localStorage.setItem(MY_POLLS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** 표가 가장 많은 후보 (동점이면 먼저 올라온 후보) */
export function tally(poll: Poll, votes: PollVote[]): { id: string; count: number }[] {
  const counts = new Map(poll.candidates.map((c) => [c, 0]));
  for (const v of votes) if (v.pollId === poll.id && counts.has(v.restaurantId)) counts.set(v.restaurantId, counts.get(v.restaurantId)! + 1);
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

/** 투표한 사람 수 (기기 기준) */
export function voterCount(poll: Poll, votes: PollVote[]): number {
  return new Set(votes.filter((v) => v.pollId === poll.id).map((v) => v.deviceId)).size;
}

// ---------- local fallback ----------
const LOCAL_KEY = 'jamsil-lunch:polls';

class LocalVote implements VoteBackend {
  readonly mode = 'local' as const;
  private subs = new Set<{ pollId: string; h: PollHandlers }>();

  private read(): { polls: Poll[]; votes: PollVote[] } {
    try {
      return (JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as { polls: Poll[]; votes: PollVote[] } | null) ?? { polls: [], votes: [] };
    } catch {
      return { polls: [], votes: [] };
    }
  }
  private write(v: { polls: Poll[]; votes: PollVote[] }) {
    const polls = v.polls.slice(-30);
    const keep = new Set(polls.map((p) => p.id));
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ polls, votes: v.votes.filter((x) => keep.has(x.pollId)) }));
    } catch {
      /* ignore */
    }
  }
  private emit(pollId: string, fn: (h: PollHandlers) => void) {
    this.subs.forEach((s) => s.pollId === pollId && fn(s.h));
  }
  async createPoll(title: string, candidates: string[]) {
    const all = this.read();
    const p: Poll = { id: crypto.randomUUID(), title, candidates, deviceId: deviceId(), createdAt: new Date().toISOString() };
    all.polls.push(p);
    this.write(all);
    return p;
  }
  async listPolls(ids: string[]) {
    const all = this.read();
    const want = new Set(ids);
    return { polls: all.polls.filter((p) => want.has(p.id)), votes: all.votes.filter((v) => want.has(v.pollId)) };
  }
  async addCandidate(pollId: string, restaurantId: string) {
    const all = this.read();
    const p = all.polls.find((x) => x.id === pollId);
    if (!p) throw new Error('투표를 찾을 수 없어요');
    if (!p.candidates.includes(restaurantId) && p.candidates.length < POLL_MAX) p.candidates.push(restaurantId);
    this.write(all);
    this.emit(pollId, (h) => h.poll(p));
    return p;
  }
  async vote(pollId: string, restaurantId: string) {
    const all = this.read();
    const me = deviceId();
    const dup = all.votes.find((v) => v.pollId === pollId && v.restaurantId === restaurantId && v.deviceId === me);
    if (dup) return dup;
    const v: PollVote = { id: crypto.randomUUID(), pollId, restaurantId, deviceId: me, createdAt: new Date().toISOString() };
    all.votes.push(v);
    this.write(all);
    this.emit(pollId, (h) => h.vote(v));
    return v;
  }
  async removeOwnVote(id: string) {
    const all = this.read();
    const v = all.votes.find((x) => x.id === id && x.deviceId === deviceId());
    if (!v) return;
    all.votes = all.votes.filter((x) => x !== v);
    this.write(all);
    this.emit(v.pollId, (h) => h.voteRemoved(id));
  }
  subscribe(pollId: string, h: PollHandlers) {
    const s = { pollId, h };
    this.subs.add(s);
    return () => {
      this.subs.delete(s);
    };
  }
}

// ---------- supabase ----------
interface PollRow {
  id: string;
  title: string;
  candidates: string[];
  device_id: string | null;
  created_at: string;
}
interface VoteRow {
  id: string;
  poll_id: string;
  restaurant_id: string;
  device_id: string;
  created_at: string;
}
const fromPoll = (r: PollRow): Poll => ({ id: r.id, title: r.title, candidates: r.candidates ?? [], deviceId: r.device_id, createdAt: r.created_at });
const fromVote = (r: VoteRow): PollVote => ({
  id: r.id,
  pollId: r.poll_id,
  restaurantId: r.restaurant_id,
  deviceId: r.device_id,
  createdAt: r.created_at,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SupabaseVote implements VoteBackend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }
  async createPoll(title: string, candidates: string[]) {
    const { data, error } = await this.sb.from('polls').insert({ title, candidates, device_id: deviceId() }).select().single();
    if (error) throw error;
    return fromPoll(data as PollRow);
  }
  async listPolls(ids: string[]) {
    const valid = ids.filter((id) => UUID_RE.test(id));
    if (!valid.length) return { polls: [], votes: [] };
    const [polls, votes] = await Promise.all([
      this.sb.from('polls').select('*').in('id', valid),
      this.sb.from('poll_votes').select('*').in('poll_id', valid).limit(2000),
    ]);
    if (polls.error) throw polls.error;
    if (votes.error) throw votes.error;
    return { polls: (polls.data as PollRow[]).map(fromPoll), votes: (votes.data as VoteRow[]).map(fromVote) };
  }
  async addCandidate(pollId: string, restaurantId: string) {
    const { data, error } = await this.sb.rpc('add_poll_candidate', { p_id: pollId, p_restaurant: restaurantId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as PollRow | null;
    if (!row?.id) throw new Error('투표를 찾을 수 없어요');
    return fromPoll(row);
  }
  async vote(pollId: string, restaurantId: string) {
    const { data, error } = await this.sb
      .from('poll_votes')
      .insert({ poll_id: pollId, restaurant_id: restaurantId, device_id: deviceId() })
      .select()
      .single();
    if (error) {
      // 이미 찍은 곳을 한 번 더 누른 경우 (두 번 탭 등)
      if (error.code === '23505') {
        const again = await this.sb
          .from('poll_votes')
          .select('*')
          .match({ poll_id: pollId, restaurant_id: restaurantId, device_id: deviceId() })
          .single();
        if (again.error) throw again.error;
        return fromVote(again.data as VoteRow);
      }
      throw error;
    }
    return fromVote(data as VoteRow);
  }
  async removeOwnVote(id: string) {
    const { error } = await this.sb.rpc('delete_own_poll_vote', { p_id: id, p_device: deviceId() });
    if (error) throw error;
  }
  subscribe(pollId: string, h: PollHandlers) {
    const ch = this.sb
      .channel(`poll-${pollId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, (e) =>
        h.poll(fromPoll(e.new as PollRow)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${pollId}` }, (e) =>
        h.vote(fromVote(e.new as VoteRow)),
      )
      // 삭제 이벤트는 걸러 받을 수 없어 id 만 보고 지금 목록에 있으면 뺀다
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poll_votes' }, (e) => {
        const id = (e.old as Partial<VoteRow>).id;
        if (id) h.voteRemoved(id);
      })
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}

export function createVoteBackend(): VoteBackend {
  const { sb } = supabaseClient();
  return sb ? new SupabaseVote(sb) : new LocalVote();
}
