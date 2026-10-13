import type { SupabaseClient } from '@supabase/supabase-js';
import { deviceId, localAdminToken, supabaseClient } from './reports';
import type { SiteId } from './sites';

/** 공유톡: 한 줄 질문·공지 (관리자 또는 누구나 '제보·의견'에서) */
export interface TalkPost {
  id: string;
  /** 어느 근무지 공지인지 — 그 근무지를 고른 사람에게만 보인다 */
  site: SiteId;
  body: string;
  /** false = 단순 공지 (댓글 닫힘) */
  allowComments: boolean;
  /** 올린 기기 (관리자 글은 null) — 본인 글 지우기에 쓴다 */
  deviceId: string | null;
  createdAt: string; // ISO
}

/** 공유톡에 사람들이 다는 한 줄 답 */
export interface TalkComment {
  id: string;
  postId: string;
  body: string;
  deviceId: string | null;
  createdAt: string; // ISO
}

/** 저장 칸은 100자 — 근무지 표시([ydp])가 들어갈 자리를 남긴다 */
export const TALK_POST_MAX = 94;

/**
 * 근무지는 글 앞에 [ydp] 처럼 붙여 저장한다 (DB 칸을 따로 만들지 않아도 되게).
 * 아무것도 안 붙은 글은 예전부터 있던 잠실 글
 */
const SITE_TAG = /^\[(ydp)\]/;

function tagBody(body: string, site: SiteId): string {
  return site === 'jamsil' ? body : `[${site}]${body}`;
}

function splitBody(raw: string): { site: SiteId; body: string } {
  const m = raw.match(SITE_TAG);
  return m ? { site: m[1] as SiteId, body: raw.slice(m[0].length) } : { site: 'jamsil', body: raw };
}
export const TALK_COMMENT_MAX = 60;

export interface TalkHandlers {
  post: (p: TalkPost) => void;
  postRemoved: (id: string) => void;
  comment: (c: TalkComment) => void;
  commentRemoved: (id: string) => void;
}

export interface TalkBackend {
  readonly mode: 'supabase' | 'local';
  list(): Promise<{ posts: TalkPost[]; comments: TalkComment[] }>;
  addComment(postId: string, body: string): Promise<TalkComment>;
  removeOwnComment(id: string): Promise<void>;
  createPost(body: string, allowComments: boolean, site: SiteId, token: string): Promise<TalkPost>;
  /** 누구나 올리는 질문 (댓글 열림) */
  createPublicPost(body: string, site: SiteId): Promise<TalkPost>;
  removeOwnPost(id: string): Promise<void>;
  setComments(id: string, allowComments: boolean, token: string): Promise<TalkPost>;
  removePost(id: string, token: string): Promise<void>;
  removeComment(id: string, token: string): Promise<void>;
  subscribe(h: TalkHandlers): () => void;
}

const WRONG_TOKEN = '관리자 비밀번호가 틀렸어요';

// ---------- local fallback ----------
const LOCAL_KEY = 'jamsil-lunch:talk';

class LocalTalk implements TalkBackend {
  readonly mode = 'local' as const;
  private subs = new Set<TalkHandlers>();

  private read(): { posts: TalkPost[]; comments: TalkComment[] } {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as { posts: TalkPost[]; comments: TalkComment[] } | null;
      return v ?? { posts: [], comments: [] };
    } catch {
      return { posts: [], comments: [] };
    }
  }
  private write(v: { posts: TalkPost[]; comments: TalkComment[] }) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ posts: v.posts.slice(-50), comments: v.comments.slice(-500) }));
    } catch {
      /* ignore */
    }
  }
  private admin(token: string) {
    if (token !== localAdminToken()) throw new Error(WRONG_TOKEN);
  }
  async list() {
    const all = this.read();
    // 예전에 이 기기에 저장된 글은 근무지가 없으면 잠실
    return { ...all, posts: all.posts.map((p) => ({ ...p, site: p.site ?? 'jamsil', deviceId: p.deviceId ?? null })) };
  }
  async addComment(postId: string, body: string) {
    const all = this.read();
    if (!all.posts.find((p) => p.id === postId)?.allowComments) throw new Error('댓글이 닫힌 글이에요');
    const c: TalkComment = { id: crypto.randomUUID(), postId, body, deviceId: deviceId(), createdAt: new Date().toISOString() };
    all.comments.push(c);
    this.write(all);
    this.subs.forEach((h) => h.comment(c));
    return c;
  }
  async removeOwnComment(id: string) {
    const all = this.read();
    all.comments = all.comments.filter((c) => !(c.id === id && c.deviceId === deviceId()));
    this.write(all);
    this.subs.forEach((h) => h.commentRemoved(id));
  }
  async createPost(body: string, allowComments: boolean, site: SiteId, token: string) {
    this.admin(token);
    const all = this.read();
    const p: TalkPost = { id: crypto.randomUUID(), site, body, allowComments, deviceId: null, createdAt: new Date().toISOString() };
    all.posts.push(p);
    this.write(all);
    this.subs.forEach((h) => h.post(p));
    return p;
  }
  async createPublicPost(body: string, site: SiteId) {
    const all = this.read();
    const p: TalkPost = { id: crypto.randomUUID(), site, body, allowComments: true, deviceId: deviceId(), createdAt: new Date().toISOString() };
    all.posts.push(p);
    this.write(all);
    this.subs.forEach((h) => h.post(p));
    return p;
  }
  async removeOwnPost(id: string) {
    const all = this.read();
    if (all.posts.find((p) => p.id === id)?.deviceId !== deviceId()) return;
    all.posts = all.posts.filter((p) => p.id !== id);
    all.comments = all.comments.filter((c) => c.postId !== id);
    this.write(all);
    this.subs.forEach((h) => h.postRemoved(id));
  }
  async setComments(id: string, allowComments: boolean, token: string) {
    this.admin(token);
    const all = this.read();
    const p = all.posts.find((x) => x.id === id);
    if (!p) throw new Error('글을 찾을 수 없어요');
    p.allowComments = allowComments;
    this.write(all);
    this.subs.forEach((h) => h.post(p));
    return p;
  }
  async removePost(id: string, token: string) {
    this.admin(token);
    const all = this.read();
    all.posts = all.posts.filter((p) => p.id !== id);
    all.comments = all.comments.filter((c) => c.postId !== id);
    this.write(all);
    this.subs.forEach((h) => h.postRemoved(id));
  }
  async removeComment(id: string, token: string) {
    this.admin(token);
    const all = this.read();
    all.comments = all.comments.filter((c) => c.id !== id);
    this.write(all);
    this.subs.forEach((h) => h.commentRemoved(id));
  }
  subscribe(h: TalkHandlers) {
    this.subs.add(h);
    return () => {
      this.subs.delete(h);
    };
  }
}

// ---------- supabase ----------
interface PostRow {
  id: string;
  body: string;
  allow_comments: boolean;
  device_id?: string | null;
  created_at: string;
}
interface CommentRow {
  id: string;
  post_id: string;
  body: string;
  device_id: string | null;
  created_at: string;
}
const fromPost = (r: PostRow): TalkPost => ({
  id: r.id,
  ...splitBody(r.body),
  allowComments: r.allow_comments,
  deviceId: r.device_id ?? null,
  createdAt: r.created_at,
});
const fromComment = (r: CommentRow): TalkComment => ({
  id: r.id,
  postId: r.post_id,
  body: r.body,
  deviceId: r.device_id,
  createdAt: r.created_at,
});

class SupabaseTalk implements TalkBackend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }
  async list() {
    const [posts, comments] = await Promise.all([
      this.sb.from('talk_posts').select('*').order('created_at', { ascending: false }).limit(50),
      this.sb.from('talk_comments').select('*').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (posts.error) throw posts.error;
    if (comments.error) throw comments.error;
    return { posts: (posts.data as PostRow[]).map(fromPost), comments: (comments.data as CommentRow[]).map(fromComment) };
  }
  async addComment(postId: string, body: string) {
    const { data, error } = await this.sb
      .from('talk_comments')
      .insert({ post_id: postId, body, device_id: deviceId() })
      .select()
      .single();
    if (error) throw error;
    return fromComment(data as CommentRow);
  }
  async removeOwnComment(id: string) {
    const { error } = await this.sb.rpc('delete_own_talk_comment', { p_id: id, p_device: deviceId() });
    if (error) throw error;
  }
  private async adminRow(fn: string, args: Record<string, unknown>): Promise<PostRow> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as PostRow | null;
    if (!row?.id) throw new Error(WRONG_TOKEN);
    return row;
  }
  async createPost(body: string, allowComments: boolean, site: SiteId, token: string) {
    return fromPost(await this.adminRow('admin_talk_create', { p_body: tagBody(body, site), p_allow: allowComments, p_token: token }));
  }
  async createPublicPost(body: string, site: SiteId) {
    const { data, error } = await this.sb.rpc('talk_create', { p_body: tagBody(body, site), p_device: deviceId() });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as PostRow | null;
    if (!row?.id) throw new Error('올리지 못했어요');
    return fromPost(row);
  }
  async removeOwnPost(id: string) {
    const { error } = await this.sb.rpc('delete_own_talk_post', { p_id: id, p_device: deviceId() });
    if (error) throw error;
  }
  async setComments(id: string, allowComments: boolean, token: string) {
    return fromPost(await this.adminRow('admin_talk_set_comments', { p_id: id, p_allow: allowComments, p_token: token }));
  }
  async removePost(id: string, token: string) {
    const { data, error } = await this.sb.rpc('admin_talk_delete_post', { p_id: id, p_token: token });
    if (error) throw error;
    if (data !== true) throw new Error(WRONG_TOKEN);
  }
  async removeComment(id: string, token: string) {
    const { data, error } = await this.sb.rpc('admin_talk_delete_comment', { p_id: id, p_token: token });
    if (error) throw error;
    if (data !== true) throw new Error(WRONG_TOKEN);
  }
  subscribe(h: TalkHandlers) {
    const ch = this.sb
      .channel(`talk-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'talk_posts' }, (e) => h.post(fromPost(e.new as PostRow)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'talk_posts' }, (e) => h.post(fromPost(e.new as PostRow)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'talk_posts' }, (e) => {
        const id = (e.old as Partial<PostRow>).id;
        if (id) h.postRemoved(id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'talk_comments' }, (e) =>
        h.comment(fromComment(e.new as CommentRow)),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'talk_comments' }, (e) => {
        const id = (e.old as Partial<CommentRow>).id;
        if (id) h.commentRemoved(id);
      })
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}

export function createTalkBackend(): TalkBackend {
  const { sb } = supabaseClient();
  return sb ? new SupabaseTalk(sb) : new LocalTalk();
}
