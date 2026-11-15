import { useEffect, useState } from 'react';
import {
  DEFAULT_EDIT,
  PRESETS,
  PRESET_GROUPS,
  type Edit,
  type Photo,
  type PresetCategory,
  type PresetId,
} from '../lib/editor';
import { renderPhoto } from '../lib/render';
import Slider from './Slider';

interface Props {
  photo: Photo | null;
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
}

export default function PresetPanel({ photo, edit, onChange }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const next: Record<string, string> = {};
    for (const p of PRESETS) {
      // 缩略图固定展示 100% 强度的风格，不带入其它编辑；这样拖动强度滑杆时不必重算 17 张
      const result = renderPhoto(photo, { ...DEFAULT_EDIT, preset: p.id as PresetId }, 160);
      next[p.id] = result.canvas.toDataURL('image/jpeg', 0.75);
    }
    if (!cancelled) setThumbs(next);
    return () => {
      cancelled = true;
    };
  }, [photo]);

  const active = PRESETS.find((p) => p.id === edit.preset);

  const card = (id: PresetId, name: string, hint: string) => (
    <button
      key={id}
      type="button"
      className={`preset-card${edit.preset === id ? ' is-active' : ''}`}
      onClick={() => onChange({ preset: id, presetStrength: id !== 'none' && edit.presetStrength === 0 ? 100 : edit.presetStrength })}
      title={hint}
      aria-pressed={edit.preset === id}
    >
      <span className="preset-thumb">
        {thumbs[id] ? <img src={thumbs[id]} alt={name} /> : <span className="preset-skeleton" />}
      </span>
      <span className="preset-name">{name}</span>
    </button>
  );

  const group = (category: PresetCategory) => (
    <section className="preset-group" key={category}>
      <h3 className="preset-group-title">{PRESET_GROUPS.find((g) => g.id === category)?.name}</h3>
      <div className="preset-grid">
        {PRESETS.filter((p) => p.category === category).map((p) => card(p.id, p.name, p.hint))}
      </div>
    </section>
  );

  return (
    <div className="panel-body">
      <p className="panel-desc">16 个滤镜分 4 类，全部由参数组合生成；每类可用强度 0–100 调节。</p>
      <div className="preset-grid preset-grid-origin">{card('none', '原图', '不做风格化处理')}</div>

      <Slider
        id="slider-preset-strength"
        label="滤镜强度"
        value={edit.presetStrength}
        min={0}
        max={100}
        step={1}
        unit="%"
        disabled={edit.preset === 'none'}
        onChange={(v) => onChange({ presetStrength: v })}
        hint="0% 等同原图，100% 为完整风格；走同一条 LUT 管线，预览与导出一致。"
      />

      {PRESET_GROUPS.map((g) => group(g.id))}
      <p className="field-hint">当前：{active?.hint}</p>
    </div>
  );
}
