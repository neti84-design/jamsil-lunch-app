import { useMemo, useRef, useState } from 'react';
import type { LeafletEventHandlerFnMap } from 'leaflet';

/**
 * 지도 타일이 로드되는지 감시. 회사망/미리보기 샌드박스처럼 외부 이미지가 막힌 환경에서는
 * tileerror 만 연속으로 발생하므로 '차단됨'으로 판단해 약도 모드로 전환한다.
 */
export function useTileStatus(): { blocked: boolean; handlers: LeafletEventHandlerFnMap } {
  const [blocked, setBlocked] = useState(false);
  const errors = useRef(0);
  const loaded = useRef(false);
  const handlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      tileload: () => {
        loaded.current = true;
        setBlocked(false);
      },
      tileerror: () => {
        errors.current += 1;
        if (!loaded.current && errors.current >= 3) setBlocked(true);
      },
    }),
    [],
  );
  return { blocked, handlers };
}
