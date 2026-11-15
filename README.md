# 清影 · Qingying Studio

本地图片调色与批量处理工具：非破坏性调色、风格预设、水印、批量流水线与元数据安全导出，全部在本机内存完成，无账号、无云端。

- 开发日志与量化记录：[docs/02-dev-log.md](docs/02-dev-log.md)
- 桌面端：Tauri v2（macOS aarch64），Web 端同一套前端代码

## 安装（macOS）

系统要求：macOS 11 Big Sur 或更高，Apple Silicon（M 系列芯片）。当前只发布 aarch64 构建；Intel Mac 需要按文末「快速启动」从源码构建。

1. 从本仓库的 Releases 页面下载 `Qingying-Studio_1.0.1_aarch64.dmg`，并核对同页附带的 `.sha256` 校验值：

```bash
shasum -a 256 "Qingying-Studio_1.0.1_aarch64.dmg"
```

2. 双击 dmg，把「清影 Qingying Studio」拖进「应用程序」。
3. **首次打开（ad-hoc 签名、未公证，必须按下面的方式）**：在「应用程序」里右键点击图标 → 选「打开」→ 弹窗里再点「打开」。直接双击会被 Gatekeeper 拦下，提示「无法打开，因为 Apple 无法验证此 App 是否包含恶意软件」。
   - 若右键「打开」仍被拦：打开「系统设置 → 隐私与安全性」，在页面底部点「仍要打开」，再确认一次。
   - 终端替代（效果相同，任选其一）：

```bash
xattr -dr com.apple.quarantine "/Applications/清影 Qingying Studio.app"
```

4. 授权过一次后即可正常双击启动。

应用完全离线运行：无账号、无云端、无网络权限（权限清单见下文「桌面壳」）。

### 提示「应用已损坏」怎么办

若打开时提示「"清影 Qingying Studio"已损坏，无法打开。你应该将它移到废纸篓」，说明 App 包的签名没有覆盖整个 bundle，Gatekeeper 判定签名不完整。这类提示不能用右键「打开」绕过。

根因：早期 dmg 里的可执行文件只有链接器自动附加的 ad-hoc 签名（`linker-signed`），bundle 内缺少 `Contents/_CodeSignature/CodeResources`，`Info.plist` 也未绑定，`codesign --verify --deep --strict` 会报 `code has no resources but signature indicates they must be present`。当前版本已改为对整个 `.app` 做 ad-hoc 签名（`codesign --sign -`），挂载 dmg 后验签通过。

处置步骤：

1. 删除旧副本：把「应用程序」里的「清影 Qingying Studio」移到废纸篓。
2. 重新下载本页最新 dmg，核对 `.sha256` 后重新拖入「应用程序」。
3. 按上面的第 3 步首次打开。

若确实是最新版本仍提示损坏，按顺序执行下面两条命令（第二条为重新做 ad-hoc 签名）：

```bash
xattr -dr com.apple.quarantine "/Applications/清影 Qingying Studio.app"
codesign --force --deep --sign - "/Applications/清影 Qingying Studio.app"
```

## 目录结构

```
qingying/
├── app/
│   ├── brand.json       # 品牌唯一真值（中文名 / 英文名 / 应用标识 / 窗口标题 / 导出前缀）
│   ├── src/
│   │   ├── lib/         # 图像管线：参数计算、渲染、导入导出、EXIF
│   │   ├── components/  # 画布、各工具面板、控件、图标
│   │   └── App.tsx      # 应用装配与状态
│   ├── scripts/         # 版本同步、品牌同步、产物校验（不进产物）
│   ├── src-tauri/       # 桌面壳（Rust + 权限配置 + 图标）
│   └── dist/            # 前端构建产物
└── docs/                # 开发日志
```

## 快速启动

环境要求：Node.js ≥ 18（已在 Node 22 验证），npm ≥ 9。

```bash
cd app
npm install
npm run dev          # http://127.0.0.1:5173
```

生产构建与本地预览：

```bash
npm run build
npm run preview
```

## 桌面壳

环境要求：Rust stable（含 `cargo`/`rustc`）+ Xcode Command Line Tools。

```bash
cd app
npm run tauri dev      # 开发模式：Vite + 原生窗口
npm run tauri build    # 发行构建：vite build + cargo build --release
```

产物位置：

- 应用：`app/src-tauri/target/release/bundle/macos/清影 Qingying Studio.app`
- 安装包：`app/src-tauri/target/release/bundle/dmg/清影 Qingying Studio_<version>_aarch64.dmg`（`<version>` 取自 `app/package.json`）

权限最小化：`app/src-tauri/capabilities/default.json` 只授予 `dialog:default` 与 `fs:allow-read-file`/`fs:allow-write-file`，路径限定在 `$HOME`、`$TEMP`、`$DESKTOP`、`$DOCUMENT`、`$DOWNLOAD`、`$PICTURE` 之下；没有网络、Shell、进程权限。

桌面端与 Web 端的行为差异由 `app/src/lib/platform.ts` 统一抹平：

| 场景 | Web | 桌面（WKWebView） |
|---|---|---|
| 导出 | `<a download>` | `dialog.save()` + `fs.writeFile()`，可取消 |
| 导入 | `<input type=file>` / HTML5 拖放 | 点击走 input；拖放由窗口 `onDragDropEvent` 接管后读字节 |
| 批量导出 | ZIP 走浏览器下载 | ZIP 也走保存对话框 |

冒烟自测：`TF_SMOKE=1` 启动打包后的二进制，前端会自动跑合成图导入 → 调色 → 水印 → 导出 PNG/JPG，stdout 输出 `[smoke] PASS`。

## 品牌与版本

**产品名/标识唯一真值：`app/brand.json`。** 中文名与英文名（`清影` / `Qingying Studio`）在 `productName`、界面标题、窗口标题、默认水印里成对出现，不单独使用其中一个。改完后：

```bash
npm run brand:sync    # 写入 tauri.conf.json / index.html / package.json / package-lock.json / Cargo.toml / main.rs / Cargo.lock / README 与开发日志标题
npm run check:brand   # 校验漂移、中英文是否成对、是否残留旧品牌字样，不一致时退出码 1
```

`check:brand` 会扫描 `src/`、`src-tauri/src/`、`index.html`、`README.md`、`docs/02-dev-log.md`，发现旧品牌字样即失败。

**版本唯一真值：`app/package.json` 的 `version`。** 其它出口全部由脚本派生，不要手改：

| 出口 | 取值方式 |
|---|---|
| `app/src-tauri/tauri.conf.json` | `"version": "../package.json"`（dmg 文件名也用它） |
| `app/src-tauri/Cargo.toml` / `Cargo.lock` | `npm run version:sync` 写入 |
| `app/package-lock.json` | 同上 |
| `README.md` 的「当前版本能做什么（vX.Y.Z）」 | 同上 |

- **升版**：只改 `app/package.json` 的 `version`，然后 `npm run version:sync`。
- **校验**：`npm run check:version`。
- **自动化**：`npm run build` 前跑 `check:version`；`npm run tauri` 前跑 `version:sync` + `check:version`。
- **打包产物校验（必做）**：`npm run check:bundle`，校验 `.app` 与 dmg 内版本一致、dmg 不比 `.app` 旧、没有旧版本残留。
  - 不要只跑 `--bundles app`：那只会更新 `.app`，dmg 仍是旧版。
  - 旧版本 dmg 统一移到 `bundle/archive/`。

## 当前版本能做什么（v1.0.1）

| 能力 | 说明 |
|---|---|
| 显影（整组调校） | 按分位统计曝光/色偏/饱和度/噪声，生成整组参数；健康照片保持恒等曲线，只做曝光/对比微调；强度 0–100%（默认 60%，凸映射 `s^1.58`），可撤销、可逐项微调、可应用到全部 |
| 可移植配方 | 导出/载入 `qingying-recipe` JSON（色彩/映射/质感参数），逐项校验范围，跨图跨机复用；旧品牌导出的 `toneforge-recipe` 文件仍可读入，载入时提示「旧版格式，已兼容」 |
| 常用动作 | 9 项网格：整组校色 / 暗部提亮 / 亮部压制 / 中性校准 / 细节增强 / 柔焦 / 颗粒抑制 / 黑白场校准 / 还原调色；后 6 项为累积式点击，按钮显示档位，到上限停住并提示，`⌘Z` 一次退一档 |
| 曝光校正 | 独立按钮，只把曝光向场景目标中位亮度逼近（单次 ≤0.5 EV，可连点），不改对比/饱和/曲线 |
| 导入 | 点击 / 拖拽 / 多选；按 EXIF 方向自动摆正；单文件上限 80MB，像素上限 8000 万 |
| 画布 | 自适应 / 滚轮以指针为锚点缩放（5%–1600%）/ 拖拽平移 / 双击切换 1:1 |
| 全屏预览 | `S` 进入/退出，`Esc` 退出；隐藏工具与面板，画布铺满窗口 |
| 色彩 | 曝光（EV）、对比度、自然饱和度、饱和度、色温、色调；滑杆双击归零，数值框可键盘输入 |
| 撤销/重做 | 50 步历史，`⌘Z` / `⇧⌘Z`；连续拖动合并为一步；移除图片即释放相关缓存 |
| 映射（曲线/色阶） | 单调三次插值曲线，端点锁定；色阶黑场/白场/Gamma 附直方图 |
| 风格 | 16 个预设分 4 类（人像/风光/胶片/黑白），每个 0–100 强度，0% 与原图逐字节一致 |
| 质感 | 降噪（3×3 双边加权）、锐化（反锐化掩模 + 过冲软限幅）、柔化（可分离盒式模糊） |
| 区域 | 径向蒙版，画面定位，范围、羽化、局部曝光与饱和度 |
| 画幅 | 旋转微调（±15°，自动裁切空白）、边框（占短边百分比 + 自定义颜色） |
| 署名（水印） | 文字水印（多行、9 宫格、字号/透明度/颜色/旋转/平铺、4 种字体族、粗斜体、对齐）+ 图片水印（9 宫格、缩放、不透明度、四种混合模式）；图片在下、文字在上 |
| 裁切 | 拖拽框选、四角缩放、选区移动；比例锁自由/原图/1:1/4:3/3:2/16:9；可反复裁切；`Enter` 应用 / `Esc` 取消 |
| 输出 | JPG / PNG / WebP；质量 50–100；原尺寸 / 限制长边 / 按百分比 |
| 元数据 | JPG 导出可选回填拍摄信息；方向重置为正立，像素尺寸与缩略图同步为导出结果 |
| 批量 | 多图切换、参数一键应用到全部、批量导出打包 ZIP、批处理流水线（逐张校色 + 统一长边 + 水印 + 输出，失败隔离、可取消） |
| 非破坏性 | 所有编辑可撤销、可重做，也可一键重置全部编辑 |

## 四个可讲的独有场景（「可移植配方」为新增闭环）

1. **批处理流水线**：一次导入一组图，四步固定顺序跑完（逐张按自身直方图校色 → 统一长边 → 水印 → 输出），单张失败不中断整批，结果面板列出成功/失败/用时，可中途取消并打包已完成部分。
2. **元数据安全导出**：保留相机/镜头/曝光/GPS，但强制把方向改为 1、像素尺寸与缩略图重写为导出结果，避免访达/资源管理器显示未编辑的旧缩略图；不支持的字段原样保留，不做逐项重写。
3. **纯键盘闭环**：`⌘O` 打开 → 数字键切工具 → 方向键调参 → `[`/`]` 切图 → `\` 对比原图 → `⌘S` 导出，全程不离开键盘；`?` 随时查看完整键位。
4. **可移植配方（新增闭环）**：把色彩/映射/质感参数导出为 `qingying-recipe` JSON，在另一台机器或另一批图上载入还原；逐项范围校验、不合规整体拒绝，配方不含裁剪/水印/画幅，因此天然可跨图复用。旧品牌写出的 `toneforge-recipe` 文件按同一套校验读入，不会被拒绝。

## 实现要点

- **统一管线**：预览与导出走同一个 `renderPhoto()`，区别只在采样上限（预览 1600px），所见即所得。
- **查找表加速**：曝光/对比度/色温/预设/色阶/曲线编译为三条 256 级 LUT，逐像素只做查表与饱和度插值。
- **自适应预览**：拖动时按上次耗时在 760–1600 长边之间调整，停手 220ms 补满档；4 张 LRU 预览缓存。
- **水印叠放**：固定顺序 边框 → 图片水印 → 文字水印，预览与导出共用绘制函数。
- **EXIF 回填**：导入只保留 APP1 段；导出 JPG 时插回 SOI 之后，改写 Orientation 与尺寸标签，断开 IFD1 指针丢弃旧缩略图。
- **自动调色**：缩略统计（亮度直方图、分位点、通道均值、饱和度分布、高频噪声）→ 场景分支 → 参数；统计按 `photo.id` 缓存，参数是绝对值，重复点击结果一致。
- **可访问性**：图标按钮均有 `aria-label`，滑杆数值框可键盘输入，统一 `:focus-visible` 焦点环，导出/进度用 `aria-live` 播报，快捷键弹窗内 Tab 循环不外泄。

## 验证状态（v1.0.1）

- `npm run build`、`check:brand`、`check:version`、`tauri build`、`check:bundle`（含挂载 dmg 复核）通过。
- `TF_SMOKE=1` 冒烟：`PASS | TAURI=true | LOAD=1200x800 | MEAN=104->198 | FILL=darkR+72 | QUICK=hi-18 | EDGE=0.64->0.55`。
- 品牌出口一致性：`check:brand` 全绿（含中英文成对与旧品牌残留扫描）；打包元数据 `CFBundleName=清影 Qingying Studio`、`CFBundleIdentifier=com.qingying.app`。
- 签名：`codesign -dv` 显示 `flags=0x10002(adhoc,runtime)`、`Info.plist entries=14`，`codesign --verify --deep --strict` 在构建目录与挂载 dmg 内均返回 `valid on disk / satisfies its Designated Requirement`。
- 安装验证：从 dmg 拷入 `/Applications` 后验签通过并成功启动；加 `com.apple.quarantine` 模拟下载后被 Gatekeeper 拦下（非「已损坏」），执行去隔离命令后正常启动；`codesign --force --deep --sign -` 重签后同样可启动。
- 十轮打磨的完整前后数据见 [开发日志](docs/02-dev-log.md)。

## 已知限制

- 累积档位离散：暗部提亮/亮部压制 4 档、细节增强 3 档、柔焦/颗粒抑制 4 档、黑白场校准 3 档；到上限后不再加码，可改用滑杆。
- 锐化/降噪为固定 3×3 半径；缩小预览的锐度观感强于 1:1。
- 旋转微调后自动放大裁切，会损失少量边缘像素。
- 不支持 RAW、HDR、ICC 嵌入；导出为 sRGB。
- 裁剪框与曲线画布仍是鼠标/触屏专用（色阶提供数值输入作为键盘替代）。
- 仅本地运行，无账号、无云端。
- 应用为 ad-hoc 签名、未公证：`spctl` 评估仍为 rejected，首次打开需右键「打开」；不影响正常使用。

## 许可

MIT，见 [LICENSE](LICENSE)。
