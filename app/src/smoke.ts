import { DEFAULT_EDIT } from './lib/editor';
import { loadPhoto } from './lib/load';
import { isTauri } from './lib/platform';
import { canvasToBlob, renderPhoto } from './lib/render';

const mean = (canvas: HTMLCanvasElement) => {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 40) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return Math.round(sum / n);
};

let ran = false;

/** 桌面壳冒烟测试：生成图片 → 导入 → 调色/锐化/水印 → 导出，结果写回 Rust 日志。 */
export async function runSmoke() {
  if (ran) return;
  ran = true;
  const lines: string[] = [];
  let ok = false;
  try {
    const src = document.createElement('canvas');
    src.width = 1200;
    src.height = 800;
    const ctx = src.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 1200, 800);
    grad.addColorStop(0, '#1b2733');
    grad.addColorStop(1, '#d8a244');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 96px -apple-system, sans-serif';
    ctx.fillText('SMOKE', 80, 170);
    const blob = await new Promise<Blob>((resolve) => src.toBlob((b) => resolve(b!), 'image/jpeg', 0.92));
    const file = new File([blob], 'smoke.jpg', { type: 'image/jpeg' });

    const photo = await loadPhoto(file);
    const base = renderPhoto(photo, DEFAULT_EDIT, 1600).canvas;
    const edit = {
      ...DEFAULT_EDIT,
      exposure: 1,
      saturation: 25,
      sharpen: 40,
      fillLight: 55,
      watermark: { ...DEFAULT_EDIT.watermark, enabled: true, text: 'SMOKE' },
    };
    const out = renderPhoto(photo, edit, 1600).canvas;
    // 亮部压制 + 柔焦走一遍独立管线，验证亮部选区与柔化在桌面端也能正常执行
    const quick = renderPhoto(photo, { ...DEFAULT_EDIT, darken: 55, blur: 30 }, 1600).canvas;
    const png = await canvasToBlob(out, 'image/png');
    const jpg = await canvasToBlob(out, 'image/jpeg', 0.92);
    const before = mean(base);
    const after = mean(out);
    // 暗部提亮：固定"原图暗部"选区比较，避免抬亮后像素离开暗部导致数字失真
    const darkLift = (() => {
      const g0 = base.getContext('2d')!.getImageData(0, 0, base.width, base.height).data;
      const g1 = out.getContext('2d')!.getImageData(0, 0, out.width, out.height).data;
      let s0 = 0;
      let s1 = 0;
      let n = 0;
      for (let i = 0; i < g0.length; i += 4) {
        const y0 = 0.2126 * g0[i] + 0.7152 * g0[i + 1] + 0.0722 * g0[i + 2];
        if (y0 < 64) {
          s0 += y0;
          s1 += 0.2126 * g1[i] + 0.7152 * g1[i + 1] + 0.0722 * g1[i + 2];
          n++;
        }
      }
      return n ? Math.round(s1 / n - s0 / n) : 0;
    })();
    const highlightDrop = (() => {
      const g0 = base.getContext('2d')!.getImageData(0, 0, base.width, base.height).data;
      const g1 = quick.getContext('2d')!.getImageData(0, 0, quick.width, quick.height).data;
      let s0 = 0;
      let s1 = 0;
      let n = 0;
      for (let i = 0; i < g0.length; i += 4) {
        const y0 = 0.2126 * g0[i] + 0.7152 * g0[i + 1] + 0.0722 * g0[i + 2];
        if (y0 > 160) {
          s0 += y0;
          s1 += 0.2126 * g1[i] + 0.7152 * g1[i + 1] + 0.0722 * g1[i + 2];
          n++;
        }
      }
      return n ? Math.round(s0 / n - s1 / n) : 0;
    })();
    const edge = (canvas: HTMLCanvasElement) => {
      const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let n = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width - 2; x += 2) {
          const i = (y * canvas.width + x) * 4;
          const j = i + 8;
          const a = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          const b = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
          sum += Math.abs(a - b);
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const edgeBase = edge(base);
    const edgeBlur = edge(quick);
    ok =
      photo.width === 1200 &&
      photo.height === 800 &&
      after > before &&
      darkLift > 8 &&
      highlightDrop > 5 &&
      edgeBlur < edgeBase &&
      png.size > 1000 &&
      jpg.size > 1000;
    lines.push(
      `TAURI=${isTauri()}`,
      `LOAD=${photo.width}x${photo.height}`,
      `MEAN=${before}->${after}`,
      `FILL=darkR+${darkLift}`,
      `QUICK=hi-${highlightDrop}`,
      `EDGE=${edgeBase.toFixed(2)}->${edgeBlur.toFixed(2)}`,
      `PNG=${png.size}B`,
      `JPG=${jpg.size}B`,
    );

    if (isTauri()) {
      // 走 fs 插件实际落盘，验证桌面端写文件权限与产物尺寸
      const [{ writeFile }, path] = await Promise.all([
        import('@tauri-apps/plugin-fs'),
        import('@tauri-apps/api/path'),
      ]);
      const dir = await path.tempDir();
      const pngPath = await path.join(dir, 'tf-smoke.png');
      const jpgPath = await path.join(dir, 'tf-smoke.jpg');
      await writeFile(pngPath, new Uint8Array(await png.arrayBuffer()));
      await writeFile(jpgPath, new Uint8Array(await jpg.arrayBuffer()));
      lines.push(`WROTE=${pngPath}`, `WROTE=${jpgPath}`);
    }
  } catch (err) {
    lines.push(`ERROR=${err instanceof Error ? err.message : String(err)}`);
  }

  const report = `${ok ? 'PASS' : 'FAIL'} | ${lines.join(' | ')}`;
  console.log('[smoke]', report);
  const bar = document.createElement('div');
  bar.textContent = report;
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px 12px;background:#0b0f14;font:12px/1.5 monospace;border-top:1px solid #2a3340;color:' +
    (ok ? '#7bd88f' : '#ff8080');
  document.body.appendChild(bar);

  if (isTauri()) {
    const api = await import('@tauri-apps/api/core');
    await api.invoke('smoke_report', { payload: report }).catch(() => {});
  }
}
