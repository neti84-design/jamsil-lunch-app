import { OFFICE } from './geo';

/** 점심때(12시) 잠실 날씨 — Open-Meteo (키 없이 쓰는 무료 날씨 API) */
export interface LunchWeather {
  /** 기온 (°C) */
  temp: number;
  /** 강수 확률 (%) */
  rainChance: number | null;
  /** WMO 날씨 코드 */
  code: number;
  kind: WeatherKind;
  label: string;
  emoji: string;
}

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

const CACHE_KEY = 'jamsil-lunch:weather';
/** 같은 날씨를 30분 동안 다시 쓴다 */
const CACHE_MS = 30 * 60 * 1000;
const LUNCH_HOUR = 12;

/** WMO 날씨 코드 → 우리말 */
export function describeCode(code: number): { kind: WeatherKind; label: string; emoji: string } {
  if (code === 0) return { kind: 'clear', label: '맑음', emoji: '☀️' };
  if (code <= 2) return { kind: 'clear', label: '구름 조금', emoji: '🌤️' };
  if (code === 3) return { kind: 'cloudy', label: '흐림', emoji: '☁️' };
  if (code === 45 || code === 48) return { kind: 'fog', label: '안개', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: '이슬비', emoji: '🌦️' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: '비', emoji: '🌧️' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: '눈', emoji: '🌨️' };
  if (code >= 95) return { kind: 'storm', label: '뇌우', emoji: '⛈️' };
  return { kind: 'cloudy', label: '흐림', emoji: '☁️' };
}

interface ApiResponse {
  current?: { temperature_2m?: number; weather_code?: number };
  hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: (number | null)[]; weather_code?: number[] };
}

function parse(json: ApiResponse, now: Date): LunchWeather | null {
  const h = json.hourly;
  // 점심 전이면 12시 예보, 점심이 지났으면 지금 날씨
  const hour = now.getHours() <= LUNCH_HOUR ? LUNCH_HOUR : now.getHours();
  const i = h?.time?.findIndex((t) => Number(t.slice(11, 13)) === hour) ?? -1;
  const temp = i >= 0 ? h?.temperature_2m?.[i] : json.current?.temperature_2m;
  const code = i >= 0 ? h?.weather_code?.[i] : json.current?.weather_code;
  if (temp == null || code == null) return null;
  const rainChance = i >= 0 ? (h?.precipitation_probability?.[i] ?? null) : null;
  return { temp: Math.round(temp), rainChance, code, ...describeCode(code) };
}

export async function fetchLunchWeather(signal?: AbortSignal): Promise<LunchWeather | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; w: LunchWeather } | null;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.w;
  } catch {
    /* ignore */
  }
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${OFFICE.lat}&longitude=${OFFICE.lng}` +
    '&current=temperature_2m,weather_code' +
    '&hourly=temperature_2m,precipitation_probability,weather_code' +
    '&forecast_days=1&timezone=Asia%2FSeoul';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`날씨 ${res.status}`);
  const w = parse((await res.json()) as ApiResponse, new Date());
  if (w) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), w }));
    } catch {
      /* ignore */
    }
  }
  return w;
}
