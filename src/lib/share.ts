import { SITES, type SiteId } from './sites';

/** 앱 첫 화면 링크 — 받은 사람이 같은 근무지 화면으로 열리게 */
export function appLink(site: SiteId): string {
  return `${location.origin}/?site=${site}`;
}

/** 공유 글 맨 밑에 붙는 앱 바로가기 (사이트 홍보) */
export function appFooter(site: SiteId): string {
  const s = SITES[site];
  return `🍱 오늘${s.brand.accent} — ${s.brand.sub} 고민 끝!\n웹앱 바로가기 👉 ${appLink(site)}`;
}

/**
 * 휴대폰은 공유 창(카톡 등), 안 되면 링크와 글을 복사한다. url 이 없으면 맨 밑 앱 바로가기 링크만.
 * 화면에 띄울 안내 문구를 돌려준다 (공유 창으로 보냈거나 닫았으면 null)
 */
export async function shareWithApp(o: { title: string; text: string; url?: string; site: SiteId }): Promise<string | null> {
  const footer = appFooter(o.site);
  const text = `${o.text}\n\n${footer}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: o.title, text, url: o.url });
      return null;
    }
    await navigator.clipboard.writeText(o.url ? `${o.text}\n${o.url}\n\n${footer}` : text);
    return '링크를 복사했어요. 단톡방에 붙여 넣으세요!';
  } catch (e) {
    // 공유 창을 닫은 경우는 조용히
    if (e instanceof Error && e.name === 'AbortError') return null;
    return `링크: ${o.url ?? appLink(o.site)}`;
  }
}
