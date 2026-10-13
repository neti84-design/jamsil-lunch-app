import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

interface Props {
  className: string;
  children: ReactNode;
  /** 바깥에서도 이 줄을 잡아야 할 때 (보던 위치 기억 등) */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  label?: string;
  /** 넘칠 때 저절로 천천히 옆으로 흘러가게 (손을 대면 잠깐 멈춤) */
  auto?: boolean;
}

/** 자동으로 흐르는 속도(px/초)와 끝에서 쉬는 시간 */
const AUTO_SPEED = 24;
const AUTO_PAUSE_MS = 1800;
/** 손을 뗀 뒤 다시 흐르기까지 */
const AUTO_RESUME_MS = 2500;

/** 옆으로 넘기는 줄 — PC(마우스)에서는 양 끝에 ‹ › 버튼이 생겨 눌러서 넘긴다 */
export function HScroll({ className, children, scrollRef, onScroll, label, auto = false }: Props) {
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

  /** 사람이 만지고 있으면(또는 막 손을 뗐으면) 자동 흐름을 멈춘다 */
  const holdUntil = useRef(0);
  const hold = (ms = AUTO_RESUME_MS) => {
    holdUntil.current = Math.max(holdUntil.current, performance.now() + ms);
  };
  const hovering = useRef(false);

  useEffect(() => {
    const s = el.current;
    if (!auto || !s || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    // scrollLeft 는 정수로 반올림되기도 해서 소수점 위치를 따로 들고 간다
    let pos = s.scrollLeft;
    const tick = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      const max = s.scrollWidth - s.clientWidth;
      if (max > 4 && !hovering.current && t >= holdUntil.current && !document.hidden) {
        if (Math.abs(s.scrollLeft - pos) > 2) pos = s.scrollLeft; // 손으로 옮긴 위치에서 이어서
        pos += (AUTO_SPEED * dt) / 1000;
        if (pos >= max) {
          // 끝까지 가면 잠깐 쉬었다가 처음으로
          pos = 0;
          holdUntil.current = t + AUTO_PAUSE_MS;
          setTimeout(() => s.scrollTo({ left: 0, behavior: 'smooth' }), AUTO_PAUSE_MS / 2);
        } else s.scrollLeft = pos;
      } else pos = s.scrollLeft;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

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
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        onPointerDown={() => hold()}
        onTouchStart={() => hold()}
        onWheel={() => hold()}
        onScroll={() => {
          update();
          onScroll?.();
        }}
      >
        {children}
      </div>
      {edge.prev && (
        <button
          type="button"
          className="hscroll-btn prev"
          onClick={() => {
            hold();
            go(-1);
          }}
          aria-label="왼쪽으로 넘기기"
        >
          ‹
        </button>
      )}
      {edge.next && (
        <button
          type="button"
          className="hscroll-btn next"
          onClick={() => {
            hold();
            go(1);
          }}
          aria-label="오른쪽으로 넘기기"
        >
          ›
        </button>
      )}
    </div>
  );
}
