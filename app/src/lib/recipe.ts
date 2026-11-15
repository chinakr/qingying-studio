import brand from '../../brand.json';
import { PRESETS, type CurvePoint, type Edit, type PresetId } from './editor';

/**
 * 可移植配方：只描述「调色」相关参数（色彩 / 映射 / 质感），不含裁剪、水印、画幅。
 * 目的是让一组参数可以离开本机：存成文件、换一台机器、套到另一批图上。
 * 解析时逐项做范围与结构校验，任何一项不合法就整体拒绝，避免半套参数污染当前图片。
 */

const NUMERIC_FIELDS = {
  exposure: [-2, 2],
  contrast: [-100, 100],
  fillLight: [0, 100],
  darken: [0, 100],
  blur: [0, 100],
  saturation: [-100, 100],
  vibrance: [-100, 100],
  temperature: [-100, 100],
  tint: [-100, 100],
  sharpen: [0, 100],
  denoise: [0, 100],
  clarity: [0, 100],
  presetStrength: [0, 100],
} as const;

type NumericField = keyof typeof NUMERIC_FIELDS;

export const RECIPE_FORMAT = brand.recipeFormat;
/** 旧品牌写出的配方仍可读入，避免升级后已有配方变成废文件 */
const ACCEPTED_FORMATS = [brand.recipeFormat, ...(brand.legacyRecipeFormats ?? [])];
export const RECIPE_VERSION = 1;

export interface RecipeFile {
  format: string;
  version: number;
  author: string;
  exportedAt: string;
  edit: Record<string, unknown>;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildRecipe(edit: Edit): RecipeFile {
  const params: Record<string, unknown> = {};
  for (const key of Object.keys(NUMERIC_FIELDS) as NumericField[]) {
    params[key] = round(edit[key]);
  }
  params.preset = edit.preset;
  params.levels = { ...edit.levels };
  params.curve = edit.curve.map((p) => ({ x: p.x, y: p.y }));
  return {
    format: RECIPE_FORMAT,
    version: RECIPE_VERSION,
    author: brand.displayName,
    exportedAt: new Date().toISOString(),
    edit: params,
  };
}

export function recipeText(edit: Edit): string {
  return `${JSON.stringify(buildRecipe(edit), null, 2)}\n`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export type RecipeParse = { ok: true; edit: Partial<Edit>; summary: string } | { ok: false; error: string };

export function parseRecipe(text: string): RecipeParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!isRecord(raw)) return { ok: false, error: '文件内容不是配方对象' };
  if (typeof raw.format !== 'string' || !ACCEPTED_FORMATS.includes(raw.format)) {
    return { ok: false, error: `不是 ${brand.displayName} 配方文件` };
  }
  const legacy = raw.format !== RECIPE_FORMAT;
  if (raw.version !== RECIPE_VERSION) return { ok: false, error: `配方版本不支持（文件 ${String(raw.version)}，当前 ${RECIPE_VERSION}）` };
  if (!isRecord(raw.edit)) return { ok: false, error: '配方缺少 edit 字段' };

  const src = raw.edit;
  const patch: Partial<Edit> = {};

  for (const key of Object.keys(NUMERIC_FIELDS) as NumericField[]) {
    const [min, max] = NUMERIC_FIELDS[key];
    if (src[key] === undefined) continue;
    if (!inRange(src[key], min, max)) return { ok: false, error: `${key} 超出 ${min}..${max}` };
    patch[key] = src[key] as never;
  }

  if (src.preset !== undefined) {
    const ids = PRESETS.map((p) => p.id);
    if (typeof src.preset !== 'string' || !ids.includes(src.preset as PresetId)) {
      return { ok: false, error: 'preset 不是可识别的风格' };
    }
    patch.preset = src.preset as PresetId;
  }

  if (src.levels !== undefined) {
    const lv = src.levels;
    if (!isRecord(lv) || !inRange(lv.black, 0, 254) || !inRange(lv.white, 1, 255) || !inRange(lv.gamma, 0.2, 3)) {
      return { ok: false, error: 'levels 结构或范围不合法' };
    }
    if (lv.black >= lv.white) return { ok: false, error: 'levels 的黑场必须小于白场' };
    patch.levels = { black: Math.round(lv.black), white: Math.round(lv.white), gamma: lv.gamma };
  }

  if (src.curve !== undefined) {
    if (!Array.isArray(src.curve) || src.curve.length < 2 || src.curve.length > 16) {
      return { ok: false, error: 'curve 需要 2–16 个控制点' };
    }
    const points: CurvePoint[] = [];
    for (const item of src.curve) {
      if (!isRecord(item) || !inRange(item.x, 0, 255) || !inRange(item.y, 0, 255)) {
        return { ok: false, error: 'curve 控制点必须在 0..255 内' };
      }
      points.push({ x: Math.round(item.x), y: Math.round(item.y) });
    }
    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (new Set(sorted.map((p) => p.x)).size !== sorted.length) {
      return { ok: false, error: 'curve 控制点的 x 不能重复' };
    }
    patch.curve = sorted;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: '配方里没有可应用的参数' };

  const presetName = patch.preset ? PRESETS.find((p) => p.id === patch.preset)?.name : null;
  const parts = [
    patch.exposure !== undefined ? `曝光 ${patch.exposure > 0 ? '+' : ''}${patch.exposure}` : null,
    patch.contrast !== undefined ? `对比 ${patch.contrast > 0 ? '+' : ''}${patch.contrast}` : null,
    patch.fillLight ? `提亮 ${patch.fillLight}` : null,
    patch.sharpen ? `细节 ${patch.sharpen}` : null,
    presetName ? `风格 ${presetName}` : null,
  ].filter(Boolean);
  return {
    ok: true,
    edit: patch,
    summary: `${parts.length ? parts.join(' · ') : '部分参数'}${legacy ? '（旧版格式，已兼容）' : ''}`,
  };
}
