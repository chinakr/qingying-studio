import brand from '../../brand.json';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PresetId =
  | 'none'
  | 'warm'
  | 'peach'
  | 'cream'
  | 'coolwhite'
  | 'cool'
  | 'clear'
  | 'green'
  | 'sunset'
  | 'film'
  | 'fuji'
  | 'kodak'
  | 'fade'
  | 'mono'
  | 'punch'
  | 'silver'
  | 'sepia';

export type PresetCategory = 'portrait' | 'landscape' | 'film' | 'mono';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export type FontFamily = 'sans' | 'song' | 'kai' | 'mono';

export type TextAlign = 'left' | 'center' | 'right';

export interface CurvePoint {
  x: number;
  y: number;
}

export interface Levels {
  black: number; // 0..254
  white: number; // 1..255
  gamma: number; // 0.2..3
}

export type WatermarkPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface Watermark {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  size: number; // 字号占比，1..20，相对图片短边
  opacity: number; // 0..100
  color: string;
  rotation: number; // -90..90
  tile: boolean;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
}

/** 图片水印：叠在文字水印下方，支持四种混合模式。 */
export interface ImageMark {
  enabled: boolean;
  src: string | null; // data URL；为空表示还没选图
  position: WatermarkPosition;
  scale: number; // 宽度占短边百分比，5..100
  opacity: number; // 0..100
  blend: BlendMode;
}

export interface Edit {
  exposure: number; // 曝光，单位 EV，-2 .. 2
  contrast: number; // 对比度，-100 .. 100
  fillLight: number; // 暗部提亮 0..100（只抬暗部，高光按像素增益上限保护）
  darken: number; // 亮部压制 0..100（只在亮部选区做乘性衰减，暗位不动）
  blur: number; // 柔化 0..100（可分离盒式模糊，默认档只做轻度柔化）
  saturation: number; // 饱和度，-100 .. 100
  vibrance: number; // 自然饱和度，-100 .. 100（优先影响低饱和像素）
  temperature: number; // 色温，-100 .. 100（正=暖）
  tint: number; // 色调，-100 .. 100（正=绿，负=洋红）
  preset: PresetId;
  presetStrength: number; // 滤镜强度 0..100，0 等同原图
  levels: Levels;
  curve: CurvePoint[];
  sharpen: number; // 锐化强度 0..100
  denoise: number; // 降噪强度 0..100
  clarity: number; // 局部对比（大半径反锐化）0..100
  straighten: number; // 微调角度，-15..15（度）
  border: Border;
  local: LocalMask;
  watermark: Watermark;
  imageMark: ImageMark;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  crop: CropRect | null;
}

export interface Border {
  width: number; // 边框占短边百分比，0..10
  color: string;
}

export interface LocalMask {
  enabled: boolean;
  cx: number; // 中心 0..1
  cy: number;
  radius: number; // 半径占短边百分比 0.05..0.6
  feather: number; // 羽化 0..1
  exposure: number; // -2..2 EV
  saturation: number; // -100..100
}

export interface Photo {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  original: HTMLCanvasElement;
  thumb: string;
  /** 原始 JPEG 的 APP1(Exif) 段，导出时按需回填；非 JPEG 为 null。 */
  exif: Uint8Array | null;
}

export const DEFAULT_LEVELS: Levels = { black: 0, white: 255, gamma: 1 };
export const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

export const DEFAULT_WATERMARK: Watermark = {
  enabled: false,
  text: brand.watermarkText,
  position: 'br',
  size: 4,
  opacity: 55,
  color: '#ffffff',
  rotation: 0,
  tile: false,
  fontFamily: 'sans',
  bold: true,
  italic: false,
  align: 'center',
};

export const DEFAULT_IMAGE_MARK: ImageMark = {
  enabled: false,
  src: null,
  position: 'br',
  scale: 22,
  opacity: 80,
  blend: 'normal',
};

export const DEFAULT_BORDER: Border = { width: 0, color: '#ffffff' };

export const DEFAULT_LOCAL: LocalMask = {
  enabled: false,
  cx: 0.5,
  cy: 0.5,
  radius: 0.3,
  feather: 0.6,
  exposure: 0.5,
  saturation: 0,
};

export const DEFAULT_EDIT: Edit = {
  exposure: 0,
  contrast: 0,
  fillLight: 0,
  darken: 0,
  blur: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  preset: 'none',
  presetStrength: 100,
  levels: DEFAULT_LEVELS,
  curve: DEFAULT_CURVE,
  sharpen: 0,
  denoise: 0,
  clarity: 0,
  straighten: 0,
  border: DEFAULT_BORDER,
  local: DEFAULT_LOCAL,
  watermark: DEFAULT_WATERMARK,
  imageMark: DEFAULT_IMAGE_MARK,
  rotation: 0,
  flipH: false,
  crop: null,
};

export interface PresetInfo {
  id: PresetId;
  name: string;
  hint: string;
  category: PresetCategory | null;
}

/** 17 张卡片 = 直出 + 4 类 × 4 个风格；全部由参数组合生成，不加载外部素材。 */
export const PRESETS: PresetInfo[] = [
  { id: 'none', name: '直出', hint: '不做风格化处理', category: null },
  { id: 'warm', name: '暖砂', hint: '暖肤色、轻提亮，适合人像与夕阳', category: 'portrait' },
  { id: 'peach', name: '桃绒', hint: '柔暖肤色，压低高光锐度', category: 'portrait' },
  { id: 'cream', name: '奶霜', hint: '低对比、柔高光，日系人像', category: 'portrait' },
  { id: 'coolwhite', name: '霜白', hint: '干净冷调，适合室内与通勤人像', category: 'portrait' },
  { id: 'cool', name: '夜巡', hint: '偏冷，适合夜景与城市', category: 'landscape' },
  { id: 'clear', name: '澄空', hint: '提对比与蓝绿，适合天空与建筑', category: 'landscape' },
  { id: 'green', name: '青岚', hint: '青绿阴影，适合山林与草地', category: 'landscape' },
  { id: 'sunset', name: '暮金', hint: '暖高光、橙红调，适合晚霞', category: 'landscape' },
  { id: 'film', name: '旧卷', hint: '抬阴影、轻微减饱和', category: 'film' },
  { id: 'fuji', name: '青丘', hint: '青绿阴影、通透高光', category: 'film' },
  { id: 'kodak', name: '暖野', hint: '暖红肤色、饱满中间调', category: 'film' },
  { id: 'fade', name: '旧梦', hint: '低对比、抬黑位，旧照片质感', category: 'film' },
  { id: 'mono', name: '灰阶', hint: '去色并轻微提对比', category: 'mono' },
  { id: 'punch', name: '硬调', hint: '强对比黑白，适合纪实与建筑', category: 'mono' },
  { id: 'silver', name: '银粒', hint: '抬黑位、柔高光的银盐灰', category: 'mono' },
  { id: 'sepia', name: '灰褐', hint: '低饱和棕灰，复古肖像', category: 'mono' },
];

export const PRESET_GROUPS: { id: PresetCategory; name: string }[] = [
  { id: 'portrait', name: '人像' },
  { id: 'landscape', name: '风光' },
  { id: 'film', name: '胶片' },
  { id: 'mono', name: '灰阶' },
];

/** 预设只由参数组合描述，不引入任何外部素材或第三方预设文件。 */
const PRESET_SPEC: Record<
  PresetId,
  { satMul: number; exposure: number; contrast: number; tint: [number, number, number]; lift: number }
> = {
  none: { satMul: 1, exposure: 0, contrast: 0, tint: [0, 0, 0], lift: 0 },
  warm: { satMul: 1.05, exposure: 0.05, contrast: 6, tint: [14, 5, -12], lift: 4 },
  peach: { satMul: 1.02, exposure: 0.06, contrast: 2, tint: [12, 4, -8], lift: 6 },
  cream: { satMul: 0.92, exposure: 0.08, contrast: -8, tint: [8, 4, -6], lift: 10 },
  coolwhite: { satMul: 0.96, exposure: 0.05, contrast: 4, tint: [-6, 0, 6], lift: 4 },
  cool: { satMul: 1.02, exposure: 0, contrast: 8, tint: [-12, -2, 16], lift: 0 },
  clear: { satMul: 1.12, exposure: 0.04, contrast: 18, tint: [-4, 0, 6], lift: 0 },
  green: { satMul: 1.06, exposure: 0, contrast: 10, tint: [-6, 8, -2], lift: 4 },
  sunset: { satMul: 1.1, exposure: 0.05, contrast: 10, tint: [18, 6, -14], lift: 3 },
  film: { satMul: 0.85, exposure: 0.04, contrast: 10, tint: [6, 4, -4], lift: 12 },
  fuji: { satMul: 0.9, exposure: 0.03, contrast: 6, tint: [-2, 6, 4], lift: 8 },
  kodak: { satMul: 1.05, exposure: 0.04, contrast: 8, tint: [10, 2, -8], lift: 6 },
  fade: { satMul: 0.7, exposure: 0.02, contrast: -10, tint: [8, 6, -4], lift: 22 },
  mono: { satMul: 0, exposure: 0, contrast: 12, tint: [0, 0, 0], lift: 0 },
  punch: { satMul: 0, exposure: 0, contrast: 28, tint: [0, 0, 0], lift: 0 },
  silver: { satMul: 0, exposure: 0.02, contrast: 6, tint: [0, 0, 0], lift: 16 },
  sepia: { satMul: 0.25, exposure: 0.02, contrast: -4, tint: [16, 8, -10], lift: 10 },
};

/** 滤镜强度 0..100 映射为 0..1；0 时预设不产生任何改动。 */
function presetAmount(edit: Edit) {
  return Math.max(0, Math.min(1, edit.presetStrength / 100));
}

function clampByte(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 4×4 Bayer 矩阵（0..15），用于打散强拉伸后的色阶台阶。 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 查找表下标必须是整数：小数下标会读到 undefined，写回即变 0。 */
function toIndex(v: number) {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** 单调三次插值，保证曲线不会出现反转过冲。 */
export function curveLut(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-6, pts[i + 1].x - pts[i].x);
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const tangent = new Array<number>(n).fill(0);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }

  for (let x = 0; x < 256; x++) {
    if (x <= pts[0].x) {
      lut[x] = pts[0].y;
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[x] = pts[n - 1].y;
      continue;
    }
    let i = 0;
    while (i < n - 2 && x > pts[i + 1].x) i++;
    const h = dx[i];
    const t = (x - pts[i].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const value =
      (2 * t3 - 3 * t2 + 1) * pts[i].y +
      (t3 - 2 * t2 + t) * h * tangent[i] +
      (-2 * t3 + 3 * t2) * pts[i + 1].y +
      (t3 - t2) * h * tangent[i + 1];
    lut[x] = clampByte(value);
  }
  return lut;
}

function levelsLut(levels: Levels): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const black = Math.min(254, levels.black);
  const white = Math.max(black + 1, levels.white);
  const invGamma = 1 / Math.max(0.2, levels.gamma);
  for (let i = 0; i < 256; i++) {
    const v = Math.min(1, Math.max(0, (i - black) / (white - black)));
    lut[i] = clampByte(Math.pow(v, invGamma) * 255);
  }
  return lut;
}

export function isCurveNeutral(points: CurvePoint[]) {
  return (
    points.length === 2 &&
    points[0].x === 0 &&
    points[0].y === 0 &&
    points[1].x === 255 &&
    points[1].y === 255
  );
}

export function isLevelsNeutral(levels: Levels) {
  return levels.black === 0 && levels.white === 255 && levels.gamma === 1;
}

/**
 * 高光肩部 / 暗部趾部：对比度是线性斜率，遇到已经接近 255 的像素会直接切成死白。
 * 这里在 0.75 以上做指数压缩、0.04 以下轻微抬升，两端都保持 C1 连续，避免硬裁剪。
 */
const SHOULDER_KNEE = 0.75;
const TOE_KNEE = 0.04;

function softClip(v: number) {
  if (v <= 0) return 0;
  if (v < TOE_KNEE) return TOE_KNEE * Math.pow(v / TOE_KNEE, 0.7);
  if (v <= SHOULDER_KNEE) return v;
  return SHOULDER_KNEE + (1 - SHOULDER_KNEE) * (1 - Math.exp(-(v - SHOULDER_KNEE) / (1 - SHOULDER_KNEE)));
}

/**
 * 对比度 S 曲线：用 |2x-1|^p（p=1/c）在 0/1 两端固定的幂曲线做对比。
 * 旧的线性斜率 `(x-0.5)*c+0.5` 在 c=2 时把 0.25 以下的输入全部压到 0
 * （实测逆光图 54.6% 像素被压成死黑），并在 0.75 以上靠肩部硬压。
 * 幂曲线端点恒为 0/1、单调，且越靠近端点斜率越小，天然带暗部趾部与高光肩部。
 */
function contrastMap(x: number, c: number) {
  if (Math.abs(c - 1) < 1e-6) return x;
  const u = 2 * x - 1;
  const p = 1 / c;
  const sign = u < 0 ? -1 : 1;
  return 0.5 + 0.5 * sign * Math.pow(Math.abs(u), p);
}

/** 供 auto.ts 预判"当前基础调色会把某个输入值映射到哪"，保证曲线控制点落在正确的横坐标上。 */
export function baseToneMap(edit: Edit, value: number) {
  const spec = PRESET_SPEC[edit.preset];
  const k = presetAmount(edit);
  const exposure = Math.pow(2, edit.exposure + spec.exposure * k);
  const contrast = 1 + (edit.contrast + spec.contrast * k) / 100;
  const base = (value / 255) * exposure;
  const lifted = base + ((spec.lift * k) / 255) * (1 - base);
  const contrasty = contrastMap(lifted, contrast);
  return Math.round(softClip(contrasty) * 255);
}

/**
 * 把编辑参数编译成三条 256 长度的通道查找表，逐像素只做查表和饱和度混合。
 * 顺序：基础调色（含高光肩部）→ 色阶 → 曲线，预览与导出共用同一套计算。
 */
function buildLuts(edit: Edit) {
  const spec = PRESET_SPEC[edit.preset];
  const k = presetAmount(edit);
  const exposure = Math.pow(2, edit.exposure + spec.exposure * k);
  const contrast = 1 + (edit.contrast + spec.contrast * k) / 100;
  const temp = edit.temperature / 100;
  const tintR = spec.tint[0] * k + temp * 26;
  const tintB = spec.tint[2] * k - temp * 26;
  const tintG = spec.tint[1] * k + (edit.tint / 100) * 26;

  const levels = levelsLut(edit.levels);
  const curve = curveLut(edit.curve);

  const luts: [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] = [
    new Uint8ClampedArray(256),
    new Uint8ClampedArray(256),
    new Uint8ClampedArray(256),
  ];

  for (let i = 0; i < 256; i++) {
    const base = (i / 255) * exposure;
    const lifted = base + ((spec.lift * k) / 255) * (1 - base);
    const contrasty = contrastMap(lifted, contrast);
    const v = clampByte(softClip(contrasty) * 255);
    luts[0][i] = curve[toIndex(levels[toIndex(v + tintR)])];
    luts[1][i] = curve[toIndex(levels[toIndex(v + tintG)])];
    luts[2][i] = curve[toIndex(levels[toIndex(v + tintB)])];
  }

  // 抖动幅度：分位拉伸把 1 级输入放大成 slope 级输出，台阶边界靠 ±slope/2 的抖动打散成细噪声，
  // 比"整图模糊"便宜得多，也不会糊掉细节。已经要求强降噪的画面要收敛，否则等于把降噪白做。
  const dither = new Float32Array(256);
  const damp = edit.denoise > 0 ? Math.max(0.25, 1 - edit.denoise / 120) : 1;
  for (let i = 0; i < 255; i++) {
    const slope = Math.max(luts[1][i + 1] - luts[1][i], 0);
    dither[i] = slope >= 3 ? Math.min(3, slope * 0.45) * damp : 0;
  }

  return { luts, satMul: (1 + (spec.satMul - 1) * k) * (1 + edit.saturation / 100), dither };
}

/**
 * 灰度世界白平衡求解：找一条色温值，使"中间调的红均值"与"蓝均值"经过整条管线
 * （曝光/对比/色阶/曲线）之后落到同一个输出值。
 * 直接套线性公式会低估——强拉伸会把色偏一起放大 4~5 倍，所以这里用真实 LUT 求根。
 */
export function solveNeutralTemperature(edit: Edit, rMean: number, bMean: number) {
  const diffAt = (t: number) => {
    const { luts } = buildLuts({ ...edit, temperature: t });
    return luts[0][Math.round(clampByte(rMean))] - luts[2][Math.round(clampByte(bMean))];
  };
  const f0 = diffAt(0);
  if (Math.abs(f0) < 1) return 0;
  const f1 = diffAt(20);
  const slope = f1 - f0;
  if (Math.abs(slope) < 1e-3) return 0;
  return Math.round(Math.max(-100, Math.min(100, (-f0 / slope) * 20)));
}

export function isNeutral(edit: Edit) {
  return (
    edit.exposure === 0 &&
    edit.contrast === 0 &&
    edit.saturation === 0 &&
    edit.vibrance === 0 &&
    edit.temperature === 0 &&
    edit.tint === 0 &&
    (edit.preset === 'none' || edit.presetStrength === 0) &&
    isLevelsNeutral(edit.levels) &&
    isCurveNeutral(edit.curve)
  );
}

/** 就地处理 ImageData，返回是否发生了改动。 */
export function applyAdjustments(data: ImageData, edit: Edit) {
  if (isNeutral(edit)) return false;
  const { luts, satMul, dither } = buildLuts(edit);
  const [lr, lg, lb] = luts;
  const px = data.data;
  const vib = edit.vibrance / 100;
  let ditherOn = false;
  for (let k = 0; k < 256; k++) {
    if (dither[k] > 0) {
      ditherOn = true;
      break;
    }
  }
  const width = data.width;
  let x = 0;
  let y = 0;

  for (let i = 0; i < px.length; i += 4) {
    let r = lr[px[i]];
    let g = lg[px[i + 1]];
    let b = lb[px[i + 2]];

    if (ditherOn) {
      // 4×4 Bayer 有序抖动，均值为 0，只作用在亮度上（三通道同加），不会产生彩色噪点
      const amp = dither[px[i + 1]];
      if (amp > 0) {
        const d = ((BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5) * amp;
        r += d;
        g += d;
        b += d;
      }
    }
    if (++x === width) {
      x = 0;
      y++;
    }

    if (satMul !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = clampByte(luma + (r - luma) * satMul);
      g = clampByte(luma + (g - luma) * satMul);
      b = clampByte(luma + (b - luma) * satMul);
    }

    if (vib !== 0) {
      // 自然饱和度：越灰的像素给得越多；肤色与天空额外收力，避免塑料感
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      const sat = max <= 0 ? 0 : (max - min) / max;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let amount = vib * (1 - sat) * 0.9;
      if (r > g && g > b && r - b > 18 && luma > 60 && luma < 235) {
        amount *= 0.35; // 肤色保护
      } else if (b > r + 10 && b > g && luma > 80) {
        amount *= 0.5; // 天空保护
      }
      if (amount !== 0) {
        const m = 1 + amount;
        r = clampByte(luma + (r - luma) * m);
        g = clampByte(luma + (g - luma) * m);
        b = clampByte(luma + (b - luma) * m);
      }
    }

    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }

  return true;
}

/**
 * 降噪：3×3 双边加权。
 * 旧实现是"差异不超过阈值就平均"的硬门限，强度 100 时阈值 48，
 * 强边（梯度 30~60）也会被算进平均，实测强边梯度只剩 8–20%，细节被整片抹平。
 * 改成按亮度差做高斯权重的双边滤波：差 10 的噪声邻居权重约 0.6，
 * 差 60 的边缘权重接近 0，压噪同时保边。权重表预计算，热循环里只查表。
 */
function denoisePixels(data: ImageData, strength: number, orthoOnly = false) {
  const { width, height } = data;
  const px = data.data;
  const src = new Uint8ClampedArray(px);
  const sigma = 3 + (strength / 100) * 19;
  const inv = 1 / (2 * sigma * sigma);
  const wTab = new Float32Array(256);
  for (let d = 0; d < 256; d++) wTab[d] = Math.exp(-d * d * inv);
  // 3×3 空间权重：中心 1，轴向 exp(-1/4)，对角 exp(-2/4)
  const spatial = [0.779, 0.882, 0.779, 0.882, 1, 0.882, 0.779, 0.882, 0.779];
  // 亮度平面先算一遍：热循环里 9 个邻居直接查表，省掉每次 3 乘法和函数调用
  const lum = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = (77 * src[i] + 151 * src[i + 1] + 28 * src[i + 2]) >> 8;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const hasUp = y > 0;
    const hasDown = y < height - 1;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const lc = lum[row + x];
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        if (dy === -1 && !hasUp) continue;
        if (dy === 1 && !hasDown) continue;
        const nrow = row + dy * width;
        const k = (dy + 1) * 3;
        const xStart = orthoOnly || x === 0 ? 0 : -1;
        const xEnd = orthoOnly || x === width - 1 ? 0 : 1;
        for (let dx = xStart; dx <= xEnd; dx++) {
          const p = nrow + x + dx;
          const diff = lum[p] - lc;
          const j = p * 4;
          const w = spatial[k + dx + 1] * wTab[diff < 0 ? -diff : diff];
          r += src[j] * w;
          g += src[j + 1] * w;
          b += src[j + 2] * w;
          wsum += w;
        }
      }
      if (wsum > 0) {
        px[i] = r / wsum;
        px[i + 1] = g / wsum;
        px[i + 2] = b / wsum;
      }
    }
  }
}

/** 锐化：3×3 高斯模糊做反锐化掩模，逐通道做，不引入外圈溢出。 */
function sharpenPixels(data: ImageData, strength: number) {
  const { width, height } = data;
  const px = data.data;
  const src = new Uint8ClampedArray(px);
  const tmp = new Uint8ClampedArray(px.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const l = (row + Math.max(0, x - 1)) * 4;
      const r = (row + Math.min(width - 1, x + 1)) * 4;
      for (let c = 0; c < 3; c++) tmp[i + c] = (src[l + c] + 2 * src[i + c] + src[r + c]) / 4;
    }
  }

  const amount = (strength / 100) * 1.2;
  // 过冲软限幅：3×3 USM 在硬边上单侧可冲出 40~60 级（实测 40→4 / 200→252），
  // 形成明显的黑边白边。这里把 |增量| 软饱和到 24 级：平坦纹理仍近似线性（不影响细节增益），
  // 只有真硬边的过冲被封住。查表换算沿用 SOFT_CURVE（1-e^-x，x 以 1/256 步长）。
  const LIMIT = 24;
  const idxScale = 256 / LIMIT;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const up = Math.max(0, y - 1) * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const u = (up + x) * 4;
      const d = (down + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (tmp[u + c] + 2 * tmp[i + c] + tmp[d + c]) / 4;
        const delta = amount * (src[i + c] - blur);
        const ad = delta > 0 ? delta : -delta;
        const add = (delta > 0 ? 1 : -1) * LIMIT * SOFT_CURVE[Math.min(4096, (ad * idxScale) | 0)];
        px[i + c] = knee(src[i + c] + add);
      }
    }
  }
}

/** 软膝用的 1-e^-x 查表：x 以 1/256 为步长覆盖 0..16，避免每像素调 Math.exp。 */
const SOFT_CURVE = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) SOFT_CURVE[i] = 1 - Math.exp(-i / 256);

/** 高光/暗部软膝：锐化的过冲在端点处逐渐收力，避免边缘处顶出一圈死白/死黑。 */
function knee(v: number) {
  const HI = 250;
  const LO = 6;
  if (v > HI) return HI + 2 * SOFT_CURVE[Math.min(4096, ((v - HI) * 64) | 0)];
  if (v < LO) return LO - 2 * SOFT_CURVE[Math.min(4096, ((LO - v) * 64) | 0)];
  return v;
}

/** 降噪与锐化都是空间卷积，与逐点 LUT 分开处理。 */
export function hasSpatial(edit: Edit) {
  return edit.denoise > 0 || edit.sharpen > 0 || edit.clarity > 0 || edit.blur > 0;
}

/**
 * 清晰度：大半径反锐化。先把亮度降到 1/8 分辨率做盒式模糊得到低频层，
 * 再双线性放大回来与原图相减，只把差值加回 RGB，色相不变。
 * 大半径决定了它增强的是"块面感"而不是边缘毛刺，因此能明显抬高全局反差。
 */
function clarityPixels(data: ImageData, strength: number) {
  const { width, height, data: px } = data;
  const factor = 8;
  const lw = Math.max(2, Math.ceil(width / factor));
  const lh = Math.max(2, Math.ceil(height / factor));
  const low = new Float32Array(lw * lh);

  // 横向采样位置只跟画布宽度有关，先算成查表，内层循环不再做浮点除法
  const lxMap = new Int32Array(width);
  for (let x = 0; x < width; x++) lxMap[x] = Math.min(lw - 1, (x / width) * lw) | 0;
  for (let y = 0; y < height; y++) {
    const lyBase = (Math.min(lh - 1, (y / height) * lh) | 0) * lw;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      low[lyBase + lxMap[x]] += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    }
  }
  // 降采样均值（按每格实际覆盖的像素数归一）
  const sx = width / lw;
  const sy = height / lh;
  const norm = sx * sy;
  for (let i = 0; i < low.length; i++) low[i] /= norm;

  // 低频层盒式模糊，半径随画面尺寸缩放，保证不同分辨率观感一致
  const radius = Math.max(2, Math.round(Math.min(lw, lh) * 0.12));
  const tmp = new Float32Array(low.length);
  const blurred = new Float32Array(low.length);
  for (let y = 0; y < lh; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += low[y * lw + Math.min(lw - 1, Math.max(0, x))];
    for (let x = 0; x < lw; x++) {
      tmp[y * lw + x] = acc / (radius * 2 + 1);
      acc += low[y * lw + Math.min(lw - 1, x + radius + 1)] - low[y * lw + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < lw; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(lh - 1, Math.max(0, y)) * lw + x];
    for (let y = 0; y < lh; y++) {
      blurred[y * lw + x] = acc / (radius * 2 + 1);
      acc += tmp[Math.min(lh - 1, y + radius + 1) * lw + x] - tmp[Math.max(0, y - radius) * lw + x];
    }
  }

  // 预先把 x/y 方向的采样位置算成查找表，内层循环只剩查表和乘加（整图 2M 像素很在意这点开销）
  const x0s = new Int32Array(width);
  const x1s = new Int32Array(width);
  const txs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = (x / width) * lw - 0.5;
    const x0 = Math.max(0, Math.floor(fx));
    x0s[x] = x0;
    x1s[x] = Math.min(lw - 1, x0 + 1);
    txs[x] = Math.min(1, Math.max(0, fx - x0));
  }

  const amount = (strength / 100) * 0.9;
  // 光晕上限：局部对比单像素最多加减 LIMIT 级。旧实现按"到端点还剩多少空间"给量，
  // 强边两侧能各顶 30~40 级，形成明显白边/黑边（实测 edge2 亮侧 +37.5、Lange 暗侧 +26.4）。
  // 这里改成固定上限的软饱和：|delta| 小时近似线性，大时收敛到 LIMIT，既有块面感又不halo。
  const LIMIT = 10;
  const HI_CAP = 250;
  const LO_CAP = 4;
  for (let y = 0; y < height; y++) {
    const fy = (y / height) * lh - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(lh - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, fy - y0));
    const row0 = y0 * lw;
    const row1 = y1 * lw;
    const it = 1 - ty;
    for (let x = 0; x < width; x++) {
      const x0 = x0s[x];
      const x1 = x1s[x];
      const tx = txs[x];
      const l00 = blurred[row0 + x0];
      const l10 = blurred[row0 + x1];
      const l01 = blurred[row1 + x0];
      const l11 = blurred[row1 + x1];
      const lowv = (l00 * (1 - tx) + l10 * tx) * it + (l01 * (1 - tx) + l11 * tx) * ty;
      const i = (y * width + x) * 4;
      const y3 = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const delta = (y3 - lowv) * amount;
      if (delta === 0) continue;
      // 离端点太近就完全不动：RGB 各通道不同步，哪怕只减 1~2 级也可能把某个通道压到 0，
      // 让整块阴影变成纯黑（实测 Lange 100% 会新增 0.58% 死黑）。同理高光侧留 245 的余量。
      if (delta < 0 ? y3 < LO_CAP + 4 : y3 > HI_CAP - 5) continue;
      // 软饱和到 ±LIMIT，再受端点余量约束（最亮/最暗处不再继续顶，避免成片死白/死黑）。
      // 指数查 SOFT_CURVE（1-e^-x，步长 1/256），省掉每像素一次 Math.exp。
      const d = delta > 0 ? delta : -delta;
      const add = (delta > 0 ? 1 : -1) * LIMIT * SOFT_CURVE[Math.min(4096, (d * (256 / LIMIT)) | 0)];
      const room = delta > 0 ? HI_CAP - y3 : y3 - LO_CAP;
      if (room <= 0 || add === 0) continue;
      // 注意 room 是正数：必须按 |add| 与 room 比较，否则负向会一路减到 0（纯黑）
      const a = add > room ? room : add < -room ? -room : add;
      px[i] = clampByte(px[i] + a);
      px[i + 1] = clampByte(px[i + 1] + a);
      px[i + 2] = clampByte(px[i + 2] + a);
    }
  }
}

/** 降噪放在调色之前：在原始数据上噪声幅度才有意义，拉伸后再判阈值会把噪点当边缘跳过。 */
export function applyDenoise(data: ImageData, edit: Edit) {
  const s = edit.denoise;
  if (s <= 0) return;
  denoisePixels(data, s);
  // 强度过半再补一遍：双边滤波按亮度差加权，重复迭代主要压残余噪声，强边权重接近 0 不会被抹平。
  // 第二遍只走四邻域（约六成开销），斜向噪声已基本被第一遍压掉，实测噪声 σ 再降 0.6 级、边缘不变。
  if (s >= 55) denoisePixels(data, s * 0.72, true);
}

/**
 * 暗部提亮参数：亮度掩膜 + 亮度域 Screen 叠加，按本项目验收阈值收敛量级。
 * - 掩膜由亮度线性 ramp 生成（48 以下全量、48..255 渐弱），再经 /2 衰减，
 *   让高光保留约一半力度；
 * - 满档系数取 145（不是 255）：实测 255 会把正常人像抬 +42，145 约 0.57 倍，
 *   夜景深黑只到 21、人像 +24，仍明显强于纯增益实现。
 */
const FILL_LOW = 48;
const FILL_K = 145;

/** 亮度用 77/151/28 的整数近似，与 0.299/0.587/0.114 同源。 */
function fillMaskTable() {
  const t = new Float32Array(256);
  const range = 255 - FILL_LOW;
  for (let i = 0; i < 256; i++) {
    const ramp = i < FILL_LOW ? 0 : Math.min(255, ((i - FILL_LOW) * 255) / range);
    // 掩膜在 0..128 之间，高光保留一半力度；再叠一道高光软膝：
    // 200 以上线性收力、255 处归零，避免接近死白的像素被推过 255
    // （无此保护时灰阶图死白会 +0.28pp）。
    const guard = i <= 200 ? 1 : Math.max(0, 1 - (i - 200) / 55);
    t[i] = (255 - Math.floor(ramp / 2)) * guard * guard;
  }
  return t;
}
const FILL_T = fillMaskTable();

/**
 * 暗部提亮：亮度域 Screen（滤色）叠加
 *
 *   outL = L + g * (1 - L/255)，g = (255-mask) * L * K / 65536
 *
 * 因为 g ≤ 255，d(outL)/dL ≥ 0 恒成立，天然单调、不会反折；L=0 时 g=0，
 * 纯黑仍是纯黑，不会被抬成灰雾。
 *
 * 逐通道 Screen 会让深色饱和区（夜景蓝）把最亮通道抬过头（实测深黑
 * 13.9→33.6、蓝通道溢出），因此在亮度域做 Screen 再按比例回放到 RGB：
 * 色相与相对饱和度保持不变，深黑只到 21 左右。
 */
export function applyFillLight(data: ImageData, edit: Edit) {
  const s = edit.fillLight;
  if (s <= 0) return;
  const K = Math.round(s * (FILL_K / 100));
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const L = (77 * r + 151 * g + 28 * b) >> 8;
    if (L <= 0) continue;
    const gL = (FILL_T[L] * L * K) / 65536;
    if (gL < 0.01) continue;
    const outL = L + gL * (1 - L / 255);
    let ratio = outL / L;
    if (ratio <= 1.0001) continue;
    const maxc = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (maxc > 0) {
      const room = 252 / maxc;
      if (ratio > room) ratio = room;
    }
    if (ratio <= 1.0001) continue;
    px[i] = clampByte(r * ratio);
    px[i + 1] = clampByte(g * ratio);
    px[i + 2] = clampByte(b * ratio);
  }
}

/**
 * 亮部压制：与暗部提亮对称的亮部选区压暗，只动 128 以上，暗部与黑位恒等。
 *
 *   u = max(0, (x - 128) / 127)
 *   out = x - A * u²,  A = 58 * strength
 *
 * 导数 1 - 2Au/127 在 A<63.5 时恒正，没有反转；u² 让压缩从 0 斜率开始，
 * 128 处没有折点。满档 255→197、224→191、192→177、160→156，中间调基本不动。
 * 压缩段斜率 <1，量化会把台阶拉长，所以按局部斜率加 Bayer 抖动打散色带。
 */
export function applyDarken(data: ImageData, edit: Edit) {
  const s = edit.darken;
  if (s <= 0) return;
  const A = 58 * (s / 100);
  const gain = new Float32Array(256);
  const dither = new Float32Array(256);
  let prev = 0;
  for (let i = 0; i < 256; i++) {
    const u = i <= 128 ? 0 : (i - 128) / 127;
    const v = i - A * u * u;
    gain[i] = i === 0 ? 1 : v / i;
    const slope = v - prev;
    dither[i] = slope < 0.9 ? Math.min(2, (1 - slope) * 2.2) : 0;
    prev = v;
  }
  const px = data.data;
  const { width } = data;
  let x = 0;
  let y0 = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.5) | 0;
    const gn = gain[y];
    const amp = gn >= 0.9999 ? 0 : dither[y];
    if (amp > 0) {
      const d = ((BAYER[((y0 & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5) * amp;
      px[i] = clampByte(r * gn + d);
      px[i + 1] = clampByte(g * gn + d);
      px[i + 2] = clampByte(b * gn + d);
    } else if (gn < 0.9999) {
      px[i] = clampByte(r * gn);
      px[i + 1] = clampByte(g * gn);
      px[i + 2] = clampByte(b * gn);
    }
    if (++x === width) {
      x = 0;
      y0++;
    }
  }
}

/**
 * 柔化：可分离盒式模糊（先横后纵），半径随强度与图片短边缩放。
 * 单次盒式会留下方块感，这里做两轮近似高斯；默认 30 档在 1200px 短边上约 1–2px，
 * 只压高频细节，不会把画面糊成一片。
 */
export function applyBlur(data: ImageData, edit: Edit) {
  const s = edit.blur;
  if (s <= 0) return;
  const { width, height, data: px } = data;
  const radius = Math.max(1, Math.round((s / 100) * Math.min(width, height) * 0.004));
  const src = new Uint8ClampedArray(px);
  const tmp = new Uint8ClampedArray(px.length);
  const win = radius * 2 + 1;

  for (let pass = 0; pass < 2; pass++) {
    // 横向
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let k = -radius; k <= radius; k++) {
        const i = (row + Math.min(width - 1, Math.max(0, k))) * 4;
        sr += src[i];
        sg += src[i + 1];
        sb += src[i + 2];
      }
      for (let x = 0; x < width; x++) {
        const i = (row + x) * 4;
        tmp[i] = sr / win;
        tmp[i + 1] = sg / win;
        tmp[i + 2] = sb / win;
        tmp[i + 3] = src[i + 3];
        const add = Math.min(width - 1, x + radius + 1);
        const sub = Math.max(0, x - radius);
        sr += src[(row + add) * 4] - src[(row + sub) * 4];
        sg += src[(row + add) * 4 + 1] - src[(row + sub) * 4 + 1];
        sb += src[(row + add) * 4 + 2] - src[(row + sub) * 4 + 2];
      }
    }
    // 纵向
    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let k = -radius; k <= radius; k++) {
        const i = (Math.min(height - 1, Math.max(0, k)) * width + x) * 4;
        sr += tmp[i];
        sg += tmp[i + 1];
        sb += tmp[i + 2];
      }
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        src[i] = sr / win;
        src[i + 1] = sg / win;
        src[i + 2] = sb / win;
        src[i + 3] = tmp[i + 3];
        const add = Math.min(height - 1, y + radius + 1);
        const sub = Math.max(0, y - radius);
        sr += tmp[(add * width + x) * 4] - tmp[(sub * width + x) * 4];
        sg += tmp[(add * width + x) * 4 + 1] - tmp[(sub * width + x) * 4 + 1];
        sb += tmp[(add * width + x) * 4 + 2] - tmp[(sub * width + x) * 4 + 2];
      }
    }
  }
  px.set(src);
}

export function applySpatial(data: ImageData, edit: Edit) {
  // 清晰度与锐化在调色之后，作用在已经定调的画面上；柔化排在锐化之前
  if (edit.clarity > 0) clarityPixels(data, edit.clarity);
  if (edit.blur > 0) applyBlur(data, edit);
  if (edit.sharpen > 0) sharpenPixels(data, edit.sharpen);
}

/** 径向蒙版局部调整：以椭圆（正圆）中心向外羽化过渡，只影响蒙版范围内。 */
export function hasLocal(edit: Edit) {
  const l = edit.local;
  return l.enabled && (l.exposure !== 0 || l.saturation !== 0);
}

export function applyLocal(data: ImageData, edit: Edit) {
  const l = edit.local;
  const { width, height, data: px } = data;
  const short = Math.min(width, height);
  const radius = Math.max(1, l.radius * short);
  const feather = Math.min(1, Math.max(0, l.feather));
  const inner = radius * (1 - feather);
  const cx = l.cx * width;
  const cy = l.cy * height;
  const gain = 2 ** l.exposure;
  const satMul = 1 + l.saturation / 100;
  const r2 = radius * radius;

  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height, Math.ceil(cy + radius));

  for (let y = y0; y < y1; y++) {
    const dy = y - cy;
    for (let x = x0; x < x1; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      let t = 1;
      if (d > inner) {
        const u = (d - inner) / Math.max(1e-6, radius - inner);
        t = 1 - u * u * (3 - 2 * u);
      }
      if (t <= 0) continue;

      const i = (y * width + x) * 4;
      const k = 1 + (gain - 1) * t;
      let r = px[i] * k;
      let g = px[i + 1] * k;
      let b = px[i + 2] * k;
      if (satMul !== 1) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const m = 1 + (satMul - 1) * t;
        r = luma + (r - luma) * m;
        g = luma + (g - luma) * m;
        b = luma + (b - luma) * m;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}

export function rotatedSize(photo: Photo, edit: Edit) {
  const swap = edit.rotation === 90 || edit.rotation === 270;
  return swap ? { width: photo.height, height: photo.width } : { width: photo.width, height: photo.height };
}

/** 当前裁剪区域，坐标为旋转后的图像坐标。 */
export function currentCrop(photo: Photo, edit: Edit): CropRect {
  if (edit.crop) return edit.crop;
  const { width, height } = rotatedSize(photo, edit);
  return { x: 0, y: 0, w: width, h: height };
}
