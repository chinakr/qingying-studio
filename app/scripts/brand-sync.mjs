#!/usr/bin/env node
/**
 * 品牌唯一真值：app/brand.json。
 *
 *   node scripts/brand-sync.mjs sync   把品牌名/应用标识/窗口标题等写进各出口
 *   node scripts/brand-sync.mjs check  只校验，不一致时以退出码 1 结束
 *
 * 出口：tauri.conf.json（productName / identifier / 窗口标题，dmg 文件名由 productName 派生）、
 * index.html（title）、package.json 与 package-lock.json（name）、Cargo.toml（package / lib / description / authors）、
 * main.rs（lib 调用）、Cargo.lock（本包条目）、README 与开发日志标题；同时扫描旧品牌残留。
 * 换产品名时只改 app/brand.json，再跑 `npm run brand:sync`。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'sync' ? 'sync' : 'check';
const brand = JSON.parse(readFileSync(resolve(root, 'brand.json'), 'utf8'));

const libName = `${brand.crateName.replace(/-/g, '_')}_lib`;
const results = [];
let failed = false;

const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const write = (rel, text) => writeFileSync(resolve(root, rel), text, 'utf8');

function record(name, actual, expected, changed = false) {
  const ok = actual === expected;
  if (!ok) failed = true;
  results.push({ name, actual, expected, ok, changed });
}

/* ---------- tauri.conf.json ---------- */
{
  const rel = 'src-tauri/tauri.conf.json';
  const conf = JSON.parse(read(rel));
  const before = JSON.stringify(conf);
  if (mode === 'sync') {
    conf.productName = brand.productName;
    conf.identifier = brand.identifier;
    if (conf.app?.windows?.[0]) conf.app.windows[0].title = brand.windowTitle;
    const after = JSON.stringify(conf, null, 2) + '\n';
    if (after !== before) write(rel, after);
  }
  record(`${rel} productName`, conf.productName, brand.productName, false);
  record(`${rel} identifier`, conf.identifier, brand.identifier, false);
  record(`${rel} 窗口标题`, conf.app?.windows?.[0]?.title ?? '(缺失)', brand.windowTitle, false);
}

/* ---------- index.html ---------- */
{
  const rel = 'index.html';
  const text = read(rel);
  const expected = `${brand.displayName} · ${brand.tagline}`;
  const m = text.match(/<title>([^<]*)<\/title>/);
  let changed = false;
  if (mode === 'sync' && m && m[1] !== expected) {
    write(rel, text.replace(/<title>[^<]*<\/title>/, `<title>${expected}</title>`));
    changed = true;
  }
  record(`${rel} title`, m?.[1] ?? '(缺失)', expected, changed);
}

/* ---------- package.json ---------- */
{
  const rel = 'package.json';
  const pkg = JSON.parse(read(rel));
  if (mode === 'sync' && pkg.name !== brand.packageName) {
    pkg.name = brand.packageName;
    write(rel, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  record(`${rel} name`, pkg.name, brand.packageName, false);
}

/* ---------- Cargo.toml ---------- */
{
  const rel = 'src-tauri/Cargo.toml';
  let text = read(rel);
  const before = text;
  if (mode === 'sync') {
    text = text
      .replace(/^name = ".*"$/m, `name = "${brand.crateName}"`)
      .replace(/^description = ".*"$/m, `description = "${brand.tagline}"`)
      .replace(/^authors = \[.*\]$/m, `authors = ["${brand.productName}"]`)
      .replace(/^name = ".*_lib"$/m, `name = "${libName}"`);
    if (text !== before) write(rel, text);
  }
  const pkgName = text.match(/^name = "(.*)"$/m)?.[1];
  const lib = text.match(/^name = "(.*_lib)"$/m)?.[1];
  record(`${rel} package.name`, pkgName ?? '(缺失)', brand.crateName);
  record(`${rel} lib.name`, lib ?? '(缺失)', libName);
}

/* ---------- main.rs ---------- */
{
  const rel = 'src-tauri/src/main.rs';
  const text = read(rel);
  const expected = `${libName}::run()`;
  const m = text.match(/(\w+_lib::run\(\))/);
  let changed = false;
  if (mode === 'sync' && m && m[1] !== expected) {
    write(rel, text.replace(m[1], expected));
    changed = true;
  }
  record(`${rel} 调用`, m?.[1] ?? '(缺失)', expected, changed);
}

/* ---------- package-lock.json：name 跟随 package.json ---------- */
{
  const rel = 'package-lock.json';
  const lock = JSON.parse(read(rel));
  let changed = false;
  if (mode === 'sync') {
    if (lock.name !== brand.packageName) {
      lock.name = brand.packageName;
      changed = true;
    }
    if (lock.packages?.['']?.name !== brand.packageName) {
      lock.packages[''].name = brand.packageName;
      changed = true;
    }
    if (changed) write(rel, `${JSON.stringify(lock, null, 2)}\n`);
  }
  const now = changed ? JSON.parse(read(rel)) : lock;
  record(`${rel} name`, now.name ?? '(缺失)', brand.packageName, changed);
  record(`${rel} packages[""].name`, now.packages?.['']?.name ?? '(缺失)', brand.packageName, changed);
}

/* ---------- 对外文档标题 ---------- */
for (const { rel, expected } of [
  { rel: '../README.md', expected: `# ${brand.displayName}` },
  { rel: '../docs/02-dev-log.md', expected: `# ${brand.displayName} 开发日志` },
]) {
  const text = read(rel);
  const first = text.split('\n')[0];
  let changed = false;
  if (mode === 'sync' && first !== expected) {
    write(rel, `${expected}\n${text.slice(first.length + 1)}`);
    changed = true;
  }
  record(`${rel} 标题`, first, expected, changed);
}

/* ---------- 旧品牌残留 ---------- */
{
  const LEGACY_TOKENS = ['toneforge', 'guangying', 'neoimaging', '光影魔术手', '光影', '复刻', '原版', '逆向'];
  const hits = [];
  const scan = (rel) => {
    // 兼容说明里允许点名旧配方格式，其余旧品牌字样一律视为残留
    const text = read(rel).toLowerCase().replaceAll('toneforge-recipe', '');
    for (const token of LEGACY_TOKENS) {
      if (text.includes(token)) hits.push(`${rel}: ${token}`);
    }
  };
  const walk = (rel) => {
    for (const entry of readdirSync(resolve(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.(ts|tsx|css|html|json|md|rs|toml)$/.test(entry.name)) scan(child);
    }
  };
  walk('src');
  walk('src-tauri/src');
  for (const rel of ['index.html', '../README.md', '../docs/02-dev-log.md']) scan(rel);
  record('旧品牌残留', hits.length ? hits.slice(0, 3).join('；') : '无', '无');
}

/* ---------- Cargo.lock ---------- */
{
  const rel = 'src-tauri/Cargo.lock';
  if (existsSync(resolve(root, rel))) {
    const text = read(rel);
    // 本包是唯一没有 source 字段的 [[package]] 块（工作区成员不能从注册表拉取）
    const blocks = text.split('[[package]]');
    const own = blocks.find((b) => /^name = "/.test(b.trimStart()) && !/^source = /m.test(b));
    const ownName = own?.match(/^name = "([^"]+)"/m)?.[1] ?? null;
    let changed = false;
    if (mode === 'sync' && ownName && ownName !== brand.crateName) {
      write(rel, text.replace(`name = "${ownName}"`, `name = "${brand.crateName}"`));
      changed = true;
    }
    const now = read(rel);
    const nowBlocks = now.split('[[package]]');
    const nowOwn = nowBlocks.find((b) => /^name = "/.test(b.trimStart()) && !/^source = /m.test(b));
    record(`${rel} 本包条目`, nowOwn?.match(/^name = "([^"]+)"/m)?.[1] ?? '(缺失)', brand.crateName, changed);
  }
}

/* ---------- 中英文成对 ---------- */
{
  const paired = [brand.productName, brand.displayName, brand.windowTitle, brand.watermarkText].every(
    (v) => typeof v === 'string' && v.includes(brand.nameZh) && v.includes(brand.nameEn),
  );
  record('中英文成对（产品名/标题/水印）', paired ? '成对' : '不成对', '成对');
}

/* ---------- 输出 ---------- */
const tag = mode === 'sync' ? '同步' : '校验';
console.log(`\n品牌${tag}（真值 app/brand.json = ${brand.productName} / ${brand.identifier}）\n`);
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  const suffix = r.changed ? ' → 已更新' : '';
  const detail = r.ok ? r.actual : `${r.actual}（应为 ${r.expected}）`;
  console.log(`  ${mark} ${r.name.padEnd(34)} ${detail}${suffix}`);
}

if (!failed) {
  console.log('\n品牌出口一致。\n');
  process.exit(0);
}
console.error(`\n品牌出口不一致。请改 app/brand.json，然后运行 npm run brand:sync；不要手改派生出口。\n`);
process.exit(1);
