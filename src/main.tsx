import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

function showFatal(title: string, detail: unknown) {
  const msg = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : String(detail);
  const el = document.getElementById('root');
  if (!el) return;
  el.innerHTML = '';
  const box = document.createElement('pre');
  box.style.cssText =
    'margin:0;padding:20px;white-space:pre-wrap;word-break:break-all;font:13px/1.5 ui-monospace,monospace;color:#b00020;background:#fff5f5;min-height:100vh';
  box.textContent = `${title}\n\n${msg}\n\n이 화면을 캡처해서 보내주세요.`;
  el.appendChild(box);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    showFatal('앱 화면을 그리는 중 오류가 났습니다', error);
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

window.addEventListener('error', (e) => showFatal('스크립트 오류', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => {
  // 네트워크 실패 같은 비동기 오류는 앱을 멈추지 않으므로 콘솔에만 남긴다
  console.warn('[jamsil-lunch] unhandled rejection:', e.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
