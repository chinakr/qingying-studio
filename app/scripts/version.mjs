#!/usr/bin/env node
/**
 * 版本管理：app/package.json 的 version 是唯一真值。
 *
 *   node scripts/version.mjs sync   把真值同步到派生出口（Cargo.toml / Cargo.lock / package-lock.json / tauri 配置 / README 标记）
 *   node scripts/version.mjs check  只校验，不一致时以退出码 1 结束
 *
 * 任何情况下都不要手改派生出口里的版本号。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'sync' ? 'sync' : 'check';
const SEMVER = /^\d+\.\d+\.\d+$/;

const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

if (!SEMVER.test(version ?? '')) {
  console.error(`✗ app/package.json 的 version 不是 x.y.z 形式：${JSON.stringify(version)}`);
  process.exit(1);
}

const results = [];
let failed = false;

function record(name, actual, expected, changed) {
  const ok = actual === expected;
  if (!ok) failed = true;
  results.push({ name, actual, expected, ok, changed });
}

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

function write(rel, text) {
  writeFileSync(resolve(root, rel), text, 'utf8');
}

/* ---------------- tauri.conf.json：必须是路径引用，不能写死 ---------------- */
{
  const rel = 'src-tauri/tauri.conf.json';
  const text = read(rel);
  const conf = JSON.parse(text);
  const expected = '../package.json';
  let changed = false;
  if (conf.version !== expected) {
    if (typeof conf.version === 'string' && SEMVER.test(conf.version) && mode === 'sync') {
      conf.version = expected;
      write(rel, `${JSON.stringify(conf, null, 2)}\n`);
      changed = true;
    }
  }
  record(rel, String(conf.version), expected, changed);
}

/* ---------------- Cargo.toml：[package] 段内的 version ---------------- */
function cargoPackageVersion(text) {
  const lines = text.split('\n');
  let inPackage = false;
  for (const line of lines) {
    if (/^\[/.test(line)) {
      inPackage = /^\[package\]\s*$/.test(line);
      continue;
    }
    if (inPackage) {
      const m = line.match(/^version\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  }
  return null;
}

function setCargoPackageVersion(text, next) {
  const lines = text.split('\n');
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\[/.test(lines[i])) {
      inPackage = /^\[package\]\s*$/.test(lines[i]);
      continue;
    }
    if (inPackage && /^version\s*=\s*".*"/.test(lines[i])) {
      lines[i] = `version = "${next}"`;
      return lines.join('\n');
    }
  }
  return null;
}

{
  const rel = 'src-tauri/Cargo.toml';
  const text = read(rel);
  let actual = cargoPackageVersion(text);
  let changed = false;
  if (actual !== version && mode === 'sync') {
    const next = setCargoPackageVersion(text, version);
    if (next) {
      write(rel, next);
      actual = version;
      changed = true;
    }
  }
  record(rel, actual ?? '(未找到 [package] version)', version, changed);
}

/* ---------------- Cargo.lock：本包条目（cargo build 也会改，但先同步更直观） ---------------- */
{
  const rel = 'src-tauri/Cargo.lock';
  if (existsSync(resolve(root, rel))) {
    const text = read(rel);
    // 包名以 Cargo.toml 为准（品牌名可从 app/brand.json 同步），这里不写死
    const crateName = read('src-tauri/Cargo.toml').match(/^name = "([^"]+)"$/m)?.[1] ?? '';
    const re = new RegExp(`(\\[\\[package\\]\\]\\nname = "${crateName}"\\nversion = ")([^"]+)(")`);
    const m = text.match(re);
    let actual = m?.[2] ?? `(未找到 ${crateName || '本包'} 条目)`;
    let changed = false;
    if (m && actual !== version && mode === 'sync') {
      write(rel, text.replace(re, `$1${version}$3`));
      changed = true;
      actual = version;
    }
    record(rel, actual, version, changed);
  }
}

/* ---------------- package-lock.json：两处 version ---------------- */
{
  const rel = 'package-lock.json';
  const lock = JSON.parse(read(rel));
  let changed = false;
  if (mode === 'sync') {
    if (lock.version !== version) {
      lock.version = version;
      changed = true;
    }
    if (lock.packages?.['']) {
      if (lock.packages[''].version !== version) {
        lock.packages[''].version = version;
        changed = true;
      }
    }
    if (changed) write(rel, `${JSON.stringify(lock, null, 2)}\n`);
  }
  const now = changed ? JSON.parse(read(rel)) : lock;
  record(`${rel} version`, now.version ?? '(缺失)', version, changed);
  record(`${rel} packages[""]`, now.packages?.['']?.version ?? '(缺失)', version, changed);
}

/* ---------------- README：当前版本标题是面向用户的版本出口 ---------------- */
{
  const rel = '../README.md';
  const text = read(rel);
  const re = /(## 当前版本能做什么（v)(\d+\.\d+\.\d+)(）)/;
  const m = text.match(re);
  let actual = m?.[2] ?? '(未找到“当前版本能做什么（vX.Y.Z）”标题)';
  let changed = false;
  if (m && actual !== version && mode === 'sync') {
    write(rel, text.replace(re, `$1${version}$3`));
    changed = true;
    actual = version;
  }
  record(rel, actual, version, changed);
}

/* ---------------- 输出 ---------------- */
const tag = mode === 'sync' ? '同步' : '校验';
console.log(`\n版本${tag}（真值 app/package.json = ${version}）\n`);
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  const suffix = r.changed ? ' → 已更新' : '';
  const detail = r.ok ? r.actual : `${r.actual}（应为 ${r.expected}）`;
  console.log(`  ${mark} ${r.name.padEnd(38)} ${detail}${suffix}`);
}

if (!failed) {
  console.log('\n全部出口一致。\n');
  process.exit(0);
}

console.error(
  mode === 'sync'
    ? '\n有出口无法自动同步，请按上面的提示手工检查（通常是文件缺失或结构被改过）。\n'
    : '\n版本不一致。请在 app/package.json 里改 version，然后运行 `npm run version:sync`；不要手改 Cargo.toml / README。\n',
);
process.exit(1);
