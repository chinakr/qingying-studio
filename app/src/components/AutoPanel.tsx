import type { Edit } from '../lib/editor';
import type { AutoResult } from '../lib/auto';
import { describeRecipe } from '../lib/auto';
import type { QuickTiers, TierState } from '../lib/quick';
import {
  IconAdjust,
  IconAuto,
  IconCheck,
  IconChevron,
  IconDetail,
  IconDroplet,
  IconGrain,
  IconLocal,
  IconOutput,
  IconPlus,
  IconReset,
  IconSunDown,
  IconSunUp,
  IconUndo,
} from './Icons';
import Slider from './Slider';

export type QuickKind =
  | 'auto'
  | 'fill'
  | 'darken'
  | 'wb'
  | 'sharpen'
  | 'blur'
  | 'denoise'
  | 'levels'
  | 'resetQuick';

interface Props {
  /** 当前强度下算出来的方案（未应用时用于预览将要改动什么） */
  preview: AutoResult | null;
  /** 已经应用到当前照片的方案；null 表示还没应用 */
  applied: AutoResult | null;
  /** 应用前的参数快照，用来在列表里显示"原值" */
  appliedFrom: Partial<Edit> | null;
  strength: number;
  edit: Edit;
  /** 可累积按钮当前到第几档，用于在按钮上显示档位 */
  tiers: QuickTiers | null;
  onStrength: (value: number) => void;
  onApply: () => void;
  /** 只做曝光归位，不碰对比/饱和/曲线 */
  onAutoExposure: () => void;
  onUndo: () => void;
  onApplyAll: () => void;
  onQuick: (kind: QuickKind) => void;
  onFillLight: (value: number) => void;
  onDarken: (value: number) => void;
  onBlur: (value: number) => void;
  onFillLightAll: () => void;
  onExportRecipe: () => void;
  onImportRecipe: () => void;
  photoCount: number;
}

/** 常用动作：整组校色 + 8 个单项动作，集中在一处，一眼可见。 */
const QUICK: { kind: QuickKind; label: string; icon: typeof IconDetail; hint: string; primary?: boolean }[] = [
  { kind: 'auto', label: '整组校色', icon: IconAuto, hint: '按直方图分位做整组自动调色；重复点击结果一致，会明确提示而不是静默', primary: true },
  { kind: 'fill', label: '暗部提亮', icon: IconSunUp, hint: '只抬暗部、不动高光；每点一档 55→70→85→100，到顶会提示' },
  { kind: 'darken', label: '亮部压制', icon: IconSunDown, hint: '只压亮部、保留暗位；每点一档 55→70→85→100，与暗部提亮对称' },
  { kind: 'wb', label: '中性校准', icon: IconDroplet, hint: '按灰度世界估计色温与色调；已接近中性时会提示，不会重复偏移' },
  { kind: 'sharpen', label: '细节增强', icon: IconDetail, hint: '每点一档 60→75→90，同时关闭柔焦' },
  { kind: 'blur', label: '柔焦', icon: IconLocal, hint: '每点一档 30→50→70→90，只压高频细节' },
  { kind: 'denoise', label: '颗粒抑制', icon: IconGrain, hint: '每点一档 45→60→75→90，保留边缘' },
  { kind: 'levels', label: '黑白场校准', icon: IconAdjust, hint: '按 1%/99% 分位设定黑白场；每点一档再收紧 6 级，最多 3 档' },
  { kind: 'resetQuick', label: '还原调整', icon: IconReset, hint: '清空提亮/压制/柔焦/细节/颗粒/黑白场/中性校准与色彩累积，可撤销' },
];

export default function AutoPanel({
  preview,
  applied,
  appliedFrom,
  strength,
  edit,
  tiers,
  onStrength,
  onApply,
  onAutoExposure,
  onUndo,
  onApplyAll,
  onQuick,
  onFillLight,
  onDarken,
  onBlur,
  onFillLightAll,
  onExportRecipe,
  onImportRecipe,
  photoCount,
}: Props) {
  const shown = applied ?? preview;
  const rows = shown ? describeRecipe(shown.recipe, applied ? appliedFrom : null) : [];
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;

  return (
    <div className="panel-body">
      <p className="panel-desc">
        先按分位数统计整图的明暗、色偏、饱和度与噪声，再做曝光、黑白场、饱和、清晰度与锐化的整组调整。全过程非破坏性，可用顶部「撤销」回退。
      </p>

      <section className="panel-section">
        <h3>常用动作</h3>
        <div className="quick-grid quick-grid-3">
          {QUICK.map((q) => {
            const Icon = q.icon;
            const tier = tiers ? (tiers as Partial<Record<QuickKind, TierState>>)[q.kind] : null;
            return (
              <button
                key={q.kind}
                className={`btn quick-btn${q.primary ? ' is-primary' : ''}`}
                type="button"
                title={q.hint}
                aria-label={q.label}
                onClick={() => (q.kind === 'auto' ? onApply() : onQuick(q.kind))}
              >
                <Icon size={16} />
                <span>{q.label}</span>
                {tier && tier.tier > 0 && (
                  <span className={`quick-tier${tier.atCap ? ' is-cap' : ''}`}>
                    {tier.atCap ? '已满' : `${tier.tier} 档`}
                    {tier.valueLabel ? ` · ${tier.valueLabel}` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="field-hint">提亮/压制/细节/柔焦/颗粒/黑白场可连点累加，⌘Z 一次退一档。</p>
      </section>

      <section className="panel-section">
        <h3>可移植配方</h3>
        <div className="recipe-actions">
          <button className="btn" type="button" onClick={onExportRecipe}>
            <IconOutput size={16} /> 导出配方
          </button>
          <button className="btn" type="button" onClick={onImportRecipe}>
            <IconPlus size={16} /> 载入配方
          </button>
        </div>
        <p className="field-hint">把当前色彩、映射与质感参数存成 JSON，可跨机跨批载入；不含裁剪、水印与画幅。</p>
      </section>

      <div className="auto-exposure">
        <button
          className="btn auto-exposure-btn"
          type="button"
          onClick={onAutoExposure}
          title="只把曝光拉回中性，不改对比/饱和/曲线；按画面中位亮度逼近目标，每次最多 0.5 EV，可连点"
        >
          <IconAdjust size={17} /> 曝光校正
          {edit.exposure !== 0 && (
            <span className="quick-tier">
              {edit.exposure > 0 ? '+' : ''}
              {edit.exposure.toFixed(2)} EV
            </span>
          )}
        </button>
      </div>
      <p className="field-hint">
        曝光校正与整组校色相互独立：只做曝光归位，按当前画面的中位亮度逐步逼近目标（单次 ≤ 0.5 EV，高光接近上限时停手）。
      </p>

      <Slider
        id="auto-strength"
        label="强度"
        value={strength}
        min={0}
        max={100}
        step={5}
        unit="%"
        hint="默认 60%，越高越明显；100% 为满强度"
        resetTo={60}
        onChange={onStrength}
      />

      {shown && (
        <>
          <div className="auto-scene">
            <span className="auto-badge">{shown.label}</span>
            <p>{shown.summary}</p>
          </div>

          {!applied && <p className="field-hint">下面是将要改动的项目，点击上方按钮才会生效。</p>}
          {applied && <p className="field-hint">下面是已生效的参数与原值对照，可据此继续微调。</p>}

          {rows.length > 0 ? (
            <div className="auto-list">
              {rows.map((r) => (
                <div className="auto-row" key={r.key}>
                  <span>{r.label}</span>
                  <b>{r.value}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-desc">这张图统计上已经很正常，强度为 0 时不会改动任何参数。</p>
          )}

          <p className="field-hint">以上项目都可以到「色彩 / 映射 / 质感」面板单独微调。</p>
        </>
      )}

      <details className="panel-fold">
        <summary>
          <span>微调：暗部提亮 / 亮部压制 / 柔焦</span>
          <IconChevron size={14} className="fold-arrow" aria-hidden />
        </summary>
        <div className="fold-inner">
        <Slider
          id="fill-light"
          label="暗部提亮"
          value={edit.fillLight}
          min={0}
          max={100}
          step={5}
          hint="只作用在暗部选区：黑位保持、亮度 0.48 以上完全不动，不会把高光推爆"
          resetTo={55}
          onChange={onFillLight}
        />
        <Slider
          id="darken-light"
          label="亮部压制"
          value={edit.darken}
          min={0}
          max={100}
          step={5}
          hint="只作用在亮部选区：亮度 0.52 以下完全不动，暗位与黑位不会被洗灰"
          resetTo={55}
          onChange={onDarken}
        />
        <Slider
          id="blur-soften"
          label="柔焦"
          value={edit.blur}
          min={0}
          max={100}
          step={5}
          hint="可分离盒式模糊；默认 30 只压高频细节（1200px 短边约 1–2px），100 才会明显糊化"
          resetTo={30}
          onChange={onBlur}
        />
        <p className="field-hint">
          当前：提亮 {edit.fillLight} · 压制 {edit.darken} · 柔焦 {edit.blur} · 细节 {edit.sharpen} · 颗粒{' '}
          {edit.denoise} · 色温 {signed(edit.temperature)} · 色调 {signed(edit.tint)}
        </p>
        {photoCount > 1 && (
          <button className="btn btn-ghost quick-all" type="button" onClick={onFillLightAll}>
            把提亮 {edit.fillLight} 应用到全部 {photoCount} 张
          </button>
        )}
        </div>
      </details>

      <div className="panel-actions">
        {applied && (
          <button className="btn" type="button" onClick={onUndo}>
            <IconUndo size={16} /> 撤销整组校色
          </button>
        )}
        <button
          className="btn"
          type="button"
          onClick={onApplyAll}
          disabled={photoCount < 2}
          title={photoCount < 2 ? '至少导入两张图片后才能批量套用' : '按各自的画面统计逐张套用整组校色'}
        >
          <IconCheck size={16} /> 应用到全部 {photoCount > 1 ? `(${photoCount})` : ''}
        </button>
      </div>
    </div>
  );
}
