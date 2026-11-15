import type { Levels } from './editor';

/**
 * 常用动作的累积档位。
 *
 * 每次点击把绝对强度推高一档，参数始终以“原图 + 当前绝对强度”重算，
 * 而不是在上一轮输出上再叠一遍，所以连点不会累积噪点或色带。
 */
export interface TierSpec {
  start: number;
  step: number;
  cap: number;
}

export type StackKind = 'fill' | 'darken' | 'sharpen' | 'blur' | 'denoise';

export const TIER_SPECS: Record<StackKind, TierSpec> = {
  // 提亮/压制只作用于各自的选区，满档仍保留黑位与高光细节
  fill: { start: 55, step: 15, cap: 100 },
  darken: { start: 55, step: 15, cap: 100 },
  // 锐化/降噪满档容易放大噪点或产生白边，上限压到 90
  sharpen: { start: 60, step: 15, cap: 90 },
  blur: { start: 30, step: 20, cap: 90 },
  denoise: { start: 45, step: 15, cap: 90 },
};

export interface TierState {
  /** 当前累计到第几档，0 表示还没启用 */
  tier: number;
  maxTier: number;
  /** 按钮上显示的强度值（黑白场校准这类没有单一数值的留空） */
  valueLabel: string;
  atCap: boolean;
}

/** 3×3 宫格里所有可累积按钮的当前档位 */
export type QuickTiers = Record<StackKind | 'levels', TierState>;

export function maxTier(spec: TierSpec): number {
  return Math.floor((spec.cap - spec.start) / spec.step + 1e-9) + 1;
}

export function tierOf(spec: TierSpec, value: number): number {
  if (value < spec.start) return 0;
  return Math.min(maxTier(spec), Math.floor((value - spec.start) / spec.step + 1e-9) + 1);
}

export function tierState(spec: TierSpec, value: number): TierState {
  const tier = tierOf(spec, value);
  return { tier, maxTier: maxTier(spec), valueLabel: String(value), atCap: tier >= maxTier(spec) };
}

export interface NextTier {
  /** 本次点击应写入的绝对强度 */
  value: number;
  tier: number;
  maxTier: number;
  atCap: boolean;
}

/** 计算下一次点击要落到的档位；已在满档时 atCap=true，调用方只提示不改参数。 */
export function nextTier(spec: TierSpec, value: number): NextTier {
  const max = maxTier(spec);
  const current = tierOf(spec, value);
  if (current >= max) return { value: spec.cap, tier: max, maxTier: max, atCap: true };
  const tier = current + 1;
  return {
    value: Math.min(spec.cap, spec.start + (tier - 1) * spec.step),
    tier,
    maxTier: max,
    atCap: false,
  };
}

/** 黑白场校准每一档再收紧 6 级，最多 3 档；两端另有硬保护，避免削顶或压死暗部。 */
export const LEVELS_STEP = 6;
export const LEVELS_MAX_TIER = 3;
const LEVELS_BLACK_CAP = 96;
const LEVELS_WHITE_FLOOR = 160;

/** 保守基准：黑场最多 48、白场至少 208，避免把夜景抽成白天。 */
export function levelsBase(p01: number, p99: number): { black: number; white: number } {
  return {
    black: Math.round(Math.min(48, Math.max(0, p01))),
    white: Math.round(Math.max(208, Math.min(255, p99))),
  };
}

export interface LevelsStep {
  levels: Levels;
  tier: number;
  maxTier: number;
  atCap: boolean;
  /** 直方图两端过于集中，无法再收紧 */
  skip: boolean;
}

export function levelsTierOf(levels: Levels, base: { black: number; white: number }): number {
  // 第一档就是基准值本身，和“未启用”的默认值（0/255）要靠默认值区分开
  if (levels.black === 0 && levels.white === 255) return 0;
  const extra = Math.max(levels.black - base.black, base.white - levels.white);
  return Math.min(LEVELS_MAX_TIER, Math.max(1, Math.round(extra / LEVELS_STEP) + 1));
}

export function nextLevels(levels: Levels, base: { black: number; white: number }): LevelsStep {
  const current = levelsTierOf(levels, base);
  if (current >= LEVELS_MAX_TIER) {
    return { levels, tier: LEVELS_MAX_TIER, maxTier: LEVELS_MAX_TIER, atCap: true, skip: false };
  }
  const tier = current + 1;
  const black = Math.min(LEVELS_BLACK_CAP, base.black + (tier - 1) * LEVELS_STEP);
  const white = Math.max(LEVELS_WHITE_FLOOR, base.white - (tier - 1) * LEVELS_STEP);
  if (white - black < 8) {
    return { levels, tier: current, maxTier: LEVELS_MAX_TIER, atCap: true, skip: true };
  }
  return { levels: { black, white, gamma: 1 }, tier, maxTier: LEVELS_MAX_TIER, atCap: false, skip: false };
}

export function levelsState(levels: Levels, base: { black: number; white: number }): TierState {
  const tier = levelsTierOf(levels, base);
  return { tier, maxTier: LEVELS_MAX_TIER, valueLabel: '', atCap: tier >= LEVELS_MAX_TIER };
}
