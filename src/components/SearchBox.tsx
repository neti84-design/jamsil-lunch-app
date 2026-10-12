import { useState } from 'react';

interface Props {
  value: string;
  onChange: (q: string) => void;
  /** 검색 버튼·키보드 "검색" 키 */
  onSubmit: (q: string) => void;
  history: string[];
  onRemoveHistory: (q: string) => void;
  onClearHistory: () => void;
}

/** 검색창 + 검색 버튼 + (입력 중) 최근 검색어 */
export function SearchBox({ value, onChange, onSubmit, history, onRemoveHistory, onClearHistory }: Props) {
  const [focused, setFocused] = useState(false);
  const showHistory = focused && !value.trim() && history.length > 0;

  const submit = (q: string, input?: HTMLInputElement | null) => {
    onSubmit(q);
    // 키보드 내리기
    input?.blur();
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  return (
    <div className="searchbox">
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value, e.currentTarget.querySelector('input'));
        }}
      >
        <span className="search-icon" aria-hidden>
          🔍
        </span>
        <input
          className="search"
          type="search"
          enterKeyHint="search"
          placeholder="가게명·메뉴 검색"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <button type="submit" className="btn primary search-btn">
          검색
        </button>
      </form>
      {showHistory && (
        <div className="search-history" onMouseDown={(e) => e.preventDefault()}>
          <div className="search-history-head">
            <span className="small">최근 검색어</span>
            <button type="button" className="link small" onClick={onClearHistory}>
              전체 삭제
            </button>
          </div>
          <ul>
            {history.map((q) => (
              <li key={q}>
                <button type="button" className="history-item" onClick={() => {
                  onChange(q);
                  submit(q);
                }}>
                  🕘 {q}
                </button>
                <button type="button" className="icon-btn sm" aria-label={`${q} 삭제`} onClick={() => onRemoveHistory(q)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
