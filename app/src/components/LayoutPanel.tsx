import type { Edit } from '../lib/editor';
import { IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
}

const COLORS: { value: string; name: string }[] = [
  { value: '#ffffff', name: '白色' },
  { value: '#000000', name: '黑色' },
  { value: '#1d2229', name: '深灰' },
  { value: '#d8a244', name: '金色' },
];

export default function LayoutPanel({ edit, onChange }: Props) {
  const border = edit.border;
  const setBorder = (next: Partial<typeof border>) => onChange({ border: { ...border, ...next } });

  return (
    <div className="panel-body">
      <p className="panel-desc">微调角度会自动放大并裁掉四角空白，边框按短边百分比绘制。</p>

      <Slider
        id="straighten"
        label="旋转微调"
        value={edit.straighten}
        min={-15}
        max={15}
        step={0.1}
        decimals={1}
        unit="°"
        hint="用于校正地平线 · 双击滑杆归零"
        onChange={(value) => onChange({ straighten: value })}
      />

      <Slider
        id="border-width"
        label="边框宽度"
        value={border.width}
        min={0}
        max={10}
        step={0.5}
        decimals={1}
        unit="%"
        hint="相对短边计算 · 双击滑杆归零"
        onChange={(value) => setBorder({ width: value })}
      />

      <div className="field">
        <div className="field-head">
          <span className="field-label">边框颜色</span>
        </div>
        <div className="swatch-row">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`swatch${border.color.toLowerCase() === c.value ? ' is-active' : ''}`}
              style={{ background: c.value }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={border.color.toLowerCase() === c.value}
              onClick={() => setBorder({ color: c.value })}
            />
          ))}
          <label className="swatch swatch-picker" title="自定义颜色">
            <input type="color" value={border.color} onChange={(e) => setBorder({ color: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn" type="button" onClick={() => onChange({ straighten: 0, border: { width: 0, color: '#ffffff' } })}>
          <IconReset size={16} /> 还原画幅
        </button>
      </div>
    </div>
  );
}
