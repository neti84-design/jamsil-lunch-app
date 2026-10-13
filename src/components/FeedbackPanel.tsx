import { useState } from 'react';
import { FEEDBACK_ID, FEEDBACK_LABELS, type FeedbackType, type NewReport } from '../lib/reports';
import { useSite } from '../lib/sites';
import { TALK_POST_MAX } from '../lib/talk';

interface Props {
  onAdd: (r: NewReport) => Promise<unknown>;
  /** 공유톡에 바로 올리기 */
  onTalk: (body: string) => Promise<unknown>;
  onClose: () => void;
}

/** 'talk' = 공유톡 올리기 (제보가 아니라 홈 공유톡에 바로 뜬다) */
type Kind = FeedbackType | 'talk';
const TYPES: Kind[] = ['talk', ...(Object.keys(FEEDBACK_LABELS) as FeedbackType[])];
const LABEL = (t: Kind) => (t === 'talk' ? '공유톡 올리기' : FEEDBACK_LABELS[t]);
/** DB 칸이 300자 — 앞에 붙는 "[fb:종류:근무지]" 자리를 남긴다 */
const TEXT_MAX = 280;

const PLACEHOLDER: Record<Kind, string> = {
  talk: '동료들에게 묻고 싶은 한 줄 (예: 오늘 장미상가 웨이팅 어때요?)',
  new: '가게 이름과 위치를 알려주세요 (예: 타워730 지하 ○○국수)',
  closed: '어느 가게가 문을 닫았나요?',
  bad: '쓰면서 불편했던 점을 알려주세요',
  good: '좋았던 점도 힘이 돼요 🙂',
  etc: '하고 싶은 말을 자유롭게 적어주세요',
};

/** 제보·의견 보내기: 신규 매장 · 폐업 · 앱 불편한 점/좋은 점 */
export function FeedbackPanel({ onAdd, onTalk, onClose }: Props) {
  const site = useSite();
  const [type, setType] = useState<Kind>('new');
  const max = type === 'talk' ? TALK_POST_MAX : TEXT_MAX;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setMsg(null);
    try {
      if (type === 'talk') await onTalk(body);
      else await onAdd({ restaurantId: FEEDBACK_ID, kind: 'feedback', feedbackType: type, feedbackSite: site.id, comment: body });
      setText('');
      setSent(true);
    } catch (e) {
      setMsg('보내지 못했어요: ' + (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="detail admin feedback" role="dialog" aria-label="제보·의견">
      <header className="detail-head">
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="detail-title">
          <h2>📮 제보·의견</h2>
          <div className="sub">익명 보장 · 보낸 사람 기록은 남지 않아요</div>
        </div>
      </header>
      <div className="detail-body">
        {sent ? (
          <section className="report feedback-done">
            <p>
              <strong>{type === 'talk' ? '공유톡에 올렸어요. 홈 맨 위에서 볼 수 있어요.' : '고마워요! 잘 받았어요 🙏'}</strong>
            </p>
            <div className="fix-actions">
              <button className="btn sm" onClick={() => setSent(false)}>
                하나 더 보내기
              </button>
              <button className="btn sm primary" onClick={onClose}>
                닫기
              </button>
            </div>
          </section>
        ) : (
          <section className="report">
            <div className="chips">
              {TYPES.map((t) => (
                <button key={t} className={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>
                  {LABEL(t)}
                </button>
              ))}
            </div>
            <div className="report-form">
              <textarea
                rows={type === 'talk' ? 2 : 4}
                maxLength={max}
                placeholder={PLACEHOLDER[type]}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="fix-actions">
                <span className="small">
                  {type === 'talk' ? '홈 공유톡에 바로 올라가요 · ' : ''}
                  {text.length}/{max}
                </span>
                <button className="btn sm primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
                  {type === 'talk' ? '올리기' : '보내기'}
                </button>
              </div>
            </div>
            {msg && <p className="small error">{msg}</p>}
          </section>
        )}
      </div>
    </aside>
  );
}
