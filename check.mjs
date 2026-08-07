/**
 * 记忆闪卡插件自检:宿主同款 new Function('ctx', src) 求值 main.js + DOM 垫片 + 冻结时钟 + 内存 vault。
 * 覆盖:贡献点契约 / disposer / FSRS 已知向量(≥4 组,含巨大 s 钳制) /
 *       数据契约往返(孤儿状态剔除、保真三防线、正文标记转义) /
 *       ```deck 块解析(含模型废话、内嵌代码块围栏深度) / ID 分配不撞 / XSS / 索引自愈 /
 *       队列构建(每日上限、坏 fsrs 跳过) / 连击与日期算术(DST 三定式,四时区扫描) /
 *       挂载冒烟(复习会话渲染、焦点归属、decks 事件合并、pendingReview 消费、
 *       编辑器读盘合并写、只读守卫、fileCreator 库根契约、AI 建卡截断提示、评分竞态兜底) /
 *       旧宿主降级(两档) / 内置抢后缀整体退让。
 * 跑法:node check.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as A } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ── 含日期算术 → 自钉 TZ,四时区扫描(UTC/上海/伦敦/纽约) ──
if (!process.env.FC_TZ) {
  for (const tz of ['UTC', 'Asia/Shanghai', 'Europe/London', 'America/New_York']) {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, TZ: tz, FC_TZ: tz } })
  }
  console.log('check ok — 四时区(UTC / Asia/Shanghai / Europe/London / America/New_York)全部通过')
  process.exit(0)
}

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')
const DAY = 86400000
const MIN = 60000
// 冻结时钟:2026-08-06T04:00:00Z(四个受测时区的本地日期同为 2026-08-06)
const NOW = Date.parse('2026-08-06T04:00:00.000Z')
Date.now = () => NOW

// ── 源码级纪律 ──
A.ok(!/^\s*(import|export)\s/m.test(src), '裸 setup 体:顶层无 import/export')
A.ok(!/agentSlug|execMode/.test(src), '纯文本 run:不带 agentSlug / 不带宿主执行面')
A.ok(!/color:\s*#fff/i.test(src), '强调色上的字绝不写死白字(一律 var(--fc-on-fill))')
A.ok(!/\bsetInterval\s*\(/.test(src), '禁 setInterval(轮询用 setTimeout 自排程)')
A.ok(src.includes('__FLASHCARDS_TEST__'), '应有测试钩子')
// ASI 陷阱:无分号风格下,以 ( 或 [ 开头的行会粘到上一句尾部
const srcLines = src.split('\n')
const asi = [...srcLines.keys()].filter((i) => {
  if (!/^\s*[([]/.test(srcLines[i])) return false
  let p = i - 1
  while (p >= 0 && !srcLines[p].trim()) p--
  return p >= 0 && /[)\]'"`\w]\s*$/.test(srcLines[p])
}).map((i) => i + 1)
A.equal(asi.length, 0, `以 ( [ 开头的行会被 ASI 粘到上一句:第 ${asi.join(',')} 行`)

// ── 交付物形状:manifest / 技能 / README / CHANGELOG / install.sh ──
const man = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
A.equal(man.id, 'flashcards', 'manifest id 钉死 flashcards')
A.equal(man.name, '记忆闪卡')
A.equal(man.version, '1.0.0')
A.equal(man.apiVersion, 1)
A.equal(man.main, 'main.js')
A.deepEqual(man.fileExtensions, ['.deck.md'], 'manifest fileExtensions 必须与 registerFileType 一致(主进程毁档防线)')
A.ok(man.description && man.description.includes('后端'), 'description 必须说清数据流向(AI 建卡会把笔记发到后端)')
A.ok(man.onboarding && Array.isArray(man.onboarding.steps) && man.onboarding.settings === true, 'onboarding 齐全')
A.ok(!man.onboarding.recommends, 'onboarding 禁止 recommends 自家内嵌内容')
A.ok(Array.isArray(man.events) && man.events.some((e) => e.name === 'review'), 'manifest 声明 review 活动事件')
const skill = readFileSync(new URL('./skills/flashcard-format/SKILL.md', import.meta.url), 'utf8')
A.ok(/^---\n/.test(skill) && skill.includes('name: flashcard-format'), '技能 frontmatter:name=flashcard-format')
A.ok(skill.includes('description:'), '技能 frontmatter:description')
A.ok(skill.includes('card:') && skill.includes('fsrs'), '技能正文覆盖 card 标记与 fsrs 行')
A.ok(skill.toLowerCase().includes('never'), '技能必须明确警告保留 card ID 与 fsrs 行')
const skillBody = skill.split('---').slice(2).join('---')
A.ok(!/[一-鿿]/.test(skillBody), '技能正文(注入模型)必须全英文')
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8')
A.ok(readme.includes('不做') && readme.includes('工作文件夹'), 'README 必须有范围说明与数据落盘位置')
const changelog = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8')
A.ok(changelog.includes('## 1.0.0'), 'CHANGELOG 必须有 1.0.0 一节')
const install = readFileSync(new URL('./install.sh', import.meta.url), 'utf8')
A.ok(install.includes('plugins/flashcards'), 'install.sh 装到 plugins/flashcards')

// ── DOM 垫片(bluebird 同款 + 挂载测试所需:innerHTML 字面量解析 / querySelector /
//    style / focus / contains / 事件注册;canvas.getContext 一律 null → 主题探针走兜底) ──
function mkText(t) {
  const n = { tag: '#text', children: [], attrs: {}, parentElement: null, appendChild() { }, setAttribute() { }, addEventListener() { } }
  let v = String(t)
  Object.defineProperty(n, 'textContent', { get: () => v, set: (x) => { v = String(x) } })
  return n
}
function mkStyle() {
  return { setProperty(k, v) { this[k] = v } }
}
const VOID_TAGS = new Set(['input', 'br', 'hr', 'img'])
function qsMatch(el, sel) {
  const m = /^\[([^\]]+)\]$/.exec(sel)
  if (m) return !!(el.attrs && m[1] in el.attrs)
  return el.tag === sel
}
function mkEl(tag) {
  const n = { tag, children: [], attrs: {}, style: mkStyle(), on: {}, parentElement: null, focusCalls: 0, className: '', isConnected: true }
  let own = ''
  n.addEventListener = (t, f) => { const arr = n.on[t] || []; arr.push(f); n.on[t] = arr }
  n.appendChild = (c) => {
    if (c && c.tag === '#frag') { for (const k of c.children) { k.parentElement = n; n.children.push(k) } }
    else { if (c && typeof c === 'object') c.parentElement = n; n.children.push(c) }
    return c
  }
  n.setAttribute = (k, val) => { n.attrs[k] = val }
  n.remove = () => { const p = n.parentElement; if (p) { const i = p.children.indexOf(n); if (i >= 0) p.children.splice(i, 1) } n.parentElement = null }
  n.contains = (o) => { let cur = o; while (cur) { if (cur === n) return true; cur = cur.parentElement } return false }
  n.focus = () => { n.focusCalls += 1; globalThis.document.activeElement = n }
  n.getContext = () => null
  n.querySelector = (sel) => { const all = []; qsWalk(n, sel, all); return all[0] || null }
  n.querySelectorAll = (sel) => { const all = []; qsWalk(n, sel, all); return all }
  Object.defineProperty(n, 'textContent', { get: () => own + n.children.map((c) => c.textContent || '').join(''), set: (x) => { n.children.length = 0; own = String(x) } })
  Object.defineProperty(n, 'innerHTML', { get: () => '', set: (html) => { n.children.length = 0; own = ''; parseHTML(String(html), n) } })
  return n
}
function qsWalk(node, sel, out) { for (const c of node.children || []) { if (c.attrs && qsMatch(c, sel)) out.push(c); qsWalk(c, sel, out) } }
/** 解析 main.js 里的编译期字面量模板(简单静态 HTML,够用即可;不是通用解析器)。 */
function parseHTML(html, parent) {
  const re = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|([^<]+)/g
  const stack = [parent]
  let m
  while ((m = re.exec(html))) {
    if (m[5] != null) { if (m[5]) stack[stack.length - 1].appendChild(mkText(m[5])); continue }
    if (m[4]) { if (stack.length > 1) stack.pop(); continue }
    const el = mkEl(m[1].toLowerCase())
    const ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g
    let am
    while ((am = ar.exec(m[2] || ''))) {
      const k = am[1]
      const v = am[2] == null ? '' : am[2]
      if (k === 'class') el.className = v
      else if (k === 'style') { for (const part of v.split(';')) { const ci = part.indexOf(':'); if (ci > 0) el.style[part.slice(0, ci).trim()] = part.slice(ci + 1).trim() } }
      el.attrs[k] = v
    }
    stack[stack.length - 1].appendChild(el)
    if (!m[3] && !VOID_TAGS.has(el.tag)) stack.push(el)
  }
}
globalThis.document = { createElement: mkEl, createTextNode: mkText, createDocumentFragment: () => mkEl('#frag'), addEventListener() { }, activeElement: undefined, body: undefined }
globalThis.window = {} // themeObserver 探 window.matchMedia;真值在截断测试里再补 tangu
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', color: 'rgb(40,40,40)', backgroundColor: '' })
globalThis.MutationObserver = class { observe() { } disconnect() { } }
const _ls = new Map()
globalThis.localStorage = { getItem: (k) => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: (k) => _ls.delete(k) }
const findAll = (node, tag) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.tag === tag) out.push(c); walk(c) } }; walk(node); return out }
const anyAttr = (node, key) => { let hit = false; const walk = (n) => { if (n.attrs && key in n.attrs) hit = true; for (const c of n.children || []) walk(c) }; walk(node); return hit }
// 挂载测试的公共工具:未处理拒绝收集(async render 崩溃不许静默溜走)+ 事件触发器
const rejections = []
process.on('unhandledRejection', (e) => rejections.push(e))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fire = (el, type, ev) => { const fs = (el && el.on && el.on[type]) || []; for (const f of fs) f(ev || { preventDefault() { }, key: '' }) }
const buttonByText = (node, text) => findAll(node, 'button').find((b) => String(b.textContent).includes(text))

// ── 求值 main.js(新宿主全量 ctx) ──
globalThis.__FLASHCARDS_TEST__ = {}
const reg = { views: [], commands: [], settings: [], fileTypes: [], creators: [], series: [], notices: [] }
const tracked = []
const activityLog = []
const ctx = {
  registerView: (v) => reg.views.push(v),
  registerCommand: (c) => reg.commands.push(c),
  registerSetting: (s) => reg.settings.push(s),
  registerFileType: (f) => { reg.fileTypes.push(f) }, // 返回 undefined(非 false)= 未被内置抢占
  registerFileCreator: (f) => reg.creators.push(f),
  registerStatusItem: () => ({ update() { }, dispose() { } }),
  notify: (m) => reg.notices.push(m),
  openView() { },
  achievements: { registerSeries: (s) => reg.series.push(s), track: (e, n) => tracked.push([e, n == null ? 1 : n]) },
  activity: { log: (e, d) => activityLog.push([e, d]) },
  app: { notify: (m) => reg.notices.push(m), readFile: async () => null, writeFile: async () => { }, openFile() { }, getActivePageText: () => '', workFolder: () => '记忆闪卡', prompt: async () => null },
}
const dispose = new Function('ctx', src)(ctx)
const T = Object.assign({}, globalThis.__FLASHCARDS_TEST__)
globalThis.__FLASHCARDS_TEST__ = null // 后续旧宿主重求值不再灌钩子
// 内存 vault(重绑后所有 ctx.app 读写走 Map,断言落盘轨迹)
const V = new Map()
const writes = []
ctx.app.readFile = async (p) => (V.has(p) ? V.get(p) : null)
ctx.app.writeFile = async (p, t) => { V.set(p, String(t)); writes.push(p) }

// ── ① 贡献点契约(id 全部按 SPEC 钉死) ──
A.equal(typeof dispose, 'function', 'setup 应返回 disposer')
A.ok(reg.views.find((v) => v.id === 'review' && v.title === '记忆闪卡' && typeof v.mount === 'function'), '应注册 review 复习台视图')
const ft = reg.fileTypes.find((f) => f.id === 'deck')
A.ok(ft && typeof ft.mount === 'function', '应注册 deck 文件类型')
A.deepEqual(ft.extensions, ['.deck.md'], '文件类型后缀 .deck.md')
A.equal(ft.icon, 'database', '文件类型图标用词表名 database')
A.equal(ft.title, '卡组')
A.ok(reg.commands.find((c) => c.id === 'flashcards-open' && c.title === '记忆闪卡:打开复习台'), '应注册 flashcards-open 命令')
A.ok(reg.commands.find((c) => c.id === 'flashcards-from-note' && c.title === '记忆闪卡:从当前笔记生成卡组'), '应注册 flashcards-from-note 命令')
const creator = reg.creators.find((c) => c.id === 'deck-new')
A.ok(creator && creator.label === '新建卡组' && creator.icon === 'database', '应注册 deck-new 新建入口')
A.deepEqual(reg.settings.map((s) => s.key), ['dailyLimit'], '应声明 dailyLimit 设置(workFolder 由宿主自动提供)')
A.equal(reg.settings[0].default, 50, 'dailyLimit 默认 50')
A.equal(reg.series.length, 1, '应注册一组复习成就')
A.deepEqual(reg.series[0].achievements.map((a) => a.event).sort(), ['review', 'review', 'streak'], '成就事件 review×2 + streak')

// ── 钩子齐全 ──
for (const k of ['schedule', 'parseDeck', 'serializeDeck', 'nextCardId', 'parseDeckFence', 'renderMarkdown', 'inline', 'safeHref', 'uniqueDeckPath', 'refreshDeckRow', 'buildQueue', 'dayKey', 'dayDiff', 'updateStreak', 'stateLabel', 'fmtDelta', 'onColorOf', 'readableOn', 'contrast', 'GEN_PROMPT']) {
  A.equal(typeof T[k], 'function', `钩子应暴露 ${k}`)
}

// ── ③ FSRS 已知向量(≥4 组;纯函数,now 显式传入) ──
const g3 = T.schedule(null, 3, NOW)
A.equal(Date.parse(g3.due) - NOW, DAY, '向量1:新卡 Good → 次日')
A.equal(g3.state, 2)
A.equal(g3.reps, 1)
A.equal(g3.lapses, 0)
A.ok(g3.s > 0 && g3.d >= 1 && g3.d <= 10, '新卡 s/d 合法')
const g1 = T.schedule(null, 1, NOW)
A.equal(g1.state, 1, '向量2:新卡 Again → 学习中')
A.ok(Date.parse(g1.due) - NOW <= 10 * MIN, '学习步以分钟计')
A.equal(g1.lapses, 0, '学习中的 Again 不算 lapse')
const rev = { due: new Date(NOW - DAY).toISOString(), s: 3, d: 5, reps: 3, lapses: 0, state: 2, last: new Date(NOW - 3 * DAY).toISOString() }
const again = T.schedule(rev, 1, NOW)
A.equal(again.lapses, 1, '向量3:review + Again → lapses+1')
A.equal(again.state, 3, '→ state=3 重学')
A.ok(again.s < rev.s, '忘了 → 稳定度打折')
const good = T.schedule(rev, 3, NOW)
A.equal(good.state, 2, '向量4:review + Good 保持 review')
A.ok(good.s > rev.s, '记得 → 稳定度增长')
A.equal(good.reps, 4, 'reps 递增')
A.equal(Date.parse(good.due) - NOW, Math.max(1, Math.round(good.s)) * DAY, '间隔 = round(s) 天')
const easy = T.schedule(rev, 4, NOW)
const hard = T.schedule(rev, 2, NOW)
A.ok(easy.s > good.s && good.s > hard.s, '向量5:稳定度 Easy > Good > Hard')
A.ok(hard.d > good.d, 'Hard 提高难度')
const relearn = T.schedule(again, 3, NOW + 10 * MIN)
A.equal(relearn.state, 2, '向量6:重学 Good → 毕业回 review')
A.ok(Date.parse(relearn.due) - (NOW + 10 * MIN) >= DAY, '毕业间隔以天计')
const junk = T.schedule({ due: 'garbage', s: 'x', d: null, reps: 'q', lapses: undefined, state: 2, last: 'not-a-date' }, 3, NOW)
A.ok(Number.isFinite(junk.s) && Number.isFinite(junk.d) && Number.isFinite(Date.parse(junk.due)), '向量7:手写 fsrs 的垃圾输入不产 NaN')
// 向量8:最大间隔钳制(评审携带项:s=1e8/1e9 时 toISOString 直接 RangeError,复习台整体崩)
for (const big of [1e7, 1e8, 1e9]) {
  const st = T.schedule({ due: new Date(NOW - DAY).toISOString(), s: big, d: 5, reps: 3, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }, 3, NOW)
  A.ok(Number.isFinite(Date.parse(st.due)), `巨大 s=${big} 不许抛 / 不许产 Invalid Date`)
  A.ok(Date.parse(st.due) - NOW <= 36500 * DAY, `巨大 s=${big}:间隔封顶 100 年`)
  A.ok(st.s <= 36500, `巨大 s=${big}:落盘的 s 同样封顶`)
}
let stx = null
for (let i = 0; i < 8; i++) stx = T.schedule(stx, 1, NOW + i * DAY)
A.ok(stx.d <= 10 && stx.d >= 1, '难度夹取 [1,10]')

// ── ⑤ 数据契约往返(写→读→再写,不丢字段;孤儿状态剔除) ──
const SAMPLE = [
  '---',
  'deck: 高数第三章',
  'fsrs: {"c1":{"due":"2026-08-08T04:00:00.000Z","s":3.2,"d":5.1,"reps":2,"lapses":0,"state":2,"last":"2026-08-06T04:00:00.000Z"},"c9":{"due":"2026-08-01T00:00:00.000Z","s":1,"d":5,"reps":1,"lapses":0,"state":2,"last":"2026-07-30T00:00:00.000Z"}}',
  '---',
  '',
  '<!-- card:c1 -->',
  'Q: 洛必达法则的适用条件?',
  '第二行也算问题',
  'A: 0/0 或 ∞/∞ 型;分母导数不为零;极限存在或为无穷。',
  '',
  '<!-- card:c3 -->',
  'Q: 什么是驻点?',
  'A: 一阶导数为零的点。',
  '',
].join('\n')
const d1 = T.parseDeck(SAMPLE)
A.equal(d1.name, '高数第三章')
A.equal(d1.cards.length, 2)
A.equal(d1.cards[0].id, 'c1')
A.ok(d1.cards[0].q.includes('第二行也算问题'), '多行 Q 保留')
A.equal(d1.cards[1].a, '一阶导数为零的点。')
A.ok(d1.fsrs.c1 && d1.fsrs.c9, '解析保留孤儿状态键(读端惰性忽略)')
const s1 = T.serializeDeck(d1)
A.ok(!s1.includes('"c9"'), '写文件时清理孤儿状态键')
const d2 = T.parseDeck(s1)
A.deepEqual(d2.cards, d1.cards, '往返不丢卡')
A.deepEqual(d2.fsrs.c1, d1.fsrs.c1, '往返不丢调度状态')
A.deepEqual(T.parseDeck(T.serializeDeck(d2)).cards, d2.cards, '再写再读稳定')
d2.cards[0].q = '手改了问题'
const d2b = T.parseDeck(T.serializeDeck(d2))
A.deepEqual(d2b.fsrs.c1, d1.fsrs.c1, '手改 Q/A 永不触碰调度状态')
A.equal(d2b.cards[0].q, '手改了问题')
const d3 = T.parseDeck('<!-- card:c1 -->\nQ: q\nA: a\n')
A.equal(d3.cards.length, 1, '无 frontmatter 也能解析')
A.deepEqual(d3.fsrs, {})
A.equal(T.parseDeck(SAMPLE.replace(/\n/g, '\r\n')).cards.length, 2, 'CRLF 输入兼容')
A.equal(T.parseDeck('---\ndeck: x\nfsrs: {bad json\n---\nno cards').cards.length, 0, '坏 fsrs JSON 不炸')

// ── 保真闸(评审第二轮 P0:解析器过严 + 有损全量重写 = 一次普通交互抹掉用户文件) ──
const FSRS_ONE = '{"c1":{"due":"2026-08-08T04:00:00.000Z","s":3.2,"d":5.1,"reps":2,"lapses":0,"state":2,"last":"2026-08-06T04:00:00.000Z"}}'
const mkBody = '\n<!-- card:c1 -->\nQ: q\nA: a\n'
const tolerantVectors = [
  ['开栏行尾空格', `--- \ndeck: 容组\nfsrs: ${FSRS_ONE}\n---${mkBody}`],
  ['开栏行尾制表符', `---\t\ndeck: 容组\nfsrs: ${FSRS_ONE}\n---${mkBody}`],
  ['文件开头空行', `\n---\ndeck: 容组\nfsrs: ${FSRS_ONE}\n---${mkBody}`],
  ['文件开头 BOM', '\uFEFF' + `---\ndeck: 容组\nfsrs: ${FSRS_ONE}\n---${mkBody}`],
  ['键前缩进', `---\n  deck: 容组\n  fsrs: ${FSRS_ONE}\n---${mkBody}`],
  ['闭栏用 ...', `---\ndeck: 容组\nfsrs: ${FSRS_ONE}\n...${mkBody}`],
]
for (const [label, text] of tolerantVectors) {
  const p = T.parseDeck(text)
  A.equal(p.name, '容组', `容错解析(${label}):deck 名不丢`)
  A.ok(p.fsrs && p.fsrs.c1 && p.fsrs.c1.s === 3.2, `容错解析(${label}):fsrs 调度状态不丢`)
  A.equal(p.cards.length, 1, `容错解析(${label}):卡片在`)
}
A.equal(T.parseDeck('<!-- card: c1 -->\nQ: q\nA: a').cards[0].id, 'c1', 'card 标记容忍冒号后空格')
A.equal(T.parseDeck('<!-- CARD:c1 -->\nQ: q\nA: a').cards[0].id, 'c1', 'card 标记容忍大写')

// 认不出的一切原样保留:未知 frontmatter 键 + 首个 card 标记前的正文,重写后一个都不许少
const RICH = ['---', 'deck: 富组', 'tags: 数学, 考研', `fsrs: ${FSRS_ONE}`, 'icon: book', '---', '', '# 第三章导言', '手写前言,不是卡片。', '', '<!-- card:c1 -->', 'Q: q1', 'A: a1', ''].join('\n')
const rp = T.parseDeck(RICH)
A.equal(rp.cards.length, 1)
const rs = T.serializeDeck(rp)
for (const keep of ['tags: 数学, 考研', 'icon: book', '# 第三章导言', '手写前言,不是卡片。']) A.ok(rs.includes(keep), `保真重写:「${keep}」不许被吞`)
const rp2 = T.parseDeck(rs)
A.deepEqual(rp2.cards, rp.cards, '保真重写后卡片不变')
A.deepEqual(rp2.fsrs, rp.fsrs, '保真重写后调度状态不变')
A.equal(T.serializeDeck(rp2), rs, '第二次重写字节稳定')

// 坏 fsrs 行 = 用户的调度状态尚可抢救,绝不许重写成 {} 抹掉
const BADF = '---\ndeck: 坏组\nfsrs: {oops broken json\n---\n\n<!-- card:c1 -->\nQ: q\nA: a\n'
const bp = T.parseDeck(BADF)
A.equal(bp.fsrsBroken, true, '坏 fsrs → fsrsBroken 标记')
const bs = T.serializeDeck(bp)
A.ok(bs.includes('fsrs: {oops broken json'), '坏 fsrs 原始行原样写回')
A.ok(!bs.includes('fsrs: {}'), '绝不重写成空 {}')

// 正文里的 card 标记字面量:写盘转义(card\:)、读回还原,内容永远撑不破结构
const escText = T.serializeDeck({ name: 'E', fsrs: {}, cards: [{ id: 'c1', q: '格式演示:\n<!-- card:c99 -->\n上面是标记长相', a: '答案' }] })
A.ok(escText.includes('card\\:c99'), '续行里的标记字面量写盘时已转义')
const ep = T.parseDeck(escText)
A.equal(ep.cards.length, 1, '标记字面量不许把一张卡撑成两张')
A.equal(ep.cards[0].q, '格式演示:\n<!-- card:c99 -->\n上面是标记长相', 'Q 逐字往返')
A.equal(ep.cards[0].a, '答案', 'A 不被吞')

// ── ID 分配不撞(含手删中间卡 / 孤儿状态键) ──
A.equal(T.nextCardId({ cards: [{ id: 'c1' }, { id: 'c3' }], fsrs: {} }), 'c4', '删中间卡后取 max+1')
A.equal(T.nextCardId({ cards: [{ id: 'c1' }], fsrs: { c9: {} } }), 'c10', '孤儿状态键也参与 max 扫描(避免继承旧调度)')
A.equal(T.nextCardId({ cards: [], fsrs: {} }), 'c1')
A.equal(T.nextCardId(d1), 'c10', '样例卡组下一个 ID')

// ── ```deck 块解析(含模型废话) ──
const fenced = T.parseDeckFence('好的,这就来!\n\n```deck\ndeck: 高数第三章\nQ: 什么是极限?\nA: 略。\n\nQ: 连续的定义?\n第二行\nA: 处处极限等于函数值。\n```\n以上就是卡组,祝学习顺利!')
A.ok(fenced, '模型多输出废话时仍能抠出块')
A.equal(fenced.name, '高数第三章')
A.equal(fenced.cards.length, 2)
A.ok(fenced.cards[1].q.includes('第二行'), '块内多行 Q 保留')
A.equal(T.parseDeckFence('没有块的纯文本'), null, '无块 → null')
const noName = T.parseDeckFence('```deck\nQ: q\nA: a\n```')
A.equal(noName.name, '', '缺 deck: 行 → 名字留空由调用方兜底')
A.equal(noName.cards.length, 1)
A.equal(T.parseDeckFence('```deck\nQ: 只有问题没有答案\n```'), null, '残缺对被丢弃')
// 围栏深度:答案里内嵌 ```python 代码块不许被当成 deck 块闭栏(非贪婪正则会提前截断丢卡)
const nested = T.parseDeckFence('好的!\n```deck\ndeck: 编程组\nQ: 写个 hello world\nA: 见下\n```python\nprint(1)\n```\n\nQ: 第二题\nA: 答二\n```\n以上!')
A.ok(nested, '内嵌代码块的 deck 块能解析')
A.equal(nested.cards.length, 2, '内嵌围栏不许丢卡')
A.ok(nested.cards[0].a.includes('print(1)'), '答案里的代码块完整保留')
A.equal(nested.cards[1].a, '答二', '第二张卡不丢')
A.equal(T.parseDeckFence('```deck\ndeck: x\nQ: q\nA: a\n没有闭栏就断流了'), null, '未闭合块 → null(提示重试,不吞垃圾)')

// ── ④ XSS:恶意字符串走渲染器后无属性注入 ──
const box = mkEl('div')
T.renderMarkdown(box, '**hi** <img src=x onerror=alert(1)> `code`')
A.ok(box.textContent.includes('hi') && box.textContent.includes('<img') && box.textContent.includes('onerror'), '<img onerror> 应作为字面文字保留')
A.equal(findAll(box, 'img').length, 0, '绝不能创建 img 元素')
A.equal(anyAttr(box, 'onerror'), false, '绝不能设 onerror 属性')
const box2 = mkEl('div')
T.renderMarkdown(box2, '# H\n\n- a\n- b\n\n[good](https://x.com) [bad](javascript:evil)')
A.equal(findAll(box2, 'h1').length, 1)
A.equal(findAll(findAll(box2, 'ul')[0], 'li').length, 2)
const as = findAll(box2, 'a')
A.equal(as[0].attrs.href, 'https://x.com', '安全链接设 href')
A.equal(as[1].attrs.href, undefined, '危险协议不设 href')
A.equal(T.safeHref('javascript:alert(1)'), '')
A.equal(T.safeHref('https://x.com'), 'https://x.com')

// ── 主题可读性(bluebird 血泪回归:cream 暗色强调色是纸白) ──
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
for (const [name, ac] of [['cream-dark', '#f8f7f6'], ['cream-light', '#1c1c1c'], ['lovable-dark', '#ece7dd'], ['echo-dark', '#ff9a7d'], ['qbird-dark', '#5fa3b2'], ['zhi', '#1e96eb']]) {
  const on = T.onColorOf(hex(ac))
  A.ok(T.contrast(hex(ac), hex(on)) >= 4.5, `${name} 强调色上的兜底字色对比度不足(${on})`)
}
A.equal(T.onColorOf(hex('#f8f7f6')), '#16161a', '纸白强调色上必须给深字')
A.equal(T.onColorOf(hex('#1c1c1c')), '#ffffff', '炭黑强调色上必须给白字')
const rgbOf = (s) => s.match(/\d+/g).map(Number)
const blended = rgbOf(T.readableOn(hex('#2a292b'), hex('#2a292b'), hex('#f2efe8')))
A.ok(T.contrast(blended, hex('#2a292b')) >= 3, '与底色同色的强调色应被掺开到 3:1')

// ── 语言纪律:注入模型的指令段全英文 + ```deck 契约在场 ──
const prompt = T.GEN_PROMPT('NOTE_BODY_MARKER')
A.ok(prompt.includes('NOTE_BODY_MARKER'), '笔记全文进 message')
A.ok(prompt.includes('```deck') && prompt.includes('deck:'), '要求 ```deck 块契约')
A.ok(/8 to 20/.test(prompt), '8-20 张')
A.ok(!/[一-鿿]/.test(T.GEN_PROMPT('')), '指令段(除笔记原文)必须全英文')

// ── 展示辅助 ──
A.equal(T.fmtDelta(DAY), '1 天')
A.equal(T.fmtDelta(60000), '1 分钟')
A.equal(T.fmtDelta(3 * 3600000), '3 小时')
A.equal(T.stateLabel(null, NOW).text, '新卡')
A.equal(T.stateLabel({ state: 1 }, NOW).text, '学习中')
A.equal(T.stateLabel({ state: 3 }, NOW).text, '重学中')
A.equal(T.stateLabel({ state: 2, due: new Date(NOW - 1000).toISOString() }, NOW).text, '到期')
A.equal(T.stateLabel({ state: 2, due: new Date(NOW + 3 * DAY).toISOString() }, NOW).text, '3 天后')

// ── 日期算术(冻钟 + 当前 TZ;DST 三定式验证) ──
A.equal(T.dayKey(NOW), '2026-08-06', `本地日期(TZ=${process.env.FC_TZ})`)
A.equal(T.dayDiff('2026-08-06', '2026-08-05'), 1)
A.equal(T.dayDiff('2026-08-06', '2026-08-01'), 5)
A.equal(T.dayDiff('2026-08-01', '2026-08-06'), -5)
A.equal(T.dayDiff('2026-03-09', '2026-03-08'), 1, '春令跳时(美东 3-08)不跳日')
A.equal(T.dayDiff('2026-03-30', '2026-03-29'), 1, '春令跳时(伦敦 3-29)不跳日')
A.equal(T.dayDiff('2026-11-02', '2026-11-01'), 1, '秋令回拨不重日')

// ── 连击:昨天复习过才 +1;只有历史新高才发成就事件 ──
_ls.delete('plugin.flashcards.streak')
tracked.length = 0
let sk = T.updateStreak()
A.deepEqual(sk, { last: '2026-08-06', len: 1, max: 1 }, '首日连击 = 1')
A.deepEqual(tracked, [['streak', 1]], '首日破纪录 → 发 1')
sk = T.updateStreak()
A.equal(sk.len, 1, '同日再复习不重复计')
A.equal(tracked.length, 1, '同日不再发事件')
_ls.set('plugin.flashcards.streak', JSON.stringify({ last: '2026-08-05', len: 3, max: 5 }))
sk = T.updateStreak()
A.equal(sk.len, 4, '昨天复习过 → 连击 +1')
A.equal(tracked.length, 1, '未破纪录不发事件')
_ls.set('plugin.flashcards.streak', JSON.stringify({ last: '2026-08-05', len: 5, max: 5 }))
sk = T.updateStreak()
A.deepEqual(tracked[1], ['streak', 1], '破纪录 → 补发差值')
_ls.set('plugin.flashcards.streak', JSON.stringify({ last: '2026-08-03', len: 9, max: 9 }))
sk = T.updateStreak()
A.equal(sk.len, 1, '断签 → 连击归 1')
A.equal(tracked.length, 2, '断签不发事件')

// ── 落盘:重名加序号不破 .deck.md 后缀 ──
V.set('记忆闪卡/高数.deck.md', SAMPLE)
A.equal(await T.uniqueDeckPath('高数'), '记忆闪卡/高数 2.deck.md', '重名 → 名字 2.deck.md')
A.equal(await T.uniqueDeckPath('新组'), '记忆闪卡/新组.deck.md')
A.equal(await T.uniqueDeckPath('a/b:c'), '记忆闪卡/a_b_c.deck.md', '非法字符消毒')

// ── 索引自愈:新建/打开刷新对应行;孤儿行剔除 ──
await T.refreshDeckRow('记忆闪卡/高数.deck.md')
let idx = await T.readIndex()
A.equal(idx.decks.length, 1)
A.equal(idx.decks[0].name, '高数第三章')
A.equal(idx.decks[0].cards, 2)
A.equal(idx.decks[0].due, 0, 'c1 未到期(due 在未来)、c9 是孤儿键不计')
A.ok(idx.decks[0].touched === NOW, 'touched 用冻结钟')
V.delete('记忆闪卡/高数.deck.md')
await T.refreshDeckRow('记忆闪卡/高数.deck.md')
idx = await T.readIndex()
A.equal(idx.decks.length, 0, '文件读不到 → 孤儿行剔除')

// ── 队列构建:到期优先 + 新卡按每日上限补足 ──
const mkDeck = (name, cards, fsrs) => T.serializeDeck({ name, cards, fsrs })
const duePast = { due: new Date(NOW - 2 * DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 4 * DAY).toISOString() }
const dueFuture = { due: new Date(NOW + 5 * DAY).toISOString(), s: 9, d: 4, reps: 2, lapses: 0, state: 2, last: new Date(NOW - DAY).toISOString() }
V.set('记忆闪卡/A.deck.md', mkDeck('组A', [{ id: 'c1', q: 'q1', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }, { id: 'c3', q: 'q3', a: 'a3' }, { id: 'c4', q: 'q4', a: 'a4' }], { c1: duePast, c4: dueFuture }))
V.set('记忆闪卡/B.deck.md', mkDeck('组B', [{ id: 'c1', q: 'qb', a: 'ab' }], {}))
await T.refreshDeckRow('记忆闪卡/A.deck.md')
await T.refreshDeckRow('记忆闪卡/B.deck.md')
_ls.set('plugin.flashcards.dailyLimit', '2')
_ls.delete('plugin.flashcards.daily')
let q = await T.buildQueue(null)
A.equal(q.decks, 2, '两个卡组')
A.equal(q.items.length, 3, '1 到期 + 新卡按上限 2 补足')
A.equal(q.items[0].id, 'c1', '到期卡排最前')
A.ok(q.items[0].prev && q.items[0].path === '记忆闪卡/A.deck.md')
A.equal(q.freshSkipped, 1, '超出上限的新卡暂缓')
A.ok(!q.items.find((it) => it.id === 'c4'), '未到期的卡不进队列')
_ls.set('plugin.flashcards.daily', JSON.stringify({ date: '2026-08-06', introduced: 1, reviewed: 3 }))
q = await T.buildQueue(null)
A.equal(q.items.length, 2, '今日已引入 1 张 → 只再补 1 张新卡')
q = await T.buildQueue({ path: '记忆闪卡/B.deck.md' })
A.equal(q.items.length, 1, '只看某一组')
A.equal(q.items[0].deckName, '组B')
V.delete('记忆闪卡/B.deck.md')
q = await T.buildQueue(null)
A.equal(q.decks, 1, 'buildQueue 也剔除孤儿行(索引自愈)')
idx = await T.readIndex()
A.equal(idx.decks.length, 1)
// fsrs 行损坏的卡组:展示不复习(入队评分会把全组当新卡重建调度 = 毁档)
V.set('记忆闪卡/坏.deck.md', '---\ndeck: 坏组\nfsrs: {not json\n---\n\n<!-- card:c1 -->\nQ: q\nA: a\n')
await T.refreshDeckRow('记忆闪卡/坏.deck.md')
q = await T.buildQueue(null)
A.ok(!q.items.find((it) => it.path === '记忆闪卡/坏.deck.md'), 'fsrsBroken 卡组的卡不进复习队列')
A.ok(q.rows.find((r) => r.path === '记忆闪卡/坏.deck.md'), '但卡组行仍在列表里(用户能看见它)')
V.delete('记忆闪卡/坏.deck.md')

// ── 复习落盘轨迹:评分 = 读改写该卡组文件,状态进 frontmatter ──
{
  const t = V.get('记忆闪卡/A.deck.md')
  const deck = T.parseDeck(t)
  deck.fsrs.c2 = T.schedule(null, 3, NOW)
  V.set('记忆闪卡/A.deck.md', T.serializeDeck(deck))
  const back = T.parseDeck(V.get('记忆闪卡/A.deck.md'))
  A.equal(back.fsrs.c2.state, 2, '评分状态落盘可回读')
  A.equal(Date.parse(back.fsrs.c2.due) - NOW, DAY)
  A.deepEqual(back.fsrs.c1, duePast, '其他卡状态原样')
}

// ══ ⑦ 挂载冒烟(评审第二轮:render 路径此前零门禁 —— RangeError/焦点抢夺/快照回滚全在这条路上) ══
{
  // 状态清场:前面的队列测试留下了 dailyLimit=2 / daily 计数 / 旧卡组,挂载场景必须自铺
  _ls.delete('plugin.flashcards.daily')
  _ls.set('plugin.flashcards.dailyLimit', '50')
  V.clear()
  writes.length = 0
  const reviewDef = reg.views.find((v) => v.id === 'review')
  const ftDef = reg.fileTypes.find((f) => f.id === 'deck')
  const idxPath = '记忆闪卡/.deck-index.json'
  const rootOf = (host) => host.children.find((c) => c.className === 'fc-root')

  // 场景 1:复习会话 —— 到期卡带巨大 s(手改/agent 写坏),翻面四档预览与评分不许崩
  const hugeState = { due: new Date(NOW - DAY).toISOString(), s: 1e9, d: 5, reps: 3, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }
  V.set('记忆闪卡/H.deck.md', mkDeck('豪组', [{ id: 'c1', q: 'hq1', a: 'ha1' }, { id: 'c2', q: 'hq2', a: 'ha2' }], { c1: hugeState }))
  await T.refreshDeckRow('记忆闪卡/H.deck.md')
  const host1 = mkEl('div')
  const disposeR1 = reviewDef.mount(host1)
  await sleep(30)
  const root1 = rootOf(host1)
  A.ok(root1, '复习台挂载出 fc-root')
  A.ok(host1.textContent.includes('豪组'), '会话相位显示到期卡')
  A.ok(root1.focusCalls >= 1, '挂载时聚焦一次(视图内键盘流)')
  fire(buttonByText(root1, '显示答案'), 'click') // 巨大 s 卡:翻面即渲染四档间隔预览 —— 无钳制时这里 RangeError
  A.ok(buttonByText(root1, '记得 3'), '翻面后四档评分按钮在场')
  fire(buttonByText(root1, '记得 3'), 'click')
  await sleep(30)
  const afterRate = T.parseDeck(V.get('记忆闪卡/H.deck.md'))
  A.equal(afterRate.fsrs.c1.state, 2, '评分落盘')
  A.ok(Date.parse(afterRate.fsrs.c1.due) - NOW <= 36500 * DAY, '巨大 s 评分后 due 合法且封顶')
  fire(buttonByText(root1, '显示答案'), 'click')
  fire(buttonByText(root1, '记得 3'), 'click')
  await sleep(30)
  A.ok(host1.textContent.includes('今日复习完成'), '复习完进入庆祝态')

  // 场景 2:空闲相位的复习台 —— 后台 'decks' 事件(编辑器自动保存)不许抢焦点、须合并重扫
  const host2 = mkEl('div')
  const disposeR2 = reviewDef.mount(host2)
  await sleep(30)
  const root2 = rootOf(host2)
  A.ok(host2.textContent.includes('暂无到期卡片'), '第二台:两张卡都已排到未来 → idle')
  const outside = mkEl('input')
  document.activeElement = outside // 用户正在别处(分屏编辑器)打字
  const f0 = root2.focusCalls
  V.set('记忆闪卡/C.deck.md', mkDeck('新组C', [{ id: 'c1', q: 'cq', a: 'ca' }], {}))
  await T.refreshDeckRow('记忆闪卡/C.deck.md')
  const idxWrites0 = writes.filter((p) => p === idxPath).length
  T.bus.emit({ type: 'decks' })
  T.bus.emit({ type: 'decks' })
  T.bus.emit({ type: 'decks' }) // 连发三次 = 编辑器打字自动保存风暴
  await sleep(1100)
  A.ok(host2.textContent.includes('新组C'), "'decks' 后列表确实刷新了(合并窗不许吞掉刷新)")
  A.equal(root2.focusCalls, f0, '后台刷新绝不抢焦点(评审携带项:分屏每 600ms 夺走输入焦点)')
  A.equal(writes.filter((p) => p === idxPath).length - idxWrites0, 1, '三连 decks 事件合并成一次重扫(写放大治理)')
  A.equal(document.activeElement, outside, '用户焦点留在原处')

  // 场景 3:编辑器「复习本组」→ 已挂载复习台消费后必须清 pendingReview(关掉再开不许被旧范围污染)
  const hostE = mkEl('div')
  const disposeE = ftDef.mount(hostE, { filePath: '记忆闪卡/H.deck.md' })
  await sleep(30)
  const rootE = rootOf(hostE)
  A.ok(rootE.querySelector('[data-review]'), '编辑器渲染出「复习本组」')
  fire(rootE.querySelector('[data-review]'), 'click')
  await sleep(30)
  A.equal(T.peekPending(), null, '已挂载复习台消费 review-open 后必须清 pendingReview')
  A.ok(host2.textContent.includes('只看'), '复习台进入只看范围')

  // 场景 4:P1 —— 编辑器持陈旧 fsrs 快照,写盘前必须读盘合并,绝不回滚复习进度
  const PM = '记忆闪卡/M.deck.md'
  V.set(PM, mkDeck('合并组', [{ id: 'c1', q: 'mq', a: 'ma' }], {}))
  const hostM = mkEl('div')
  const disposeM = ftDef.mount(hostM, { filePath: PM })
  await sleep(30)
  const progressed = T.schedule(null, 3, NOW)
  V.set(PM, mkDeck('合并组', [{ id: 'c1', q: 'mq', a: 'ma' }], { c1: progressed })) // 分屏:复习台随后写入了进度
  const rootM = rootOf(hostM)
  const nameEl = rootM.querySelector('[data-name]')
  A.ok(nameEl, '编辑器渲染出卡组名输入框')
  nameEl.value = '合并组改名'
  fire(nameEl, 'input')
  disposeM() // 卸载 = 立即 flush(不等 600ms 防抖)
  await sleep(30)
  const merged = T.parseDeck(V.get(PM))
  A.equal(merged.name, '合并组改名', '编辑器自己的改动落盘')
  A.deepEqual(merged.fsrs.c1, progressed, '写盘前读盘合并:复习进度绝不被陈旧快照回滚')

  // 场景 5:P0 兜底守卫 —— 不合卡组格式的文件进只读警示态,绝不许被空 deck 覆盖
  V.set('记忆闪卡/杂.deck.md', '# 随笔\n就是一段被改错后缀的普通笔记。')
  const hostG = mkEl('div')
  const disposeG = ftDef.mount(hostG, { filePath: '记忆闪卡/杂.deck.md' })
  await sleep(30)
  A.ok(hostG.textContent.includes('停用编辑'), '非卡组格式 → 只读警示')
  A.equal(findAll(hostG, 'textarea').length, 0, '警示态没有可编辑面')
  const wG = writes.length
  disposeG()
  await sleep(20)
  A.equal(writes.length, wG, '警示态从挂载到卸载零写盘')
  A.equal(V.get('记忆闪卡/杂.deck.md'), '# 随笔\n就是一段被改错后缀的普通笔记。', '原文件一字未动')
  // 而合法的空卡组(新建即是)必须照常可编辑 —— 守卫不许误伤「新建 → 加卡」主流程
  V.set('记忆闪卡/空.deck.md', T.serializeDeck({ name: '空组', fsrs: {}, cards: [] }))
  const hostN = mkEl('div')
  const disposeN = ftDef.mount(hostN, { filePath: '记忆闪卡/空.deck.md' })
  await sleep(30)
  A.ok(!hostN.textContent.includes('停用编辑'), '合法空卡组不许被守卫误伤')
  A.ok(buttonByText(rootOf(hostN), '加卡'), '空卡组照常可加卡')
  disposeN()

  // 场景 6:fileCreator 契约 —— 宿主给 '' = 库根(types.ts 钉死),不许劫持进工作文件夹
  let promptAnswer = '根上新组'
  ctx.app.prompt = async () => promptAnswer
  await creator.run('')
  A.ok(V.has('根上新组.deck.md'), "宿主 parentFolder='' → 文件落库根")
  A.ok(!V.has('记忆闪卡/根上新组.deck.md'), '不许被劫持进工作文件夹')
  promptAnswer = '文件夹组'
  await creator.run('学习/数学')
  A.ok(V.has('学习/数学/文件夹组.deck.md'), '指定文件夹 → 落该文件夹')
  promptAnswer = '闲建组'
  fire(buttonByText(root2, '新建卡组'), 'click') // 复习台按钮 = 插件自发起(null)→ 工作文件夹
  await sleep(30)
  A.ok(V.has('记忆闪卡/闲建组.deck.md'), '插件自发起(无归属)→ 落工作文件夹')
  // 失败路径:不许 unhandled rejection,必须 toast
  promptAnswer = '爆组'
  const origWrite = ctx.app.writeFile
  ctx.app.writeFile = async (p, t) => { if (String(p).includes('爆组')) throw new Error('disk full'); return origWrite(p, t) }
  const n6 = reg.notices.length
  await creator.run('') // 内部兜错 → 这里绝不 reject
  A.ok(reg.notices.slice(n6).some((m) => String(m).includes('新建卡组失败')), '新建失败必须错误 toast')
  ctx.app.writeFile = origWrite
  // 取消路径:prompt 拒绝 = 取消,不许当错误
  ctx.app.prompt = async () => { throw new Error('user dismissed') }
  const n6b = reg.notices.length
  await creator.run('')
  A.equal(reg.notices.length, n6b, 'prompt 拒绝 = 取消,零提示零写盘')
  ctx.app.prompt = async () => null

  // 场景 7:AI 建卡超长笔记 —— 截断必须提示,不许静默(评审携带项)
  globalThis.window = { tangu: { getConfig: async () => ({ backendUrl: 'http://x', token: 't' }) } }
  globalThis.fetch = async () => { throw new Error('offline') }
  ctx.app.getActivePageText = () => 'N'.repeat(30000)
  const n7 = reg.notices.length
  await T.generateFromNote()
  const msgs = reg.notices.slice(n7).map(String)
  A.ok(msgs.some((m) => m.includes('20000')), '超长笔记必须提示只用前 20000 字')
  A.ok(msgs.some((m) => m.includes('AI 建卡失败')), '失败路径照常 toast')
  A.equal(T.gen.active, false, '失败后建卡状态复位')
  A.equal(T.clipNote('x'.repeat(30000)).text.length, 20000, 'clipNote 截到 20000')
  A.equal(T.clipNote('x'.repeat(30000)).truncated, true)
  A.equal(T.clipNote('短').truncated, false, '不超长不标截断')
  ctx.app.getActivePageText = () => ''
  globalThis.window = {}

  // 场景 8:评分瞬间文件被外部写坏(队列构建后的竞态)—— rate 兜底不许把坏 fsrs 行重写掉
  V.set('记忆闪卡/R.deck.md', mkDeck('竞态组', [{ id: 'c1', q: 'rq', a: 'ra' }], { c1: { due: new Date(NOW - DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() } }))
  await T.refreshDeckRow('记忆闪卡/R.deck.md')
  const host3 = mkEl('div')
  const disposeR3 = reviewDef.mount(host3)
  await sleep(30)
  const root3 = rootOf(host3)
  A.ok(host3.textContent.includes('竞态组'), '到期卡在场')
  fire(buttonByText(root3, '显示答案'), 'click')
  const brokenText = '---\ndeck: 竞态组\nfsrs: {mid-air corruption\n---\n\n<!-- card:c1 -->\nQ: rq\nA: ra\n'
  V.set('记忆闪卡/R.deck.md', brokenText) // 翻面后、评分前一瞬被外部写坏
  const n8 = reg.notices.length
  fire(buttonByText(root3, '记得 3'), 'click')
  await sleep(30)
  A.equal(V.get('记忆闪卡/R.deck.md'), brokenText, '竞态兜底:坏文件绝不被评分写盘触碰')
  A.ok(reg.notices.slice(n8).some((m) => String(m).includes('保存失败')), '评分写盘失败必须 toast')
  disposeR3()

  disposeE()
  disposeR1()
  disposeR2()
}

// ── ② disposer 执行不抛 ──
dispose()

// 挂载冒烟全程不许有未处理的 Promise 拒绝(async render 崩溃不许静默溜走)
await sleep(80)
A.equal(rejections.length, 0, `存在未处理拒绝:${rejections.map((e) => (e && e.stack) || String(e)).join(' | ')}`)

// ── ⑥ 旧宿主(a):07-18 后 API 全删(连 registerView/app.readFile 都没有)→ setup 不抛,只留提示 ──
{
  const oldReg = { commands: [], settings: [], notices: [] }
  const oldCtx = {
    registerCommand: (c) => oldReg.commands.push(c),
    registerSetting: (s) => oldReg.settings.push(s),
    registerSlashItem() { },
    registerTheme() { },
    app: { notify: (m) => oldReg.notices.push(m), getActivePage: () => null, getActivePageText: () => '', loadPage() { }, createPage() { }, openSearch() { } },
  }
  const oldDispose = new Function('ctx', src)(oldCtx)
  A.equal(typeof oldDispose, 'function', '旧宿主(a)setup 应返回 disposer 且不抛')
  oldDispose()
  A.equal(oldReg.commands.length, 0, '无视图 API → 不注册命令(避免指向不存在的视图)')
  A.equal(oldReg.settings.length, 0, '无视图 API → 不注册设置')
  A.equal(oldReg.notices.length, 1, '旧宿主(a)应收到一条降级提示')
}

// ── ⑥ 旧宿主(b):仅缺 registerFileType → 复习台照常,建卡入口整体隐藏 ──
{
  const bReg = { views: [], commands: [], settings: [], creators: [], notices: [] }
  const bCtx = {
    registerView: (v) => bReg.views.push(v),
    registerCommand: (c) => bReg.commands.push(c),
    registerSetting: (s) => bReg.settings.push(s),
    openView() { },
    app: { notify: (m) => bReg.notices.push(m), readFile: async () => null, writeFile: async () => { }, openFile() { }, getActivePageText: () => '' },
  }
  const bDispose = new Function('ctx', src)(bCtx)
  A.equal(typeof bDispose, 'function', '旧宿主(b)setup 应返回 disposer 且不抛')
  bDispose()
  A.deepEqual(bReg.views.map((v) => v.id), ['review'], '复习台照常注册')
  A.deepEqual(bReg.commands.map((c) => c.id), ['flashcards-open'], '只留打开命令;from-note 不注册(避免建出被笔记编译器改写的文件)')
  A.deepEqual(bReg.settings.map((s) => s.key), ['dailyLimit'])
  A.equal(bReg.creators.length, 0)
}

// ── 内置抢占 .deck.md(registerFileType === false)→ 整体退让,只留提示 ──
{
  const cReg = { views: [], commands: [], settings: [], creators: [], notices: [] }
  const cCtx = {
    registerView: (v) => cReg.views.push(v),
    registerCommand: (c) => cReg.commands.push(c),
    registerSetting: (s) => cReg.settings.push(s),
    registerFileType: () => false,
    registerFileCreator: (f) => cReg.creators.push(f),
    notify: (m) => cReg.notices.push(m),
    openView() { },
    achievements: { registerSeries() { }, track() { } },
    app: { notify: (m) => cReg.notices.push(m), readFile: async () => null, writeFile: async () => { }, openFile() { }, getActivePageText: () => '' },
  }
  const cDispose = new Function('ctx', src)(cCtx)
  A.equal(typeof cDispose, 'function')
  cDispose()
  A.equal(cReg.views.length, 0, '退让:不注册视图')
  A.equal(cReg.commands.length, 0, '退让:不注册命令')
  A.equal(cReg.creators.length, 0, '退让:不注册新建入口')
  A.equal(cReg.settings.length, 0, '退让:不注册设置')
  A.equal(cReg.notices.length, 1, '只留一条提示')
}

console.log(`check ok [TZ=${process.env.FC_TZ}] — 贡献点/FSRS 向量(含钳制)/契约往返(保真三防线)/围栏解析(内嵌代码块)/ID 分配/XSS/索引自愈/队列/连击/挂载冒烟(焦点·合并写·守卫·创建契约)/旧宿主两档/内置退让 全部通过`)
