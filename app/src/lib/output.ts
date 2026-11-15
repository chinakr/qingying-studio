import type { CropRect } from './editor';
import type { ExportFormat } from './render';

export interface OutputSettings {
  format: ExportFormat;
  quality: number;
  sizeMode: 'original' | 'long' | 'percent';
  longSide: number;
  percent: number;
  keepExif: boolean;
}

export const DEFAULT_OUTPUT: OutputSettings = {
  format: 'jpeg',
  quality: 0.92,
  sizeMode: 'original',
  longSide: 1920,
  percent: 100,
  keepExif: true,
};

export function outputScale(crop: CropRect, settings: OutputSettings) {
  if (settings.sizeMode === 'long') return Math.min(1, settings.longSide / Math.max(crop.w, crop.h));
  if (settings.sizeMode === 'percent') return Math.min(1, settings.percent / 100);
  return 1;
}

export function outputDims(crop: CropRect, settings: OutputSettings) {
  const scale = outputScale(crop, settings);
  return {
    width: Math.max(1, Math.round(crop.w * scale)),
    height: Math.max(1, Math.round(crop.h * scale)),
  };
}

/** 传给 renderPhoto 的 maxSide：null 表示按原分辨率输出。 */
export function outputMaxSide(crop: CropRect, settings: OutputSettings) {
  const scale = outputScale(crop, settings);
  return scale < 1 ? Math.max(crop.w, crop.h) * scale : null;
}
