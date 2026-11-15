import type { CropRect, Photo, Edit } from '../lib/editor';
import { summarizeExif } from '../lib/exif';
import { DEFAULT_OUTPUT, outputDims, type OutputSettings } from '../lib/output';
import { IconReset } from './Icons';
import Slider from './Slider';

interface Props {
  photo: Photo;
  crop: CropRect;
  edit: Edit;
  settings: OutputSettings;
  onChange: (patch: Partial<OutputSettings>) => void;
}

const FORMATS: { id: OutputSettings['format']; label: string; hint: string }[] = [
  { id: 'jpeg', label: 'JPG', hint: '体积小，适合照片' },
  { id: 'png', label: 'PNG', hint: '无损，适合截图与图形' },
  { id: 'webp', label: 'WebP', hint: '同等观感体积更小' },
];

const SIZE_MODES: { id: OutputSettings['sizeMode']; label: string }[] = [
  { id: 'original', label: '原尺寸' },
  { id: 'long', label: '限制长边' },
  { id: 'percent', label: '按百分比' },
];

export default function OutputPanel({ photo, crop, edit, settings, onChange }: Props) {
  const dims = outputDims(crop, settings);
  const jpegLike = settings.format !== 'png';
  const exifSummary = photo.exif ? summarizeExif(photo.exif) : '';

  return (
    <div className="panel-body">
      <section className="panel-section">
        <h3>格式</h3>
        <div className="seg" role="group" aria-label="导出格式">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`seg-btn${settings.format === f.id ? ' is-active' : ''}`}
              title={f.hint}
              aria-pressed={settings.format === f.id}
              onClick={() => onChange({ format: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="field-hint">{FORMATS.find((f) => f.id === settings.format)?.hint}</p>

        {jpegLike && (
          <Slider
            id="out-quality"
            label="质量"
            value={Math.round(settings.quality * 100)}
            min={50}
            max={100}
            step={1}
            hint="数值越高体积越大，90 以上肉眼差异很小"
            resetTo={Math.round(DEFAULT_OUTPUT.quality * 100)}
            onChange={(value) => onChange({ quality: value / 100 })}
          />
        )}
      </section>

      <section className="panel-section">
        <h3>尺寸</h3>
        <div className="seg" role="group" aria-label="导出尺寸方式">
          {SIZE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`seg-btn${settings.sizeMode === m.id ? ' is-active' : ''}`}
              aria-pressed={settings.sizeMode === m.id}
              onClick={() => onChange({ sizeMode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {settings.sizeMode === 'long' && (
          <Slider
            id="out-long"
            label="长边像素"
            value={settings.longSide}
            min={480}
            max={6000}
            step={10}
            unit="px"
            resetTo={1920}
            onChange={(value) => onChange({ longSide: value })}
          />
        )}

        {settings.sizeMode === 'percent' && (
          <Slider
            id="out-percent"
            label="缩放比例"
            value={settings.percent}
            min={10}
            max={100}
            step={1}
            unit="%"
            resetTo={100}
            onChange={(value) => onChange({ percent: value })}
          />
        )}

        <div className="field-head">
          <span className="field-label">导出尺寸</span>
          <span className="field-value">
            {dims.width} × {dims.height}
          </span>
        </div>
        {edit.crop && <p className="field-hint">当前已裁切，按裁切后的范围计算。</p>}
      </section>

      {exifSummary && (
        <p className="exif-line">
          <span className="exif-label">拍摄信息</span>
          <span className="exif-value">
            {exifSummary}
            {` · GPS ${settings.keepExif ? '写入' : '不写入'}`}
          </span>
        </p>
      )}

      <label className="switch-row">
        <input
          type="checkbox"
          checked={settings.keepExif}
          disabled={settings.format !== 'jpeg' || !photo.exif}
          onChange={(e) => onChange({ keepExif: e.target.checked })}
        />
        <span>保留拍摄信息（EXIF）</span>
      </label>
      <p className="field-hint">
        {settings.format !== 'jpeg'
          ? '仅 JPG 支持保留 EXIF'
          : photo.exif
            ? '相机、镜头、拍摄时间等信息会写回导出文件；方向标记重置为正立，尺寸标记与缩略图同步为导出结果'
            : '当前图片没有可保留的 EXIF'}
      </p>

      <div className="panel-actions">
        <button className="btn" type="button" onClick={() => onChange({ sizeMode: 'original', longSide: 1920, percent: 100 })}>
          <IconReset size={16} /> 恢复原尺寸
        </button>
      </div>
      <p className="field-hint">预览始终以最长边 1600px 渲染，导出按这里的设置单独计算。</p>
    </div>
  );
}
