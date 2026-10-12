import type { Restaurant } from '../types';

function q(r: Restaurant): string {
  return encodeURIComponent(`${r.name}${r.branch ? ' ' + r.branch : ''} 잠실`);
}

export function naverMapLink(r: Restaurant): string {
  return r.links.naverPlace ?? `https://map.naver.com/p/search/${q(r)}`;
}

export function kakaoMapLink(r: Restaurant): string {
  return r.links.kakaoMap ?? `https://map.kakao.com/?q=${q(r)}`;
}

export function naverBlogSearchLink(r: Restaurant): string {
  return `https://search.naver.com/search.naver?where=view&query=${q(r)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

export function formatWon(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
