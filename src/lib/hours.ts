import type { Restaurant } from '../types';

/**
 * 네이버 지도처럼 "영업 중 / 마감 1시간 전 / 브레이크타임 / 영업 종료" 상태를 계산한다.
 * 데이터의 영업시간은 사람이 적은 문자열이라 대표적인 형식만 해석하고,
 * 해석이 안 되면 'unknown' 으로 돌려준다. 시간은 항상 한국 시간(KST) 기준.
 */
export type OpenState = 'open' | 'closing' | 'break' | 'before' | 'closed' | 'dayoff' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  label: string;
  /** "21:30에 영업 종료" 같은 보조 설명 */
  detail?: string;
}

export const OPEN_STATE_COLOR: Record<OpenState, string> = {
  open: 'var(--ok)',
  closing: 'var(--warn)',
  break: 'var(--warn)',
  before: 'var(--muted)',
  closed: 'var(--muted)',
  dayoff: 'var(--danger)',
  unknown: 'var(--muted)',
};

/** 마감 몇 분 전부터 "마감 1시간 전"으로 보여줄지 */
const CLOSING_SOON_MIN = 60;

const DAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

interface Span {
  days: number[];
  /** 자정 기준 분. end 가 1440 을 넘으면 다음 날 새벽까지 영업 */
  start: number;
  end: number;
}

interface Schedule {
  allDay: boolean;
  spans: Span[];
  breaks: Span[];
  closed: (date: KstDate) => boolean;
}

interface KstDate {
  day: number;
  date: number;
  minutes: number;
}

function kst(now: number): KstDate {
  const d = new Date(now + 9 * 3600_000);
  return { day: d.getUTCDay(), date: d.getUTCDate(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "월~토", "평일·토", "화·수·금", "매일" → 요일 번호. 해석 불가면 null */
function parseDays(spec: string): number[] | null {
  const s = spec.replace(/\s+/g, '').replace(/요일/g, '');
  if (!s) return ALL_DAYS;
  const out = new Set<number>();
  for (const part of s.split(/[·,]/)) {
    if (part === '매일') ALL_DAYS.forEach((d) => out.add(d));
    else if (part === '평일') WEEKDAYS.forEach((d) => out.add(d));
    else if (part === '주말') [0, 6].forEach((d) => out.add(d));
    else if (/^[월화수목금토일]~[월화수목금토일]$/.test(part)) {
      const a = DAY_INDEX[part[0]];
      const b = DAY_INDEX[part[2]];
      for (let i = a; ; i = (i + 1) % 7) {
        out.add(i);
        if (i === b) break;
      }
    } else if (/^[월화수목금토일]$/.test(part)) out.add(DAY_INDEX[part]);
    else return null;
  }
  return [...out];
}

const RANGE = /(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/;

function parseSpans(text: string): Span[] {
  const spans: Span[] = [];
  // 괄호 안(L.O, 유인 시간 등)은 무시
  for (const seg of text.replace(/\([^)]*\)/g, '').split(/[,;]/)) {
    const m = seg.match(RANGE);
    if (!m || m.index == null) continue;
    const days = parseDays(seg.slice(0, m.index));
    if (!days) continue;
    const start = toMin(m[1]);
    let end = toMin(m[2]);
    if (end <= start) end += 1440;
    spans.push({ days, start, end });
  }
  return spans;
}

function parseBreaks(text: string | null | undefined): Span[] {
  if (!text) return [];
  const m = text.match(RANGE);
  if (!m) return [];
  const weekdaysOnly = /평일|주말\s*없음/.test(text);
  return [{ days: weekdaysOnly ? WEEKDAYS : ALL_DAYS, start: toMin(m[1]), end: toMin(m[2]) }];
}

function parseClosed(text: string | null | undefined): (d: KstDate) => boolean {
  const none = () => false;
  if (!text) return none;
  const s = text.replace(/\([^)]*\)/g, '').trim();
  const nth = s.match(/^매월\s*([\d·,\s]+)번째\s*([월화수목금토일])요일/);
  if (nth) {
    const weeks = nth[1].split(/[·,\s]+/).filter(Boolean).map(Number);
    const day = DAY_INDEX[nth[2]];
    return (d) => d.day === day && weeks.includes(Math.ceil(d.date / 7));
  }
  if (/^[월화수목금토일](요일)?([·,\s]+[월화수목금토일](요일)?)*$/.test(s)) {
    const days = parseDays(s.replace(/\s+/g, '').replace(/,/g, '·'));
    if (days) return (d) => days.includes(d.day);
  }
  return none;
}

const cache = new Map<string, Schedule | null>();

function schedule(r: Restaurant): Schedule | null {
  if (cache.has(r.id)) return cache.get(r.id)!;
  let result: Schedule | null = null;
  const hours = r.hours?.trim();
  if (hours) {
    const allDay = /^24시간/.test(hours);
    const spans = allDay ? [] : parseSpans(hours);
    if (allDay || spans.length) {
      result = { allDay, spans, breaks: parseBreaks(r.breakTime), closed: parseClosed(r.closedDays) };
    }
  }
  cache.set(r.id, result);
  return result;
}

export function openStatus(r: Restaurant, now: number): OpenStatus {
  const s = schedule(r);
  if (!s) return { state: 'unknown', label: '영업시간 미확인' };
  const t = kst(now);
  const yesterday = (t.day + 6) % 7;

  // 전날 밤부터 이어지는 새벽 영업
  const overnight = s.spans.find((sp) => sp.days.includes(yesterday) && sp.end > 1440 && t.minutes < sp.end - 1440);
  if (overnight) return openOrClosing(overnight.end - 1440, t.minutes, []);

  if (s.closed(t)) return { state: 'dayoff', label: '오늘 휴무', detail: r.closedDays ?? undefined };
  if (s.allDay) return { state: 'open', label: '영업 중', detail: '24시간 영업' };

  const today = s.spans.filter((sp) => sp.days.includes(t.day)).sort((a, b) => a.start - b.start);
  if (!today.length) return { state: 'dayoff', label: '오늘 휴무' };

  const breaks = s.breaks.filter((b) => b.days.includes(t.day));
  for (const sp of today) {
    if (t.minutes < sp.start) return { state: 'before', label: '영업 전', detail: `${fmt(sp.start)}에 영업 시작` };
    if (t.minutes < sp.end) {
      const br = breaks.find((b) => t.minutes >= b.start && t.minutes < b.end);
      if (br) return { state: 'break', label: '브레이크타임', detail: `${fmt(br.end)}에 영업 재개` };
      return openOrClosing(sp.end, t.minutes, breaks.filter((b) => b.start > t.minutes && b.start < sp.end));
    }
  }
  return { state: 'closed', label: '영업 종료', detail: `${fmt(today[today.length - 1].end)}에 영업 종료` };
}

function openOrClosing(end: number, nowMin: number, upcomingBreaks: Span[]): OpenStatus {
  const left = end - nowMin;
  const brk = upcomingBreaks[0];
  if (brk) {
    const toBreak = brk.start - nowMin;
    if (toBreak <= CLOSING_SOON_MIN) {
      return { state: 'closing', label: '브레이크 1시간 전', detail: `${fmt(brk.start)}부터 브레이크타임 (${toBreak}분 남음)` };
    }
    return { state: 'open', label: '영업 중', detail: `${fmt(brk.start)}에 브레이크타임` };
  }
  if (left <= CLOSING_SOON_MIN) {
    return { state: 'closing', label: '마감 1시간 전', detail: `${fmt(end)}에 영업 종료 (${left}분 남음)` };
  }
  return { state: 'open', label: '영업 중', detail: `${fmt(end)}에 영업 종료` };
}

/** 지금 가면 먹을 수 있는(혹은 확인이 안 된) 곳인지 */
export function maybeOpen(r: Restaurant, now: number): boolean {
  const st = openStatus(r, now).state;
  return st === 'open' || st === 'closing' || st === 'unknown';
}
