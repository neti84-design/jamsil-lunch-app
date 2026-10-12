import { useEffect, useState } from 'react';

/** 이 너비 이상이면 PC 화면 (지도 왼쪽 + 조건·식당 오른쪽) */
export const WIDE_QUERY = '(min-width: 1024px)';

export function isWide(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches;
}

/** 창 크기를 바꾸면 PC ↔ 휴대폰 화면도 따라 바뀐다 */
export function useWide(): boolean {
  const [wide, setWide] = useState(isWide);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
