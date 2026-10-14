import { supabaseClient } from './reports';

/** 메인 사진 올리기: 긴 쪽을 이 크기(px)로 줄여 JPEG 로 */
const MAX_SIDE = 900;
/** Supabase 미연결(이 기기에만 저장)일 때는 더 작게 — localStorage 에 그대로 넣는다 */
const LOCAL_MAX_SIDE = 480;
const BUCKET = 'photos';

/** 사진 파일을 줄여서 JPEG Blob 으로 */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 줄이지 못했어요'))), 'image/jpeg', 0.82),
  );
}

function toDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}

/**
 * 제보자가 고른 사진을 줄여서 올리고, 보여 줄 주소를 돌려준다.
 * Supabase 에 연결돼 있으면 Storage 'photos' 버킷(supabase/schema.sql v9), 아니면 이 기기에만(data URL)
 */
export async function uploadPhoto(restaurantId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일만 올릴 수 있어요');
  const { sb } = supabaseClient();
  if (!sb) return toDataUrl(await shrink(file, LOCAL_MAX_SIDE));
  const blob = await shrink(file, MAX_SIDE);
  const safeId = restaurantId.replace(/[^\w-]/g, '_');
  const path = `${safeId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(`사진을 올리지 못했어요 (${error.message}) — 사진 주소 붙여넣기로도 바꿀 수 있어요`);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 붙여넣은 사진 주소가 쓸 만한가 (https, 너무 길지 않게) */
export function isPhotoUrl(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url) && url.length <= 280;
}
