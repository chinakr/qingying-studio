import type { Edit } from '../lib/editor';
import { IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  edit: Edit;
  onChange: (patch: Partial<Edit>) => void;
}

export default function LocalPanel({ edit, onChange }: Props) {
  const local = edit.local;
  const patch = (next: Partial<typeof local>) => onChange({ local: { ...local, ...next } });

  return (
    <div className="panel-body">
      <p className="panel-desc">
        径向蒙版：只调整圆圈内的区域，边缘按羽化平滑过渡。在画面中点击或拖动可移动中心。
      </p>

      <label className="switch-row">
        <input type="checkbox" checked={local.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        <span>启用局部调整（调下面任一滑杆也会自动启用）</span>
      </label>

      <Slider
        id="local-radius"
        label="范围半径"
        value={Math.round(local.radius * 100)}
        min={5}
        max={60}
        step={1}
        unit="% 短边"
        hint="圆圈越大，受影响的区域越多"
        onChange={(value) => patch({ radius: value / 100, enabled: true })}
      />

      <Slider
        id="local-feather"
        label="羽化"
        value={Math.round(local.feather * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        hint="边缘过渡的柔和程度"
        onChange={(value) => patch({ feather: value / 100, enabled: true })}
      />

      <Slider
        id="local-exposure"
        label="局部曝光"
        value={local.exposure}
        min={-2}
        max={2}
        step={0.05}
        decimals={2}
        unit="EV"
        hint="只作用于圆圈内 · 双击滑杆归零"
        onChange={(value) => patch({ exposure: value, enabled: true })}
      />

      <Slider
        id="local-saturation"
        label="局部饱和度"
        value={local.saturation}
        min={-100}
        max={100}
        step={1}
        hint="只作用于圆圈内 · 双击滑杆归零"
        onChange={(value) => patch({ saturation: value, enabled: true })}
      />

      <p className="field-hint">
        中心位置：X {Math.round(local.cx * 100)}% · Y {Math.round(local.cy * 100)}%
      </p>

      <div className="panel-actions">
        <button
          className="btn"
          type="button"
          onClick={() => onChange({ local: { ...local, enabled: false, exposure: 0, saturation: 0, cx: 0.5, cy: 0.5 } })}
        >
          <IconReset size={16} /> 重置局部
        </button>
      </div>
    </div>
  );
}
