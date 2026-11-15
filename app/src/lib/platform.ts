import { downloadBlob } from './render';
import type { ExportFormat } from './render';

/** 是否运行在 Tauri 桌面壳里（WebView 会注入 __TAURI_INTERNALS__）。 */
export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;

/** 快捷键修饰键的显示文案（macOS 用 ⌘，其它平台用 Ctrl） */
export const modLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function extOf(format: ExportFormat) {
  return format === 'jpeg' ? 'jpg' : format;
}

export function mimeOf(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

/**
 * 保存文件：Web 端走浏览器下载；桌面端（WKWebView 不支持 blob 下载）弹系统保存框并写盘。
 * 返回 false 表示用户在保存框里点了取消。
 */
export async function saveBlob(blob: Blob, name: string, ext: string): Promise<boolean> {
  if (!isTauri()) {
    downloadBlob(blob, name);
    return true;
  }
  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const path = await save({
    defaultPath: name,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
}
