import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

interface Props {
  className: string;
  children: ReactNode;
  /** 바깥에서도 이 줄을 잡아야 할 때 (보던 위치 기억 등) */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  label?: string;
  /** 넘칠 때 저절로 천천히 옆으로 흘러가게 — 끝 뒤에 처음이 이어 붙어 끊김 없이 계속 돈다 (손을 대면 잠깐 멈춤) */
  auto?: boolean;
}

/** 자동으로 흐르는 속도(px/초) */
const AUTO_SPEED = 24;
/** 손을 뗀 뒤 다시 흐르기까지 */
const AUTO_RESUME_MS = 2500;

/** 옆으로 넘기는 줄 — PC(마우스)에서는 양 끝에 ‹ › 버튼이 생겨 눌러서 넘긴다 */
export function HScroll({ className, children, scrollRef, onScroll, label, auto = false }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ prev: false, next: false });
  /** 자동으로 흐르면서 넘칠 때만 뒤에 한 벌 더 붙여 이어지게 한다 */
  const [loop, setLoop] = useState(false);
  const loopRef = useRef<HTMLSpanElement | null>(null);

  /** 한 바퀴 길이 = 붙여 놓은 두 번째 벌이 시작하는 곳까지 */
  const loopWidth = useCallback(() => {
    const s = el.current;
    const first = s?.firstElementChild as HTMLElement | null;
    const copy = loopRef.current?.firstElementChild as HTMLElement | null;
    return first && copy ? copy.offsetLeft - first.offsetLeft : 0;
  }, []);

  const update = useCallback(() => {
    const s = el.current;
    if (!s) return;
    setEdge({ prev: s.scrollLeft > 4, next: s.scrollLeft + s.clientWidth < s.scrollWidth - 4 });
    if (!auto) return;
    // 붙인 벌을 뺀 원래 항목들 길이가 화면보다 길 때만 돈다
    const first = s.firstElementChild as HTMLElement | null;
    const last = (loopRef.current ? loopRef.current.previousElementSibling : s.lastElementChild) as HTMLElement | null;
    if (!first || !last) return setLoop(false);
    const cs = getComputedStyle(s);
    const content = last.offsetLeft + last.offsetWidth - first.offsetLeft + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    setLoop(content > s.clientWidth + 4);
  }, [auto]);

  useEffect(() => {
    const s = el.current;
    if (!s) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(s);
    for (const c of Array.from(s.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [update, children, loop]);

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
        // 한 바퀴 돌면 붙여 둔 두 번째 벌이 처음과 똑같은 자리라, 몰래 한 바퀴만큼 되돌려 계속 흐르게
        const w = loopWidth();
        if (w > 0 && pos >= w) pos -= w;
        else if (pos > max) pos = max;
        s.scrollLeft = pos;
      } else pos = s.scrollLeft;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, loopWidth]);

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
        {/* 끝 뒤에 이어 붙이는 두 번째 벌 (보이기만 하고 읽어 주지는 않음) */}
        {loop && (
          <span ref={loopRef} className="hscroll-loop" aria-hidden>
            {children}
          </span>
        )}
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
