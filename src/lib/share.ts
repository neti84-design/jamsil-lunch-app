import type { SiteId } from './sites';

/** 앱 첫 화면 링크 — 받은 사람이 같은 근무지 화면으로 열리게 */
export function appLink(site: SiteId): string {
  return `${location.origin}/?site=${site}`;
}

/**
 * 휴대폰은 공유 창(카톡 등), 안 되면 글을 복사한다. 글 맨 밑에는 "웹앱 바로가기"만 붙인다 (사이트 홍보).
 * 공유 창에는 링크를 글에 넣지 않고 따로 한 번만 넘긴다 — 글에도 넣으면 카톡에서 링크가 두 번(글 + 미리보기) 나온다.
 * url 이 없으면 앱 첫 화면 링크. 화면에 띄울 안내 문구를 돌려준다 (공유 창으로 보냈거나 닫았으면 null)
 */
export async function shareWithApp(o: { text: string; url?: string; site: SiteId }): Promise<string | null> {
  const url = o.url ?? appLink(o.site);
  try {
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
