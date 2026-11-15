import { DEFAULT_EDIT, baseToneMap, solveNeutralTemperature, type CurvePoint, type Edit, type Levels, type Photo } from './editor';
import { renderPhoto } from './render';

/**
 * 整组校色：先统计场景，再按分位数结果生成一组全局调色参数。
 *
 * 设计原则：
 * 1. 只做全局调整（不找人脸、不做局部），因此所有结论都基于整图统计；
 * 2. 参数一次性算完写成绝对值，重复点击结果完全一致（幂等）；
 * 3. 曝光看中位数、黑白场看 1%/99% 分位，不再用固定阈值猜；
 * 4. 强度只做线性缩放：100% 是满强度，默认 60% 约为其六成。
 */

export type SceneKind = 'normal' | 'flat' | 'overcast' | 'backlit' | 'warm-indoor' | 'night';

export interface SceneStats {
  width: number;
  height: number;
  pixels: number;
  mean: number;
  std: number;
  p01: number;
  p02: number;
  p50: number;
  p98: number;
  p99: number;
  /** 缩略图上相邻像素的平均亮度差，越大越"有内容"，用来区分灰雾与真实纹理 */
  detail: number;
  clipLow: number;
  clipHigh: number;
  shadowRatio: number;
  highlightRatio: number;
  satMean: number;
  rMean: number;
  gMean: number;
  bMean: number;
  /** (rMean - bMean) / 255，正数偏暖 */
  cast: number;
  /** (gMean - (rMean + bMean)/2) / 255，正数偏绿 */
  greenCast: number;
  /** 高频残差估计（0..255 尺度），越大越可能是高 ISO 噪点 */
  noise: number;
}

export interface AutoRecipe {
  exposure: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  levels: Levels;
  curve: CurvePoint[];
  sharpen: number;
  denoise: number;
  clarity: number;
}

export interface AutoResult {
  scene: SceneKind;
  label: string;
  recipe: AutoRecipe;
  /** 面向用户的一句话解释，说明为什么这么调 */
  summary: string;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const SCENE_LABEL: Record<SceneKind, string> = {
  normal: '常规场景',
  flat: '低对比',
  overcast: '阴天低饱和',
  backlit: '逆光',
  'warm-indoor': '偏黄室内',
  night: '夜景',
};

/** 各场景的中位数目标亮度：逆光/低对比拉向中灰，夜景保留氛围不拉成白天。 */
const SCENE_MID: Record<SceneKind, number> = {
  normal: 128,
  flat: 150,
  overcast: 146,
  backlit: 150,
  'warm-indoor': 136,
  night: 96,
};

const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

/** 把满强度的控制点按 strength 向恒等直线收拢，strength=0 时退化为不调整。 */
function scaleCurve(points: Array<[number, number]>, strength: number): CurvePoint[] {
  return points.map(([x, y]) => ({ x, y: Math.round(x + (y - x) * strength) }));
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 在原图缩略图上统计；降采样同时起到抑制噪点、加速计算的作用。 */
export function computeStats(photo: Photo): SceneStats {
  const { original } = photo;
  const scale = Math.min(1, 420 / Math.max(original.width, original.height));
  const w = Math.max(1, Math.round(original.width * scale));
  const h = Math.max(1, Math.round(original.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(original, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const hist = new Uint32Array(256);
  let sum = 0;
  let sumSq = 0;
  let satSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let midCount = 0;
  let clipLow = 0;
  let clipHigh = 0;
  let shadow = 0;
  let highlight = 0;
  const total = w * h;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const y = luma(r, g, b);
    const yi = y < 0 ? 0 : y > 255 ? 255 : Math.round(y);
    hist[yi]++;
    sum += y;
    sumSq += y * y;

    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    satSum += max === 0 ? 0 : (max - min) / max;

    if (yi >= 12 && yi <= 243) {
      rSum += r;
      gSum += g;
      bSum += b;
      midCount++;
    }
    if (yi <= 2) clipLow++;
    if (yi >= 253) clipHigh++;
    if (yi < 48) shadow++;
    if (yi > 208) highlight++;
  }

  const mean = sum / total;
  const variance = Math.max(0, sumSq / total - mean * mean);

  // 分位数：用"累计占比首次越过阈值"求，避免用 0 当哨兵（真实值可能就是 0）
  const marks = [0.01, 0.02, 0.5, 0.98, 0.99];
  const pct = [0, 0, 0, 255, 255];
  let mi = 0;
  let acc = 0;
  for (let i = 0; i < 256 && mi < marks.length; i++) {
    acc += hist[i];
    while (mi < marks.length && acc / total >= marks[mi]) {
      pct[mi] = i;
      mi++;
    }
  }

  // 细节量：缩略图上相邻像素平均亮度差
  let dSum = 0;
  let dCount = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const j = i + 4;
      const k = i + w * 4;
      const y0 = luma(px[i], px[i + 1], px[i + 2]);
      const y1 = luma(px[j], px[j + 1], px[j + 2]);
      const y2 = luma(px[k], px[k + 1], px[k + 2]);
      dSum += (Math.abs(y1 - y0) + Math.abs(y2 - y0)) / 2;
      dCount++;
    }
  }

  const n = Math.max(1, midCount);
  const rMean = rSum / n;
  const gMean = gSum / n;
  const bMean = bSum / n;

  return {
    width: original.width,
    height: original.height,
    pixels: total,
    mean,
    std: Math.sqrt(variance),
    p01: pct[0],
    p02: pct[1],
    p50: pct[2],
    p98: pct[3],
    p99: pct[4],
    detail: dCount > 0 ? dSum / dCount : 0,
    clipLow: clipLow / total,
    clipHigh: clipHigh / total,
    shadowRatio: shadow / total,
    highlightRatio: highlight / total,
    satMean: satSum / total,
    rMean,
    gMean,
    bMean,
    cast: (rMean - bMean) / 255,
    greenCast: (gMean - (rMean + bMean) / 2) / 255,
    noise: estimateNoise(original),
  };
}

/**
 * 噪点估计：在原始分辨率中心区域取 256×256，比较相邻像素亮度差并取横纵较小值。
 * 平坦区横纵差都小，边缘通常只有一个方向差大，取 min 可以把边缘排除掉。
 */
function estimateNoise(source: HTMLCanvasElement): number {
  const size = Math.min(256, source.width, source.height);
  const sx = Math.floor((source.width - size) / 2);
  const sy = Math.floor((source.height - size) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, sx, sy, size, size, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const lum = new Float32Array(size * size);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const i = y * size + x;
      const dx = Math.abs(lum[i + 1] - lum[i]);
      const dy = Math.abs(lum[i + size] - lum[i]);
      sum += Math.min(dx, dy);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function detectScene(stats: SceneStats): SceneKind {
  // 夜景要排除"大片高光的暗场"（舞台、逆光）：那种图的高光占比会超过 4%，
  // 按夜景处理会把亮部一起拉爆，按逆光处理才该压高光、抬暗部。
  if (stats.mean < 56 && stats.shadowRatio > 0.45 && stats.highlightRatio < 0.04) return 'night';
  // 大块高光 + 大块暗部：典型逆光（窗户、天空、舞台）
  if (stats.highlightRatio > 0.04 && stats.shadowRatio > 0.25 && stats.std > 30) return 'backlit';
  // 色偏要先于"低对比"判断：偏黄的室内往往也是低对比，不能被归类成 flat 而跳过白平衡
  if (stats.cast > 0.028 && stats.mean > 70) return 'warm-indoor';
  if (stats.std < 22) return stats.cast < -0.014 ? 'overcast' : 'flat';
  if (stats.std < 40 && stats.satMean < 0.17) return stats.cast < -0.014 ? 'overcast' : 'flat';
  return 'normal';
}

const DEFAULT_STAGE: Edit = DEFAULT_EDIT;

/**
 * 独立的中性校准（灰度世界假设）：偏色越大修正越多，上限 ±90。
 * 整组校色里用的是 solveNeutralTemperature（考虑拉伸放大），这里给独立按钮用。
 */
export function computeWhiteBalance(stats: SceneStats): { temperature: number; tint: number } {
  const temperature = Math.abs(stats.cast) < 0.006 ? 0 : Math.round(clamp(-stats.cast * 490, -90, 90));
  const tint = Math.abs(stats.greenCast) < 0.005 ? 0 : Math.round(clamp(-stats.greenCast * 260, -18, 18));
  return { temperature, tint };
}

/** strength: 0..1 */
export function buildRecipe(stats: SceneStats, strength: number): AutoResult {
  const s = clamp(strength, 0, 1);
  // 强度用凸映射：100% 保持满力度，60% 档落到约 45%，
  // 使 60% 的实际效果落在满档的 50–60% 附近（线性映射时实测为 75%/81%，偏强）。
  const k = Math.pow(s, 1.58);
  const scene = detectScene(stats);

  if (s === 0) {
    return {
      scene,
      label: SCENE_LABEL[scene],
      recipe: {
        exposure: 0,
        contrast: 0,
        saturation: 0,
        vibrance: 0,
        temperature: 0,
        tint: 0,
        levels: { black: 0, white: 255, gamma: 1 },
        curve: IDENTITY_CURVE,
        sharpen: 0,
        denoise: 0,
        clarity: 0,
      },
      summary: '强度为 0%，不会改动任何参数',
    };
  }

  // ---------- 曝光：中位数目标，但不超过"高光不爆"的上限；剩下的交给曲线 ----------
  const darkScene = scene === 'night' || scene === 'backlit';
  // 画面很暗且几乎没有层次（std 极小）说明是整体欠曝，可以大胆拉到中灰；
  // 有层次的暗场是"夜景"，保留氛围，目标压到 96 而不是 150。
  const underexposed = stats.std < 8;
  const targetMid = darkScene ? (underexposed ? 150 : 96) : SCENE_MID[scene];
  // 暗场但直方图极窄（p2~p98 跨度 < 40）：亮部只有少量灯光，硬拉到 236 会把整幅拉成灰白，
  // 这里改用压缩的端点，让暗部真的抬起来、亮部留在"夜晚"该有的位置上。
  const compressed = darkScene && !underexposed && stats.p98 - stats.p02 < 40;
  const spread = Math.max(6, stats.p99 - stats.p01);
  // 已经拍得完整的照片（常规场景 + 中位正常 + 1%~99% 跨度大 + 高光没爆）不需要"救"，
  // 分位拉伸给满会把整体推亮（人像 +12.6、星月夜 +17.9）。这类图只做很轻的端点归位。
  const healthy =
    scene === 'normal' &&
    stats.mean >= 85 &&
    stats.mean <= 180 &&
    spread >= 150 &&
    stats.clipHigh < 0.02;
  const yHi = darkScene && !underexposed ? (compressed ? 196 : 236) : healthy ? 231 : 247;
  const headroom = Math.log2(204 / Math.max(40, stats.p98));
  let exposure = clamp(Math.min(Math.log2(targetMid / Math.max(6, stats.p50)) * 0.9, headroom), -0.6, 2.4);
  if (darkScene && !underexposed) exposure = Math.max(exposure, -0.3);
  if (healthy) exposure = Math.min(exposure, 0.08);

  // ---------- 对比：1%~99% 跨度越窄补得越多；已经拉满或两端裁切时不加 ----------
  let contrast = clamp((112 - spread) * 0.3, 6, 22);
  if (scene === 'backlit' || scene === 'night') contrast = Math.min(contrast, 16);
  if (stats.clipHigh > 0.05) contrast = Math.min(contrast, 8);
  if (stats.clipLow > 0.05) contrast = Math.min(contrast, 10);
  if (healthy) contrast = Math.min(contrast, 8);

  // ---------- 白平衡：放到曲线之后求根 ----------
  // 强拉伸会把原本 10~20 级的色偏放大 4~5 倍，线性公式一定会矫正不足，
  // 所以直接用最终 LUT 解"红均值与蓝均值输出相等"所需的色温。
  const wbStrength = scene === 'night' ? 1 : scene === 'warm-indoor' ? 1 : scene === 'overcast' ? 0.85 : 0.7;

  // ---------- 饱和度：低饱和场景多补，正常场景只给一点点 ----------
  const satDeficit = Math.max(0, 0.34 - stats.satMean);
  let vibrance = clamp(18 + satDeficit * 180, 12, 72);
  let saturation = clamp(10 + satDeficit * 110, 8, 52);
  if (scene === 'normal') {
    vibrance *= 0.7;
    saturation *= 0.6;
  }
  // 夜景本身色饱和就高，再按低饱和公式补会变成霓虹灯
  if (scene === 'night') {
    vibrance *= 0.75;
    saturation *= 0.7;
  }
  if (stats.clipHigh > 0.05) {
    vibrance *= 0.7;
    saturation *= 0.7;
  }

  // ---------- 曲线：p02/p98 归位到安全端点，中位是否移动取决于这张图曝不曝光 ----------
  const stage: Edit = {
    ...DEFAULT_STAGE,
    exposure: Math.round(exposure * k * 100) / 100,
    contrast: Math.round(contrast * k),
    temperature: 0,
    tint: 0,
  };
  const x0 = baseToneMap(stage, stats.p02);
  const x1 = baseToneMap(stage, stats.p98);
  const xm = baseToneMap(stage, stats.p50);
  // 曝光正常时只做分位端点拉伸（中位由端点连线自然决定）；统计上偏暗时才额外把中位推到目标，
  // 否则会像"提亮"一样把整幅的中间调一起抬高。直方图完整的照片不做中位推高，避免过冲。
  const dark = stats.mean < 95 && !healthy;
  const yLo = healthy ? 20 : compressed ? 22 : darkScene ? (scene === 'backlit' ? 20 : 10) : 30;
  let curve: CurvePoint[] = IDENTITY_CURVE;
  // 曝光正常且直方图完整的照片不做分位拉伸：实测 Lange 这种"健康图"也会被端点归位推亮 +7，
  // 与"正常曝光的照片尽量不动"的预期不符，所以这里直接保持恒等曲线，只留曝光/对比的微调。
  if (!healthy && x1 - x0 >= 16 && x1 > x0) {
    const pts: Array<[number, number]> = [[0, 0]];
    if (x0 > 10) pts.push([x0, yLo]);
    // 中位锚点只在端点之间有足够空间时加入。此前用 x0+12 / x1-12 夹取，
    // 压缩夜景的跨度不足 24 时会得到反向区间，把锚点压成 (x0, x0) 的恒等点，
    // 强度稍变就吞掉整段暗部抬升，导致 60% 档比 50% 还暗。改成按 yLo/yHi 夹取。
    if (dark && x1 - x0 >= 20 && xm > x0 + 10 && xm < x1 - 10) {
      const ym = Math.round(clamp(targetMid, yLo + 4, yHi - 4));
      if (ym > yLo + 2 && ym < yHi - 2) pts.push([xm, ym]);
    }
    pts.push([x1, yHi], [255, 255]);
    curve = scaleCurve(pts, k);
  }

  let temperature = 0;
  if (wbStrength > 0 && Math.abs(stats.cast) > 0.006) {
    temperature = solveNeutralTemperature({ ...stage, curve }, stats.rMean, stats.bMean) * wbStrength;
    // 只有"色偏不是主角"的场景才压一压修正力度，避免把绘画、霓虹拉灰；
    // 夜景的蓝调本身就是色偏，压力度会让"色偏恶化"无法收敛，这里必须全量修正
    if (scene !== 'warm-indoor' && scene !== 'overcast' && scene !== 'night') {
      temperature *= clamp(1 - stats.satMean * 1.2, 0.4, 1);
    }
    temperature = Math.round(temperature);
  }
  const tint = Math.round(computeWhiteBalance(stats).tint * wbStrength);

  // ---------- 局部对比 / 细节 ----------
  // 分位跨度很窄时，拉伸倍数会把 1 级的色阶跳变放大成可见噪点，所以先按倍数补降噪
  const stretchGain = 255 / Math.max(16, stats.p98 - stats.p02);
  let clarity = scene === 'backlit' ? 30 : scene === 'night' ? 26 : scene === 'flat' || scene === 'overcast' ? 30 : 16;
  if (stats.detail < 2) clarity *= 0.8; // 近乎纯色块时少给，避免块面被抽成斑驳
  if (stats.detail > 2.5) clarity *= 0.7; // 高频纹理本来就有局部反差，再加清晰度会顶到死白
  if (stats.detail > 4) clarity *= 0.6;
  if (stretchGain > 6) clarity *= 0.5; // 已放大噪声的图，再加强局部对比只会更花
  if (healthy) clarity = Math.min(clarity, 12); // 正常曝光的照片只做轻度清晰度，避免整体再被推亮
  // 降噪只跟"放大后是否真的看得见噪点"有关：原图本来干净（如平滑渐变）就不要白白糊掉细节
  const amplified = stats.noise * Math.min(stretchGain, 24);
  let sharpen = scene === 'night' ? 12 : amplified < 6 ? 28 : amplified < 14 ? 20 : 14;
  if (stats.detail > 2.5) sharpen *= 0.7;
  if (stretchGain > 6) sharpen = 8;
  if (stats.clipHigh > 0.05) sharpen *= 0.6;
  let denoise = stats.noise > 30 ? clamp((stats.noise - 30) * 1.2, 8, 28) : 0;
  if (amplified > 10) denoise = Math.max(denoise, clamp((amplified - 8) * 3, 10, 90));
  if (scene === 'night' && denoise < 10) denoise = 10;

  const recipe: AutoRecipe = {
    exposure: Math.round(exposure * k * 100) / 100,
    contrast: Math.round(contrast * k),
    saturation: Math.round(saturation * k),
    vibrance: Math.round(vibrance * k),
    temperature: Math.round(temperature * k),
    tint: Math.round(tint * k),
    levels: { black: 0, white: 255, gamma: 1 },
    curve,
    sharpen: Math.round(sharpen * k),
    denoise: Math.round(denoise * k),
    clarity: Math.round(clarity * k),
  };

  const reasons: string[] = [];
  if (scene === 'night') reasons.push('整体偏暗，按分位提亮并抬高暗部');
  if (scene === 'backlit') reasons.push('逆光，按中位数补光并压高光');
  if (scene === 'warm-indoor') reasons.push('检测到暖色偏移，做了轻度白平衡');
  if (scene === 'overcast') reasons.push('低饱和低对比，补通透感');
  if (scene === 'flat') reasons.push('对比不足，按 1%/99% 分位拉伸');
  if (healthy) reasons.push('直方图完整、曝光正常，只做轻量端点归位');
  if (stats.clipHigh > 0.02) reasons.push('高光占比偏高，提亮与锐化都收力');
  if (stats.noise > 30) reasons.push('噪点较明显，先降噪再轻锐化');
  if (reasons.length === 0) reasons.push('画面统计正常，做轻度提升');

  return { scene, label: SCENE_LABEL[scene], recipe, summary: reasons.join('；') };
}

/** 把方案转成 Edit 补丁；只覆盖全局调色相关字段，裁剪/水印/旋转不受影响。 */
export function recipeToEdit(recipe: AutoRecipe): Partial<Edit> {
  return {
    exposure: recipe.exposure,
    contrast: recipe.contrast,
    saturation: recipe.saturation,
    vibrance: recipe.vibrance,
    temperature: recipe.temperature,
    tint: recipe.tint,
    levels: { ...recipe.levels },
    curve: recipe.curve.map((p) => ({ ...p })),
    sharpen: recipe.sharpen,
    denoise: recipe.denoise,
    clarity: recipe.clarity,
  };
}

export interface RecipeRow {
  key: string;
  label: string;
  value: string;
}

/** 面板展示用：只列真正改动的项目；传入 before 时把"改前 → 改后"一起写出来。 */
export function describeRecipe(recipe: AutoRecipe, before?: Partial<Edit> | null): RecipeRow[] {
  const rows: RecipeRow[] = [];
  const signed = (v: number, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  const from = (v: number, digits = 0) => (before ? `（原 ${signed(v, digits)}）` : '');
  if (recipe.exposure !== 0)
    rows.push({
      key: 'exposure',
      label: '曝光',
      value: `${signed(recipe.exposure, 2)} EV${from(before?.exposure ?? 0, 2)}`,
    });
  if (recipe.contrast !== 0)
    rows.push({ key: 'contrast', label: '对比度', value: `${signed(recipe.contrast)}${from(before?.contrast ?? 0)}` });
  if (recipe.saturation !== 0)
    rows.push({ key: 'saturation', label: '饱和度', value: `${signed(recipe.saturation)}${from(before?.saturation ?? 0)}` });
  if (recipe.vibrance !== 0)
    rows.push({
      key: 'vibrance',
      label: '自然饱和度',
      value: `${signed(recipe.vibrance)}${from(before?.vibrance ?? 0)}`,
    });
  if (recipe.temperature !== 0)
    rows.push({
      key: 'temperature',
      label: '色温',
      value: `${signed(recipe.temperature)}${from(before?.temperature ?? 0)}`,
    });
  if (recipe.tint !== 0)
    rows.push({ key: 'tint', label: '色调', value: `${signed(recipe.tint)}${from(before?.tint ?? 0)}` });
  if (recipe.levels.black !== 0) rows.push({ key: 'black', label: '黑场', value: `${recipe.levels.black}` });
  if (recipe.levels.white !== 255) rows.push({ key: 'white', label: '白场', value: `${recipe.levels.white}` });
  if (recipe.curve.length > 2) rows.push({ key: 'curve', label: '曲线', value: '分位拉伸' });
  if (recipe.clarity !== 0)
    rows.push({ key: 'clarity', label: '清晰度', value: `${recipe.clarity}${from(before?.clarity ?? 0)}` });
  if (recipe.sharpen !== 0)
    rows.push({ key: 'sharpen', label: '锐化', value: `${recipe.sharpen}${from(before?.sharpen ?? 0)}` });
  if (recipe.denoise !== 0)
    rows.push({ key: 'denoise', label: '降噪', value: `${recipe.denoise}${from(before?.denoise ?? 0)}` });
  return rows;
}

/**
 * 白平衡闭环校准：在缩略图上量出"处理之后"的红/蓝均值差，用一次探针估出斜率后
 * 反解还需要补多少色温。buildRecipe 只能在 LUT 空间求根，而强度很大的拉伸、
 * 饱和度/自然饱和度会把这层修正再放大一次，所以这里用真实输出做最后一步收敛。
 */
export function refineWhiteBalance(photo: Photo, edit: Edit): number {
  const measure = (temperature: number) => {
    const { canvas } = renderPhoto(photo, { ...edit, temperature }, 480);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let r = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (y < 12 || y > 243) continue;
      r += data[i];
      b += data[i + 2];
      n++;
    }
    return n ? (r - b) / n : 0;
  };

  const d0 = measure(edit.temperature);
  if (Math.abs(d0) < 1.5) return edit.temperature;
  const step = d0 > 0 ? -8 : 8;
  const d1 = measure(edit.temperature + step);
  const slope = (d1 - d0) / step;
  if (Math.abs(slope) < 0.05) return edit.temperature;
  const next = edit.temperature + Math.round(-d0 / slope);
  return Math.round(clamp(next, -100, 100));
}

/** 暗部提亮的可解释反馈：在缩略图上量"原本的暗部"被抬了多少，以及处理后死白比例。 */
export function measureFillLight(photo: Photo, edit: Edit, fill: number) {
  const inspect = (target: Edit) => {
    const { canvas } = renderPhoto(photo, target, 480);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const before = inspect(edit);
  const after = inspect({ ...edit, fillLight: fill });
  if (!before || !after) return { darkBefore: 0, darkAfter: 0, whiteAfter: 0 };
  const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let sumBefore = 0;
  let sumAfter = 0;
  let dark = 0;
  let white = 0;
  for (let i = 0; i < before.length; i += 4) {
    const y0 = luma(before, i);
    // 固定用"处理前就是暗部"的像素做统计，否则抬亮后会大量像素离开暗部，数字看起来像没变化
    if (y0 < 64) {
      sumBefore += y0;
      sumAfter += luma(after, i);
      dark++;
    }
    if (luma(after, i) >= 253) white++;
  }
  return {
    darkBefore: dark ? sumBefore / dark : 0,
    darkAfter: dark ? sumAfter / dark : 0,
    whiteAfter: (white / (before.length / 4)) * 100,
  };
}

/** 亮部压制的可解释反馈：亮部均值降了多少、暗部是否保持不动。 */
export function measureDarken(photo: Photo, edit: Edit, darken: number) {
  const inspect = (target: Edit) => {
    const { canvas } = renderPhoto(photo, target, 480);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const before = inspect(edit);
  const after = inspect({ ...edit, darken });
  if (!before || !after) return { highBefore: 0, highAfter: 0, darkDelta: 0 };
  const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let highSum0 = 0;
  let highSum1 = 0;
  let high = 0;
  let darkSum0 = 0;
  let darkSum1 = 0;
  let dark = 0;
  for (let i = 0; i < before.length; i += 4) {
    const y0 = luma(before, i);
    // 固定源选区：亮部按处理前 >160 统计，暗部按处理前 <64 统计，避免选区随结果漂移
    if (y0 > 160) {
      highSum0 += y0;
      highSum1 += luma(after, i);
      high++;
    } else if (y0 < 64) {
      darkSum0 += y0;
      darkSum1 += luma(after, i);
      dark++;
    }
  }
  return {
    highBefore: high ? highSum0 / high : 0,
    highAfter: high ? highSum1 / high : 0,
    darkDelta: dark ? darkSum1 / dark - darkSum0 / dark : 0,
  };
}

export interface ExposurePlan {
  /** 当前画面的中位亮度（0..255，按渲染后的预览统计） */
  median: number;
  /** 当前画面的 98% 分位亮度，用于高光保护 */
  p98: number;
  /** 目标中位亮度 */
  target: number;
  /** 本次点击建议写入的曝光值（EV） */
  next: number;
  /** 距离目标还差多少 EV，正数表示还要提亮 */
  delta: number;
  atTarget: boolean;
  /** 达到 ±2 EV 或高光保护上限，无法继续朝目标推进 */
  blocked: boolean;
  reason: string;
}

/** 各场景的曝光归位目标（中位亮度）：夜景保留氛围，逆光/低对比拉向中灰。 */
const EXPOSURE_TARGET: Record<SceneKind, number> = {
  normal: 120,
  flat: 145,
  overcast: 142,
  backlit: 148,
  'warm-indoor': 132,
  night: 96,
};

/** 单次点击最多推进的曝光量：连点可以逐步逼近，又不会一下把画面推过头。 */
const EXPOSURE_STEP = 0.5;

/**
 * 自动曝光：只做"曝光归位"，不改对比/饱和/曲线。
 * 统计的是"当前编辑渲染之后"的中位亮度，所以连点会逐步逼近目标；
 * 高光侧按 p98 留出余量，接近死白时停手并明确提示，而不是继续硬拉。
 */
export function planAutoExposure(photo: Photo, edit: Edit): ExposurePlan {
  const { canvas } = renderPhoto(photo, edit, 480);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const target = EXPOSURE_TARGET[detectScene(statsFor(photo))];
  if (!ctx) return { median: target, p98: target, target, next: edit.exposure, delta: 0, atTarget: true, blocked: false, reason: '' };

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = new Uint32Array(256);
  const total = canvas.width * canvas.height;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    hist[y < 0 ? 0 : y > 255 ? 255 : Math.round(y)]++;
  }
  const percentile = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc / total >= q) return i;
    }
    return 255;
  };
  const median = percentile(0.5);
  const p98 = percentile(0.98);

  const need = Math.log2(target / Math.max(4, median));
  // 高光保护：p98 已经接近 255 时不再继续提亮
  const headroom = Math.log2(246 / Math.max(8, p98));
  const limit = need > 0 ? Math.max(0, headroom) : -1.5;
  const clamped = need > 0 ? Math.min(need, limit) : Math.max(need, limit);
  // 是否"真的到位"要看画面离目标还差多少，不能看被高光保护截断后的步长
  const atTarget = Math.abs(need) < 0.15;
  const step = clamp(clamped, -EXPOSURE_STEP, EXPOSURE_STEP);
  // 与调色面板滑杆的 0.05 EV 步长对齐，避免提示值与滑杆显示值不一致
  const next = Number((Math.round(clamp(edit.exposure + step, -2, 2) / 0.05) * 0.05).toFixed(2));
  const blocked = !atTarget && Math.abs(next - edit.exposure) < 0.02;
  const reason = blocked
    ? next >= 2
      ? '曝光已到 +2 EV 上限'
      : next <= -2
        ? '曝光已到 -2 EV 下限'
        : `高光已接近上限（98% 分位 ${p98}），再提亮会大面积死白`
    : '';

  return { median, p98, target, next, delta: clamped, atTarget, blocked, reason };
}

/** 一句话反馈：用于应用后的 toast，说明改了哪些参数、幅度多少。 */
export function describeRecipeText(recipe: AutoRecipe): string {
  return describeRecipe(recipe)
    .map((r) => `${r.label} ${r.value}`)
    .join('、');
}

const cache = new Map<string, SceneStats>();

/** 统计缓存条目数（开发态诊断用）。 */
export function statsCacheSize() {
  return cache.size;
}

/** 移除图片时丢掉它的统计结果，长会话里删图不再留下残留。 */
export function dropStats(photoId: string) {
  cache.delete(photoId);
}

/** 同一张图只统计一次；原图不会被修改，所以缓存是安全的。 */
export function statsFor(photo: Photo): SceneStats {
  const hit = cache.get(photo.id);
  if (hit) return hit;
  const stats = computeStats(photo);
  cache.set(photo.id, stats);
  return stats;
}
