import type { SiteId } from './sites';

/** 앱 첫 화면 링크 — 받은 사람이 같은 근무지 화면으로 열리게 */
export function appLink(site: SiteId): string {
  return `${location.origin}/?site=${site}`;
}

// ---------- 카카오톡 공유 (키가 있을 때) ----------
// 카톡으로 보내면 큰 미리보기 대신 글 + [웹앱 바로가기] 버튼 하나로 깔끔하게 간다.
// Kakao Developers 앱의 JavaScript 키, 플랫폼 > Web 에 사이트 도메인 등록 필요
const KAKAO_JS_KEY = ((import.meta.env.VITE_KAKAO_JS_KEY as string | undefined) ?? '').trim();
const KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
/** 카톡 글 템플릿 글자 수 한도 */
const KAKAO_TEXT_MAX = 200;

interface KakaoLink {
  mobileWebUrl: string;
  webUrl: string;
}
interface KakaoSDK {
  init(key: string): void;
  isInitialized(): boolean;
  Share: { sendDefault(o: { objectType: 'text'; text: string; link: KakaoLink; buttons: { title: string; link: KakaoLink }[] }): void };
}
declare global {
  interface Window {
    Kakao?: KakaoSDK;
  }
}

/** 누르는 순간 바로 열리게 미리 불러 둔다 */
if (KAKAO_JS_KEY && typeof document !== 'undefined') {
  const s = document.createElement('script');
  s.src = KAKAO_SDK;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.onload = () => {
    try {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
    } catch (e) {
      console.warn('[jamsil-lunch] 카카오 공유 준비 실패:', e);
    }
  };
  document.head.appendChild(s);
}

/** 200자 안으로 — 넘치면 뒤 줄부터 빼고 "외 N줄" */
function fitKakao(text: string): string {
  if (text.length <= KAKAO_TEXT_MAX) return text;
  const lines = text.split('\n');
  for (let cut = 1; cut < lines.length; cut++) {
    const t = `${lines.slice(0, lines.length - cut).join('\n').trimEnd()}\n… 외 ${cut}줄`;
    if (t.length <= KAKAO_TEXT_MAX) return t;
  }
  return text.slice(0, KAKAO_TEXT_MAX - 1) + '…';
}

function shareKakao(text: string, url: string): boolean {
  const k = window.Kakao;
  if (!k?.isInitialized()) return false;
  const link = { mobileWebUrl: url, webUrl: url };
  k.Share.sendDefault({ objectType: 'text', text: fitKakao(text), link, buttons: [{ title: '웹앱 바로가기', link }] });
  return true;
}

/**
 * 카카오 키가 있으면 카톡 공유(글 + 바로가기 버튼).
 * 없으면 휴대폰은 공유 창(카톡 등), 안 되면 글을 복사한다. 글 맨 밑에는 "웹앱 바로가기"만 붙인다 (사이트 홍보).
 * 공유 창에는 링크를 글에 넣지 않고 따로 한 번만 넘긴다 — 글에도 넣으면 카톡에서 링크가 두 번(글 + 미리보기) 나온다.
 * url 이 없으면 앱 첫 화면 링크. 화면에 띄울 안내 문구를 돌려준다 (공유 창으로 보냈거나 닫았으면 null)
 */
export async function shareWithApp(o: { text: string; url?: string; site: SiteId }): Promise<string | null> {
  const url = o.url ?? appLink(o.site);
  try {
    if (shareKakao(o.text, url)) return null;
    if (navigator.share) {
      await navigator.share({ text: `${o.text}\n\n웹앱 바로가기 👇`, url });
      return null;
    }
    await navigator.clipboard.writeText(`${o.text}\n\n웹앱 바로가기 👉 ${url}`);
    return '링크를 복사했어요. 단톡방에 붙여 넣으세요!';
  } catch (e) {
    // 공유 창을 닫은 경우는 조용히
    if (e instanceof Error && e.name === 'AbortError') return null;
    return `링크: ${url}`;
  }
}
