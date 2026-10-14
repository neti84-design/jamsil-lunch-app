/** 작은 공유 아이콘 버튼 (네모 위로 화살표) */
export function ShareButton({ onClick, label = '공유하기' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="share-btn" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="M7.5 7.5 12 3l4.5 4.5" />
        <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
      </svg>
    </button>
  );
}
