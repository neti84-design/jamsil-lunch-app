/**
 * 새로 등록한 식당 — 등록한 날부터 NEW_DAYS 일 동안
 * 카드 왼쪽에 '신규' 동그라미가 붙고, 홈 아래 '추천' 맨 위(혜택 매장 다음)에 올라간다.
 * 식당을 새로 넣을 때 여기에 앱 안 식당 id(카카오에서 가져온 곳은 "kakao-카카오id")와 한국 날짜를 적는다
 */
export const NEW_PLACES: Record<string, string> = {
  'kakao-716103067': '2026-10-20', // 프레퍼스 잠실장미상가점
};

/** 등록한 날 포함 이만큼 '신규'로 보인다 */
export const NEW_DAYS = 4;

/** 오늘(한국 날짜 "2026-10-20")이 등록 후 NEW_DAYS 일 안이면 true */
export function isNewPlace(id: string, today: string): boolean {
  const added = NEW_PLACES[id];
  if (!added) return false;
  const days = (Date.parse(today) - Date.parse(added)) / 86_400_000;
  return days >= 0 && days < NEW_DAYS;
}
