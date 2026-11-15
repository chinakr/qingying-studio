import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CURVE,
  DEFAULT_LEVELS,
  curveLut,
  type CurvePoint,
  type Edit,
  type Photo,
} from '../lib/editor';
import { IconChevron, IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  photo: Photo | null;
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
}

const PAD = 12;

export default function CurvePanel({ photo, edit, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);
  const pointsRef = useRef<CurvePoint[] | null>(null);
  const [histogram, setHistogram] = useState<number[] | null>(null);

  const lut = useMemo(() => curveLut(edit.curve), [edit.curve]);

  // 直方图取自已生成的缩略图，避免每次调整都重新解码原图
  useEffect(() => {
    if (!photo) {
      setHistogram(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const bins = new Array<number>(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const luma = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        bins[luma]++;
      }
      const max = Math.max(1, ...bins);
      setHistogram(bins.map((v) => v / max));
    };
    img.src = photo.thumb;
    return () => {
      cancelled = true;
    };
  }, [photo]);

  useEffect(() => {
    const canvas = histRef.current;
    if (!canvas || !histogram) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(216, 162, 68, 0.55)';
    const w = canvas.width / 256;
    for (let i = 0; i < 256; i++) {
      const h = Math.max(1, histogram[i] * canvas.height);
      ctx.fillRect(i * w, canvas.height - h, Math.max(1, w), h);
    }
  }, [histogram]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const toX = (x: number) => PAD + (x / 255) * (size - PAD * 2);
    const toY = (y: number) => size - PAD - (y / 255) * (size - PAD * 2);

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d1013';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#20252c';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const g = PAD + (i / 4) * (size - PAD * 2);
      ctx.beginPath();
      ctx.moveTo(g, PAD);
      ctx.lineTo(g, size - PAD);
      ctx.moveTo(PAD, g);
      ctx.lineTo(size - PAD, g);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2b313a';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(255), toY(255));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#e7e9ee';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let x = 0; x <= 255; x++) {
      const px = toX(x);
      const py = toY(lut[x]);
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (const p of edit.curve) {
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#d8a244';
      ctx.fill();
      ctx.strokeStyle = '#161a20';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [edit.curve, lut]);

  const valueFromClient = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const size = canvas.width;
    const px = ((clientX - rect.left) / rect.width) * size;
    const py = ((clientY - rect.top) / rect.height) * size;
    return {
      x: Math.max(0, Math.min(255, ((px - PAD) / (size - PAD * 2)) * 255)),
      y: Math.max(0, Math.min(255, ((size - PAD - py) / (size - PAD * 2)) * 255)),
    };
  }, []);

  const toValue = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => valueFromClient(e.currentTarget, e.clientX, e.clientY),
    [valueFromClient],
  );

  const commit = (points: CurvePoint[]) => {
    onChange({ curve: [...points].sort((a, b) => a.x - b.x) });
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = toValue(e);
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const threshold = 11 * scale;
    const base = pointsRef.current ?? edit.curve;
    let index = -1;
    let best = Infinity;
    base.forEach((p, i) => {
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d < threshold && d < best) {
        best = d;
        index = i;
      }
    });

    let next = base;
    if (index === -1) {
      next = [...base, { x: Math.round(v.x), y: Math.round(v.y) }].sort((a, b) => a.x - b.x);
      index = next.findIndex((p) => Math.abs(p.x - v.x) < 0.6);
      commit(next);
    }
    pointsRef.current = next;
    dragRef.current = index;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const index = dragRef.current;
    const base = pointsRef.current;
    if (index === null || index < 0 || !base) return;
    const v = toValue(e);
    const next = base.map((p, i) => {
      if (i !== index) return p;
      const isFirst = index === 0;
      const isLast = index === base.length - 1;
      const minX = isFirst ? 0 : base[index - 1].x + 1;
      const maxX = isLast ? 255 : base[index + 1].x - 1;
      return {
        x: isFirst || isLast ? p.x : Math.max(minX, Math.min(maxX, Math.round(v.x))),
        y: Math.round(v.y),
      };
    });
    pointsRef.current = next;
    commit(next);
  };

  const onUp = () => {
    dragRef.current = null;
    pointsRef.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (edit.curve.length <= 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = e.currentTarget.width / rect.width;
    const v = valueFromClient(e.currentTarget, e.clientX, e.clientY);
    let index = -1;
    let best = Infinity;
    edit.curve.forEach((p, i) => {
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d < 11 * scale && d < best) {
        best = d;
        index = i;
      }
    });
    if (index > 0 && index < edit.curve.length - 1) {
      commit(edit.curve.filter((_, i) => i !== index));
    }
  };

  const autoLevels = () => {
    if (!histogram) return;
    const total = histogram.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    let black = 0;
    let white = 255;
    for (let i = 0; i < 256; i++) {
      acc += histogram[i];
      if (acc / total > 0.005) {
        black = i;
        break;
      }
    }
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += histogram[i];
      if (acc / total > 0.005) {
        white = i;
        break;
      }
    }
    onChange({ levels: { ...edit.levels, black: Math.min(black, white - 8), white: Math.max(white, black + 8) } });
  };

  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="field-head">
          <span className="field-label">曲线</span>
          <span className="field-value">{edit.curve.length} 个控制点</span>
        </div>
        <canvas
          ref={canvasRef}
          className="curve-canvas"
          width={256}
          height={256}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={onDoubleClick}
        />
        <p className="field-hint">点击空白处加点，拖动调整，双击中间点删除</p>
      </section>

      <section className="panel-section">
        <div className="field-head">
          <span className="field-label">直方图</span>
          <button
            className="btn btn-mini"
            type="button"
            onClick={autoLevels}
            disabled={!histogram}
            title="按两端各 0.5% 截断自动设定黑白场"
          >
            黑白场校准
          </button>
        </div>
        <canvas ref={histRef} className="hist-canvas" width={256} height={64} />
      </section>

      <details className="panel-fold" open>
        <summary>
          <span>色阶（黑场 / 白场 / Gamma）</span>
          <IconChevron size={14} className="fold-arrow" aria-hidden />
        </summary>

        <Slider
          id="level-black"
          label="黑场"
          value={edit.levels.black}
          min={0}
          max={254}
          step={1}
          onChange={(value) => onChange({ levels: { ...edit.levels, black: Math.min(value, edit.levels.white - 1) } })}
        />
        <Slider
          id="level-white"
          label="白场"
          value={edit.levels.white}
          min={1}
          max={255}
          step={1}
          onChange={(value) => onChange({ levels: { ...edit.levels, white: Math.max(value, edit.levels.black + 1) } })}
        />
        <Slider
          id="level-gamma"
          label="中间调（Gamma）"
          value={edit.levels.gamma}
          min={0.2}
          max={3}
          step={0.01}
          decimals={2}
          hint="大于 1 提亮中间调，小于 1 压暗中间调"
          onChange={(value) => onChange({ levels: { ...edit.levels, gamma: value } })}
        />
      </details>

      <div className="panel-actions">
        <button
          className="btn"
          type="button"
          onClick={() =>
            onChange({
              levels: { ...DEFAULT_LEVELS },
              curve: DEFAULT_CURVE.map((p) => ({ ...p })),
            })
          }
        >
          <IconReset size={16} /> 还原曲线与色阶
        </button>
      </div>
    </div>
  );
}
