#!/usr/bin/env node
/**
 * 打包产物校验：防止".app 已更新、dmg 还是旧版"再次发生。
 *
 *   node scripts/check-bundle.mjs
 *
 * 校验内容：
 *   1. bundle/macos/*.app 的 CFBundleShortVersionString / CFBundleVersion 必须等于 package.json 的 version；
 *   2. bundle/dmg/ 下必须存在同名版本的 dmg，且 dmg 的修改时间不早于 .app（否则说明 dmg 是旧构建残留）；
 *   3. bundle/dmg/ 下不得残留其它版本的 dmg（旧版本请移到 bundle/archive/）。
 *
 * 任何一项不满足都以退出码 1 结束，并给出修复命令。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const bundleDir = resolve(root, 'src-tauri/target/release/bundle');
const macosDir = join(bundleDir, 'macos');
const dmgDir = join(bundleDir, 'dmg');

const problems = [];
const ok = [];

function plistField(plist, key) {
  const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  return m ? m[1] : null;
}

/* ---------- 1. .app 版本 ---------- */
const apps = existsSync(macosDir) ? readdirSync(macosDir).filter((n) => n.endsWith('.app')) : [];
if (!apps.length) {
  problems.push(`未找到 ${macosDir} 下的 .app，先执行 npm run tauri -- build`);
} else {
  for (const name of apps) {
    const plistPath = join(macosDir, name, 'Contents/Info.plist');
    if (!existsSync(plistPath)) {
      problems.push(`${name} 缺少 Contents/Info.plist`);
      continue;
    }
    const plist = readFileSync(plistPath, 'utf8');
    const short = plistField(plist, 'CFBundleShortVersionString');
    const build = plistField(plist, 'CFBundleVersion');
    if (short !== version) problems.push(`${name} 的 CFBundleShortVersionString 是 ${short}，期望 ${version}`);
    else if (build !== version) problems.push(`${name} 的 CFBundleVersion 是 ${build}，期望 ${version}`);
    else ok.push(`${name} → ${short} / ${build}`);
  }
}

/* ---------- 2. dmg 存在且不比 .app 旧 ---------- */
const dmgs = existsSync(dmgDir) ? readdirSync(dmgDir).filter((n) => n.endsWith('.dmg')) : [];
const expectedDmg = dmgs.find((n) => n.includes(`_${version}_`));
if (!expectedDmg) {
  problems.push(
    dmgs.length
      ? `bundle/dmg/ 下没有 ${version} 的 dmg，只有：${dmgs.join('、')}（旧 dmg 请移到 bundle/archive/）`
      : `bundle/dmg/ 为空，重新打包：npm run tauri -- build -- --bundles dmg`,
  );
} else {
  ok.push(`dmg → ${expectedDmg}`);
  const appMtime = apps.length ? statSync(join(macosDir, apps[0])).mtimeMs : 0;
  const dmgMtime = statSync(join(dmgDir, expectedDmg)).mtimeMs;
  if (dmgMtime < appMtime) {
    problems.push(`dmg 比 .app 旧（dmg ${new Date(dmgMtime).toLocaleString()} < app ${new Date(appMtime).toLocaleString()}），说明 dmg 未重新生成`);
  } else {
    ok.push(`dmg 时间 ≥ .app 时间（${new Date(dmgMtime).toLocaleString()}）`);
  }
}

/* ---------- 3. 不残留其它版本的 dmg ---------- */
for (const name of dmgs) {
  if (name !== expectedDmg) problems.push(`bundle/dmg/ 残留旧产物 ${name}，请移到 bundle/archive/`);
}

/* ---------- 4. 可选：真实读取 dmg 内 .app 版本（塞进 dmg 的副本） ---------- */
if (expectedDmg && apps.length) {
  const mountPoint = `/tmp/tf-dmg-check-${process.pid}`;
  let mounted = false;
  try {
    execFileSync('hdiutil', ['attach', join(dmgDir, expectedDmg), '-mountpoint', mountPoint, '-nobrowse', '-readonly', '-quiet'], {
      stdio: 'ignore',
    });
    mounted = true;
    const inner = readdirSync(mountPoint).find((n) => n.endsWith('.app'));
    if (!inner) {
      problems.push(`dmg 内未找到 .app`);
    } else {
      const plist = readFileSync(join(mountPoint, inner, 'Contents/Info.plist'), 'utf8');
      const short = plistField(plist, 'CFBundleShortVersionString');
      const build = plistField(plist, 'CFBundleVersion');
      if (short !== version || build !== version) {
        problems.push(`dmg 内的 ${inner} 版本是 ${short} / ${build}，期望 ${version}`);
      } else {
        ok.push(`dmg 内 .app → ${short} / ${build}`);
      }
    }
  } catch (err) {
    problems.push(`挂载校验失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (mounted) {
      try {
        execFileSync('hdiutil', ['detach', mountPoint, '-quiet', '-force'], { stdio: 'ignore' });
      } catch {
        problems.push(`卸载 ${mountPoint} 失败，请手动 hdiutil detach`);
      }
    }
  }
}

/* ---------- 输出 ---------- */
for (const line of ok) console.log(`✓ ${line}`);
for (const line of problems) console.error(`✗ ${line}`);
if (problems.length) {
  console.error(`\n打包产物校验未通过（${problems.length} 项）。`);
  process.exit(1);
}
console.log(`\n打包产物校验通过：.app / dmg 版本一致（${version}）。`);
