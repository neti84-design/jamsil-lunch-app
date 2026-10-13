import type { Restaurant } from '../types';
import type { SiteId } from '../lib/sites';

/**
 * 근무지별 식당 — 고른 근무지 데이터만 따로 내려받는다 (두 곳을 한꺼번에 받으면 첫 화면이 느려서).
 * 한 번 받은 건 다시 받지 않는다
 */
const LOADERS: Record<SiteId, () => Promise<Restaurant[]>> = {
  jamsil: () => import('./jamsil').then((m) => m.RESTAURANTS),
  ydp: () => import('./ydp').then((m) => m.RESTAURANTS),
};

const cache = new Map<SiteId, Promise<Restaurant[]>>();

export function loadRestaurants(site: SiteId): Promise<Restaurant[]> {
  let p = cache.get(site);
  if (!p) {
    p = LOADERS[site]();
    // 실패하면 다음에 다시 받을 수 있게
    p.catch(() => cache.delete(site));
    cache.set(site, p);
  }
  return p;
}
