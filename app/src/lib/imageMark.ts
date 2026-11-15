import type { BlendMode, ImageMark } from './editor';

const CACHE = new Map<string, HTMLImageElement>();
/** 水印图片按 data URL 缓存，换图多次也不无限堆积，只留最近 6 张。 */
const CACHE_MAX = 6;
let onReady: (() => void) | null = null;

/** 图片解码完成后通知外层重绘预览（只用于异步解码场景，正常选图会先 await 再写入 edit）。 */
export function setImageMarkReadyHandler(handler: (() => void) | null) {
  onReady = handler;
}

export function loadImageMark(src: string) {
  const hit = CACHE.get(src);
  if (hit) {
    return hit.complete && hit.naturalWidth > 0
      ? Promise.resolve(hit)
      : new Promise<HTMLImageElement>((resolve, reject) => {
          hit.addEventListener('load', () => resolve(hit), { once: true });
          hit.addEventListener('error', () => reject(new Error('水印图片加载失败')), { once: true });
        });
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      CACHE.set(src, img);
      while (CACHE.size > CACHE_MAX) {
        const oldest = CACHE.keys().next().value;
        if (oldest === undefined) break;
        CACHE.delete(oldest);
      }
      onReady?.();
      resolve(img);
    };
    img.onerror = () => reject(new Error('水印图片加载失败'));
    img.src = src;
  });
}

function loaded(src: string) {
  const img = CACHE.get(src);
  if (!img) {
    void loadImageMark(src).catch(() => undefined);
    return null;
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

/**
 * 图片水印：宽度按短边百分比缩放，保持原图宽高比，9 宫格定位并留出与文字水印相同的边距。
 * 由调用方保证在文字水印之前绘制，因此两者同时开启时文字始终压在上面。
 */
export function drawImageMark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mark: ImageMark,
) {
  if (!mark.src || width <= 0 || height <= 0) return;
  const img = loaded(mark.src);
  if (!img) return;

  const short = Math.min(width, height);
  const targetW = (Math.max(5, Math.min(100, mark.scale)) / 100) * short;
  const targetH = (img.naturalHeight / img.naturalWidth) * targetW;
  const margin = short * 0.025;
  const horizontal = mark.position[1];
  const vertical = mark.position[0];
  const x =
    horizontal === 'l' ? margin : horizontal === 'r' ? width - margin - targetW : (width - targetW) / 2;
  const y =
    vertical === 't' ? margin : vertical === 'b' ? height - margin - targetH : (height - targetH) / 2;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, mark.opacity / 100));
  ctx.globalCompositeOperation = BLEND[mark.blend];
  ctx.drawImage(img, x, y, targetW, targetH);
  ctx.restore();
}
