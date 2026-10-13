import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

interface Props {
  className: string;
  children: ReactNode;
  /** 바깥에서도 이 줄을 잡아야 할 때 (보던 위치 기억 등) */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  label?: string;
}

/** 옆으로 넘기는 줄 — PC(마우스)에서는 양 끝에 ‹ › 버튼이 생겨 눌러서 넘긴다 */
export function HScroll({ className, children, scrollRef, onScroll, label }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ prev: false, next: false });

  const update = useCallback(() => {
    const s = el.current;
    if (!s) return;
    setEdge({ prev: s.scrollLeft > 4, next: s.scrollLeft + s.clientWidth < s.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const s = el.current;
    if (!s) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(s);
    for (const c of Array.from(s.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [update, children]);

  const setRef = (node: HTMLDivElement | null) => {
    el.current = node;
    if (typeof scrollRef === 'function') scrollRef(node);
    else if (scrollRef) (scrollRef as { current: HTMLDivElement | null }).current = node;
  };

  const go = (dir: 1 | -1) => {
    const s = el.current;
    if (s) s.scrollBy({ left: dir * Math.max(120, s.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="hscroll">
      <div
        className={className}
        ref={setRef}
        aria-label={label}
        onScroll={() => {
          update();
          onScroll?.();
        }}
      >
        {children}
      </div>
      {edge.prev && (
        <button type="button" className="hscroll-btn prev" onClick={() => go(-1)} aria-label="왼쪽으로 넘기기">
          ‹
        </button>
      )}
      {edge.next && (
        <button type="button" className="hscroll-btn next" onClick={() => go(1)} aria-label="오른쪽으로 넘기기">
          ›
        </button>
      )}
    </div>
  );
}
