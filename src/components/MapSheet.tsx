import { useRef, useState, type ReactNode } from 'react';

/** 식당이 바뀌면 다시 접힌 상태로 시작하도록 key 를 식당 id 로 주세요 */
interface Props {
  children: ReactNode;
  onClose: () => void;
}

/** 이만큼(px) 끌면 펼치기/접기 */
const SWIPE_PX = 40;

/**
 * 지도 아래에서 끌어 올리는 식당 정보 패널.
 * 접힘(peek): 이름 줄만 보이고 지도는 그대로 → 위로 올리면 펼쳐져 상세 정보, 다시 내리면 지도.
 */
export function MapSheet({ children, onClose }: Props) {
  const [full, setFull] = useState(false);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ y: number; fromBody: boolean; active: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const body = () => ref.current?.querySelector<HTMLElement>('.detail-body') ?? null;

  return (
    <div
      ref={ref}
      className={'map-sheet' + (full ? ' full' : '') + (drag ? ' dragging' : '')}
      style={drag ? { transform: `translateY(${full ? Math.max(0, drag) : Math.min(0, drag) * 0.25}px)` } : undefined}
      onTouchStart={(e) => {
        const b = body();
        const fromBody = !!b && b.contains(e.target as Node);
        touch.current = { y: e.touches[0].clientY, fromBody, active: false };
      }}
      onTouchMove={(e) => {
        const t = touch.current;
        if (!t) return;
        const dy = e.touches[0].clientY - t.y;
        // 펼친 상태에서 내용을 스크롤 중이면 패널은 그대로
        if (full && t.fromBody && ((body()?.scrollTop ?? 0) > 0 || dy < 0)) return;
        t.active = true;
        setDrag(dy);
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        setDrag(0);
        if (!t?.active) return;
        const dy = e.changedTouches[0].clientY - t.y;
        if (dy < -SWIPE_PX) setFull(true);
        else if (dy > SWIPE_PX) {
          if (full) setFull(false);
          else onClose();
        }
      }}
      onTouchCancel={() => {
        touch.current = null;
        setDrag(0);
      }}
      onClick={(e) => {
        // 접힌 상태에서 이름 줄을 누르면 펼친다 (버튼·링크는 제외)
        if (!full && !(e.target as HTMLElement).closest('button, a, input')) setFull(true);
      }}
    >
      <button className="sheet-grip" onClick={() => setFull((v) => !v)} aria-label={full ? '지도 보기' : '자세히 보기'}>
        <span aria-hidden />
        {!full && <em>위로 올려 자세히 보기</em>}
      </button>
      {children}
    </div>
  );
}
