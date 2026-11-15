import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconClose, IconOpen, IconReset } from './Icons';

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  preview: HTMLCanvasElement | null;
  original: HTMLCanvasElement | null;
  showOriginal: boolean;
  cropMode: boolean;
  onApplyCrop: (rect: NormalizedRect | null) => void;
  onExitCrop: () => void;
  onPickFiles: () => void;
  fileName?: string;
  localMode: boolean;
  local?: { cx: number; cy: number; radius: number };
  onPickLocal: (cx: number, cy: number) => void;
  /** 变化时把缩放/平移复位到"适应窗口"，用于全屏进出后的画布重排 */
  resetViewKey: number;
}

type DragMode = 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

const MIN_SIZE = 0.04;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

/** 裁剪比例锁：ratio 为像素宽高比，orig 表示跟随原图。 */
const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: '自由', ratio: null },
  { id: 'orig', label: '原图', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export default function CanvasStage({
  preview,
  original,
  showOriginal,
  cropMode,
  onApplyCrop,
  onExitCrop,
  onPickFiles,
  fileName,
  localMode,
  local,
  onPickLocal,
  resetViewKey,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState<NormalizedRect>({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
  const [aspectId, setAspectId] = useState('free');
  const [view, setView] = useState({ zoom: null as number | null, panX: 0, panY: 0 });
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; origin: NormalizedRect } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const source = showOriginal && original ? original : preview;

  const fitZoom = useMemo(() => {
    if (!source || !box.w || !box.h) return 1;
    const availW = Math.max(80, box.w - 96);
    const availH = Math.max(80, box.h - 96);
    return Math.min(availW / source.width, availH / source.height, 2);
  }, [source, box]);

  const zoom = view.zoom ?? fitZoom;
  const dispW = Math.max(1, Math.round((source?.width ?? 0) * zoom));
  const dispH = Math.max(1, Math.round((source?.height ?? 0) * zoom));
  const left = Math.round((box.w - dispW) / 2 + view.panX);
  const top = Math.round((box.h - dispH) / 2 + view.panY);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0);
  }, [source]);

  useEffect(() => {
    if (cropMode) {
      setSel({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
      setAspectId('free');
    }
  }, [cropMode]);

  // 全屏进出会改变画布可用尺寸：把手动缩放/平移复位，交给 fitZoom 重新居中
  useEffect(() => {
    setView({ zoom: null, panX: 0, panY: 0 });
  }, [resetViewKey]);

  // 滚轮缩放：以指针位置为锚点
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !source) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView((v) => {
        const current = v.zoom ?? fitZoom;
        const next = clamp(current * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const dw = source.width * current;
        const dh = source.height * current;
        const u = (sx - ((rect.width - dw) / 2 + v.panX)) / dw;
        const w = (sy - ((rect.height - dh) / 2 + v.panY)) / dh;
        const dw2 = source.width * next;
        const dh2 = source.height * next;
        return {
          zoom: next,
          panX: sx - u * dw2 - (rect.width - dw2) / 2,
          panY: sy - w * dh2 - (rect.height - dh2) / 2,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [source, fitZoom]);

  useEffect(() => {
    if (!cropMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExitCrop();
      if (e.key === 'Enter') onApplyCrop(sel);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropMode, onApplyCrop, onExitCrop, sel]);

  const zoomBy = (factor: number) => {
    if (!source) return;
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    setView((v) => ({ zoom: next, panX: v.panX, panY: v.panY }));
  };

  const resetView = () => setView({ zoom: null, panX: 0, panY: 0 });

  // 缩放快捷键：⌘/Ctrl + = / - / 0，与顶部缩放条等价；输入框内不接管。
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = Boolean(
        el &&
          (el.tagName === 'TEXTAREA' ||
            el.isContentEditable ||
            (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range')),
      );
      if (typing) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(1.25);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomBy(1 / 1.25);
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [source, zoom, fitZoom]);

  const posOf = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  /** 当前比例锁对应的“归一化宽高比”（选区坐标相对画面 0..1）。 */
  const aspectRatio = () => {
    if (!source || aspectId === 'free') return null;
    const px =
      aspectId === 'orig' ? source.width / source.height : ASPECTS.find((a) => a.id === aspectId)?.ratio ?? null;
    if (!px) return null;
    return px / (source.width / source.height);
  };

  /** 切换比例：保持当前选区中心，按面积近似缩放，再夹到画面内。 */
  const applyAspect = (id: string) => {
    setAspectId(id);
    if (id === 'free' || !source) return;
    const ratioPx = id === 'orig' ? source.width / source.height : ASPECTS.find((a) => a.id === id)?.ratio;
    if (!ratioPx) return;
    const ar = ratioPx / (source.width / source.height);
    const cx = sel.x + sel.w / 2;
    const cy = sel.y + sel.h / 2;
    const area = Math.max(MIN_SIZE * MIN_SIZE, sel.w * sel.h);
    const wMax = ar <= 1 ? ar : 1;
    const hMax = ar <= 1 ? 1 : 1 / ar;
    let w = Math.min(Math.sqrt(area * ar), wMax);
    let h = w / ar;
    if (h > hMax) {
      h = hMax;
      w = h * ar;
    }
    if (w < MIN_SIZE) {
      w = MIN_SIZE;
      h = w / ar;
    }
    if (h < MIN_SIZE) {
      h = MIN_SIZE;
      w = h * ar;
    }
    // 以中心为准：优先缩小到"中心到边界距离的 2 倍"，避免贴边后被夹住导致中心漂移
    const wLimit = 2 * Math.min(cx, 1 - cx);
    const hLimit = 2 * Math.min(cy, 1 - cy);
    if (w > wLimit) {
      w = wLimit;
      h = w / ar;
    }
    if (h > hLimit) {
      h = hLimit;
      w = h * ar;
    }
    if (w < MIN_SIZE || h < MIN_SIZE) {
      w = Math.max(w, MIN_SIZE);
      h = w / ar;
      if (h < MIN_SIZE) {
        h = MIN_SIZE;
        w = h * ar;
      }
    }
    const x = clamp01(Math.min(Math.max(cx - w / 2, 0), 1 - w));
    const y = clamp01(Math.min(Math.max(cy - h / 2, 0), 1 - h));
    setSel({ x, y, w, h });
  };

  /** 锁定比例时，按“锚点 + 指针”生成保持比例的矩形（锚点为对角/起点，固定不动）。 */
  const fitFromAnchor = (ax: number, ay: number, px: number, py: number, ar: number): NormalizedRect => {
    const signX = px < ax ? -1 : 1;
    const signY = py < ay ? -1 : 1;
    let w = Math.max(MIN_SIZE, Math.abs(px - ax));
    let h = Math.max(MIN_SIZE, Math.abs(py - ay));
    if (w / h > ar) h = w / ar;
    else w = h * ar;
    const maxW = signX > 0 ? 1 - ax : ax;
    const maxH = signY > 0 ? 1 - ay : ay;
    if (w > maxW) {
      w = maxW;
      h = w / ar;
    }
    if (h > maxH) {
      h = maxH;
      w = h * ar;
    }
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
    return {
      x: signX > 0 ? ax : clamp01(ax - w),
      y: signY > 0 ? ay : clamp01(ay - h),
      w,
      h,
    };
  };

  const onCropDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropMode) return;
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle as DragMode | undefined;
    const p = posOf(e);
    const inside = p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h;
    const mode: DragMode = handle ?? (inside ? 'move' : 'new');
    dragRef.current = { mode, startX: p.x, startY: p.y, origin: { ...sel } };
    if (mode === 'new') {
      const ar = aspectRatio();
      setSel(ar ? fitFromAnchor(p.x, p.y, p.x, p.y, ar) : { x: p.x, y: p.y, w: MIN_SIZE, h: MIN_SIZE });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onCropMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = posOf(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const o = drag.origin;

    if (drag.mode === 'move') {
      setSel({
        x: clamp01(Math.min(o.x + dx, 1 - o.w)),
        y: clamp01(Math.min(o.y + dy, 1 - o.h)),
        w: o.w,
        h: o.h,
      });
      return;
    }

    const ar = aspectRatio();

    if (drag.mode === 'new') {
      if (ar) {
        setSel(fitFromAnchor(drag.startX, drag.startY, p.x, p.y, ar));
        return;
      }
      setSel({
        x: Math.min(drag.startX, p.x),
        y: Math.min(drag.startY, p.y),
        w: Math.max(MIN_SIZE, Math.abs(p.x - drag.startX)),
        h: Math.max(MIN_SIZE, Math.abs(p.y - drag.startY)),
      });
      return;
    }

    // 锁定比例时，锚点是对角（保持不动），指针只决定大小
    if (ar) {
      const ax = drag.mode === 'nw' || drag.mode === 'sw' ? o.x + o.w : o.x;
      const ay = drag.mode === 'nw' || drag.mode === 'ne' ? o.y + o.h : o.y;
      setSel(fitFromAnchor(ax, ay, p.x, p.y, ar));
      return;
    }

    let x = o.x;
    let y = o.y;
    let w = o.w;
    let h = o.h;
    if (drag.mode === 'nw') {
      x = o.x + dx;
      y = o.y + dy;
      w = o.w - dx;
      h = o.h - dy;
    } else if (drag.mode === 'ne') {
      y = o.y + dy;
      w = o.w + dx;
      h = o.h - dy;
    } else if (drag.mode === 'sw') {
      x = o.x + dx;
      w = o.w - dx;
      h = o.h + dy;
    } else if (drag.mode === 'se') {
      w = o.w + dx;
      h = o.h + dy;
    }
    if (w < MIN_SIZE) {
      if (drag.mode === 'nw' || drag.mode === 'sw') x = o.x + o.w - MIN_SIZE;
      w = MIN_SIZE;
    }
    if (h < MIN_SIZE) {
      if (drag.mode === 'nw' || drag.mode === 'ne') y = o.y + o.h - MIN_SIZE;
      h = MIN_SIZE;
    }
    const nx = clamp01(Math.min(x, 1 - MIN_SIZE));
    const ny = clamp01(Math.min(y, 1 - MIN_SIZE));
    setSel({
      x: nx,
      y: ny,
      w: Math.min(w, 1 - nx),
      h: Math.min(h, 1 - ny),
    });
  };

  const onCropUp = () => {
    dragRef.current = null;
  };

  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cropMode || !source) return;
    if (e.button !== 0) return;
    if (e.target instanceof HTMLElement && e.target.closest('.zoom-bar, .crop-bar, .local-layer')) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const localDragRef = useRef(false);

  const onLocalDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!localMode) return;
    e.stopPropagation();
    const p = posOf(e);
    onPickLocal(p.x, p.y);
    localDragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onLocalMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!localDragRef.current) return;
    const p = posOf(e);
    onPickLocal(p.x, p.y);
  };

  const onLocalUp = () => {
    localDragRef.current = false;
  };

  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    const limitX = (dispW + box.w) / 2;
    const limitY = (dispH + box.h) / 2;
    setView((v) => ({
      zoom: v.zoom ?? fitZoom,
      panX: clamp(pan.panX + e.clientX - pan.startX, -limitX, limitX),
      panY: clamp(pan.panY + e.clientY - pan.startY, -limitY, limitY),
    }));
  };

  const onPanUp = () => {
    panRef.current = null;
  };

  const hasImage = Boolean(preview);

  return (
    <div
      className={`stage${hasImage ? ' has-image' : ''}`}
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerCancel={onPanUp}
      onDoubleClick={(e) => {
        if (e.target instanceof HTMLElement && e.target.closest('.zoom-bar, .crop-bar')) return;
        if (zoom > fitZoom * 1.01) resetView();
        else setView({ zoom: 1, panX: 0, panY: 0 });
      }}
    >
      {!hasImage && (
        <button className="dropzone" type="button" onClick={onPickFiles}>
          <IconOpen size={28} />
          <span className="dropzone-title">把图片拖到这里，或点击打开图片</span>
          <span className="dropzone-hint">支持 JPG / PNG / WebP / GIF 首帧，可一次导入多张</span>
          <span className="btn btn-primary">打开图片</span>
        </button>
      )}

      {hasImage && (
        <>
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            role="img"
            aria-label={
              preview
                ? `${fileName ?? '图片'}${showOriginal ? '（原图对照）' : ''}，${preview.width}×${preview.height} 像素预览`
                : '暂无图片'
            }
            style={{ left, top, width: dispW, height: dispH }}
          />
          {fileName && (
            <div className="stage-caption">
              {fileName}
              <span className="stage-caption-sep">·</span>
              {showOriginal ? '原图' : '预览'}
            </div>
          )}
          <div className="zoom-bar" role="group" aria-label="画布缩放">
            <button type="button" onClick={() => zoomBy(1 / 1.25)} title="缩小（也可用滚轮）" aria-label="缩小">
              −
            </button>
            <span className="zoom-percent" title="当前缩放比例">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" onClick={() => zoomBy(1.25)} title="放大（也可用滚轮）" aria-label="放大">
              +
            </button>
            <span className="zoom-sep" />
            <button type="button" onClick={resetView} title="适应窗口：缩放到完整显示" aria-label="适应窗口">
              适应
            </button>
            <button
              type="button"
              onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
              title="按 1:1 像素显示"
              aria-label="按 1:1 像素显示"
            >
              1:1
            </button>
          </div>
          {cropMode && (
            <div
              className="crop-layer"
              style={{ left, top, width: dispW, height: dispH }}
              onPointerDown={onCropDown}
              onPointerMove={onCropMove}
              onPointerUp={onCropUp}
              onPointerCancel={onCropUp}
            >
              <div className="crop-shade" style={{ left: 0, top: 0, right: 0, height: `${sel.y * 100}%` }} />
              <div
                className="crop-shade"
                style={{ left: 0, top: `${(sel.y + sel.h) * 100}%`, right: 0, bottom: 0 }}
              />
              <div
                className="crop-shade"
                style={{ left: 0, top: `${sel.y * 100}%`, width: `${sel.x * 100}%`, height: `${sel.h * 100}%` }}
              />
              <div
                className="crop-shade"
                style={{ left: `${(sel.x + sel.w) * 100}%`, top: `${sel.y * 100}%`, right: 0, height: `${sel.h * 100}%` }}
              />
              <div
                className="crop-selection"
                style={{
                  left: `${sel.x * 100}%`,
                  top: `${sel.y * 100}%`,
                  width: `${sel.w * 100}%`,
                  height: `${sel.h * 100}%`,
                }}
              >
                <div className="crop-grid" />
                <div className="crop-handle" data-handle="nw" />
                <div className="crop-handle" data-handle="ne" />
                <div className="crop-handle" data-handle="sw" />
                <div className="crop-handle" data-handle="se" />
                <div className="crop-size">
                  {Math.round(sel.w * 100)}% × {Math.round(sel.h * 100)}%
                </div>
              </div>
            </div>
          )}
          {localMode && local && (
            <div
              className="local-layer"
              style={{ left, top, width: dispW, height: dispH }}
              onPointerDown={onLocalDown}
              onPointerMove={onLocalMove}
              onPointerUp={onLocalUp}
              onPointerCancel={onLocalUp}
            >
              <div
                className="local-ring"
                style={{
                  left: `${local.cx * 100}%`,
                  top: `${local.cy * 100}%`,
                  width: Math.round(local.radius * 2 * Math.min(dispW, dispH)),
                  height: Math.round(local.radius * 2 * Math.min(dispW, dispH)),
                }}
              />
              <div className="local-tip">点击或拖动画面，设定局部调整中心</div>
            </div>
          )}
          {cropMode && (
            <div className="crop-bar">
              <span className="crop-tip">拖动框选区域，回车应用 · Esc 取消</span>
              <div className="crop-aspects" role="group" aria-label="裁切比例">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`crop-aspect${aspectId === a.id ? ' is-active' : ''}`}
                    aria-pressed={aspectId === a.id}
                    title={a.id === 'orig' ? '锁定为原图比例' : a.id === 'free' ? '不锁定比例' : `锁定为 ${a.label}`}
                    onClick={() => applyAspect(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSel({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
                  setAspectId('free');
                }}
              >
                <IconReset size={16} /> 重置选区
              </button>
              <button className="btn" type="button" onClick={onExitCrop}>
                <IconClose size={16} /> 取消
              </button>
              <button className="btn btn-primary" type="button" onClick={() => onApplyCrop(sel)}>
                <IconCheck size={16} /> 应用裁切
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
