import { supabaseClient } from './reports';

/** 홈 '추천'에서 "많이 본 매장"을 셀 기간 */
export const VIEW_DAYS = 14;

/** 같은 기기에서 같은 식당을 이 시간 안에 다시 열면 한 번으로 친다 */
const SAME_VIEW_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

/** 식당 상세를 열었다고 공유 저장소에 1 더한다 (실패해도 조용히 넘어간다) */
export function bumpView(restaurantId: string) {
  const now = Date.now();
  if (now - (lastSent.get(restaurantId) ?? 0) < SAME_VIEW_MS) return;
  lastSent.set(restaurantId, now);
  const { sb } = supabaseClient();
  if (!sb) return;
  sb.rpc('bump_view', { p_restaurant: restaurantId }).then(({ error }) => {
    if (error) console.warn('[jamsil-lunch] 조회수 기록 실패:', error.message);
  });
}

/** 최근 VIEW_DAYS 일 동안 전체 사용자가 연 횟수 (식당별). 저장소가 없거나 표가 아직 없으면 빈 값 */
export async function loadViewCounts(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const { sb } = supabaseClient();
  if (!sb) return m;
  const since = new Date(Date.now() - VIEW_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('restaurant_views').select('restaurant_id, views').gte('day', since).limit(5000);
  if (error) {
    console.warn('[jamsil-lunch] 조회수 불러오기 실패:', error.message);
    return m;
  }
  for (const row of data as { restaurant_id: string; views: number }[]) m.set(row.restaurant_id, (m.get(row.restaurant_id) ?? 0) + row.views);
  return m;
}
