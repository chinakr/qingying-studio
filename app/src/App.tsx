import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import brand from '../brand.json';
import pkg from '../package.json';
import AdjustPanel from './components/AdjustPanel';
import AutoPanel, { type QuickKind } from './components/AutoPanel';
import BatchPanel, { type BatchOptions, type BatchReport } from './components/BatchPanel';
import CanvasStage, { type NormalizedRect } from './components/CanvasStage';
import CurvePanel from './components/CurvePanel';
import DetailPanel from './components/DetailPanel';
import LayoutPanel from './components/LayoutPanel';
import LocalPanel from './components/LocalPanel';
import OutputPanel from './components/OutputPanel';
import PresetPanel from './components/PresetPanel';
import WatermarkPanel from './components/WatermarkPanel';
import {
  IconBatch,
  IconCrop,
  IconAdjust,
  IconAuto,
  IconCurve,
  IconDetail,
  IconExport,
  IconFlip,
  IconFrame,
  IconFullscreen,
  IconLocal,
  IconOpen,
  IconOutput,
  IconPlus,
  IconPreset,
  IconRedo,
  IconReset,
  IconRotateLeft,
  IconRotateRight,
  IconTrash,
  IconUndo,
  IconWatermark,
} from './components/Icons';
import { setImageMarkReadyHandler } from './lib/imageMark';
import {
  DEFAULT_CURVE,
  DEFAULT_EDIT,
  PRESETS,
  currentCrop,
  solveNeutralTemperature,
  type Edit,
  type Photo,
} from './lib/editor';
import {
  buildRecipe,
  computeWhiteBalance,
  describeRecipeText,
  dropStats,
  measureDarken,
  measureFillLight,
  planAutoExposure,
  recipeToEdit,
  refineWhiteBalance,
  statsCacheSize,
  statsFor,
  type AutoResult,
} from './lib/auto';
import { attachExif } from './lib/exif';
import { DEFAULT_OUTPUT, outputMaxSide, type OutputSettings } from './lib/output';
import {
  TIER_SPECS,
  levelsBase,
  levelsState,
  nextLevels,
  nextTier,
  tierState,
  type QuickTiers,
} from './lib/quick';
import { parseRecipe, recipeText } from './lib/recipe';
import { formatBytes, loadPhoto, shortName } from './lib/load';
import { IMAGE_EXT, extOf, isTauri, mimeOf, modLabel, saveBlob } from './lib/platform';
import { baseCacheStats, canvasToBlob, exportName, releaseBaseCache, renderPhoto } from './lib/render';

type Tool =
  | 'auto'
  | 'adjust'
  | 'curve'
  | 'preset'
  | 'detail'
  | 'local'
  | 'watermark'
  | 'layout'
  | 'output'
  | 'crop'
  | 'batch';

const TOOLS: { id: Tool; label: string; icon: typeof IconAdjust }[] = [
  { id: 'auto', label: '显影', icon: IconAuto },
  { id: 'adjust', label: '色彩', icon: IconAdjust },
  { id: 'curve', label: '映射', icon: IconCurve },
  { id: 'preset', label: '风格', icon: IconPreset },
  { id: 'detail', label: '质感', icon: IconDetail },
  { id: 'local', label: '区域', icon: IconLocal },
  { id: 'watermark', label: '署名', icon: IconWatermark },
  { id: 'layout', label: '画幅', icon: IconFrame },
  { id: 'output', label: '输出', icon: IconOutput },
  { id: 'crop', label: '裁切', icon: IconCrop },
  { id: 'batch', label: '流水线', icon: IconBatch },
];

const MAX_HISTORY = 50;

/** 快捷键说明：分组展示，版本内保持与 keydown 实现同步。 */
const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; desc: string }[] }[] = [
  {
    title: '文件与历史',
    items: [
      { keys: [modLabel, 'O'], desc: '打开图片（可多选）' },
      { keys: [modLabel, 'S'], desc: '导出当前图片' },
      { keys: [modLabel, 'Z'], desc: '撤销' },
      { keys: ['⇧', modLabel, 'Z'], desc: '重做（也可用 ' + modLabel + 'Y）' },
    ],
  },
  {
    title: '工具切换',
    items: [
      { keys: ['1', '–', '9'], desc: '按顺序切换左侧工具（显影→输出）' },
      { keys: ['0'], desc: '切换到第 10 个工具「裁切」' },
      { keys: ['B'], desc: '打开「流水线」' },
    ],
  },
  {
    title: '图片与画布',
    items: [
      { keys: ['['], desc: '上一张图片' },
      { keys: [']'], desc: '下一张图片' },
      { keys: ['S'], desc: '进入 / 退出全屏预览' },
      { keys: ['Esc'], desc: '退出全屏；裁剪中则取消本次裁剪' },
      { keys: ['按住', '\\'], desc: '临时查看原图，松开还原' },
      { keys: [modLabel, '+'], desc: '放大画布（也可用滚轮）' },
      { keys: [modLabel, '−'], desc: '缩小画布' },
      { keys: [modLabel, '0'], desc: '缩放到适应窗口' },
      { keys: ['双击画布'], desc: '在 1:1 与适应窗口之间切换' },
    ],
  },
  {
    title: '裁剪',
    items: [
      { keys: ['Enter'], desc: '应用当前裁剪框' },
      { keys: ['Esc'], desc: '取消裁剪并回到调色面板' },
    ],
  },
  {
    title: '帮助',
    items: [{ keys: ['?'], desc: '打开 / 关闭这份快捷键说明' }],
  },
];

/** 整组校色会覆盖这些全局字段，撤销时按这份快照还原。 */
function adjustableOf(edit: Edit): Partial<Edit> {
  return {
    exposure: edit.exposure,
    contrast: edit.contrast,
    fillLight: edit.fillLight,
    saturation: edit.saturation,
    vibrance: edit.vibrance,
    temperature: edit.temperature,
    tint: edit.tint,
    levels: { ...edit.levels },
    curve: edit.curve.map((p) => ({ ...p })),
    sharpen: edit.sharpen,
    denoise: edit.denoise,
    clarity: edit.clarity,
  };
}

const secondsSince = (from: number) => `${((performance.now() - from) / 1000).toFixed(1)} 秒`;

/** 预览长边：满档 1600；拖动高开销参数时自适应降到 760，停手后再补满档。 */
const PREVIEW_MAX = 1600;
const PREVIEW_MIN = 760;

/**
 * 预览画布缓存（LRU，最多 4 张）：同一张图在同一组参数下反复进出（切图再切回、
 * 撤销重做）时直接复用，省掉一次完整渲染。图片水印是异步解码的，带水印的画面不缓存。
 */
const PREVIEW_CACHE_MAX = 4;
const previewCache = new Map<string, HTMLCanvasElement>();

/** 预览缓存占用（开发态诊断用）：条目数与画布后备存储字节数。 */
function previewCacheStats() {
  let bytes = 0;
  for (const c of previewCache.values()) bytes += c.width * c.height * 4;
  return { entries: previewCache.size, bytes };
}

/** 移除图片时释放它的预览帧，避免已移除的图继续占着画布。 */
function releasePreviewCache(photoId: string) {
  for (const [key, canvas] of [...previewCache]) {
    if (!key.startsWith(`${photoId}|`)) continue;
    previewCache.delete(key);
    canvas.width = 0;
    canvas.height = 0;
  }
}

function previewCanvas(photo: Photo, edit: Edit, side: number): { canvas: HTMLCanvasElement; hit: boolean } {
  if (edit.imageMark.enabled) return { canvas: renderPhoto(photo, edit, side).canvas, hit: false };
  const key = `${photo.id}|${side}|${JSON.stringify(edit)}`;
  const hit = previewCache.get(key);
  if (hit) {
    previewCache.delete(key);
    previewCache.set(key, hit);
    return { canvas: hit, hit: true };
  }
  const canvas = renderPhoto(photo, edit, side).canvas;
  previewCache.set(key, canvas);
  while (previewCache.size > PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest === undefined) break;
    previewCache.delete(oldest);
  }
  return { canvas, hit: false };
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [tool, setTool] = useState<Tool>('adjust');
  const [showOriginal, setShowOriginal] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [output, setOutput] = useState<OutputSettings>(DEFAULT_OUTPUT);
  const [busyState, setBusyState] = useState<{ text: string; progress: number | null } | null>(null);
  const busy = busyState?.text ?? null;
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [originalPreview, setOriginalPreview] = useState<HTMLCanvasElement | null>(null);
  const [autoStrength, setAutoStrength] = useState(60);
  const [batch, setBatch] = useState<BatchOptions>({ auto: true, strength: 60, resize: false, longEdge: 1920 });
  const [batchReport, setBatchReport] = useState<BatchReport | null>(null);
  const [batchDone, setBatchDone] = useState(0);
  const batchCancelRef = useRef(false);
  const [autoApplied, setAutoApplied] = useState<Record<string, { result: AutoResult; undo: Partial<Edit> }>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const recipeInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shortcutDialogRef = useRef<HTMLDivElement>(null);
  const shortcutReturnRef = useRef<HTMLElement | null>(null);

  // 编辑状态与撤销栈。editsRef 与 edits 同步写入，保证连续操作时快照不落后一拍。
  const editsRef = useRef<Record<string, Edit>>({});
  const pastRef = useRef<Record<string, Edit>[]>([]);
  const futureRef = useRef<Record<string, Edit>[]>([]);
  const lastCommitRef = useRef({ key: '', time: 0 });
  const [, setHistoryTick] = useState(0);

  const photo = useMemo(() => photos.find((p) => p.id === activeId) ?? null, [photos, activeId]);
  const edit = useMemo(() => (photo ? edits[photo.id] ?? DEFAULT_EDIT : DEFAULT_EDIT), [photo, edits]);

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text: message, tone });
    window.setTimeout(() => setToast((t) => (t?.text === message ? null : t)), tone === 'error' ? 6000 : 3200);
  }, []);

  // 忙碌提示用任务栈：导入与导出可以并行，任务结束只清掉自己那一层，
  // 避免先结束的任务把还在跑的进度提示一起抹掉。
  const busySeqRef = useRef(0);
  const busyTasksRef = useRef<{ id: number; text: string; progress: number | null }[]>([]);
  const syncBusy = useCallback(() => {
    const tasks = busyTasksRef.current;
    const top = tasks[tasks.length - 1];
    setBusyState(top ? { text: top.text, progress: top.progress } : null);
  }, []);
  const busyBegin = useCallback(
    (text: string) => {
      const id = ++busySeqRef.current;
      busyTasksRef.current = [...busyTasksRef.current, { id, text, progress: null }];
      syncBusy();
      return id;
    },
    [syncBusy],
  );
  const busySet = useCallback(
    (id: number, text: string, progress: number | null = null) => {
      busyTasksRef.current = busyTasksRef.current.map((t) => (t.id === id ? { ...t, text, progress } : t));
      syncBusy();
    },
    [syncBusy],
  );
  const busyEnd = useCallback(
    (id: number) => {
      busyTasksRef.current = busyTasksRef.current.filter((t) => t.id !== id);
      syncBusy();
    },
    [syncBusy],
  );

  // 快捷键说明弹窗：打开时把焦点移进弹窗、Tab 循环不外泄，关闭后回到原焦点，
  // 纯键盘用户可以完整读完说明再按 Esc 返回原处。
  useEffect(() => {
    if (!showShortcuts) return;
    shortcutReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = shortcutDialogRef.current;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener('keydown', onTab);
    return () => {
      dialog?.removeEventListener('keydown', onTab);
      shortcutReturnRef.current?.focus?.();
    };
  }, [showShortcuts]);

  const applyEdits = useCallback((next: Record<string, Edit>) => {
    editsRef.current = next;
    setEdits(next);
  }, []);

  /** 同一组参数在 700ms 内的连续拖动合并成一步，避免滑杆拖一次产生几十条历史。 */
  const pushHistory = useCallback((key: string) => {
    const now = performance.now();
    const coalesce =
      key === lastCommitRef.current.key && now - lastCommitRef.current.time < 700 && pastRef.current.length > 0;
    lastCommitRef.current = { key, time: now };
    if (coalesce) return;
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), editsRef.current];
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    // 撤销后立刻改同一参数不应该被 700ms 合并规则并进上一步，否则重做会跳过这次修改
    lastCommitRef.current = { key: '', time: 0 };
    futureRef.current = [editsRef.current, ...futureRef.current].slice(0, MAX_HISTORY);
    applyEdits(prev);
    setAutoApplied({});
    setHistoryTick((t) => t + 1);
    notify('已撤销上一步');
  }, [applyEdits, notify]);

  const redo = useCallback(() => {
    const next = futureRef.current.shift();
    if (!next) return;
    lastCommitRef.current = { key: '', time: 0 };
    pastRef.current = [...pastRef.current, editsRef.current].slice(-MAX_HISTORY);
    applyEdits(next);
    setAutoApplied({});
    setHistoryTick((t) => t + 1);
    notify('已重做');
  }, [applyEdits, notify]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  // 开发态诊断入口：只读统计各缓存条目与画布占用，供内存回归测试取值。
  useEffect(() => {
    if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
    (window as unknown as Record<string, unknown>).__tfCache = () => ({
      base: baseCacheStats(),
      preview: previewCacheStats(),
      stats: statsCacheSize(),
      history: { past: pastRef.current.length, future: futureRef.current.length },
      edits: Object.keys(editsRef.current).length,
    });
  }, []);

  // 图片水印是异步解码的：解码完成后强制重绘一次预览（正常选图会先 await 再写入编辑，这里是兜底）
  useEffect(() => {
    setImageMarkReadyHandler(() => setRenderTick((t) => t + 1));
    return () => setImageMarkReadyHandler(null);
  }, []);

  // 预览渲染状态：一帧内多次参数变化合并成一次绘制；拖动时按上次耗时自适应分辨率，
  // 停手 220ms 后补一帧满档预览。原图预览只跟几何/裁剪有关，调色滑杆不再重算它。
  const previewStateRef = useRef({ has: false, quality: PREVIEW_MAX, lastSide: 0, raf: 0, idle: 0, photoId: '' });
  const editRef = useRef<Edit>(DEFAULT_EDIT);
  editRef.current = edit;
  const geoKey = photo
    ? `${photo.id}|${edit.rotation}|${edit.flipH ? 1 : 0}|${edit.straighten}|${
        edit.crop ? `${edit.crop.x},${edit.crop.y},${edit.crop.w},${edit.crop.h}` : ''
      }`
    : '';

  useEffect(() => {
    const st = previewStateRef.current;
    if (!photo) {
      cancelAnimationFrame(st.raf);
      window.clearTimeout(st.idle);
      st.has = false;
      st.photoId = '';
      setPreview(null);
      return;
    }
    const current = edits[photo.id] ?? DEFAULT_EDIT;
    const paint = (side: number) => {
      const t0 = performance.now();
      const { canvas, hit } = previewCanvas(photo, current, side);
      setPreview(canvas);
      if (hit) return;
      const ms = performance.now() - t0;
      st.lastSide = side;
      st.has = true;
      // 自适应：单次超过 24ms 降一档（最低 760），稳定在 8ms 内再逐档升回 1600
      if (ms > 24 && st.quality > PREVIEW_MIN) st.quality = Math.max(PREVIEW_MIN, Math.round(st.quality * 0.75));
      else if (ms < 8 && st.quality < PREVIEW_MAX) st.quality = Math.min(PREVIEW_MAX, Math.round(st.quality * 1.25));
    };
    if (!st.has || st.photoId !== photo.id) {
      // 首次导入 / 切图：同步出图，不空一帧
      st.photoId = photo.id;
      st.quality = PREVIEW_MAX;
      paint(PREVIEW_MAX);
    } else {
      cancelAnimationFrame(st.raf);
      st.raf = requestAnimationFrame(() => paint(st.quality));
    }
    window.clearTimeout(st.idle);
    st.idle = window.setTimeout(() => {
      if (st.lastSide < PREVIEW_MAX) paint(PREVIEW_MAX);
    }, 220);
    return () => {
      cancelAnimationFrame(st.raf);
      window.clearTimeout(st.idle);
    };
  }, [photo, edits, renderTick]);

  // 原图对照：只有旋转/翻转/拉直/裁剪变化才需要重算，色彩与细节参数不影响它
  useEffect(() => {
    if (!photo) {
      setOriginalPreview(null);
      return;
    }
    const current = editRef.current;
    const neutral: Edit = {
      ...current,
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
      levels: { black: 0, white: 255, gamma: 1 },
      curve: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
      sharpen: 0,
      denoise: 0,
      clarity: 0,
      border: { width: 0, color: '#ffffff' },
      watermark: { ...current.watermark, enabled: false },
      imageMark: { ...current.imageMark, enabled: false },
    };
    setOriginalPreview(renderPhoto(photo, neutral, PREVIEW_MAX).canvas);
  }, [photo, geoKey, renderTick]);

  // 图片全部移除后自动退出全屏，避免停在一个空画布上
  useEffect(() => {
    if (!photo && fullscreen) setFullscreen(false);
  }, [photo, fullscreen]);

  // 列表清空后历史里只剩已移除图片的快照，留着只会白占内存，一并清掉
  useEffect(() => {
    if (photos.length > 0) return;
    if (pastRef.current.length === 0 && futureRef.current.length === 0) return;
    pastRef.current = [];
    futureRef.current = [];
    lastCommitRef.current = { key: '', time: 0 };
    setHistoryTick((t) => t + 1);
  }, [photos.length]);

  const updateEdit = useCallback(
    (patch: Partial<Edit>, historyKey?: string) => {
      if (!photo) return;
      const current = editsRef.current[photo.id] ?? DEFAULT_EDIT;
      const keys = Object.keys(patch) as (keyof Edit)[];
      // 参数完全没变就不写历史：否则连点同一个按钮会留下"按了撤销却没反应"的空步
      if (keys.every((k) => JSON.stringify(current[k]) === JSON.stringify(patch[k]))) return;
      pushHistory(historyKey ?? (keys.sort().join(',') || 'edit'));
      applyEdits({ ...editsRef.current, [photo.id]: { ...current, ...patch } });
    },
    [photo, pushHistory, applyEdits],
  );

  // 预览：当前强度下会改成什么样（统计结果按 photo.id 缓存，滑杆拖动不重复算）
  const autoPreview = useMemo(() => {
    if (!photo) return null;
    return buildRecipe(statsFor(photo), autoStrength / 100);
  }, [photo, autoStrength]);

  /** 宫格按钮上的累计档位：由当前绝对参数反推，撤销后会自动跟着回退。 */
  const quickTiers = useMemo<QuickTiers | null>(() => {
    if (!photo) return null;
    const stats = statsFor(photo);
    const base = levelsBase(stats.p01, stats.p99);
    return {
      fill: tierState(TIER_SPECS.fill, edit.fillLight),
      darken: tierState(TIER_SPECS.darken, edit.darken),
      sharpen: tierState(TIER_SPECS.sharpen, edit.sharpen),
      blur: tierState(TIER_SPECS.blur, edit.blur),
      denoise: tierState(TIER_SPECS.denoise, edit.denoise),
      levels: levelsState(edit.levels, base),
    };
  }, [photo, edit]);

  const autoEntry = photo ? autoApplied[photo.id] ?? null : null;

  const runAuto = useCallback(
    (strengthPercent: number, keepUndo: boolean) => {
      if (!photo) return;
      const stats = statsFor(photo);
      const result = buildRecipe(stats, strengthPercent / 100);
      // LUT 求根之后再量一次真实输出：强拉伸/饱和度会把色偏再放大一次，这里闭环收敛
      const recipe = { ...result.recipe };
      if (Math.abs(stats.cast) > 0.006) {
        recipe.temperature = refineWhiteBalance(photo, { ...DEFAULT_EDIT, ...recipeToEdit(recipe) });
      }
      const patch = recipeToEdit(recipe);
      const current = editsRef.current[photo.id] ?? DEFAULT_EDIT;
      // 整组校色按统计结果写绝对参数，重复点击结果一致；这里明确提示，不留“按了没反应”的错觉
      const changed = (Object.keys(patch) as (keyof Edit)[]).some(
        (k) => JSON.stringify(current[k]) !== JSON.stringify(patch[k]),
      );
      if (!changed) {
        notify(`整组校色：当前参数已是强度 ${strengthPercent}% 的结果，未重复改动（可继续用单项按钮累积）`);
        return;
      }
      const undo = keepUndo && autoApplied[photo.id] ? autoApplied[photo.id].undo : adjustableOf(edit);
      setAutoApplied((prev) => ({ ...prev, [photo.id]: { result: { ...result, recipe }, undo } }));
      updateEdit(patch, 'auto');
      notify(`整组校色已应用（强度 ${strengthPercent}%）：${describeRecipeText(recipe)}`);
    },
    [photo, edit, autoApplied, updateEdit, notify],
  );

  const changeAutoStrength = (value: number) => {
    setAutoStrength(value);
    if (photo && autoApplied[photo.id]) runAuto(value, true);
  };

  const undoAuto = () => {
    if (!photo) return;
    const entry = autoApplied[photo.id];
    if (!entry) return;
    updateEdit(entry.undo);
    setAutoApplied((prev) => {
      const next = { ...prev };
      delete next[photo.id];
      return next;
    });
    notify('已撤销整组校色');
  };

  /** 曝光校正：只归位曝光，按当前画面中位亮度逐步逼近目标；与整组校色完全独立。 */
  const runAutoExposure = () => {
    if (!photo) return;
    const plan = planAutoExposure(photo, edit);
    const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
    if (plan.atTarget) {
      notify(
        `曝光校正：已到目标（中位亮度 ${plan.median}，目标 ${plan.target}），再点不会继续改变曝光`,
      );
      return;
    }
    if (plan.blocked) {
      notify(`曝光校正：${plan.reason}，当前曝光 ${signed(edit.exposure)} EV 保持不变`);
      return;
    }
    updateEdit({ exposure: plan.next }, 'quick-exposure');
    notify(
      `曝光校正：曝光 ${signed(edit.exposure)} → ${signed(plan.next)} EV，中位亮度 ${plan.median} → 目标 ${plan.target}${
        Math.abs(plan.next - edit.exposure - plan.delta) > 0.02 ? '（本次已到单次上限，可继续点击逼近）' : ''
      }`,
    );
  };

  /** 单项动作：只改一个参数，每点一次累积一档，参数按累积后的绝对强度重算。 */
  const runQuick = (kind: QuickKind) => {
    if (!photo) return;
    if (kind === 'auto') {
      runAuto(autoStrength, false);
      return;
    }
    if (kind === 'sharpen') {
      const step = nextTier(TIER_SPECS.sharpen, edit.sharpen);
      if (step.atCap) {
        notify(`锐化已到上限（当前 ${edit.sharpen}，第 ${step.maxTier} 档），再点不会更强；${modLabel}Z 可退一档`);
        return;
      }
      // 锐化与模糊互斥：已经柔化的画面再锐化只会把模糊边缘抽成光晕
      updateEdit({ sharpen: step.value, blur: 0 }, `quick-sharpen-${step.tier}`);
      notify(
        `细节增强 第 ${step.tier}/${step.maxTier} 档：锐化 ${edit.sharpen} → ${step.value}${
          edit.blur > 0 ? '，已关闭模糊' : ''
        }`,
      );
      return;
    }
    if (kind === 'blur') {
      // 首档 30：1200px 短边约 1–2px 半径，只压高频细节，不会糊成一片
      const step = nextTier(TIER_SPECS.blur, edit.blur);
      if (step.atCap) {
        notify(`模糊已到上限（当前 ${edit.blur}，第 ${step.maxTier} 档），再点不会更强；${modLabel}Z 可退一档`);
        return;
      }
      updateEdit({ blur: step.value, sharpen: 0 }, `quick-blur-${step.tier}`);
      notify(
        `柔焦 第 ${step.tier}/${step.maxTier} 档：柔化 ${edit.blur} → ${step.value}${
          edit.sharpen > 0 ? '，已关闭锐化' : ''
        }`,
      );
      return;
    }
    if (kind === 'denoise') {
      const step = nextTier(TIER_SPECS.denoise, edit.denoise);
      if (step.atCap) {
        notify(`降噪已到上限（当前 ${edit.denoise}，第 ${step.maxTier} 档），再点不会更强；${modLabel}Z 可退一档`);
        return;
      }
      updateEdit({ denoise: step.value }, `quick-denoise-${step.tier}`);
      notify(`颗粒抑制 第 ${step.tier}/${step.maxTier} 档：降噪 ${edit.denoise} → ${step.value}`);
      return;
    }
    if (kind === 'fill') {
      // 首档 55 大约把暗部抬一倍；之后每档 +15，满档仍有 252 高光余量保护
      const step = nextTier(TIER_SPECS.fill, edit.fillLight);
      if (step.atCap) {
        notify(`暗部提亮已到上限（当前 ${edit.fillLight}，第 ${step.maxTier} 档），再点不会更强；${modLabel}Z 可退一档`);
        return;
      }
      const m = measureFillLight(photo, edit, step.value);
      updateEdit({ fillLight: step.value }, `quick-fill-${step.tier}`);
      notify(
        m.darkBefore > 0
          ? `暗部提亮 第 ${step.tier}/${step.maxTier} 档：暗部提亮 ${edit.fillLight} → ${step.value}，暗部均值 ${m.darkBefore.toFixed(1)} → ${m.darkAfter.toFixed(1)}，死白 ${m.whiteAfter.toFixed(2)}%`
          : `暗部提亮 第 ${step.tier}/${step.maxTier} 档：画面没有明显暗部（<64），${step.value} 档主要抬中间调，死白 ${m.whiteAfter.toFixed(2)}%`,
      );
      return;
    }
    if (kind === 'darken') {
      const step = nextTier(TIER_SPECS.darken, edit.darken);
      if (step.atCap) {
        notify(`亮部压制已到上限（当前 ${edit.darken}，第 ${step.maxTier} 档），再点不会更强；${modLabel}Z 可退一档`);
        return;
      }
      const m = measureDarken(photo, edit, step.value);
      updateEdit({ darken: step.value }, `quick-darken-${step.tier}`);
      notify(
        m.highBefore > 0
          ? `亮部压制 第 ${step.tier}/${step.maxTier} 档：亮部压制 ${edit.darken} → ${step.value}，亮部均值 ${m.highBefore.toFixed(1)} → ${m.highAfter.toFixed(1)}，暗部变化 ${m.darkDelta >= 0 ? '+' : ''}${m.darkDelta.toFixed(1)}`
          : `亮部压制 第 ${step.tier}/${step.maxTier} 档：画面没有明显亮部（>192），${step.value} 档主要压中间调，暗部变化 ${m.darkDelta >= 0 ? '+' : ''}${m.darkDelta.toFixed(1)}`,
      );
      return;
    }
    if (kind === 'levels') {
      const stats = statsFor(photo);
      const base = levelsBase(stats.p01, stats.p99);
      if (base.white - base.black < 8) {
        notify('直方图两端过于集中，黑白场校准已跳过');
        return;
      }
      if (base.black === 0 && base.white === 255) {
        notify('直方图已占满 0–255，黑白场校准无需再收紧');
        return;
      }
      const step = nextLevels(edit.levels, base);
      if (step.skip) {
        notify(`黑白场校准已到保护极限（黑场 ≤ ${96}、白场 ≥ ${160}），无法再收紧`);
        return;
      }
      if (step.atCap) {
        notify(
          `黑白场校准已到上限（第 ${step.maxTier} 档：黑场 ${edit.levels.black} / 白场 ${edit.levels.white}），再点不会更强；${modLabel}Z 可退一档`,
        );
        return;
      }
      updateEdit({ levels: step.levels }, `quick-levels-${step.tier}`);
      notify(
        `黑白场校准 第 ${step.tier}/${step.maxTier} 档：黑场 ${edit.levels.black} → ${step.levels.black}、白场 ${edit.levels.white} → ${step.levels.white}`,
      );
      return;
    }
    if (kind === 'resetQuick') {
      // 累积是全局的：连同整组校色/白平衡写进来的色彩参数一起清空，避免留下残余档位
      updateEdit(
        {
          exposure: 0,
          contrast: 0,
          fillLight: 0,
          darken: 0,
          blur: 0,
          sharpen: 0,
          saturation: 0,
          vibrance: 0,
          temperature: 0,
          tint: 0,
          clarity: 0,
          levels: { black: 0, white: 255, gamma: 1 },
          curve: DEFAULT_CURVE.map((p) => ({ ...p })),
        },
        'quick-reset',
      );
      notify('已还原调整：暗部提亮/亮部压制/模糊/锐化/降噪/色阶/白平衡与色彩累积全部清零，可撤销');
      return;
    }
    // 用当前 Edit 求解，这样在已有曝光/对比/曲线的基础上也能把肤色拉回中性
    const stats = statsFor(photo);
    const solved = solveNeutralTemperature(edit, stats.rMean, stats.bMean);
    const wb = solved === 0 ? computeWhiteBalance(stats) : { temperature: solved, tint: computeWhiteBalance(stats).tint };
    wb.temperature = refineWhiteBalance(photo, { ...edit, temperature: wb.temperature, tint: wb.tint });
    // 白平衡是“求解到中性”，不是可叠加的强度：已经命中时明确提示，避免像失灵
    if (wb.temperature === edit.temperature && wb.tint === edit.tint) {
      notify(
        wb.temperature === 0 && wb.tint === 0
          ? '画面已接近中性，无需白平衡修正'
          : `中性校准已是最佳（色温 ${wb.temperature >= 0 ? '+' : ''}${wb.temperature}、色调 ${
              wb.tint >= 0 ? '+' : ''
            }${wb.tint}），再点不会重复偏移`,
      );
      return;
    }
    updateEdit({ temperature: wb.temperature, tint: wb.tint }, 'quick-wb');
    notify(
      `中性校准：色温 ${wb.temperature >= 0 ? '+' : ''}${wb.temperature}、色调 ${wb.tint >= 0 ? '+' : ''}${wb.tint}`,
    );
  };

  const applyAutoAll = () => {
    pushHistory('auto-all');
    const next = { ...editsRef.current };
    for (const p of photos) {
      const stats = statsFor(p);
      const result = buildRecipe(stats, autoStrength / 100);
      const recipe = { ...result.recipe };
      if (Math.abs(stats.cast) > 0.006) {
        recipe.temperature = refineWhiteBalance(p, { ...DEFAULT_EDIT, ...recipeToEdit(recipe) });
      }
      next[p.id] = { ...(next[p.id] ?? DEFAULT_EDIT), ...recipeToEdit(recipe) };
    }
    applyEdits(next);
    if (photo && autoPreview) {
      setAutoApplied((prev) => ({ ...prev, [photo.id]: { result: autoPreview, undo: adjustableOf(edit) } }));
    }
    notify(`已对 ${photos.length} 张图片应用整组校色（强度 ${autoStrength}%）`);
  };

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const task = busyBegin(`正在导入 ${list.length} 张图片…`);
      const loaded: Photo[] = [];
      const failed: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        if (list.length > 1) {
          busySet(task, `正在导入 ${i + 1} / ${list.length} 张：${shortName(file.name)}`, (i / list.length) * 100);
        }
        try {
          loaded.push(await loadPhoto(file));
        } catch (err) {
          failed.push(err instanceof Error ? err.message : String(err));
        }
        if (list.length > 1) {
          busySet(task, `正在导入 ${i + 1} / ${list.length} 张：${shortName(file.name)}`, ((i + 1) / list.length) * 100);
        }
      }
      if (loaded.length > 0) {
        setPhotos((prev) => [...prev, ...loaded]);
        setActiveId((current) => current ?? loaded[0].id);
      }
      busyEnd(task);
      if (failed.length > 0) notify(failed.join('；'), 'error');
    },
    [busyBegin, busyEnd, busySet, notify],
  );

  // 桌面端：WKWebView 不支持 HTML5 文件拖放，改用 Tauri 原生拖放事件读路径再读字节
  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const [{ getCurrentWebview }, { readFile }] = await Promise.all([
          import('@tauri-apps/api/webview'),
          import('@tauri-apps/plugin-fs'),
        ]);
        dispose = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return;
          const paths = event.payload.paths.filter((p) => IMAGE_EXT.test(p));
          if (paths.length === 0) return;
          const files: File[] = [];
          for (const path of paths) {
            const bytes = await readFile(path);
            const name = path.split(/[/\\]/).pop() ?? 'image';
            files.push(new File([bytes as BlobPart], name, { type: mimeOf(name) }));
          }
          if (files.length > 0) await addFiles(files);
        });
        if (cancelled) dispose?.();
      } catch (err) {
        notify(err instanceof Error ? err.message : '桌面拖拽初始化失败', 'error');
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [addFiles, notify]);

  const removePhoto = (id: string) => {
    // 三处缓存都按 photo.id 归档，删图时一起释放，长会话反复增删不会残留整张画布
    releasePreviewCache(id);
    releaseBaseCache(id);
    dropStats(id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setActiveId((current) => {
      if (current !== id) return current;
      const rest = photos.filter((p) => p.id !== id);
      return rest[0]?.id ?? null;
    });
    const nextEdits = { ...editsRef.current };
    delete nextEdits[id];
    applyEdits(nextEdits);
    setAutoApplied((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    notify('已从列表移除（原文件未删除）');
  };

  const resetAll = () => {
    if (!photo) return;
    pushHistory('reset-all');
    applyEdits({ ...editsRef.current, [photo.id]: DEFAULT_EDIT });
    setAutoApplied((prev) => {
      const next = { ...prev };
      delete next[photo.id];
      return next;
    });
    notify(`已重置这张图的全部编辑（${modLabel}Z 可撤销）`);
  };

  const applyCrop = (rect: NormalizedRect | null) => {
    if (!photo) return;
    if (!rect) {
      updateEdit({ crop: null });
      setTool('adjust');
      return;
    }
    const base = currentCrop(photo, edit);
    const x = Math.round(base.x + rect.x * base.w);
    const y = Math.round(base.y + rect.y * base.h);
    const w = Math.max(1, Math.round(rect.w * base.w));
    const h = Math.max(1, Math.round(rect.h * base.h));
    updateEdit({
      crop: {
        x: Math.min(x, base.x + base.w - 1),
        y: Math.min(y, base.y + base.h - 1),
        w: Math.min(w, base.x + base.w - x),
        h: Math.min(h, base.y + base.h - y),
      },
    });
    setTool('adjust');
  };

  const rotate = (delta: 90 | -90) => {
    if (!photo) return;
    const current = editsRef.current[photo.id] ?? DEFAULT_EDIT;
    const next = (((current.rotation + delta) % 360) + 360) % 360;
    pushHistory(`rotate-${next}`);
    applyEdits({ ...editsRef.current, [photo.id]: { ...current, rotation: next as Edit['rotation'], crop: null } });
  };

  const buildExport = async (target: Photo, targetEdit: Edit, out: OutputSettings = output) => {
    const maxSide = outputMaxSide(currentCrop(target, targetEdit), out);
    const result = renderPhoto(target, targetEdit, maxSide ?? undefined);
    const type =
      out.format === 'png' ? 'image/png' : out.format === 'webp' ? 'image/webp' : 'image/jpeg';
    let blob = await canvasToBlob(result.canvas, type, out.format === 'png' ? undefined : out.quality);
    if (out.format === 'jpeg' && out.keepExif && target.exif) {
      blob = await attachExif(blob, target.exif, { width: result.canvas.width, height: result.canvas.height });
    }
    return blob;
  };

  const exportOne = async (target: Photo, targetEdit: Edit, prefix?: string) => {
    const blob = await buildExport(target, targetEdit);
    const name = `${prefix ?? ''}${exportName(target.name, output.format)}`;
    const saved = await saveBlob(blob, name, extOf(output.format));
    if (!saved) notify('已取消保存');
    return saved;
  };

  const handleExport = async () => {
    if (!photo || busy) return;
    const started = performance.now();
    const task = busyBegin('正在导出当前图片…');
    try {
      const saved = await exportOne(photo, edit);
      if (saved) notify(`已导出 ${exportName(photo.name, output.format)}（用时 ${secondsSince(started)}）`);
    } catch (err) {
      notify(err instanceof Error ? err.message : '导出失败', 'error');
    } finally {
      busyEnd(task);
    }
  };

  const handleBatchExport = async () => {
    if (photos.length === 0 || busy) return;
    const started = performance.now();
    const task = busyBegin(`正在批量导出 0 / ${photos.length}…`);
    try {
      const files: Record<string, Uint8Array> = {};
      const failed: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const target = photos[i];
        busySet(task, `正在批量导出 ${i + 1} / ${photos.length}…`, (i / photos.length) * 100);
        try {
          const blob = await buildExport(target, edits[target.id] ?? DEFAULT_EDIT);
          const name = `${String(i + 1).padStart(3, '0')}-${exportName(target.name, output.format)}`;
          files[name] = new Uint8Array(await blob.arrayBuffer());
        } catch (err) {
          failed.push(`${shortName(target.name)}：${err instanceof Error ? err.message : String(err)}`);
        }
        busySet(task, `正在批量导出 ${i + 1} / ${photos.length}…`, ((i + 1) / photos.length) * 100);
        await new Promise((r) => setTimeout(r, 0));
      }
      const done = photos.length - failed.length;
      if (done > 0) {
        busySet(task, '正在打包 ZIP…', 100);
        const zipped = zipSync(files, { level: 0 });
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const saved = await saveBlob(new Blob([zipped], { type: 'application/zip' }), `${brand.exportPrefix}-${stamp}.zip`, 'zip');
        if (!saved) notify('已取消保存');
        else if (failed.length > 0) notify(`批量导出完成：成功 ${done} 张，失败 ${failed.length} 张（${failed[0]}${failed.length > 1 ? ' 等' : ''}）`, 'error');
        else notify(`批量导出完成：${done} 张，已打包为 ZIP（用时 ${secondsSince(started)}）`);
      } else {
        notify(`批量导出失败：${failed[0] ?? '没有可导出的图片'}`, 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '批量导出失败', 'error');
    } finally {
      busyEnd(task);
    }
  };

  const runBatch = async () => {
    if (photos.length === 0 || busy) return;
    batchCancelRef.current = false;
    const started = performance.now();
    const task = busyBegin(`正在批处理 0 / ${photos.length}…`);
    const out: OutputSettings = batch.resize ? { ...output, sizeMode: 'long', longSide: batch.longEdge } : output;
    const files: Record<string, Uint8Array> = {};
    const failed: { name: string; reason: string }[] = [];
    let ok = 0;
    let cancelled = false;
    setBatchReport(null);
    try {
      for (let i = 0; i < photos.length; i++) {
        if (batchCancelRef.current) {
          cancelled = true;
          break;
        }
        const target = photos[i];
        setBatchDone(i);
        busySet(task, `正在批处理 ${i + 1} / ${photos.length}：${shortName(target.name)}`, (i / photos.length) * 100);
        try {
          let targetEdit = editsRef.current[target.id] ?? DEFAULT_EDIT;
          if (batch.auto) {
            const { recipe } = buildRecipe(statsFor(target), batch.strength / 100);
            targetEdit = { ...targetEdit, ...recipeToEdit(recipe) };
          }
          const blob = await buildExport(target, targetEdit, out);
          const name = `${String(i + 1).padStart(3, '0')}-${exportName(target.name, out.format)}`;
          files[name] = new Uint8Array(await blob.arrayBuffer());
          ok++;
        } catch (err) {
          failed.push({ name: shortName(target.name), reason: err instanceof Error ? err.message : String(err) });
        }
        setBatchDone(i + 1);
        busySet(task, `正在批处理 ${i + 1} / ${photos.length}：${shortName(target.name)}`, ((i + 1) / photos.length) * 100);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (ok > 0) {
        busySet(task, '正在打包 ZIP…', 100);
        const zipped = zipSync(files, { level: 0 });
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        await saveBlob(new Blob([zipped], { type: 'application/zip' }), `${brand.exportPrefix}-batch-${stamp}.zip`, 'zip');
      }
    } catch (err) {
      failed.push({ name: 'ZIP', reason: err instanceof Error ? err.message : String(err) });
    } finally {
      busyEnd(task);
      setBatchDone(0);
    }
    const report: BatchReport = { ok, failed, total: photos.length, ms: Math.round(performance.now() - started), cancelled };
    setBatchReport(report);
    if (failed.length > 0) {
      notify(`批处理完成：成功 ${ok} 张，失败 ${failed.length} 张（详见批处理面板）`, 'error');
    } else if (cancelled) {
      notify(`批处理已取消：已完成 ${ok} 张`);
    } else if (ok > 0) {
      notify(`批处理完成：${ok} 张，已打包为 ZIP（用时 ${secondsSince(started)}）`);
    }
  };

  const toggleFullscreen = useCallback(() => {
    if (!photo) return;
    const next = !fullscreen;
    setFullscreen(next);
    notify(next ? '已进入全屏预览：S 或 Esc 退出' : '已退出全屏预览');
  }, [photo, fullscreen, notify]);

  /** 键盘切换图片：按胶片栏顺序循环。 */
  const stepPhoto = useCallback(
    (dir: 1 | -1) => {
      if (photos.length === 0) {
        notify('还没有导入图片');
        return;
      }
      if (photos.length === 1) {
        notify('只有一张图片，无需切换');
        return;
      }
      const index = Math.max(0, photos.findIndex((p) => p.id === activeId));
      const nextIndex = (index + dir + photos.length) % photos.length;
      const next = photos[nextIndex];
      if (!next || next.id === activeId) return;
      setActiveId(next.id);
      notify(`已切换到 ${nextIndex + 1} / ${photos.length}：${next.name}`);
    },
    [photos, activeId, notify],
  );

  // 快捷键：数字键切工具、方括号切图、\ 对比原图、? 说明面板、缩放（画布内），其余为文件/历史。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 只有会接收字符输入的控件才算"正在输入"；复选框/单选/开关上的按键仍走全局快捷键
      const inputType = el instanceof HTMLInputElement ? el.type : '';
      const typing = Boolean(
        el &&
          (el.tagName === 'TEXTAREA' ||
            el.isContentEditable ||
            (el.tagName === 'INPUT' &&
              inputType !== 'range' &&
              inputType !== 'checkbox' &&
              inputType !== 'radio' &&
              inputType !== 'color' &&
              inputType !== 'file' &&
              inputType !== 'button')),
      );

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (showShortcuts) {
          if (e.key === 'Escape' || e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            setShowShortcuts(false);
          }
          return;
        }
        if (e.key === 'Escape') {
          // 裁剪模式下先让画布用 Esc 取消裁剪，再按一次才退出全屏
          if (fullscreen && tool !== 'crop') {
            e.preventDefault();
            setFullscreen(false);
            notify('已退出全屏预览');
          }
          return;
        }
        if (!typing && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
          e.preventDefault();
          setShowShortcuts(true);
          return;
        }
        if (typing) return;
        if (photo && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          toggleFullscreen();
          return;
        }
        if (photo && e.key === '\\') {
          e.preventDefault();
          setShowOriginal(true);
          return;
        }
        if (e.key === '[' || e.key === ']') {
          e.preventDefault();
          stepPhoto(e.key === ']' ? 1 : -1);
          return;
        }
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          if (!photo) notify('先导入图片再切换工具');
          else {
            setTool('batch');
            notify('已切换到「流水线」');
          }
          return;
        }
        if (/^[0-9]$/.test(e.key)) {
          const index = e.key === '0' ? 9 : Number(e.key) - 1;
          const target = TOOLS[index];
          if (target) {
            e.preventDefault();
            if (!photo) notify('先导入图片再切换工具');
            else if (target.id === tool) notify(`已在「${target.label}」面板`);
            else {
              setTool(target.id);
              notify(`已切换到「${target.label}」`);
              // 键盘切换工具后把焦点送进新面板，Tab 次数从 5 次降到 0，方向键即可调参。
              // 只挑滑杆/按钮，避免落到复选框或数值框上把后续快捷键当成文本输入吞掉。
              window.requestAnimationFrame(() => {
                panelRef.current
                  ?.querySelector<HTMLElement>('input[type="range"], button, summary')
                  ?.focus();
              });
            }
          }
          return;
        }
        return;
      }

      const key = e.key.toLowerCase();

      // 导出 / 打开即使焦点在输入框也接管，避免浏览器弹出「保存网页」
      if (key === 's') {
        e.preventDefault();
        void handleExport();
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        inputRef.current?.click();
        return;
      }

      if (typing) return;

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') setShowOriginal(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, redo, handleExport, fullscreen, tool, photo, notify, toggleFullscreen, stepPhoto, showShortcuts]);

  const exportRecipeFile = async () => {
    if (!photo) return;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const saved = await saveBlob(
      new Blob([recipeText(edit)], { type: 'application/json' }),
      `${brand.exportPrefix}-recipe-${stamp}.json`,
      'json',
    );
    if (saved) notify('配方已导出：含色彩、映射与质感参数（不含裁剪、水印、画幅）');
  };

  const importRecipeFile = async (file: File) => {
    if (!photo) return;
    const parsed = parseRecipe(await file.text());
    if (!parsed.ok) {
      notify(`载入配方失败：${parsed.error}`);
      return;
    }
    updateEdit(parsed.edit, 'recipe-import');
    notify(`已载入配方：${parsed.summary}`);
  };

  const applyAll = () => {
    pushHistory('apply-all');
    const next = { ...editsRef.current };
    for (const p of photos) {
      next[p.id] = {
        ...(next[p.id] ?? DEFAULT_EDIT),
        exposure: edit.exposure,
        contrast: edit.contrast,
        fillLight: edit.fillLight,
        darken: edit.darken,
        saturation: edit.saturation,
        vibrance: edit.vibrance,
        temperature: edit.temperature,
        tint: edit.tint,
        preset: edit.preset,
        presetStrength: edit.presetStrength,
        levels: edit.levels,
        curve: edit.curve,
      };
    }
    applyEdits(next);
    notify('调色参数已应用到全部图片（裁剪与旋转不受影响）');
  };

  const applyFillLightAll = () => {
    pushHistory('fill-light-all');
    const next = { ...editsRef.current };
    for (const p of photos) {
      next[p.id] = { ...(next[p.id] ?? DEFAULT_EDIT), fillLight: edit.fillLight };
    }
    applyEdits(next);
    notify(`暗部提亮 ${edit.fillLight} 已应用到全部 ${photos.length} 张图片`);
  };

  const applyWatermarkAll = () => {
    pushHistory('watermark-all');
    const next = { ...editsRef.current };
    for (const p of photos) {
      next[p.id] = {
        ...(next[p.id] ?? DEFAULT_EDIT),
        watermark: { ...edit.watermark },
        imageMark: { ...edit.imageMark },
      };
    }
    applyEdits(next);
    notify('文字与图片水印设置已应用到全部图片');
  };

  const appVersion = `v${pkg.version}`;
  const crop = photo ? currentCrop(photo, edit) : null;
  const exporting = Boolean(busy?.startsWith('正在导出'));
  const batchExporting = Boolean(busy?.startsWith('正在批量导出') || busy === '正在打包 ZIP…');
  const importing = Boolean(busy?.startsWith('正在导入'));
  const batchOutputSummary = `${output.format === 'jpeg' ? 'JPG' : output.format === 'png' ? 'PNG' : 'WebP'}${
    output.format === 'png' ? '' : ` · 质量 ${Math.round(output.quality * 100)}`
  } · ${
    output.sizeMode === 'original'
      ? '原尺寸'
      : output.sizeMode === 'long'
        ? `长边 ${output.longSide}px`
        : `${output.percent}%`
  }`;

  return (
    <div
      className={`app${fullscreen ? ' is-fullscreen' : ''}`}
      aria-busy={Boolean(busy)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#151f24" />
            <path d="M16 6.5 24.5 23h-17Z" fill="none" stroke="#5ec9b0" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="16" cy="26" r="1.6" fill="#eaf4ef" />
          </svg>
          <span className="brand-text">
            {brand.displayName}
            <small>{brand.tagline}</small>
          </span>
        </div>

        <div className="topbar-group">
          <button
            className="btn"
            type="button"
            onClick={() => inputRef.current?.click()}
            title={`打开图片（${modLabel}O）`}
            aria-keyshortcuts="Meta+O Control+O"
          >
            <IconOpen size={17} /> 打开图片
          </button>

          <span className="topbar-sep" aria-hidden />

          <button
            className="btn icon-only"
            type="button"
            title={`撤销（${modLabel}Z）`}
            aria-label="撤销"
            aria-keyshortcuts="Meta+Z Control+Z"
            disabled={!canUndo}
            onClick={undo}
          >
            <IconUndo size={17} />
          </button>
          <button
            className="btn icon-only"
            type="button"
            title={`重做（⇧${modLabel}Z）`}
            aria-label="重做"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
            disabled={!canRedo}
            onClick={redo}
          >
            <IconRedo size={17} />
          </button>

          <span className="topbar-sep" aria-hidden />

          <button
            className="btn icon-only"
            type="button"
            title={photo ? '向左旋转 90°' : '先导入图片'}
            aria-label="向左旋转 90°"
            disabled={!photo}
            onClick={() => rotate(-90)}
          >
            <IconRotateLeft size={17} />
          </button>
          <button
            className="btn icon-only"
            type="button"
            title={photo ? '向右旋转 90°' : '先导入图片'}
            aria-label="向右旋转 90°"
            disabled={!photo}
            onClick={() => rotate(90)}
          >
            <IconRotateRight size={17} />
          </button>
          <button
            className="btn icon-only"
            type="button"
            title={photo ? '水平翻转' : '先导入图片'}
            aria-label="水平翻转"
            disabled={!photo}
            onClick={() => updateEdit({ flipH: !edit.flipH, crop: null })}
          >
            <IconFlip size={17} />
          </button>
          <button
            className="btn icon-only"
            type="button"
            title={photo ? (fullscreen ? '退出全屏预览（S / Esc）' : '全屏预览（S）') : '先导入图片'}
            aria-label={fullscreen ? '退出全屏预览' : '全屏预览'}
            aria-pressed={fullscreen}
            disabled={!photo}
            onClick={toggleFullscreen}
          >
            <IconFullscreen size={17} />
          </button>
          <button
            className="btn icon-only"
            type="button"
            title={photo ? '重置这张图的全部编辑（可撤销）' : '先导入图片'}
            aria-label="重置全部编辑"
            disabled={!photo}
            onClick={resetAll}
          >
            <IconReset size={17} />
          </button>
          <button
            className="btn icon-only shortcut-open"
            type="button"
            title="快捷键说明（?）"
            aria-label="快捷键说明"
            aria-keyshortcuts="? Shift+/"
            onClick={() => setShowShortcuts(true)}
          >
            ?
          </button>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-group">
          <button
            className="btn"
            type="button"
            disabled={!photo || Boolean(busy)}
            onClick={() => void handleBatchExport()}
            title="把全部图片按当前导出设置打包成 ZIP"
          >
            {batchExporting ? <span className="spinner" aria-hidden /> : <IconBatch size={17} />}
            {batchExporting ? '导出中…' : '批量导出'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!photo || Boolean(busy)}
            onClick={() => void handleExport()}
            title={`导出当前图片（${modLabel}S）`}
            aria-keyshortcuts="Meta+S Control+S"
          >
            {exporting ? <span className="spinner" aria-hidden /> : <IconExport size={17} />}
            {exporting ? '导出中…' : '导出'}
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="library" aria-label="工具与图库">
          <div className="library-block">
            <div className="library-head">
              <h2>工具</h2>
              <span>1–9 / 0 / B</span>
            </div>
            <div className="tool-grid" role="toolbar" aria-label="工具">
              {TOOLS.map((t, i) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tool-tile${tool === t.id ? ' is-active' : ''}`}
                    disabled={!photo}
                    aria-pressed={tool === t.id}
                    aria-keyshortcuts={i === 9 ? '0' : i === 10 ? 'B' : String(i + 1)}
                    title={`${t.label}（${i === 9 ? '0' : i === 10 ? 'B' : i + 1}）`}
                    onClick={() => setTool(t.id)}
                  >
                    <Icon size={19} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="library-block library-gallery">
            <div className="library-head">
              <h2>图库</h2>
              <span>{photos.length} 张</span>
            </div>
            <div className="film-list">
              {photos.map((p) => (
                <div key={p.id} className={`film-item${p.id === activeId ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="film-thumb"
                    onClick={() => setActiveId(p.id)}
                    title={p.name}
                    aria-label={`切换到 ${p.name}`}
                    aria-pressed={p.id === activeId}
                  >
                    <img src={p.thumb} alt={p.name} />
                  </button>
                  <span className="film-name" title={p.name}>
                    {p.name}
                  </span>
                  <button
                    type="button"
                    className="film-remove"
                    title="从列表移除（不删除原文件）"
                    aria-label={`从列表移除 ${p.name}`}
                    onClick={() => removePhoto(p.id)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
              {importing && (
                <div className="film-loading" aria-hidden>
                  <span className="spinner" />
                </div>
              )}
              <button
                type="button"
                className="film-add"
                title="添加图片"
                aria-label="添加图片"
                onClick={() => inputRef.current?.click()}
              >
                <IconPlus size={15} /> 添加图片
              </button>
            </div>
          </div>
        </aside>

        <CanvasStage
          preview={preview}
          original={originalPreview}
          showOriginal={showOriginal}
          cropMode={tool === 'crop'}
          localMode={tool === 'local' && edit.local.enabled}
          local={{ cx: edit.local.cx, cy: edit.local.cy, radius: edit.local.radius }}
          onPickLocal={(cx, cy) => updateEdit({ local: { ...edit.local, cx, cy } })}
          fileName={photo?.name}
          onPickFiles={() => inputRef.current?.click()}
          onApplyCrop={applyCrop}
          onExitCrop={() => setTool('adjust')}
          resetViewKey={fullscreen ? 1 : 0}
        />

        <aside className="panel" ref={panelRef}>
          <div className="panel-head">
            <h2>{TOOLS.find((t) => t.id === tool)?.label}</h2>
            {photo && (
              <span className="panel-meta">
                {crop?.w} × {crop?.h}
              </span>
            )}
          </div>

          {!photo && (
            <div className="panel-empty">
              <IconOpen size={28} />
              <p className="panel-empty-title">还没有打开图片</p>
              <p className="field-hint">
                导入后这里显示「{TOOLS.find((t) => t.id === tool)?.label}」参数；拖进窗口或点顶栏「打开图片」即可开始。
              </p>
            </div>
          )}

          {photo && tool === 'auto' && (
            <AutoPanel
              preview={autoPreview}
              applied={autoEntry?.result ?? null}
              appliedFrom={autoEntry?.undo ?? null}
              strength={autoStrength}
              edit={edit}
              tiers={quickTiers}
              onStrength={changeAutoStrength}
              onApply={() => runAuto(autoStrength, false)}
              onAutoExposure={runAutoExposure}
              onUndo={undoAuto}
              onApplyAll={applyAutoAll}
              onQuick={runQuick}
              onFillLight={(value) => updateEdit({ fillLight: value })}
              onDarken={(value) => updateEdit({ darken: value })}
              onBlur={(value) => updateEdit({ blur: value })}
              onFillLightAll={applyFillLightAll}
              onExportRecipe={exportRecipeFile}
              onImportRecipe={() => recipeInputRef.current?.click()}
              photoCount={photos.length}
            />
          )}

          {photo && tool === 'adjust' && (
            <AdjustPanel
              edit={edit}
              onChange={updateEdit}
              onReset={() =>
                updateEdit({ exposure: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0 })
              }
              onApplyAll={applyAll}
              photoCount={photos.length}
            />
          )}

          {photo && tool === 'preset' && <PresetPanel photo={photo} edit={edit} onChange={updateEdit} />}

          {photo && tool === 'curve' && <CurvePanel photo={photo} edit={edit} onChange={updateEdit} />}

          {photo && tool === 'detail' && <DetailPanel edit={edit} onChange={updateEdit} />}

          {photo && tool === 'local' && <LocalPanel edit={edit} onChange={updateEdit} />}

          {photo && tool === 'watermark' && (
            <WatermarkPanel
              edit={edit}
              onChange={updateEdit}
              onApplyAll={applyWatermarkAll}
              photoCount={photos.length}
              onNotify={notify}
            />
          )}

          {photo && tool === 'layout' && <LayoutPanel edit={edit} onChange={updateEdit} />}

          {photo && crop && tool === 'output' && (
            <OutputPanel
              photo={photo}
              crop={crop}
              edit={edit}
              settings={output}
              onChange={(patch) => setOutput((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {photo && tool === 'batch' && (
            <BatchPanel
              options={batch}
              onChange={(patch) => setBatch((prev) => ({ ...prev, ...patch }))}
              photoCount={photos.length}
              outputSummary={batchOutputSummary}
              running={Boolean(busy?.startsWith('正在批处理'))}
              done={batchDone}
              onRun={runBatch}
              onCancel={() => {
                batchCancelRef.current = true;
              }}
              report={batchReport}
            />
          )}

          {photo && tool === 'crop' && (
            <div className="panel-body">
              <p className="panel-desc">在画布上拖出保留区域，四角可微调，回车应用。</p>
              <ul className="tips">
                <li>拖动选区内部可整体移动</li>
                <li>裁剪可反复进行，每次都在当前结果上继续</li>
                <li>需要恢复整图时点下面的「还原为整图」</li>
              </ul>
              <div className="panel-actions">
                <button className="btn" type="button" onClick={() => applyCrop(null)}>
                  <IconReset size={16} /> 还原为整图
                </button>
              </div>
            </div>
          )}

          {photo && (
            <div className="panel-foot">
              <button
                className="btn ghost"
                type="button"
                title="按住或聚焦时显示原图，松开还原（对比用）"
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
                onPointerLeave={() => setShowOriginal(false)}
                onFocus={() => setShowOriginal(true)}
                onBlur={() => setShowOriginal(false)}
              >
                按住查看原图
              </button>
              <button className="btn ghost" type="button" onClick={resetAll} title={`重置这张图的全部编辑（${modLabel}Z 可撤销）`}>
                <IconReset size={15} /> 重置全部编辑
              </button>
            </div>
          )}
        </aside>
      </div>

      {fullscreen && photo && (
        <div className="fullscreen-bar">
          <span className="fullscreen-title">
            {photo.name} · {crop?.w} × {crop?.h}
          </span>
          <span className="fullscreen-hint">S / Esc 退出</span>
          <button className="btn" type="button" onClick={toggleFullscreen}>
            <IconFullscreen size={16} /> 退出全屏
          </button>
        </div>
      )}

      <footer className="statusbar">
        <span className="status-brand">
          {brand.displayName} {appVersion}
        </span>
        <span className="status-sep" aria-hidden />
        <span className="status-item">{photos.length} 张</span>
        {photo && (
          <>
            <span className="status-sep" aria-hidden />
            <span className="status-item">
              {crop?.w} × {crop?.h} · {photo.width} × {photo.height} · {formatBytes(photo.size)}
            </span>
            {edit.rotation !== 0 && <span className="status-item">旋转 {edit.rotation}°</span>}
          </>
        )}
        {!photo && <span className="status-item">还没有图片，拖进来或点顶栏「打开图片」开始</span>}
        <span className="status-hint">
          {PRESETS.find((p) => p.id === edit.preset)?.name ?? '直出'} · 拖入图片可继续添加 · 按 ? 查看快捷键
        </span>
      </footer>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <input
        ref={recipeInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importRecipeFile(file);
          e.target.value = '';
        }}
      />

      {showShortcuts && (
        <div
          className="shortcut-backdrop"
          role="presentation"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setShowShortcuts(false);
          }}
        >
          <div className="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" ref={shortcutDialogRef}>
            <div className="shortcut-head">
              <h2 id="shortcut-title">键盘快捷键</h2>
              <button
                className="btn icon-only"
                type="button"
                aria-label="关闭快捷键说明"
                onClick={() => setShowShortcuts(false)}
              >
                ×
              </button>
            </div>
            <div className="shortcut-grid">
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.title} className="shortcut-group">
                  <h3>{group.title}</h3>
                  <dl>
                    {group.items.map((item) => (
                      <div key={item.desc} className="shortcut-row">
                        <dt>
                          {item.keys.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </dt>
                        <dd>{item.desc}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <p className="shortcut-foot">按 ? 或 Esc 关闭；输入框内保留系统原生编辑快捷键。</p>
          </div>
        </div>
      )}

      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <span className="spinner" aria-hidden /> {busy}
          {busyState?.progress != null && (
            <span className="busy-track" aria-hidden>
              <span className="busy-fill" style={{ width: `${Math.max(2, Math.round(busyState.progress))}%` }} />
            </span>
          )}
        </div>
      )}
      {toast && (
        <div
          className={`toast${toast.tone === 'error' ? ' is-error' : ''}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
