import { forwardRef, useState } from 'react';
import type { Restaurant } from '../types';
import { FIX_LABELS, deviceId, timeAgo, type FixType, type NewReport, type Report } from '../lib/reports';
import { formatWon } from '../lib/links';

interface Props {
  r: Restaurant;
  reports: Report[];
  now: number;
  isAdmin: boolean;
  /** 열려 있는 종류 (null = 닫힘). 가격·영업 제목 옆 "직접 수정"으로도 연다 */
  type: FixType | null;
  onType: (t: FixType | null) => void;
  onAdd: (r: NewReport) => Promise<unknown>;
  onRemove: (id: string, asAdmin?: boolean) => Promise<unknown>;
}

const TYPES = Object.keys(FIX_LABELS) as FixType[];
const TEXT_MAX = 200;

const PLACEHOLDER: Record<Exclude<FixType, 'price'>, string> = {
  hours: '예: 매일 11:00-21:00 또는 평일 11:30-21:00, 토 11:30-15:00',
  info: '예: 일요일 휴무로 바뀌었어요 · 폐업했어요 · 전화번호가 바뀌었어요',
  etc: '예: 2층으로 이전했어요 · 포장만 돼요',
};

/** 사용자 "직접 수정": 가격정보는 메뉴 가격 칸에, 영업시간은 영업시간 칸에 (제보)로 바로 들어간다 */
export const FixPanel = forwardRef<HTMLElement, Props>(function FixPanel({ r, reports, now, isAdmin, type, onType, onAdd, onRemove }, ref) {
  const [menu, setMenu] = useState('');
  const [price, setPrice] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const me = deviceId();
  const fixes = reports.filter((x) => x.restaurantId === r.id && x.kind === 'fix');

  const pick = (t: FixType) => {
    setMsg(null);
    if (t === type) return onType(null);
    onType(t);
    setText(t === 'hours' ? (r.hours ?? '') : '');
  };

  const priceNum = Number(price.replace(/[^0-9]/g, ''));
  const ready = type === 'price' ? menu.trim().length > 0 && priceNum >= 500 && priceNum <= 300000 : text.trim().length > 0;

  const submit = async () => {
    if (!type || !ready || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await onAdd(
        type === 'price'
          ? { restaurantId: r.id, kind: 'fix', fixType: 'price', fixMenu: menu.trim(), fixPrice: priceNum }
          : { restaurantId: r.id, kind: 'fix', fixType: type, comment: text.trim() },
      );
      setMenu('');
      setPrice('');
      setText('');
      onType(null);
      setMsg(type === 'price' ? '메뉴 가격에 (제보)로 들어갔어요. 고마워요!' : type === 'hours' ? '영업시간에 (제보)로 들어갔어요. 고마워요!' : '제보가 등록됐어요. 고마워요!');
    } catch (e) {
      setMsg(`등록하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: Report) => {
    const own = f.deviceId === me;
    if (!own && !confirm('관리자 권한으로 이 제보를 지울까요?')) return;
    setBusy(true);
    try {
      await onRemove(f.id, !own);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fix-panel" ref={ref}>
      <div className="fix-head">
        <h4>✏️ 정보가 틀렸나요?</h4>
        {!type && (
          <button className="btn sm" onClick={() => pick('price')}>
            직접 수정
          </button>
        )}
      </div>
      {type && (
        <>
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t} className={'chip sm' + (t === type ? ' on' : '')} onClick={() => pick(t)}>
                {FIX_LABELS[t]}
              </button>
            ))}
          </div>
          {type === 'price' ? (
            <div className="one-line-form fix-price">
              <input
                className="mini grow"
                placeholder="메뉴 이름 (예: 연어샐러드)"
                maxLength={30}
                list={`fix-menu-${r.id}`}
                value={menu}
                onChange={(e) => setMenu(e.target.value)}
              />
              <datalist id={`fix-menu-${r.id}`}>
                {r.menu.map((m) => (
                  <option key={m.name} value={m.name} />
                ))}
              </datalist>
              <input
                className="mini fix-won"
                placeholder="가격"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="small">원</span>
            </div>
          ) : (
            <textarea
              className="mini fix-text"
              rows={2}
              maxLength={TEXT_MAX}
              placeholder={PLACEHOLDER[type]}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          <div className="fix-actions">
            <span className="small">
              {type === 'price' && '같은 메뉴면 가격이 바뀌고, 없는 메뉴면 메뉴판에 더해져요.'}
              {type === 'hours' && '영업시간 칸이 이걸로 바뀌어요 (제보 표시).'}
              {(type === 'info' || type === 'etc') && '아래 사용자 제보에 올라가요.'}
            </span>
            <button className="btn sm" onClick={() => onType(null)}>
              취소
            </button>
            <button className="btn sm primary" disabled={!ready || busy} onClick={submit}>
              등록
            </button>
          </div>
        </>
      )}
      {msg && <p className="small">{msg}</p>}
      {fixes.length > 0 && (
        <ul className="fix-list">
          {fixes.map((f) => (
            <li key={f.id}>
              <span className="badge soft">{FIX_LABELS[f.fixType ?? 'etc']}</span>{' '}
              {f.fixType === 'price' ? (
                <>
                  {f.fixMenu} {f.fixPrice != null && formatWon(f.fixPrice)}
                </>
              ) : (
                f.comment
              )}
              <span className="small"> · {timeAgo(f.createdAt, now)}</span>
              {(f.deviceId === me || isAdmin) && (
                <button className="link del" disabled={busy} onClick={() => void remove(f)}>
                  지우기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
