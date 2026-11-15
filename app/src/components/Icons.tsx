import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

/*
 * 图标语义约定（同一个动作全应用只用同一个图标）：
 * - 打开：文件夹                    - 显影：星芒
 * - 色彩：纵向推子                  - 质感：锐角 + 颗粒（不是星芒）
 * - 区域：虚线圆 + 靶心             - 画幅：双线框
 * - 输出：文件 + 下箭头             - 裁切：裁切角
 * - 旋转：环形箭头 + 小照片框（左/右）；还原：竖条 + 回退箭头（两者不再相似）
 * - 撤销/重做：弯箭头（左/右）
 */

export const IconOpen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5v8A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);

/** 图片水印：相框 + 山形 */
export const IconImage = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 16l5-5 4 4 3-3 6 6" />
    <circle cx="8" cy="8.5" r="1.3" />
  </svg>
);

export const IconAdjust = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" opacity="0.4" />
    <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="11" cy="17" r="2.2" fill="currentColor" stroke="none" />
  </svg>
);

/** 显影：与品牌标记同源的三角，内部实心一半表示“整组” */
export const IconAuto = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.8 20.2 18.6H3.8Z" />
    <path d="M12 11.6 16.2 18.6H7.8Z" fill="currentColor" stroke="none" opacity="0.9" />
  </svg>
);

export const IconPreset = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="11" height="11" rx="2" opacity="0.45" />
    <rect x="9.5" y="9.5" width="11" height="11" rx="2" fill="currentColor" fillOpacity="0.18" />
  </svg>
);

export const IconCurve = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h16M4 20V4" opacity="0.4" />
    <path d="M4 20C8 20 9 6 20 6V20Z" fill="currentColor" stroke="none" opacity="0.14" />
    <path d="M4 20C8 20 9 6 20 6" />
  </svg>
);

export const IconCrop = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 3v14h14M3 7h14v14" />
    <rect x="5.5" y="5.5" width="3" height="3" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);

/** 质感：锐角 + 颗粒，避免与「显影」的三角混用 */
export const IconDetail = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 16.5 8.5 7l5 9.5z" fill="currentColor" fillOpacity="0.14" />
    <circle cx="17" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="17" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconWatermark = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M8.5 8.5h7" opacity="0.45" />
    <path d="M6.5 15.5h11" strokeWidth="2.8" />
  </svg>
);

export const IconLocal = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" strokeDasharray="3 3" opacity="0.65" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconFrame = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <rect x="7.5" y="8.5" width="4.5" height="4.5" fill="currentColor" stroke="none" opacity="0.85" />
  </svg>
);

/** 输出：液体灌入托盘，表示“落到文件” */
export const IconOutput = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5v8M8.5 8 12 11.5 15.5 8" />
    <path d="M4.5 15.5h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z" fill="currentColor" stroke="none" opacity="0.28" />
    <path d="M4.5 15.5h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z" />
  </svg>
);

/** 旋转：环形箭头 + 画面框 */
export const IconRotateLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9a8 8 0 1 1 1.6 8" />
    <path d="M4 4v5h5" />
    <rect x="9.5" y="10" width="5" height="4" rx="0.8" opacity="0.6" />
  </svg>
);

export const IconRotateRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 9A8 8 0 1 0 18.4 17" />
    <path d="M20 4v5h-5" />
    <rect x="9.5" y="10" width="5" height="4" rx="0.8" opacity="0.6" />
  </svg>
);

export const IconFlip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v18" strokeDasharray="2 3" />
    <path d="M9 6 4 12l5 6zM15 6l5 6-5 6z" />
  </svg>
);

export const IconExport = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </svg>
);

/** 提亮：向上箭头 + 地平线，与压制形成一对 */
export const IconSunUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 19.5h16" opacity="0.4" />
    <path d="M12 15.5V4M8.2 7.8 12 4l3.8 3.8" />
    <circle cx="12" cy="19.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

/** 压制：向下箭头 + 地平线 */
export const IconSunDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4.5h16" opacity="0.4" />
    <path d="M12 8.5V20M8.2 16.2 12 20l3.8-3.8" />
    <circle cx="12" cy="4.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

/** 中性校准：水滴（色温/色调归中） */
export const IconDroplet = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5c3.4 4.2 5.4 7 5.4 9.6a5.4 5.4 0 0 1-10.8 0C6.6 10.5 8.6 7.7 12 3.5Z" />
    <path d="M9.6 14.4a2.6 2.6 0 0 0 2.5 2.5" opacity="0.55" />
  </svg>
);

/** 颗粒抑制：密集点阵，右上角一个被圈掉的噪点 */
export const IconGrain = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="5.5" r="1.1" fill="currentColor" stroke="none" opacity="0.5" />
    <circle cx="7" cy="12" r="1.1" fill="currentColor" stroke="none" opacity="0.5" />
    <circle cx="11" cy="11" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="17" r="1.1" fill="currentColor" stroke="none" opacity="0.5" />
    <circle cx="13" cy="16" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="7.5" r="3.2" strokeDasharray="2 2" opacity="0.7" />
  </svg>
);

export const IconBatch = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="8" width="12" height="12" rx="2" fill="currentColor" stroke="none" opacity="0.16" />
    <rect x="4" y="8" width="12" height="12" rx="2" />
    <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H18a2 2 0 0 1 2 2v8.5A1.5 1.5 0 0 1 18.5 16H16" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
);

/** 还原/重置：回到起点（与「撤销」「旋转」图形完全不同） */
export const IconReset = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.5 4.5v15" />
    <path d="M19.5 12H9" />
    <path d="M13 7.5 8.5 12l4.5 4.5" />
  </svg>
);

export const IconUndo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 9h9a4.5 4.5 0 0 1 0 9H8" />
    <path d="M8 5 4 9l4 4" />
  </svg>
);

export const IconRedo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19.5 9h-9a4.5 4.5 0 0 0 0 9H16" />
    <path d="M16 5l4 4-4 4" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 全屏：四角向外（进入/退出共用，按钮文案区分状态） */
export const IconFullscreen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const IconChevron = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9.5 12 15.5 18 9.5" />
  </svg>
);
