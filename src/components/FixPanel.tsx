import { forwardRef, useRef, useState } from 'react';
import type { Restaurant } from '../types';
import { FIX_LABELS, NO_PHOTO, deviceId, timeAgo, type FixType, type NewReport, type Report } from '../lib/reports';
import { formatWon } from '../lib/links';
import { isPhotoUrl, uploadPhoto } from '../lib/photos';
import { Thumb } from './Thumb';

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

const PLACEHOLDER: Record<Exclude<FixType, 'price' | 'photo'>, string> = {
  hours: '예: 매일 11:00-21:00 또는 평일 11:30-21:00, 토 11:30-15:00',
  info: '예: 일요일 휴무로 바뀌었어요 · 폐업했어요 · 전화번호가 바뀌었어요',
  etc: '예: 2층으로 이전했어요 · 포장만 돼요',
};

/** 사용자 "직접 수정": 가격정보는 메뉴 가격 칸에, 영업시간은 영업시간 칸에, 메인 사진은 사진 칸에 (제보)로 바로 들어간다 */
export const FixPanel = forwardRef<HTMLElement, Props>(function FixPanel({ r, reports, now, isAdmin, type, onType, onAdd, onRemove }, ref) {
  const [menu, setMenu] = useState('');
  const [price, setPrice] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** 메인 사진: 새로 고른 사진 주소 (올린 사진·붙여넣은 주소, 또는 NO_PHOTO) */
  const [photo, setPhoto] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const me = deviceId();
  const fixes = reports.filter((x) => x.restaurantId === r.id && x.kind === 'fix');

  const pick = (t: FixType) => {
    setMsg(null);
    if (t === type) return onType(null);
    onType(t);
    setText(t === 'hours' ? (r.hours ?? '') : '');
    setPhoto('');
    setPhotoUrl('');
  };

  /** 사진 파일을 골랐을 때: 줄여서 올리고 미리보기 */
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      setPhoto(await uploadPhoto(r.id, file));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const priceNum = Number(price.replace(/[^0-9]/g, ''));
  const ready =
    type === 'price'
      ? menu.trim().length > 0 && priceNum >= 500 && priceNum <= 300000
      : type === 'photo'
        ? photo.length > 0
        : text.trim().length > 0;

  const submit = async () => {
    if (!type || !ready || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await onAdd(
        type === 'price'
          ? { restaurantId: r.id, kind: 'fix', fixType: 'price', fixMenu: menu.trim(), fixPrice: priceNum }
          : { restaurantId: r.id, kind: 'fix', fixType: type, comment: type === 'photo' ? photo : text.trim() },
      );
      setMenu('');
      setPrice('');
      setText('');
      setPhoto('');
      setPhotoUrl('');
      onType(null);
      setMsg(
        type === 'price'
          ? '메뉴 가격에 (제보)로 들어갔어요. 고마워요!'
          : type === 'hours'
            ? '영업시간에 (제보)로 들어갔어요. 고마워요!'
            : type === 'photo'
              ? '메인 사진이 바뀌었어요. 고마워요!'
              : '제보가 등록됐어요. 고마워요!',
      );
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
          ) : type === 'photo' ? (
            <div className="fix-photo">
              <div className="fix-photo-pair">
                <figure>
                  <span className="fix-photo-thumb">
                    <Thumb r={r} width={160} height={110} />
                  </span>
                  <figcaption className="small">지금 사진</figcaption>
                </figure>
                <span aria-hidden>→</span>
                <figure>
                  <span className="fix-photo-thumb">
                    {photo && photo !== NO_PHOTO ? (
                      <img className="thumb-img" src={photo} alt="" referrerPolicy="no-referrer" />
                    ) : photo === NO_PHOTO ? (
                      <Thumb r={{ ...r, photo: null }} width={160} height={110} />
                    ) : (
                      <span className="small">새 사진</span>
                    )}
                  </span>
                  <figcaption className="small">{photo === NO_PHOTO ? '사진 빼기' : '바꿀 사진'}</figcaption>
                </figure>
              </div>
              <div className="fix-photo-btns">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
                <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                  📷 {busy ? '올리는 중…' : '사진 올리기'}
                </button>
                {r.photo && (
                  <button className={'btn sm' + (photo === NO_PHOTO ? ' on' : '')} onClick={() => setPhoto(NO_PHOTO)}>
                    🚫 사진 빼기
                  </button>
                )}
              </div>
              <div className="one-line-form">
                <input
                  className="mini grow"
                  placeholder="또는 사진 주소 붙여넣기 (https://…)"
                  inputMode="url"
                  value={photoUrl}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setPhotoUrl(v);
                    setPhoto(isPhotoUrl(v) ? v : '');
                  }}
                />
              </div>
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
              {type === 'photo' && '진짜 이 가게 사진이 아니면 바꿔 주세요. 모두에게 바뀐 사진이 보여요.'}
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
              ) : f.fixType === 'photo' ? (
                f.comment === NO_PHOTO ? '사진 빼기' : '사진 바꿈'
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
