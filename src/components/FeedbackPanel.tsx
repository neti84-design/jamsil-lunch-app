import { useState } from 'react';
import { FEEDBACK_ID, FEEDBACK_LABELS, type FeedbackType, type NewReport } from '../lib/reports';
import { useSite } from '../lib/sites';

interface Props {
  onAdd: (r: NewReport) => Promise<unknown>;
  onClose: () => void;
}

const TYPES = Object.keys(FEEDBACK_LABELS) as FeedbackType[];
/** DB 칸이 300자 — 앞에 붙는 "[fb:종류:근무지]" 자리를 남긴다 */
const TEXT_MAX = 280;

const PLACEHOLDER: Record<FeedbackType, string> = {
  new: '가게 이름과 위치를 알려주세요 (예: 타워730 지하 ○○국수)',
  closed: '어느 가게가 문을 닫았나요?',
  bad: '쓰면서 불편했던 점을 알려주세요',
  good: '좋았던 점도 힘이 돼요 🙂',
  etc: '하고 싶은 말을 자유롭게 적어주세요',
};

/** 제보·의견 보내기: 신규 매장 · 폐업 · 앱 불편한 점/좋은 점 */
export function FeedbackPanel({ onAdd, onClose }: Props) {
  const site = useSite();
  const [type, setType] = useState<FeedbackType>('new');
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
      await onAdd({ restaurantId: FEEDBACK_ID, kind: 'feedback', feedbackType: type, feedbackSite: site.id, comment: body });
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
              <strong>고마워요! 잘 받았어요 🙏</strong>
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
                  {FEEDBACK_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="report-form">
              <textarea
                rows={4}
                maxLength={TEXT_MAX}
                placeholder={PLACEHOLDER[type]}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="fix-actions">
                <span className="small">
                  {text.length}/{TEXT_MAX}
                </span>
                <button className="btn sm primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
                  보내기
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
