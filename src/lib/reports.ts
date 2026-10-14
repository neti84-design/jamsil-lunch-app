import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TasteTag, WaitLevel } from '../types';

export type ReportKind = 'wait' | 'review' | 'tag' | 'fix' | 'feedback';
/** 직접 수정: 가격정보 / 운영 정보 / 영업시간 / 메인 사진 / 기타 */
export type FixType = 'price' | 'info' | 'hours' | 'photo' | 'etc';
export const FIX_LABELS: Record<FixType, string> = { price: '가격정보', info: '운영 정보', hours: '영업시간', photo: '메인 사진', etc: '기타' };
/** 메인 사진 제보에서 "사진 빼기"(음식 이모지로)를 뜻하는 값 */
export const NO_PHOTO = 'none';
/** 앱 제보·의견 (식당과 상관없는 것) */
export type FeedbackType = 'new' | 'closed' | 'bad' | 'good' | 'etc';
export const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  new: '🆕 신규 식당 등록 요청',
  closed: '🚫 폐업 제보',
  bad: '😣 불편한 점',
  good: '😊 좋은 점',
  etc: '💬 기타',
};
/** 제보·의견은 식당 칸에 이 값을 넣어 저장한다 */
export const FEEDBACK_ID = '__feedback__';
/** 'fav' = 관심 저장 (추천매장 집계용, 기기당 식당마다 한 번), 'delivery' = 배달 돼요 체크 */
export type ReportTag = TasteTag | 'fav' | 'delivery';

export interface Report {
  id: string;
  restaurantId: string;
  kind: ReportKind;
  waitLevel?: Exclude<WaitLevel, 'unknown'> | null;
  /** 내 앞에 몇 팀 */
  waitTeams?: number | null;
  /** 예상 대기 분 */
  waitMinutes?: number | null;
  rating?: number | null;
  comment?: string | null;
  tag?: ReportTag | null;
  /** 직접 수정(kind 'fix')의 종류. 내용은 comment, 가격정보는 fixMenu·fixPrice */
  fixType?: FixType | null;
  fixMenu?: string | null;
  fixPrice?: number | null;
  /** 제보·의견(kind 'feedback')의 종류와 근무지. 내용은 comment */
  feedbackType?: FeedbackType | null;
  feedbackSite?: string | null;
  /** 작성한 기기 식별자 (닉네임 대신 사용, 본인 글 표시·삭제용) */
  deviceId?: string | null;
  createdAt: string; // ISO
}

export type NewReport = Omit<Report, 'id' | 'createdAt' | 'deviceId'>;

export type LocalReason = 'unset' | 'invalid-url' | 'init-failed';

export interface ReportsBackend {
  /** 'supabase' = 모두와 공유, 'local' = 이 기기에만 저장 */
  readonly mode: 'supabase' | 'local';
  /** local 모드일 때 그 이유 (배지에 표시) */
  readonly localReason?: LocalReason;
  list(): Promise<Report[]>;
  add(r: NewReport): Promise<Report>;
  /** 내가 쓴 글 삭제 */
  removeOwn(id: string): Promise<void>;
  /** 관리자 토큰 확인 */
  checkAdmin(token: string): Promise<boolean>;
  /** 관리자 삭제 (아무 글이나) */
  removeAsAdmin(id: string, token: string): Promise<void>;
  /** 새 제보/삭제가 들어오면 호출. 해제 함수 반환 */
  subscribe(onInsert: (r: Report) => void, onDelete: (id: string) => void): () => void;
}

/** 이 시간 안의 웨이팅 제보만 "실시간"으로 취급 */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

const LOCAL_KEY = 'jamsil-lunch:reports';
const DEVICE_KEY = 'jamsil-lunch:device';
const ADMIN_KEY = 'jamsil-lunch:admin-token';

let deviceIdCache: string | null = null;
/** 기기마다 한 번 만들어 localStorage 에 두는 익명 식별자 */
export function deviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    deviceIdCache = id;
    return id;
  } catch {
    deviceIdCache = 'anon';
    return deviceIdCache;
  }
}

export function loadAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveAdminToken(t: string) {
  try {
    if (t) localStorage.setItem(ADMIN_KEY, t);
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}

/** 팀 수·분 → 웨이팅 단계. 둘 다 없으면 null */
export function levelFromNumbers(teams: number | null, minutes: number | null): Exclude<WaitLevel, 'unknown'> | null {
  if (teams == null && minutes == null) return null;
  const t = teams ?? -1;
  const m = minutes ?? -1;
  if (t <= 0 && m <= 0) return 'low';
  if (t <= 3 && m <= 15) return 'medium';
  return 'high';
}

/** "앞 3팀 · 15분" 식 표기 */
export function waitText(r: Report): string {
  const parts: string[] = [];
  if (r.waitTeams != null) parts.push(r.waitTeams === 0 ? '바로 입장' : `앞 ${r.waitTeams}팀`);
  if (r.waitMinutes != null) parts.push(r.waitMinutes === 0 ? '대기 없음' : `약 ${r.waitMinutes}분`);
  return parts.join(' · ');
}

// ---------- local fallback ----------
const LOCAL_ADMIN = ((import.meta.env.VITE_ADMIN_KEY as string | undefined) ?? 'admin').trim();

class LocalBackend implements ReportsBackend {
  readonly mode = 'local' as const;
  readonly localReason: LocalReason;
  private inserts = new Set<(r: Report) => void>();
  private deletes = new Set<(id: string) => void>();
  constructor(reason: LocalReason = 'unset') {
    this.localReason = reason;
  }

  private read(): Report[] {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Report[];
    } catch {
      return [];
    }
  }
  private write(all: Report[]) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-500)));
    } catch {
      /* ignore */
    }
  }
  async list() {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async add(r: NewReport) {
    const rec: Report = { ...r, id: crypto.randomUUID(), deviceId: r.kind === 'feedback' ? null : deviceId(), createdAt: new Date().toISOString() };
    const all = this.read();
    all.push(rec);
    this.write(all);
    this.inserts.forEach((fn) => fn(rec));
    return rec;
  }
  async removeOwn(id: string) {
    this.write(this.read().filter((r) => r.id !== id));
    this.deletes.forEach((fn) => fn(id));
  }
  async checkAdmin(token: string) {
    return token === LOCAL_ADMIN;
  }
  async removeAsAdmin(id: string, token: string) {
    if (token !== LOCAL_ADMIN) throw new Error('관리자 비밀번호가 틀렸어요');
    await this.removeOwn(id);
  }
  subscribe(onInsert: (r: Report) => void, onDelete: (id: string) => void) {
    this.inserts.add(onInsert);
    this.deletes.add(onDelete);
    return () => {
      this.inserts.delete(onInsert);
      this.deletes.delete(onDelete);
    };
  }
}

// ---------- supabase ----------
interface Row {
  id: string;
  restaurant_id: string;
  kind: ReportKind;
  wait_level: Report['waitLevel'];
  wait_teams: number | null;
  wait_minutes: number | null;
  rating: number | null;
  comment: string | null;
  tag: ReportTag | null;
  device_id: string | null;
  created_at: string;
}

/**
 * 직접 수정은 DB 를 바꾸지 않으려고 후기(review, 별점 없음) 칸에 "[fix:종류]내용" 으로 저장한다.
 * 가격정보는 "[fix:price]메뉴|가격"
 */
const FIX_RE = /^\[fix:(price|info|hours|photo|etc)\]([\s\S]*)$/;

function encodeFix(r: NewReport): string {
  const body = r.fixType === 'price' ? `${r.fixMenu ?? ''}|${r.fixPrice ?? ''}` : (r.comment ?? '');
  return `[fix:${r.fixType}]${body}`;
}

function decodeFix(rep: Report): Report {
  const m = rep.kind === 'review' && rep.rating == null ? rep.comment?.match(FIX_RE) : null;
  if (!m) return rep;
  const fixType = m[1] as FixType;
  if (fixType !== 'price') return { ...rep, kind: 'fix', fixType, comment: m[2] };
  const [menu, price] = m[2].split('|');
  return { ...rep, kind: 'fix', fixType, fixMenu: menu, fixPrice: Number(price) || null, comment: null };
}

/** 제보·의견도 같은 방식으로 "[fb:종류:근무지]내용" 으로 저장한다. 보낸 기기는 남기지 않는다 */
const FB_RE = /^\[fb:(new|closed|bad|good|etc):(\w*)\]([\s\S]*)$/;

function encodeFeedback(r: NewReport): string {
  return `[fb:${r.feedbackType ?? 'etc'}:${r.feedbackSite ?? ''}]${r.comment ?? ''}`;
}

function decodeFeedback(rep: Report): Report {
  const m = rep.kind === 'review' && rep.rating == null && rep.restaurantId === FEEDBACK_ID ? rep.comment?.match(FB_RE) : null;
  if (!m) return rep;
  return { ...rep, kind: 'feedback', feedbackType: m[1] as FeedbackType, feedbackSite: m[2] || null, comment: m[3] };
}

function fromRow(r: Row): Report {
  return decodeFeedback(decodeFix({
    id: r.id,
    restaurantId: r.restaurant_id,
    kind: r.kind,
    waitLevel: r.wait_level,
    waitTeams: r.wait_teams,
    waitMinutes: r.wait_minutes,
    rating: r.rating,
    comment: r.comment,
    tag: r.tag,
    deviceId: r.device_id,
    createdAt: r.created_at,
  }));
}

class SupabaseBackend implements ReportsBackend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  async list() {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.sb
      .from('reports')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  }
  async add(r: NewReport) {
    const { data, error } = await this.sb
      .from('reports')
      .insert({
        restaurant_id: r.restaurantId,
        kind: r.kind === 'fix' || r.kind === 'feedback' ? 'review' : r.kind,
        wait_level: r.waitLevel ?? null,
        wait_teams: r.waitTeams ?? null,
        wait_minutes: r.waitMinutes ?? null,
        rating: r.kind === 'fix' || r.kind === 'feedback' ? null : (r.rating ?? null),
        comment: r.kind === 'fix' ? encodeFix(r) : r.kind === 'feedback' ? encodeFeedback(r) : (r.comment ?? null),
        tag: r.tag ?? null,
        device_id: r.kind === 'feedback' ? null : deviceId(),
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }
  async removeOwn(id: string) {
    const { error } = await this.sb.rpc('delete_own_report', { p_id: id, p_device: deviceId() });
    if (error) throw error;
  }
  async checkAdmin(token: string) {
    const { data, error } = await this.sb.rpc('admin_check', { p_token: token });
    if (error) throw error;
    return data === true;
  }
  async removeAsAdmin(id: string, token: string) {
    const { data, error } = await this.sb.rpc('admin_delete_report', { p_id: id, p_token: token });
    if (error) throw error;
    if (data !== true) throw new Error('관리자 비밀번호가 틀렸어요');
  }
  subscribe(onInsert: (r: Report) => void, onDelete: (id: string) => void) {
    const ch = this.sb
      .channel(`reports-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) =>
        onInsert(fromRow(payload.new as Row)),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reports' }, (payload) => {
        const id = (payload.old as Partial<Row>).id;
        if (id) onDelete(id);
      })
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}

let clientCache: { sb: SupabaseClient | null; reason?: LocalReason } | null = null;

/** 제보·공유톡이 함께 쓰는 Supabase 연결. 설정이 없거나 잘못되면 sb = null (로컬 저장) */
export function supabaseClient(): { sb: SupabaseClient | null; reason?: LocalReason } {
  if (clientCache) return clientCache;
  const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
  const key = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();
  if (!url || !key) clientCache = { sb: null, reason: 'unset' };
  // 환경변수가 잘못 들어가도(URL 형식 오류 등) 앱 전체가 죽지 않고 로컬 저장으로 넘어가도록
  else if (!/^https?:\/\/[^\s/]+\.supabase\.(co|in)\/?$/i.test(url)) {
    console.warn('[jamsil-lunch] VITE_SUPABASE_URL 형식이 올바르지 않아 로컬 저장으로 전환합니다');
    clientCache = { sb: null, reason: 'invalid-url' };
  } else {
    try {
      clientCache = { sb: createClient(url, key, { auth: { persistSession: false } }) };
    } catch (e) {
      console.warn('[jamsil-lunch] Supabase 클라이언트 생성 실패, 로컬 저장으로 전환합니다:', e);
      clientCache = { sb: null, reason: 'init-failed' };
    }
  }
  return clientCache;
}

/** 로컬 저장 모드에서 쓰는 관리자 비밀번호 */
export function localAdminToken(): string {
  return LOCAL_ADMIN;
}

export function createReportsBackend(): ReportsBackend {
  const { sb, reason } = supabaseClient();
  return sb ? new SupabaseBackend(sb) : new LocalBackend(reason);
}

// ---------- helpers ----------
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export interface ReportSummary {
  liveWait: Report | null; // 최근 3시간 내 가장 최신 웨이팅 제보
  reviewCount: number;
  avgRating: number | null;
  /** 별점 합계 — "별점 많은 순" 정렬 기준 */
  totalStars: number;
  hidden: number; // 🤫 숨은맛집 체크 수
  classic: number; // 🔁 또 갈래요 체크 수
  favs: number; // ⭐ 관심 저장한 기기 수
  delivery: number; // 🛵 배달 돼요 체크 수
  /** 이 기기에서 체크한 태그 */
  myTags: Partial<Record<ReportTag, string>>; // tag → report id
}

export function emptySummary(): ReportSummary {
  return { liveWait: null, reviewCount: 0, avgRating: null, totalStars: 0, hidden: 0, classic: 0, favs: 0, delivery: 0, myTags: {} };
}

export function summarize(reports: Report[], now = Date.now()): Map<string, ReportSummary> {
  const m = new Map<string, ReportSummary>();
  const me = deviceId();
  for (const r of reports) {
    let s = m.get(r.restaurantId);
    if (!s) {
      s = emptySummary();
      m.set(r.restaurantId, s);
    }
    if (r.kind === 'wait') {
      const fresh = now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS;
      if (fresh && (!s.liveWait || r.createdAt > s.liveWait.createdAt)) s.liveWait = r;
    } else if (r.kind === 'review' && r.rating != null) {
      s.totalStars += r.rating;
      s.reviewCount += 1;
      s.avgRating = s.totalStars / s.reviewCount;
    } else if (r.kind === 'tag' && r.tag) {
      if (r.tag === 'fav') s.favs += 1;
      else if (r.tag === 'delivery') s.delivery += 1;
      else s[r.tag] += 1;
      if (r.deviceId === me && !s.myTags[r.tag]) s.myTags[r.tag] = r.id;
    }
  }
  return m;
}
