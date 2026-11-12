#!/usr/bin/env node
// 本项目编码格式：UTF-8（无 BOM）。
//
// 编码格式门禁（前端侧）：与 backend/scripts/encoding_check.py 同一套判定标准。//
// why 前端要单独一份：frontend 是独立仓库、独立 CI，读不到 backend 的脚本；
// 而乱码的成因（GBK/cp936 存盘、BOM、漏写首行声明）与仓库无关，两边必须同标准。
// why 纯 Node 内置模块：门禁要能在 `pnpm install` 之前跑，不能依赖 node_modules。
//
// 检查项：
//   E1 UTF-8 可解码（用 TextDecoder 严格模式，非 fatal 解不出即失败）
//   E2 无 BOM（首字节禁止 EF BB BF）
//   E3 首行即编码声明（`本项目编码格式：UTF-8`）
//   E4 无乱码残迹（U+FFFD、UTF-8 被按 cp936/latin-1 拆读的典型串）

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.ENCODING_ROOT ?? join(HERE, '..')

const MARKER_TEXT = '本项目编码格式：UTF-8'

// 各文件族的注释符。why 分族：给 HTML/JSON 套 `#` 会写出非法语法。
const SUFFIX_PREFIXES = {
  '.ts': ['//', '/*', '*'],
  '.js': ['//', '/*', '*'],
  '.mjs': ['//', '/*', '*'],
  '.vue': ['<!--', '//', '/*'],
  '.scss': ['//', '/*', '*'],
  '.css': ['/*', '*'],
  '.html': ['<!--'],
  '.md': ['<!--'],
  '.yml': ['#'],
  '.yaml': ['#'],
  '.conf': ['#'],
  '.json': null, // JSON 不支持注释，不参与文件头检查
  '.bat': ['@rem ', 'rem ', '@REM ', 'REM '],
  '.sh': ['#'],
}

const NAME_PREFIXES = {
  Dockerfile: ['#'],
  Jenkinsfile: ['/*', '*'],
  '.gitignore': ['#'],
  '.dockerignore': ['#'],
  '.editorconfig': ['#'],
  '.env': ['#'],
  '.env.example': ['#'],
}

const SKIP_DIRS = new Set([
  '.git',
  '.venv',
  'venv',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'reports',
  '__pycache__',
  '.pytest_cache',
  '.ruff_cache',
  '.idea',
  '.vscode',
])

const SKIP_SUFFIXES = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.pdf',
  '.lock', '.log', '.tsbuildinfo', '.pyc', '.db',
])

const SKIP_NAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'junit.xml'])

// 乱码残迹：与 backend 侧同一组形态，用 \u 转义书写，避免本文件自身被判 E4。
const MOJIBAKE_RE =
  /\u951f\u65a4\u62f7|\u00ef\u00bf\u00bd|\ufffd|\u00e2\u20ac|\u00c3[\u00a4\u00a5\u00a9\u00a8\u00ad\u00b6]|\u00e6\u2013\u2021/

// 行内豁免标记：所在行跳过 E4。说明「乱码长什么样」的文档必须能写出残迹示例，
// 纯正则分不清「在举例」与「真乱码」。与 backend 侧同名机制、同语义：
// 只豁免 E4、只豁免该行、无文件级豁免。标记必须可见可 grep，不许藏进脚本白名单。
const IGNORE_MARKER = 'encoding-check: ignore'

const problems = { E1: [], E2: [], E3: [], E4: [] }
let checked = 0

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full)
      continue
    }
    if (SKIP_SUFFIXES.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue
    if (SKIP_NAMES.has(entry.name)) continue
    inspect(full)
  }
}

function prefixesFor(file) {
  const base = file.slice(file.lastIndexOf(sep) + 1)
  if (Object.hasOwn(NAME_PREFIXES, base)) return NAME_PREFIXES[base]
  const dot = base.lastIndexOf('.')
  const suffix = dot === -1 ? '' : base.slice(dot)
  if (Object.hasOwn(SUFFIX_PREFIXES, suffix)) return SUFFIX_PREFIXES[suffix]
  return undefined
}

function inspect(file) {
  const rel = relative(ROOT, file).split(sep).join('/')
  const bytes = readFileSync(file)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.E2.push(`${rel}:1 [E2] 文件以 UTF-8 BOM 开头，应保存为无 BOM`)
  }

  let text
  try {
    // fatal: true 才是严格校验；默认会把非法字节替换成 U+FFFD 而「解码成功」。
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    problems.E1.push(`${rel}:0 [E1] 非 UTF-8 编码（含非法字节序列）`)
    return
  }
  checked += 1

  const prefixes = prefixesFor(file)
  if (Array.isArray(prefixes)) {
    const lines = text.split(/\r?\n/)
    // why 放行 shebang：可执行脚本的第一行必须是 `#!`，编码声明只能排到第二行。
    // 这只对确实以 `#!` 开头的文件生效，不会变成「声明可以随便挪」的后门。
    const start = lines[0]?.startsWith('#!') ? 1 : 0
    const first = lines[start] ?? ''
    const ok = prefixes.some((p) => first.trimStart().startsWith(p) && first.includes(MARKER_TEXT))
    if (!ok) {
      problems.E3.push(
        `${rel}:${start + 1} [E3] 首行缺少编码声明（应为 ${prefixes[0]} ${MARKER_TEXT}）`,
      )
    }
  }

  // 无文件级豁免：说明规则的文档与脚本自身一视同仁，只放行被显式标注的行。
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(IGNORE_MARKER)) return
    const m = MOJIBAKE_RE.exec(line)
    if (m) problems.E4.push(`${rel}:${i + 1} [E4] 疑似乱码残迹「${m[0]}」`)
  })
}

const TITLES = {
  E1: '文件为合法 UTF-8',
  E2: '文件无 BOM',
  E3: `首行声明「${MARKER_TEXT}」`,
  E4: '无乱码残迹',
}

walk(ROOT)

const MAX_DETAILS = 60
console.log('编码格式门禁（前端）：UTF-8 解码 / 无 BOM / 首行声明 / 无乱码残迹')
console.log(`  受检根：${ROOT}`)
console.log()

let failed = 0
for (const code of ['E1', 'E2', 'E3', 'E4']) {
  const list = problems[code]
  console.log(`[${list.length ? 'FAIL' : 'OK'}] ${code} ${TITLES[code]}（${checked} 个文件）`)
  for (const line of list.slice(0, MAX_DETAILS)) console.log(`    ${line}`)
  if (list.length > MAX_DETAILS) console.log(`    …另有 ${list.length - MAX_DETAILS} 项未列出`)
  if (list.length) failed += 1
}

console.log()
console.log('== 汇总 ==')
const detail = `${4 - failed}/4 项通过`
console.log(`[${failed ? 'FAIL' : 'OK'}] ${detail}`)
const total = Object.values(problems).reduce((n, l) => n + l.length, 0)
console.log(`exit code = ${failed ? 1 : 0}` + (failed ? `（失败明细共 ${total} 项）` : ''))
process.exitCode = failed ? 1 : 0
