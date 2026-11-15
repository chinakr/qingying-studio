import type { FontFamily, Watermark } from './editor';

const MARGIN_RATIO = 0.025;

/** 只用系统自带字体，导出与预览走同一套字体栈；换字体族会真实改变字形宽度与观感。 */
export const FONT_FAMILIES: { id: FontFamily; name: string; stack: string }[] = [
  {
    id: 'sans',
    name: '无衬线',
    stack: '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  { id: 'song', name: '宋体', stack: '"Songti SC", "STSong", "SimSun", serif' },
  { id: 'kai', name: '楷体', stack: '"Kaiti SC", "STKaiti", "KaiTi", serif' },
  { id: 'mono', name: '等宽', stack: '"SF Mono", Menlo, Consolas, "Courier New", monospace' },
];

const stackOf = (id: FontFamily) => FONT_FAMILIES.find((f) => f.id === id)?.stack ?? FONT_FAMILIES[0].stack;

/**
 * 按输出画布的实际像素绘制水印，所以预览（缩小）与导出（原分辨率）位置比例一致。
 * 不做任何位图素材，纯文字绘制；支持多行（换行符）、粗斜体、字体族与对齐。
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wm: Watermark,
) {
  const lines = wm.text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!lines.length || width <= 0 || height <= 0) return;

  const short = Math.min(width, height);
  const fontSize = Math.max(8, (wm.size / 100) * short);
  const lineH = fontSize * 1.25;
  const angle = (wm.rotation * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, wm.opacity / 100));
  ctx.fillStyle = wm.color;
  ctx.font = `${wm.italic ? 'italic ' : ''}${wm.bold ? '700' : '400'} ${fontSize}px ${stackOf(wm.fontFamily)}`;
  ctx.textBaseline = 'middle';
  // 清晰度：贴一圈随字号缩放的暗边（浅色衣服/天空上也能看清），投影只留很窄的一层做分离，
  // 旧参数 0.16em 的模糊半径在 8% 字号下就是 30px 的灰雾，字边会被糊掉。
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.lineWidth = Math.max(1, fontSize * 0.026);
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = fontSize * 0.06;

  const drawLines = (dx: number, dy: number) => {
    lines.forEach((line, i) => {
      const y = dy + (i - (lines.length - 1) / 2) * lineH;
      // 描边不参与投影，否则暗边会再叠一层灰影
      ctx.shadowColor = 'transparent';
      ctx.strokeText(line, dx, y);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.fillText(line, dx, y);
    });
  };

  if (wm.tile) {
    const maxW = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const stepX = Math.max(fontSize * 2.6, maxW + fontSize * 2.2);
    const stepY = Math.max(fontSize * 3.2, lineH * lines.length + fontSize * 1.2);
    const radius = Math.hypot(width, height) / 2;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    for (let y = -radius; y <= radius; y += stepY) {
      for (let x = -radius; x <= radius; x += stepX) drawLines(x, y);
    }
    ctx.restore();
    return;
  }

  const margin = short * MARGIN_RATIO;
  const maxW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const vertical = wm.position[0];
  const horizontal = wm.position[1];

  let x: number;
  if (wm.align === 'left') {
    // 在选中的水平三分之一区域内靠左：左中贴左边距，中部从 1/2 起，右中从 2/3 起
    x = horizontal === 'l' ? margin : horizontal === 'c' ? width / 2 : (2 * width) / 3;
    ctx.textAlign = 'left';
  } else if (wm.align === 'right') {
    x = horizontal === 'l' ? width / 3 : horizontal === 'c' ? width / 2 : width - margin;
    ctx.textAlign = 'right';
  } else {
    // 居中（默认）：保持原有观感，整块文字以 9 宫格边缘为锚点居中
    x = horizontal === 'l' ? margin + maxW / 2 : horizontal === 'r' ? width - margin - maxW / 2 : width / 2;
    ctx.textAlign = 'center';
  }

  const y =
    vertical === 't'
      ? margin + fontSize / 2
      : vertical === 'b'
        ? height - margin - (lines.length - 1) * lineH - fontSize / 2
        : height / 2;

  ctx.translate(x, y);
  ctx.rotate(angle);
  drawLines(0, 0);
  ctx.restore();
}
