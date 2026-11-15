import Slider from './Slider';

export interface BatchOptions {
  /** 是否逐张整组校色（按每张图自己的直方图计算，而不是套用当前这张的参数） */
  auto: boolean;
  /** 整组校色强度 0–100 */
  strength: number;
  /** 是否统一长边 */
  resize: boolean;
  /** 长边像素，只缩小不放大 */
  longEdge: number;
}

export interface BatchFailure {
  name: string;
  reason: string;
}

export interface BatchReport {
  ok: number;
  failed: BatchFailure[];
  total: number;
  ms: number;
  cancelled: boolean;
}

interface Props {
  options: BatchOptions;
  onChange: (patch: Partial<BatchOptions>) => void;
  photoCount: number;
  /** 例如「JPG · 质量 92 · 原尺寸」 */
  outputSummary: string;
  running: boolean;
  /** 已处理张数（运行中显示） */
  done: number;
  onRun: () => void;
  onCancel: () => void;
  report: BatchReport | null;
}

/**
 * 流水线面板：固定顺序的四步流水线（整组校色 → 统一长边 → 水印 → 输出），
 * 一次跑完列表里的所有图片并打包成 ZIP。单张失败会被记录并继续，不中断整批。
 */
export default function BatchPanel({
  options,
  onChange,
  photoCount,
  outputSummary,
  running,
  done,
  onRun,
  onCancel,
  report,
}: Props) {
  return (
    <div className="panel-body">
      <p className="panel-desc">
        按下面的顺序把同一套动作套用到列表里的每张图，然后打包成一个 ZIP。
      </p>

      <section className="panel-section">
        <h3>动作流水线</h3>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={options.auto}
            onChange={(e) => onChange({ auto: e.target.checked })}
            disabled={running}
          />
          <span>1. 整组校色（逐张分析）</span>
        </label>
        {options.auto && (
          <Slider
            id="batch-strength"
            label="整组校色强度"
            value={options.strength}
            min={0}
            max={100}
            step={1}
            unit="%"
            hint="按每张图自己的直方图计算，不会把当前这张的参数复制过去"
            resetTo={60}
            disabled={running}
            onChange={(value) => onChange({ strength: value })}
          />
        )}

        <label className="switch-row">
          <input
            type="checkbox"
            checked={options.resize}
            onChange={(e) => onChange({ resize: e.target.checked })}
            disabled={running}
          />
          <span>2. 统一长边</span>
        </label>
        {options.resize && (
          <div className="field">
            <div className="field-head">
              <span>长边像素</span>
              <span>{options.longEdge}px</span>
            </div>
            <input
              className="text-input"
              type="number"
              min={320}
              max={12000}
              step={10}
              value={options.longEdge}
              disabled={running}
              aria-label="统一长边像素"
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) onChange({ longEdge: Math.min(12000, Math.max(320, Math.round(next))) });
              }}
            />
            <p className="field-hint">只缩小不放大；关闭时按原尺寸输出。</p>
          </div>
        )}

        <div className="auto-list">
          <div className="auto-row">
            <span>3. 水印</span>
            <span>沿用每张图的设置</span>
          </div>
          <div className="auto-row">
            <span>4. 输出</span>
            <span>{outputSummary}</span>
          </div>
        </div>
      </section>

      <div className="panel-actions">
        {running ? (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            取消（当前这张完成后停止）
          </button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={onRun} disabled={photoCount === 0}>
            开始批处理（{photoCount} 张）
          </button>
        )}
      </div>
      {running && (
        <p className="field-hint" role="status" aria-live="polite">
          正在处理 {Math.min(done + 1, photoCount)} / {photoCount}…
        </p>
      )}

      {report && (
        <section className="panel-section">
          <h3>上次结果</h3>
          <div className="auto-list">
            <div className="auto-row">
              <span>成功</span>
              <span>
                {report.ok} / {report.total}
              </span>
            </div>
            <div className="auto-row">
              <span>失败</span>
              <span>{report.failed.length}</span>
            </div>
            <div className="auto-row">
              <span>用时</span>
              <span>{(report.ms / 1000).toFixed(2)}s</span>
            </div>
            {report.cancelled && (
              <div className="auto-row">
                <span>状态</span>
                <span>已取消</span>
              </div>
            )}
          </div>
          {report.failed.length > 0 && (
            <ul className="tips">
              {report.failed.slice(0, 6).map((f) => (
                <li key={f.name}>
                  {f.name}：{f.reason}
                </li>
              ))}
              {report.failed.length > 6 && <li>另有 {report.failed.length - 6} 张失败未列出</li>}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
