import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WaitLevel } from '../types';

export type ReportKind = 'wait' | 'review';

export interface Report {
  id: string;
  restaurantId: string;
  kind: ReportKind;
  waitLevel?: Exclude<WaitLevel, 'unknown'> | null;
  waitMinutes?: number | null;
  rating?: number | null;
  comment?: string | null;
  nickname?: string | null;
  createdAt: string; // ISO
}

export type NewReport = Omit<Report, 'id' | 'createdAt'>;

export interface ReportsBackend {
  /** 'supabase' = 모두와 공유, 'local' = 이 기기에만 저장 */
  readonly mode: 'supabase' | 'local';
  list(): Promise<Report[]>;
  add(r: NewReport): Promise<Report>;
  /** 새 제보가 들어오면 호출. 해제 함수 반환 */
  subscribe(onInsert: (r: Report) => void): () => void;
}

/** 이 시간 안의 웨이팅 제보만 "실시간"으로 취급 */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

const LOCAL_KEY = 'jamsil-lunch:reports';
const NICK_KEY = 'jamsil-lunch:nickname';

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveNickname(n: string) {
  try {
    localStorage.setItem(NICK_KEY, n);
  } catch {
    /* ignore */
  }
}

// ---------- local fallback ----------
class LocalBackend implements ReportsBackend {
  readonly mode = 'local' as const;
  private listeners = new Set<(r: Report) => void>();

  private read(): Report[] {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Report[];
    } catch {
      return [];
    }
  }
  async list() {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async add(r: NewReport) {
    const rec: Report = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const all = this.read();
    all.push(rec);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-500)));
    } catch {
      /* ignore */
    }
    this.listeners.forEach((fn) => fn(rec));
    return rec;
  }
  subscribe(fn: (r: Report) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

// ---------- supabase ----------
interface Row {
  id: string;
  restaurant_id: string;
  kind: ReportKind;
  wait_level: Report['waitLevel'];
  wait_minutes: number | null;
  rating: number | null;
  comment: string | null;
  nickname: string | null;
  created_at: string;
}

function fromRow(r: Row): Report {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    kind: r.kind,
    waitLevel: r.wait_level,
    waitMinutes: r.wait_minutes,
    rating: r.rating,
    comment: r.comment,
    nickname: r.nickname,
    createdAt: r.created_at,
  };
}

class SupabaseBackend implements ReportsBackend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  async list() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.sb
      .from('reports')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  }
  async add(r: NewReport) {
    const { data, error } = await this.sb
      .from('reports')
      .insert({
        restaurant_id: r.restaurantId,
        kind: r.kind,
        wait_level: r.waitLevel ?? null,
        wait_minutes: r.waitMinutes ?? null,
        rating: r.rating ?? null,
        comment: r.comment ?? null,
        nickname: r.nickname ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }
  subscribe(fn: (r: Report) => void) {
    const ch = this.sb
      .channel('reports-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) =>
        fn(fromRow(payload.new as Row)),
      )
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}

export function createReportsBackend(): ReportsBackend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    return new SupabaseBackend(createClient(url, key, { auth: { persistSession: false } }));
  }
  return new LocalBackend();
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
}

export function summarize(reports: Report[], now = Date.now()): Map<string, ReportSummary> {
  const m = new Map<string, ReportSummary>();
  for (const r of reports) {
    let s = m.get(r.restaurantId);
    if (!s) {
      s = { liveWait: null, reviewCount: 0, avgRating: null };
      m.set(r.restaurantId, s);
    }
    if (r.kind === 'wait') {
      const fresh = now - new Date(r.createdAt).getTime() <= LIVE_WINDOW_MS;
      if (fresh && (!s.liveWait || r.createdAt > s.liveWait.createdAt)) s.liveWait = r;
    } else if (r.kind === 'review' && r.rating != null) {
      const total = (s.avgRating ?? 0) * s.reviewCount + r.rating;
      s.reviewCount += 1;
      s.avgRating = total / s.reviewCount;
    }
  }
  return m;
}
