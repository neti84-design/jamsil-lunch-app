import { useState, type ReactNode } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';

interface Props {
  r: Restaurant;
  className?: string;
  /** 사진이 없을 때 보일 것 (기본: 음식 종류 이모지) */
  fallback?: ReactNode;
}

/** 가게 대표 사진. 사진이 없거나 못 불러오면 음식 종류 이모지 */
export function Thumb({ r, className, fallback = CUISINE_EMOJI[r.cuisine] }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = r.photo && failed !== r.photo ? r.photo : null;
  if (!src) return <>{fallback}</>;
  return (
    <img
      className={'thumb-img' + (className ? ` ${className}` : '')}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      // 블로그 사진(네이버)은 다른 사이트에서 왔다고 하면 막혀서 출처를 보내지 않는다
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
    />
  );
}
