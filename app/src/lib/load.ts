import type { Photo } from './editor';
import { extractExifSegment } from './exif';

const MAX_BYTES = 80 * 1024 * 1024;
/** 单张像素上限：8000 万像素（覆盖 6100 万像素级机身）。再大预览能画，导出会长时间无响应。 */
const MAX_PIXELS = 80_000_000;

/** 失败提示里的文件名截短，超长文件名不会把提示挤出屏幕 */
export function shortName(name: string) {
  return name.length > 42 ? `${name.slice(0, 39)}…` : name;
}

export async function loadPhoto(file: File): Promise<Photo> {
  const label = shortName(file.name);
  if (!file.type.startsWith('image/')) {
    throw new Error(`${label} 不是图片文件`);
  }
  if (file.size === 0) {
    throw new Error(`${label} 是空文件，读不到图像内容`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${label} 超过 80 MB，暂不支持`);
  }

  let exif: Uint8Array | null = null;
  if (file.type === 'image/jpeg') {
    exif = extractExifSegment(new Uint8Array(await file.arrayBuffer()));
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`${label} 解码失败，文件可能已损坏或格式不受支持`);
    }
  }

  const pixels = bitmap.width * bitmap.height;
  if (pixels > MAX_PIXELS) {
    const w = bitmap.width;
    const h = bitmap.height;
    bitmap.close();
    throw new Error(
      `${label} 尺寸过大（${w}×${h}，约 ${Math.round(pixels / 1e6)} 百万像素），上限 8000 万像素`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error(`${label} 尺寸过大，无法创建画布`);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const thumbSide = 260;
  const scale = Math.min(1, thumbSide / Math.max(canvas.width, canvas.height));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  thumbCanvas.getContext('2d')!.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    width: canvas.width,
    height: canvas.height,
    original: canvas,
    thumb: thumbCanvas.toDataURL('image/jpeg', 0.8),
    exif,
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
