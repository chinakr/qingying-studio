import {
  applyAdjustments,
  applyDarken,
  applyLocal,
  applySpatial,
  applyDenoise,
  applyFillLight,
  currentCrop,
  hasLocal,
  hasSpatial,
  rotatedSize,
  type CropRect,
  type Edit,
  type Photo,
} from './editor';
import { drawImageMark } from './imageMark';
import { drawWatermark } from './watermark';

export interface RenderResult {
  canvas: HTMLCanvasElement;
  crop: CropRect;
  scale: number;
}

const baseCache = new Map<string, HTMLCanvasElement>();

function baseKey(photo: Photo, edit: Edit) {
  return `${photo.id}|${edit.rotation}|${edit.flipH ? 1 : 0}|${edit.straighten.toFixed(1)}`;
}

/** 缓存占用统计（开发态诊断用）：条目数与画布后备存储字节数。 */
export function baseCacheStats() {
  let bytes = 0;
  for (const c of baseCache.values()) bytes += c.width * c.height * 4;
  return { entries: baseCache.size, bytes };
}

/** 底图缓存按整张画布计（12MP 约 48MB），最多留 3 张，避免多图长会话把内存堆满。 */
const BASE_CACHE_MAX = 3;

function dropBase(key: string) {
  const canvas = baseCache.get(key);
  if (!canvas) return;
  baseCache.delete(key);
  canvas.width = 0;
  canvas.height = 0;
}

/** 移除图片时同步释放它的底图，避免已移除的图继续占着几十 MB 画布。 */
export function releaseBaseCache(photoId: string) {
  for (const k of [...baseCache.keys()]) {
    if (k.startsWith(`${photoId}|`)) dropBase(k);
  }
}

/** 旋转/翻转后的全尺寸底图，按 图片+方向 缓存，避免滑杆拖动时反复重绘原图。 */
export function getBaseCanvas(photo: Photo, edit: Edit) {
  const key = baseKey(photo, edit);
  const cached = baseCache.get(key);
  if (cached) {
    // 命中即提到队尾，淘汰时优先丢最久没用过的那张
    baseCache.delete(key);
    baseCache.set(key, cached);
    return cached;
  }

  for (const k of [...baseCache.keys()]) {
    if (k.startsWith(`${photo.id}|`)) dropBase(k);
  }

  const { width, height } = rotatedSize(photo, edit);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  if (edit.flipH) ctx.scale(-1, 1);
  if (edit.rotation) ctx.rotate((edit.rotation * Math.PI) / 180);
  if (edit.straighten) {
    // 任意角度旋转后放大到刚好盖住画布，避免四角出现空白
    const rad = (Math.abs(edit.straighten) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cover = Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
    ctx.rotate((edit.straighten * Math.PI) / 180);
    ctx.scale(cover, cover);
  }
  ctx.drawImage(photo.original, -photo.width / 2, -photo.height / 2);
  ctx.restore();

  baseCache.set(key, canvas);
  while (baseCache.size > BASE_CACHE_MAX) {
    const oldest = baseCache.keys().next().value;
    if (oldest === undefined) break;
    dropBase(oldest);
  }
  return canvas;
}

function drawBorder(ctx: CanvasRenderingContext2D, width: number, height: number, border: Edit['border']) {
  if (border.width <= 0) return;
  const t = Math.max(1, Math.round((border.width / 100) * Math.min(width, height)));
  ctx.save();
  ctx.fillStyle = border.color;
  ctx.fillRect(0, 0, width, t);
  ctx.fillRect(0, height - t, width, t);
  ctx.fillRect(0, 0, t, height);
  ctx.fillRect(width - t, 0, t, height);
  ctx.restore();
}

/** 生成预览/导出共用的结果画布；maxSide 为空表示按原始分辨率输出。 */
export function renderPhoto(photo: Photo, edit: Edit, maxSide?: number): RenderResult {
  const base = getBaseCanvas(photo, edit);
  const crop = currentCrop(photo, edit);
  const scale = maxSide ? Math.min(1, maxSide / Math.max(crop.w, crop.h)) : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.w * scale));
  canvas.height = Math.max(1, Math.round(crop.h * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const adjusted = applyAdjustments(data, edit);
  const spatial = hasSpatial(edit);
  const local = hasLocal(edit);
  const denoised = edit.denoise > 0;
  const filled = edit.fillLight > 0;
  const darkened = edit.darken > 0;
  // 提亮/压制属于调色环节，紧跟 LUT 之后；降噪/细节作用在抬过暗部的画面上，保持与参数调整一致的先后顺序
  if (filled) applyFillLight(data, edit);
  if (darkened) applyDarken(data, edit);
  if (denoised) applyDenoise(data, edit);
  if (spatial) applySpatial(data, edit);
  if (local) applyLocal(data, edit);
  if (adjusted || spatial || local || denoised || filled || darkened) ctx.putImageData(data, 0, 0);
  drawBorder(ctx, canvas.width, canvas.height, edit.border);
  // 叠放顺序固定：图片水印在下，文字水印在上（文字始终可见，不被图片盖住）
  if (edit.imageMark.enabled) drawImageMark(ctx, canvas.width, canvas.height, edit.imageMark);
  if (edit.watermark.enabled) drawWatermark(ctx, canvas.width, canvas.height, edit.watermark);

  return { canvas, crop, scale };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('导出失败：浏览器无法编码该图片'))),
      type,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ExportFormat = 'jpeg' | 'png' | 'webp';

/**
 * 文件系统单个文件名上限通常是 255 字节，中文一个字符占 3 字节。
 * 超长文件名直接保存会在写盘阶段失败（ENAMETOOLONG），这里按字节裁到 180 以内。
 */
function clampStem(stem: string, maxBytes = 180) {
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of stem) {
    const size = enc.encode(ch).length;
    if (bytes + size > maxBytes) break;
    out += ch;
    bytes += size;
  }
  return out || 'image';
}

export function exportName(name: string, format: ExportFormat) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${clampStem(stem)}-edit.${format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg'}`;
}
