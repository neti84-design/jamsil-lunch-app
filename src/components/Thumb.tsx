import { useState, type ReactNode } from 'react';
import { CUISINE_EMOJI, type Restaurant } from '../types';

interface Props {
  r: Restaurant;
  /** 보여 줄 크기(px). 카카오 썸네일 서버에 이 크기의 2배로 줄여 달라고 한다 */
  width: number;
  height: number;
  className?: string;
  /** 사진이 없을 때 보일 것 (기본: 음식 종류 이모지) */
  fallback?: ReactNode;
}

/**
 * 카카오맵이 쓰는 썸네일 서버로 줄인 사진 주소.
 * 네이버 블로그 사진은 다른 사이트에서 바로 불러오면 막히는데, 이 서버를 거치면 카카오맵처럼 보이고
 * 원본(수 MB)이 아니라 작은 사진을 받는다.
 */
function kakaoThumb(url: string, width: number, height: number) {
  return `https://img1.kakaocdn.net/cthumb/local/C${width * 2}x${height * 2}.q70/?fname=${encodeURIComponent(url)}`;
}

/** 가게 대표 사진. 썸네일 → 원본 순으로 시도하고, 둘 다 안 되면 음식 종류 이모지 */
export function Thumb({ r, width, height, className, fallback = CUISINE_EMOJI[r.cuisine] }: Props) {
  const [failed, setFailed] = useState<{ photo: string; count: number } | null>(null);
  // 이 기기에만 저장된 제보 사진(data URL)은 썸네일 서버를 거치지 않는다
  const tries = r.photo ? (r.photo.startsWith('data:') ? [r.photo] : [kakaoThumb(r.photo, width, height), r.photo]) : [];
  const step = failed && failed.photo === r.photo ? failed.count : 0;
  const src = tries[step];
  if (!src) return <>{fallback}</>;
  return (
    <img
      key={src}
      className={'thumb-img' + (className ? ` ${className}` : '')}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      // 블로그 사진(네이버)은 다른 사이트에서 왔다고 하면 막혀서 출처를 보내지 않는다
      referrerPolicy="no-referrer"
      onError={() => setFailed({ photo: r.photo!, count: step + 1 })}
    />
  );
}
