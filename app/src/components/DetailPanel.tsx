import type { Edit } from '../lib/editor';
import { IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
}

const SLIDERS: { key: 'clarity' | 'sharpen' | 'denoise'; label: string; hint: string }[] = [
  { key: 'clarity', label: '清晰度', hint: '大半径局部对比，增强块面层次，不放大噪点' },
  { key: 'denoise', label: '降噪', hint: '只平滑相近的像素，边缘保留' },
  { key: 'sharpen', label: '锐化', hint: '反锐化掩模，提升边缘清晰度' },
];

export default function DetailPanel({ edit, onChange }: Props) {
  return (
    <div className="panel-body">
      <p className="panel-desc">
        按「降噪 → 清晰度 → 锐化」的顺序执行。预览基于缩放后的画布，导出按原分辨率重新计算，强度感会略有差异。
      </p>

      {SLIDERS.map((s) => (
        <Slider
          key={s.key}
          id={`detail-${s.key}`}
          label={s.label}
          value={edit[s.key]}
          min={0}
          max={100}
          step={1}
          hint={`${s.hint} · 双击滑杆归零`}
          onChange={(value) => onChange({ [s.key]: value } as Partial<Edit>)}
        />
      ))}

      <div className="panel-actions">
        <button className="btn" type="button" onClick={() => onChange({ clarity: 0, sharpen: 0, denoise: 0 })}>
          <IconReset size={16} /> 还原细节
        </button>
      </div>
    </div>
  );
}
