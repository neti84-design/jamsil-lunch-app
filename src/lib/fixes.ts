import type { MenuItem, Restaurant } from '../types';
import { NO_PHOTO, type Report } from './reports';

/** 점심 가격대에 넣을 만한 가격 (이보다 비싼 건 메뉴판에만) */
const LUNCH_MAX = 30000;

const key = (name: string) => name.replace(/\s+/g, '');

/**
 * 사용자 "직접 수정" 반영: 가격정보는 메뉴 가격 칸에(같은 메뉴면 가격을 바꿈), 영업시간은 영업시간 칸에, 메인 사진은 사진 칸에.
 * 같은 칸을 여러 번 고쳤으면 가장 최근 것. 운영 정보·기타는 식당 정보 화면에 목록으로만 보인다
 */
export function applyFixes(list: Restaurant[], reports: Report[]): Restaurant[] {
  const byId = new Map<string, Report[]>();
  for (const r of reports) {
    if (r.kind !== 'fix' || (r.fixType !== 'price' && r.fixType !== 'hours' && r.fixType !== 'photo')) continue;
    byId.set(r.restaurantId, [...(byId.get(r.restaurantId) ?? []), r]);
  }
  if (byId.size === 0) return list;
  return list.map((r) => {
    const fixes = byId.get(r.id);
    if (!fixes) return r;
    const out = { ...r, menu: [...r.menu] };
    // 오래된 것부터 차례로 → 최근 것이 남는다
    for (const f of [...fixes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (f.fixType === 'hours' && f.comment?.trim()) {
        out.hours = f.comment.trim();
        out.hoursReported = true;
        // 제보한 시간에 브레이크·휴무가 들어 있을 수 있어 예전 값은 지운다
        out.breakTime = null;
        out.closedDays = null;
      }
      if (f.fixType === 'photo') {
        const url = f.comment?.trim() ?? '';
        // "사진 빼기"면 음식 이모지로, 아니면 제보한 사진으로
        if (url === NO_PHOTO) out.photo = null;
        else if (/^(https:\/\/|data:image\/)/.test(url)) out.photo = url;
      }
      if (f.fixType === 'price' && f.fixMenu?.trim() && f.fixPrice && f.fixPrice > 0) {
        const item: MenuItem = { name: f.fixMenu.trim(), price: f.fixPrice, reported: true };
        const i = out.menu.findIndex((m) => key(m.name) === key(item.name));
        if (i >= 0) out.menu[i] = item;
        else out.menu.unshift(item);
        if (item.price <= LUNCH_MAX) {
          const [lo, hi] = out.priceRange ?? [item.price, item.price];
          out.priceRange = [Math.min(lo, item.price), Math.max(hi, item.price)];
        }
        if (!out.signature.some((s) => key(s) === key(item.name))) out.signature = [...out.signature, item.name];
      }
    }
    return out;
  });
}
