import { useState, type CSSProperties } from 'react';

interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 数值框显示的小数位，默认 0 */
  decimals?: number;
  /** 数值框右侧单位，如 ° / % / EV */
  unit?: string;
  hint?: string;
  /** 双击滑杆时的归零值，默认 0 */
  resetTo?: number;
  disabled?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 统一的「标签 + 可键盘输入的数值 + 滑杆 + 提示」控件。
 * 数值框既显示当前值也可以直接输入，失焦或回车时按 min/max 夹紧。
 */
export default function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  decimals = 0,
  unit,
  hint,
  resetTo = 0,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const fill = ((value - min) / (max - min)) * 100;

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const snapped = Math.round(parsed / step) * step;
    onChange(Number(clamp(snapped, min, max).toFixed(4)));
  };

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="field-num">
          <input
            className="num-input"
            type="number"
            inputMode="decimal"
            aria-label={`${label}（可输入数值）`}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={draft ?? value.toFixed(decimals)}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit((e.target as HTMLInputElement).value);
                setDraft(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {unit && <span className="field-unit">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${value.toFixed(decimals)}${unit ?? ''}`}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(resetTo)}
        style={{ '--fill': `${fill}%` } as CSSProperties}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
