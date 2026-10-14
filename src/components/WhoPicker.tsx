import { useEffect, useRef, useState } from 'react';
import { useSite } from '../lib/sites';
import { shareWithApp } from '../lib/share';

const NAMES_KEY = 'jamsil-lunch:who-names';
const NAME_MAX = 20;
const NAMES_MAX = 20;
const ROLL_MS = 1400;

function loadNames(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, NAMES_MAX) : [];
  } catch {
    return [];
  }
}

/** 누가 메뉴를 정할까: 이름을 적어 두고 랜덤으로 한 명 뽑기 (이름은 이 기기에 남김) */
export function WhoPicker({ onClose }: { onClose: () => void }) {
  const site = useSite();
  const [names, setNames] = useState<string[]>(loadNames);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    } catch {
      /* ignore */
    }
  }, [names]);
  useEffect(() => () => void (timer.current != null && clearInterval(timer.current)), []);

  const add = () => {
    const n = q.trim().slice(0, NAME_MAX);
    if (n && !names.includes(n) && names.length < NAMES_MAX) setNames([...names, n]);
    setQ('');
  };

  const roll = () => {
    if (names.length < 2 || rolling) return;
    const winner = names[Math.floor(Math.random() * names.length)];
    const start = Date.now();
    setRolling(true);
    setMsg(null);
    timer.current = window.setInterval(() => {
      if (Date.now() - start >= ROLL_MS) {
        clearInterval(timer.current!);
        timer.current = null;
        setShown(winner);
        setRolling(false);
      } else {
        setShown(names[Math.floor(Math.random() * names.length)]);
      }
    }, 80);
  };

  const share = async () => {
    if (!shown) return;
    const m = await shareWithApp({ text: `🎲 오늘 메뉴는 ${shown}님이 정해요!\n(후보: ${names.join(', ')})`, site: site.id });
    if (m) setMsg(m);
  };

  return (
    <aside className="detail vote-panel" role="dialog" aria-label="누가 정할까">
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>🎲 누가 정할까</h2>
          <div className="sub">다들 미룰 땐 랜덤으로! 이름을 적고 뽑기를 눌러요</div>
        </div>
      </header>
      <div className="detail-body">
        <section>
          <h4>
            이름 {names.length}명 <span className="small">(2명 이상)</span>
          </h4>
          {names.length > 0 && (
            <div className="chips">
              {names.map((n) => (
                <button
                  key={n}
                  className={'chip sm' + (shown === n && !rolling ? ' on' : '')}
                  onClick={() => setNames(names.filter((x) => x !== n))}
                  aria-label={`${n} 빼기`}
                >
                  {n} ✕
                </button>
              ))}
            </div>
          )}
          <div className="who-add">
            <input
              className="mini grow vote-search"
              placeholder="이름 입력 (예: 김대리)"
              value={q}
              maxLength={NAME_MAX}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) add();
              }}
              enterKeyHint="done"
            />
            <button className="btn sm" disabled={!q.trim()} onClick={add}>
              + 담기
            </button>
          </div>
        </section>

        <div className={'who-result' + (rolling ? ' rolling' : '')} aria-live="polite">
          {shown ? (
            rolling ? (
              <strong>{shown}</strong>
            ) : (
              <>
                🎉 오늘 메뉴는
                <strong>{shown}</strong>님이 정해요!
              </>
            )
          ) : (
            <span className="small">누가 걸릴까요?</span>
          )}
        </div>

        <button className="btn primary vote-create" disabled={names.length < 2 || rolling} onClick={roll}>
          {names.length < 2 ? '이름을 2명 이상 담아 주세요' : shown && !rolling ? '🎲 다시 뽑기' : '🎲 뽑기'}
        </button>
        {shown && !rolling && (
          <button className="btn sm" onClick={() => void share()}>
            🔗 결과 공유
          </button>
        )}
        {msg && <p className="small">{msg}</p>}
      </div>
    </aside>
  );
}
