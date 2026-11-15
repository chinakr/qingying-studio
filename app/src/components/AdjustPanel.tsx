import type { Edit } from '../lib/editor';
import { IconCheck, IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
  onReset: () => void;
  onApplyAll: () => void;
  photoCount: number;
}

interface SliderDef {
  key: 'exposure' | 'contrast' | 'vibrance' | 'saturation' | 'temperature' | 'tint';
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
  hint: string;
}

const SLIDERS: SliderDef[] = [
  { key: 'exposure', label: '曝光', min: -2, max: 2, step: 0.05, decimals: 2, unit: 'EV', hint: '整体明暗，双击滑杆归零' },
  { key: 'contrast', label: '对比度', min: -100, max: 100, step: 1, decimals: 0, hint: '明暗反差，双击滑杆归零' },
  { key: 'vibrance', label: '自然饱和度', min: -100, max: 100, step: 1, decimals: 0, hint: '优先提升灰暗色彩，保护肤色' },
  { key: 'saturation', label: '饱和度', min: -100, max: 100, step: 1, decimals: 0, hint: '全图色彩浓淡' },
  { key: 'temperature', label: '色温', min: -100, max: 100, step: 1, decimals: 0, hint: '冷 ← → 暖，负值偏冷' },
  { key: 'tint', label: '色调', min: -100, max: 100, step: 1, decimals: 0, hint: '洋红 ← → 绿' },
];

export default function AdjustPanel({ edit, onChange, onReset, onApplyAll, photoCount }: Props) {
  return (
    <div className="panel-body">
      <p className="panel-desc">所有调整都是非破坏性的，可用顶部「撤销」或下方「还原调整」回退。</p>

      <section className="panel-section">
        <h3>光与色</h3>
        {SLIDERS.map((s) => (
          <Slider
            key={s.key}
            id={`slider-${s.key}`}
            label={s.label}
            value={edit[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
            decimals={s.decimals}
            unit={s.unit}
            hint={s.hint}
            onChange={(value) => onChange({ [s.key]: value } as Partial<Edit>)}
          />
        ))}
      </section>

      <div className="panel-actions">
        <button className="btn" type="button" onClick={onReset}>
          <IconReset size={16} /> 还原调整
        </button>
        <button
          className="btn"
          type="button"
          onClick={onApplyAll}
          disabled={photoCount < 2}
          title={photoCount < 2 ? '至少导入两张图片后才能批量套用' : '把当前调色参数套用到全部图片'}
        >
          <IconCheck size={16} /> 应用到全部 {photoCount > 1 ? `(${photoCount})` : ''}
        </button>
      </div>
    </div>
  );
}
