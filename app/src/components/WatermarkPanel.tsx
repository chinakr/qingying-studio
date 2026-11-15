import { useRef, useState } from 'react';
import type { BlendMode, Edit, TextAlign, WatermarkPosition } from '../lib/editor';
import { loadImageMark } from '../lib/imageMark';
import { FONT_FAMILIES } from '../lib/watermark';
import { IconCheck, IconChevron, IconClose, IconImage } from './Icons';
import Slider from './Slider';

interface Props {
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
  onApplyAll: () => void;
  photoCount: number;
  onNotify?: (message: string) => void;
}

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: 'tl', label: '左上' },
  { id: 'tc', label: '中上' },
  { id: 'tr', label: '右上' },
  { id: 'ml', label: '左中' },
  { id: 'mc', label: '居中' },
  { id: 'mr', label: '右中' },
  { id: 'bl', label: '左下' },
  { id: 'bc', label: '中下' },
  { id: 'br', label: '右下' },
];

const COLORS: { value: string; name: string }[] = [
  { value: '#ffffff', name: '白色' },
  { value: '#000000', name: '黑色' },
  { value: '#d8a244', name: '金色' },
  { value: '#5aa9e6', name: '蓝色' },
];

const BLENDS: { id: BlendMode; name: string }[] = [
  { id: 'normal', name: '正常' },
  { id: 'multiply', name: '正片叠底' },
  { id: 'screen', name: '滤色' },
  { id: 'overlay', name: '叠加' },
];

const ALIGNS: { id: TextAlign; name: string }[] = [
  { id: 'left', name: '左对齐' },
  { id: 'center', name: '居中' },
  { id: 'right', name: '右对齐' },
];

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

export default function WatermarkPanel({ edit, onChange, onApplyAll, photoCount, onNotify }: Props) {
  const wm = edit.watermark;
  const im = edit.imageMark;
  const patch = (next: Partial<typeof wm>) => onChange({ watermark: { ...wm, ...next } });
  const patchImage = (next: Partial<typeof im>) => onChange({ imageMark: { ...im, ...next } });
  const markInput = useRef<HTMLInputElement>(null);
  const [markBusy, setMarkBusy] = useState(false);

  const pickMark = async (file: File | undefined) => {
    if (!file) return;
    setMarkBusy(true);
    try {
      const src = await readDataUrl(file);
      await loadImageMark(src);
      patchImage({ src, enabled: true });
      onNotify?.(`图片水印已载入：${file.name}`);
    } catch {
      onNotify?.('水印图片加载失败，请换一张 PNG/JPG/WebP');
    } finally {
      setMarkBusy(false);
    }
  };

  const positionGrid = (
    active: WatermarkPosition,
    onPick: (id: WatermarkPosition) => void,
    label: string,
  ) => (
    <div className="grid9" role="group" aria-label={label}>
      {POSITIONS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`grid9-cell${active === p.id ? ' is-active' : ''}`}
          title={p.label}
          aria-label={p.label}
          aria-pressed={active === p.id}
          onClick={() => onPick(p.id)}
        >
          <span aria-hidden />
        </button>
      ))}
    </div>
  );

  return (
    <div className="panel-body">
      <p className="panel-desc">图片水印在下、文字水印在上；两者可同时开启，文字始终压在最上层。</p>

      <section className="panel-section">
        <h3>文字水印</h3>
        <label className="switch-row">
          <input type="checkbox" checked={wm.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <span>启用文字水印</span>
        </label>

        <div className="field">
          <div className="field-head">
            <label htmlFor="wm-text">文字</label>
            <span className="field-value">{wm.text.length}/120</span>
          </div>
          <textarea
            id="wm-text"
            className="text-input text-area"
            rows={2}
            value={wm.text}
            maxLength={120}
            placeholder="输入水印文字，回车换行"
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">字体</span>
          </div>
          <div className="seg" role="group" aria-label="水印字体">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`seg-btn${wm.fontFamily === f.id ? ' is-active' : ''}`}
                aria-pressed={wm.fontFamily === f.id}
                onClick={() => patch({ fontFamily: f.id })}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">字形</span>
          </div>
          <div className="seg" role="group" aria-label="水印字形">
            <button
              type="button"
              className={`seg-btn${wm.bold ? ' is-active' : ''}`}
              aria-pressed={wm.bold}
              onClick={() => patch({ bold: !wm.bold })}
            >
              粗体
            </button>
            <button
              type="button"
              className={`seg-btn${wm.italic ? ' is-active' : ''}`}
              aria-pressed={wm.italic}
              onClick={() => patch({ italic: !wm.italic })}
            >
              斜体
            </button>
          </div>
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">对齐</span>
          </div>
          <div className="seg" role="group" aria-label="水印对齐">
            {ALIGNS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`seg-btn${wm.align === a.id ? ' is-active' : ''}`}
                aria-pressed={wm.align === a.id}
                onClick={() => patch({ align: a.id })}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">位置</span>
            <span className="field-value">{wm.tile ? '平铺' : POSITIONS.find((p) => p.id === wm.position)?.label}</span>
          </div>
          {positionGrid(wm.position, (id) => patch({ position: id, tile: false }), '文字水印位置')}
          <label className="switch-row">
            <input
              type="checkbox"
              checked={wm.tile}
              onChange={(e) => patch({ tile: e.target.checked, rotation: e.target.checked && wm.rotation === 0 ? -30 : wm.rotation })}
            />
            <span>平铺整张图片（勾选后默认 -30°）</span>
          </label>
        </div>
      </section>

      <section className="panel-section">
        <h3>文字外观</h3>

        <Slider
          id="wm-size"
          label="字号"
          value={wm.size}
          min={1}
          max={20}
          step={0.5}
          decimals={1}
          unit="% 短边"
          onChange={(value) => patch({ size: value })}
        />

        <Slider
          id="wm-opacity"
          label="不透明度"
          value={wm.opacity}
          min={5}
          max={100}
          step={1}
          unit="%"
          onChange={(value) => patch({ opacity: value })}
        />

        <Slider
          id="wm-rotate"
          label="旋转"
          value={wm.rotation}
          min={-90}
          max={90}
          step={5}
          unit="°"
          hint="双击滑杆归零"
          onChange={(value) => patch({ rotation: value })}
        />

        <div className="field">
          <div className="field-head">
            <span className="field-label">颜色</span>
          </div>
          <div className="swatch-row">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`swatch${wm.color.toLowerCase() === c.value ? ' is-active' : ''}`}
                style={{ background: c.value }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={wm.color.toLowerCase() === c.value}
                onClick={() => patch({ color: c.value })}
              />
            ))}
            <label className="swatch swatch-picker" title="自定义颜色">
              <input type="color" value={wm.color} onChange={(e) => patch({ color: e.target.value })} />
            </label>
          </div>
        </div>
      </section>

      <details className="panel-fold" open={im.enabled}>
        <summary>
          <span>图片水印{im.enabled ? '（已启用）' : ''}</span>
          <IconChevron size={14} className="fold-arrow" aria-hidden />
        </summary>
        <div className="fold-inner">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={im.enabled}
            disabled={!im.src}
            onChange={(e) => patchImage({ enabled: e.target.checked })}
          />
          <span>{im.src ? '启用图片水印' : '启用图片水印（先选择图片）'}</span>
        </label>

        <div className="mark-row">
          <span className="mark-thumb">
            {im.src ? <img src={im.src} alt="图片水印预览" /> : <IconImage size={20} />}
          </span>
          <button className="btn" type="button" onClick={() => markInput.current?.click()} disabled={markBusy}>
            {markBusy ? '载入中…' : im.src ? '更换图片' : '选择图片'}
          </button>
          {im.src && (
            <button className="btn" type="button" onClick={() => patchImage({ src: null, enabled: false })}>
              移除
            </button>
          )}
          <input
            ref={markInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              void pickMark(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">位置</span>
            <span className="field-value">{POSITIONS.find((p) => p.id === im.position)?.label}</span>
          </div>
          {positionGrid(im.position, (id) => patchImage({ position: id }), '图片水印位置')}
        </div>

        <Slider
          id="im-scale"
          label="缩放"
          value={im.scale}
          min={5}
          max={100}
          step={1}
          unit="% 短边"
          onChange={(value) => patchImage({ scale: value })}
        />

        <Slider
          id="im-opacity"
          label="不透明度"
          value={im.opacity}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(value) => patchImage({ opacity: value })}
        />

        <div className="field">
          <div className="field-head">
            <span className="field-label">混合模式</span>
          </div>
          <div className="seg" role="group" aria-label="图片水印混合模式">
            {BLENDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`seg-btn${im.blend === b.id ? ' is-active' : ''}`}
                aria-pressed={im.blend === b.id}
                onClick={() => patchImage({ blend: b.id })}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        </div>
      </details>

      <p className="field-hint">水印按导出分辨率绘制，预览中的大小比例与成片一致；图片水印先画、文字水印后画。</p>

      <div className="panel-actions">
        <button className="btn" type="button" onClick={() => patch({ enabled: false })}>
          <IconClose size={16} /> 关闭文字水印
        </button>
        <button
          className="btn"
          type="button"
          onClick={onApplyAll}
          disabled={photoCount < 2}
          title={photoCount < 2 ? '至少导入两张图片后才能批量套用' : '把文字水印设置套用到全部图片'}
        >
          <IconCheck size={16} /> 水印应用到全部 {photoCount > 1 ? `(${photoCount})` : ''}
        </button>
      </div>
    </div>
  );
}
