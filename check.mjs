/**
 * 记忆闪卡插件自检:宿主同款 new Function('ctx', src) 求值 main.js + DOM 垫片 + 冻结时钟 + 内存 vault。
 * 覆盖:贡献点契约 / disposer / FSRS 已知向量(≥4 组,含巨大 s 钳制) /
 *       数据契约往返(孤儿状态剔除、保真三防线、正文标记转义) /
 *       ```deck 块解析(含模型废话、内嵌代码块围栏深度) / ID 分配不撞 / XSS / 索引自愈 /
 *       队列构建(每日上限、坏 fsrs 跳过) / 连击与日期算术(DST 三定式,四时区扫描) /
 *       挂载冒烟(复习会话渲染、焦点归属、decks 事件合并、pendingReview 消费、
 *       编辑器读盘合并写、只读守卫、fileCreator 库根契约、AI 建卡截断提示、评分竞态兜底) /
 *       双语(词表两侧键集合 + 占位符一致、英文侧零中文、en 宿主真渲英文、切语言不重挂即变、卸载退订) /
 *       旧宿主降级(两档) / 内置抢后缀整体退让 /
 *       状态栏(纯函数向量、状态栏数字 ≡ 队列长度的不变式、三态文案、索引自愈、
 *         轮询与 handle 的泄漏防线、提醒 P0:读失败零提醒·标记后落·合并写) /
 *       v4 载体路由(不读 blocks/order) / 降级宿主下的活动页写保护。
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
// 落盘的东西不许走词表:t('untitledDeck') 会让「没名字」在 en/zh 下落成两个不同文件名
A.ok(!/t\(\s*['"]untitledDeck['"]/.test(src), "落盘兜底卡组名不许走 t()(文件名是数据契约,不随界面语言变)")
A.ok(/fence\.name \|\| UNTITLED_DECK/.test(src), 'AI 建卡的卡组名兜底必须钉死 UNTITLED_DECK canonical')
A.ok(!/for \(const n of Object\.keys\(vars\)\)/.test(src), 't() 占位符禁逐键顺序替换(先替进去的用户数据会被二次替换)')
A.ok(src.includes('__FLASHCARDS_TEST__'), '应有测试钩子')
// BRIEF #9 v4/unified 载体:普通笔记没有块 id,块寻址 API 在它上面会被诚实拒绝 ——
// 本插件的产物是独立的 .deck.md 文件,从不改活动页正文,所以这些 API 一个都不该出现。
for (const bad of ['insertBlockAfter', 'mountBlocks', 'deleteBlock', 'setFmExtra', 'requestFocus', 'subscribePage']) {
  A.ok(!src.includes(bad), `v4 路由:源码不许出现块寻址 API ${bad}`)
}
A.ok(!/\.undo\s*\(/.test(src), 'v4 路由:不许调页面撤销栈 undo()')
A.ok(!/getPage\(\)\s*\.\s*(blocks|order)/.test(src), 'v4 路由:不许从 getPage() 读 blocks / order 拿正文')
A.ok(/getActivePageText/.test(src), '取当前笔记正文一律走 getActivePageText(v3/v4 都成立)')
// 1.2.0 状态栏:轮询频率封在源码里(R7)
A.ok(/STATUS_POLL = 5 \* MIN/.test(src), 'R7:轮询间隔钉成 STATUS_POLL = 5 * MIN')
A.ok(/statusDisposed = true/.test(src), 'R8b:disposer 必须先立 statusDisposed 标志(只清 timer 会被飞行中的 refresh 重臂)')
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
A.equal(man.version, '1.2.2')
A.equal(man.apiVersion, 1)
A.equal(man.main, 'main.js')
// 双语 manifest:中文是 canonical(任何宿主都显示得出),英文另开字段;旧宿主忽略新字段
A.equal(man.nameEn, 'Flashcards', 'manifest 必须有英文名')
A.ok(man.descriptionEn && !/[一-鿿]/.test(man.descriptionEn), 'descriptionEn 必须在场且无中文残留')
A.ok(man.descriptionEn.includes('backend'), 'descriptionEn 同样要说清数据流向(笔记会发到后端)')
A.ok(man.onboarding.en && man.onboarding.en.intro && !/[一-鿿]/.test(man.onboarding.en.intro), 'onboarding.en.intro 在场且无中文')
A.equal(man.onboarding.en.steps.length, man.onboarding.steps.length, 'onboarding 英文 steps 与中文一一对应(同序同数)')
for (const s of man.onboarding.en.steps) A.ok(s.title && s.description && !/[一-鿿]/.test(s.title + s.description), `onboarding.en step「${s.title}」无中文残留`)
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
A.ok(changelog.includes('## 1.1.0'), 'CHANGELOG 必须有 1.1.0(双语)一节')
A.ok(changelog.includes(`## ${man.version}`), `CHANGELOG 必须有与 manifest 同版本的 ${man.version} 一节`)
A.ok(readme.includes('双语') && readme.includes('重启'), 'README 必须写双语说明与命令面板标题的重启缺口')
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
const reg = { views: [], commands: [], settings: [], fileTypes: [], creators: [], series: [], notices: [], statusItems: [] }
const tracked = []
const activityLog = []
const ctx = {
  registerView: (v) => reg.views.push(v),
  registerCommand: (c) => reg.commands.push(c),
  registerSetting: (s) => reg.settings.push(s),
  registerFileType: (f) => { reg.fileTypes.push(f) }, // 返回 undefined(非 false)= 未被内置抢占
  registerFileCreator: (f) => reg.creators.push(f),
  registerStatusItem: (it) => { reg.statusItems.push(it); return { update() { }, dispose() { } } },
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
// 只读枚举面(真宿主 ctx.app 上恒在,pluginStore.ts:207-208)。孤儿行判定只认它,
// 不认 readFile 给不给内容 —— 后者三态不分(见 2026-08-21 评审 Finding 4)。
ctx.app.listFiles = async () => Array.from(V.keys()).filter((x) => !x.split('/').pop().startsWith('.'))

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
A.deepEqual(reg.settings.map((s) => s.key), ['dailyLimit', 'nudge'], '应声明 dailyLimit / nudge 设置(workFolder 由宿主自动提供);顺序钉死 dailyLimit 在前')
A.equal(reg.settings[0].default, 50, 'dailyLimit 默认 50')
const nudgeSet = reg.settings.find((x) => x.key === 'nudge')
A.equal(nudgeSet.type, 'boolean', 'R4:nudge 是布尔开关')
A.equal(nudgeSet.default, true, 'R4:nudge 默认开')
A.ok(nudgeSet.label && nudgeSet.description, 'R4:nudge 有标签与说明')
A.ok(reg.statusItems.length === 1 && reg.statusItems[0].id === 'due', '应注册 due 状态栏常驻项')
A.equal(reg.statusItems[0].side, 'right')
A.equal(reg.series.length, 1, '应注册一组复习成就')
A.deepEqual(reg.series[0].achievements.map((a) => a.event).sort(), ['review', 'review', 'streak'], '成就事件 review×2 + streak')

// ── 钩子齐全 ──
for (const k of ['schedule', 'parseDeck', 'serializeDeck', 'nextCardId', 'parseDeckFence', 'renderMarkdown', 'inline', 'safeHref', 'uniqueDeckPath', 'refreshDeckRow', 'buildQueue', 'dayKey', 'dayDiff', 'updateStreak', 'stateLabel', 'fmtDelta', 'onColorOf', 'readableOn', 'contrast', 'GEN_PROMPT', 'deckCounts', 'dueSummary', 'isIndexStale', 'shouldNudge', 'paintStatus', 'refreshStatus', 'statusPeek']) {
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
A.equal(q.decks, 1, 'buildQueue 剔除**真**孤儿行(枚举面确认文件不在了 → 索引自愈)')
idx = await T.readIndex()
A.equal(idx.decks.length, 1)
// fsrs 行损坏的卡组:展示不复习(入队评分会把全组当新卡重建调度 = 毁档)
V.set('记忆闪卡/坏.deck.md', '---\ndeck: 坏组\nfsrs: {not json\n---\n\n<!-- card:c1 -->\nQ: q\nA: a\n')
await T.refreshDeckRow('记忆闪卡/坏.deck.md')
q = await T.buildQueue(null)
A.ok(!q.items.find((it) => it.path === '记忆闪卡/坏.deck.md'), 'fsrsBroken 卡组的卡不进复习队列')
A.ok(q.rows.find((r) => r.path === '记忆闪卡/坏.deck.md'), '但卡组行仍在列表里(用户能看见它)')

// ══ 🆕 1.2.0 计数口径:四个纯函数的已知向量 + 「状态栏数字 ≡ 复习台队列长度」不变式 ══
{
  const lsBak0 = new Map(_ls)
  const mk = (cards, fsrs) => ({ name: 'X', cards, fsrs })

  // ── deckCounts:口径真源,判据必须逐字对齐 buildQueue 的入队条件 ──
  A.deepEqual(T.deckCounts(mk([{ id: 'c1', q: 'q1', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }, { id: 'c3', q: 'q3', a: 'a3' }, { id: 'c4', q: 'q4', a: 'a4' }], { c1: duePast, c4: dueFuture }), NOW),
    { due: 1, fresh: 2, nextDue: NOW + 5 * DAY }, 'deckCounts V1:1 到期 / 2 新卡 / nextDue = 5 天后那一刻')
  const brokenDeck = T.parseDeck('---\ndeck: 坏组\nfsrs: {not json\n---\n\n<!-- card:c1 -->\nQ: q\nA: a\n')
  A.ok(brokenDeck.fsrsBroken, 'deckCounts V2 前提:该卡组确实是 fsrsBroken')
  A.deepEqual(T.deckCounts(brokenDeck, NOW), { due: 0, fresh: 0, nextDue: 0 }, 'deckCounts V2:坏 fsrs 行的卡组一张都不计(它一张都进不了队列)')
  const emptyQDeck = mk([{ id: 'c1', q: '', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }], { c1: duePast })
  A.equal(T.deckCounts(emptyQDeck, NOW).due, 0, 'deckCounts V3:空问题的到期卡不计(正是「状态栏说 3 张、点进去 0 张」那条裂缝)')
  A.equal(T.deckCounts(emptyQDeck, NOW).fresh, 1, 'deckCounts V3:空问题的卡也不算新卡(队列同样不收)')
  A.deepEqual(T.deckCounts(mk([{ id: 'c1', q: 'q1', a: 'a1' }], { c1: dueFuture, c9: duePast }), NOW),
    { due: 0, fresh: 0, nextDue: NOW + 5 * DAY }, 'deckCounts V4:fsrs 里的孤儿键(卡已删)不许撑大数字')
  A.deepEqual(T.deckCounts(mk([{ id: 'c1', q: 'q1', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }], { c1: duePast, c2: duePast }), NOW),
    { due: 2, fresh: 0, nextDue: 0 }, 'deckCounts V5:没有未来到期时刻 → nextDue = 0(0 是「没有下一个时刻」,不是「立刻过期」)')

  // ── dueSummary:索引行 → 今日待复习总数 ──
  const RW = [{ due: 1, fresh: 2 }, { due: 0, fresh: 1 }]
  A.deepEqual(T.dueSummary(RW, { introduced: 0 }, 2), { due: 1, fresh: 2, n: 3 }, 'dueSummary V1:新卡受每日上限压')
  A.deepEqual(T.dueSummary(RW, { introduced: 2 }, 2), { due: 1, fresh: 0, n: 1 }, 'dueSummary V2:今日额度用完 → 只剩到期')
  A.equal(T.dueSummary(RW, { introduced: 0 }, 0).n, 1, 'dueSummary V3:上限 0(关掉新卡)不等于「没得复习」')
  A.equal(T.dueSummary([{ due: 3, name: '旧' }], { introduced: 0 }, 50).n, 3, 'dueSummary V4:v1 老索引行(无 fresh)按 0 计,不崩不瞎猜')
  A.deepEqual(T.dueSummary([{ due: -5, fresh: 'x' }, null], { introduced: 0 }, 50), { due: 0, fresh: 0, n: 0 }, 'dueSummary V5:负数 / 非数 / 空行一律钳到 0')

  // ── isIndexStale:什么时候才值得全量扫盘(「计数必须便宜」的兑现方式) ──
  A.equal(T.isIndexStale([{ due: 0, fresh: 0, nextDue: NOW + 1000 }], NOW), false, 'isIndexStale V1:还没到点 → 只读小索引,不扫全库')
  A.equal(T.isIndexStale([{ due: 0, fresh: 0, nextDue: NOW - 1 }], NOW), true, 'isIndexStale V2:有卡真的到点了 → 允许一次全量扫描')
  A.equal(T.isIndexStale([{ due: 1, fresh: 0, nextDue: 0 }], NOW), false, 'isIndexStale V3:nextDue=0 = 没有下一个到期时刻,不许连环触发')
  A.equal(T.isIndexStale([{ path: 'a', name: '旧', cards: 2, due: 1, touched: 1 }], NOW), true, 'isIndexStale V4:v1 老行缺 fresh/nextDue → 升级后第一次自愈')
  A.equal(T.isIndexStale([], NOW), false, 'isIndexStale V5:空索引不触发扫盘')

  // ── shouldNudge:一天最多一次 ──
  A.equal(T.shouldNudge(null, '2026-08-06', true, 3, false), true, 'shouldNudge V1:从没提醒过 → 提醒')
  A.equal(T.shouldNudge('2026-08-06', '2026-08-06', true, 3, false), false, 'shouldNudge V2:今天提醒过了 → 闭嘴')
  A.equal(T.shouldNudge('2026-08-05', '2026-08-06', true, 3, false), true, 'shouldNudge V3:跨日再来一次')
  A.equal(T.shouldNudge(null, '2026-08-06', true, 0, false), false, 'shouldNudge V4:没有到期卡不吵')
  A.equal(T.shouldNudge(null, '2026-08-06', false, 3, false), false, 'shouldNudge V5:设置关掉 → 不提醒')
  A.equal(T.shouldNudge(null, '2026-08-06', true, 3, true), false, 'shouldNudge V6:本会话已提醒 → 防轮询重入')

  // ── R2:空问题的到期卡 —— 索引记 1、队列收 0 的那条既有裂缝(1.2.0 闭合) ──
  const emptyQPath = '记忆闪卡/空问.deck.md'
  V.set(emptyQPath, T.serializeDeck({ name: '空问组', fsrs: { c1: duePast, c2: duePast }, cards: [{ id: 'c1', q: '', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }] }))
  await T.refreshDeckRow(emptyQPath)
  const rowEQ = (await T.readIndex()).decks.find((r) => r.path === emptyQPath)
  A.equal(rowEQ.due, 1, 'R2:两张到期卡里只有一张有问题文本 → 索引只记 1(旧口径会记 2)')

  // ── R1:同一份 vault 下,dueSummary(rows).n 恒等于复习台队列长度,三种状态各一次 ──
  const inv = (label) => A.equal(T.dueSummary(q.rows, T.readDaily(), T.dailyLimit()).n, q.items.length, label)
  _ls.set('plugin.flashcards.dailyLimit', '50')
  _ls.delete('plugin.flashcards.daily')
  q = await T.buildQueue(null)
  A.ok(!q.items.find((it) => it.path === emptyQPath && it.id === 'c1'), 'R2:空问题的卡确实不进队列')
  A.ok(q.items.length > 0, 'R1① 前提:队列非空,否则这条不变式没有意义')
  inv('R1①:默认上限下,状态栏数字 ≡ 复习台队列长度')
  _ls.set('plugin.flashcards.daily', JSON.stringify({ date: '2026-08-06', introduced: 999, reviewed: 0 }))
  q = await T.buildQueue(null)
  inv('R1②:今日新卡额度用完后仍恒等')
  A.ok(q.rows.find((r) => r.path === '记忆闪卡/坏.deck.md'), 'R1③ 前提:库里确实混着一个 fsrsBroken 卡组')
  _ls.set('plugin.flashcards.dailyLimit', '1')
  _ls.delete('plugin.flashcards.daily')
  q = await T.buildQueue(null)
  inv('R1③:混着 fsrsBroken 卡组时仍恒等')
  const rowBad = q.rows.find((r) => r.path === '记忆闪卡/坏.deck.md')
  A.equal(rowBad.due, 0, 'R1③:坏组行的到期数恒 0(它一张都进不了队列)')
  A.equal(rowBad.fresh, 0, 'R1③:坏组行的新卡数恒 0')

  // ── R3:索引行升到 v2 —— 只增字段,旧字段一个不改 ──
  const rowA = (await T.readIndex()).decks.find((r) => r.path === '记忆闪卡/A.deck.md')
  for (const k of ['path', 'name', 'cards', 'due', 'touched']) A.ok(k in rowA, `R3:索引行必须保留 v1 字段 ${k}`)
  for (const k of ['fresh', 'nextDue']) A.ok(k in rowA, `R3:索引行必须带上 v2 字段 ${k}`)
  A.equal(rowA.due, 1, 'R3:v1 字段 due 的值口径不变')
  A.equal(rowA.fresh, 2, 'R3:fresh = 该组还没排过的卡')
  A.equal(rowA.nextDue, NOW + 5 * DAY, 'R3:nextDue = 该组未来最近的一个到期时刻')

  V.delete(emptyQPath)
  await T.refreshDeckRow(emptyQPath) // 剔除孤儿行,别污染后面的小节
  _ls.clear()
  for (const [k, v] of lsBak0) _ls.set(k, v)
}

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

  // 场景 4b:[回归 2026-08-21 · P0 Finding 2] 读盘那一步**读不到**时必须中止,不许「跳过合并照写」
  //   —— 那等于用挂载那一刻的陈旧快照整篇覆写(进度回滚),或把已删/已改名的卡组凭空造回来。
  {
    const PN = '记忆闪卡/N.deck.md'
    V.set(PN, mkDeck('消失组', [{ id: 'c1', q: 'nq', a: 'na' }], {}))
    const hostN = mkEl('div')
    const disposeN = ftDef.mount(hostN, { filePath: PN })
    await sleep(30)
    const prog2 = T.schedule(null, 3, NOW)
    V.set(PN, mkDeck('消失组', [{ id: 'c1', q: 'nq', a: 'na' }], { c1: prog2 })) // 复习台写进了进度
    const nameN = rootOf(hostN).querySelector('[data-name]')
    nameN.value = '改个名'
    fire(nameN, 'input')
    V.delete(PN) // 这一刻文件被删/改名,或 fs 读失败 —— 宿主一律给 null
    const w0 = writes.length
    disposeN()
    await sleep(30)
    A.equal(V.has(PN), false, '场景 4b:读不到就一律中止,绝不把已删的卡组凭空造回来')
    A.equal(writes.length, w0, '场景 4b:零 writeFile')
  }

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

// ══ ⑧ 双语(2026-08-14 硬要求):词表两侧键集合相等 + en 宿主真渲英文 + 切语言不重挂也变 ══
{
  // ① 两侧键集合必须完全相等(漏翻一条就红),且英文侧不许有中文 / 空串 / 占位符错配
  const zhKeys = Object.keys(T.MSG.zh).sort()
  const enKeys = Object.keys(T.MSG.en).sort()
  const onlyZh = zhKeys.filter((k) => !enKeys.includes(k))
  const onlyEn = enKeys.filter((k) => !zhKeys.includes(k))
  A.deepEqual(enKeys, zhKeys, `MSG 两侧键集合必须完全相等(zh 独有:${onlyZh.join(',')} / en 独有:${onlyEn.join(',')})`)
  A.ok(zhKeys.length >= 60, `词表只有 ${zhKeys.length} 条,不像覆盖了全部 UI 文案`)
  const holes = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',')
  for (const k of zhKeys) {
    A.equal(typeof T.MSG.en[k], 'string', `MSG.en.${k} 应是字符串`)
    A.ok(T.MSG.en[k].trim().length > 0, `MSG.en.${k} 不许空串`)
    A.ok(!/[一-鿿]/.test(T.MSG.en[k]), `MSG.en.${k} 残留中文:${T.MSG.en[k]}`)
    A.equal(holes(T.MSG.en[k]), holes(T.MSG.zh[k]), `MSG.${k} 两侧占位符不一致(英文侧会漏参数)`)
  }
  // 旧宿主没有 getLocale → 一律回退中文 canonical
  A.equal(T.L(), 'zh', '缺 getLocale 的宿主回退中文')
  A.equal(T.t('appName'), '记忆闪卡')
  A.equal(T.t('deckCount', { n: 3 }), '3 个卡组', '占位符 {n} 替换')
  A.equal(T.t('__不存在的键__'), '__不存在的键__', '缺键回退键名而不是崩')
  // 占位符必须**单趟**替换:替进去的是用户数据(卡组名),不许被后面的轮次再当占位符吃一遍
  A.equal(T.t('cardMeta', { deck: '{i} 章', kind: '复习', i: 2, n: 7 }), '{i} 章 · 复习 · 第 2 / 7 张', '卡组名里的 {i} 必须原样保留(单趟替换)')
  A.equal(T.t('genCreated', { name: '{n}', n: 5 }), '已生成卡组「{n}」(5 张卡)', '卡组名叫 {n} 时不许被卡片数二次替换')
  A.equal(T.t('deckCount', {}), '{n} 个卡组', '没给值的占位符原样保留(不许替成 undefined)')

  // ② 宿主 getLocale 返回 'en' 时,同一份 main.js 必须渲染出英文(且零中文残留 —— 与真机门禁同一条判据)
  const enReg = { views: [], commands: [], settings: [], fileTypes: [], notices: [] }
  const enVault = new Map()
  const localeSubs = new Set()
  let localeNow = 'en'
  const enCtx = {
    registerView: (v) => enReg.views.push(v),
    registerCommand: (c) => enReg.commands.push(c),
    registerSetting: (s) => enReg.settings.push(s),
    registerFileType: (f) => { enReg.fileTypes.push(f) },
    registerFileCreator: () => { },
    notify: (m) => enReg.notices.push(m),
    openView() { },
    getLocale: () => localeNow,
    subscribeLocale: (cb) => { localeSubs.add(cb); return () => { localeSubs.delete(cb) } },
    achievements: { registerSeries() { }, track() { } },
    app: {
      notify: (m) => enReg.notices.push(m),
      readFile: async (p) => (enVault.has(p) ? enVault.get(p) : null),
      writeFile: async (p, x) => { enVault.set(p, String(x)) },
      openFile() { }, getActivePageText: () => '', workFolder: () => '记忆闪卡',
    },
  }
  // 这一份是**另一个**模块实例:模块级的 gen / bus / MSG 都是它自己的,
  // 要驱动它的 AI 建卡面板就得拿它自己的钩子(第一份 T 属于 zh 实例)。取完立刻收回,
  // 后面的旧宿主小节必须继续在无钩子状态下求值。
  globalThis.__FLASHCARDS_TEST__ = {}
  const enDispose = new Function('ctx', src)(enCtx)
  const T2 = Object.assign({}, globalThis.__FLASHCARDS_TEST__)
  globalThis.__FLASHCARDS_TEST__ = null
  const enView = enReg.views.find((v) => v.id === 'review')
  A.ok(enView && enView.title === 'Flashcards', 'en 宿主下视图标题取英文(注册时快照)')
  A.ok(enReg.commands.every((c) => !/[一-鿿]/.test(c.title)), 'en 宿主下命令标题全英文')
  A.ok(enReg.settings.every((s) => !/[一-鿿]/.test(s.label)), 'en 宿主下设置项标签全英文')
  const enHost = mkEl('div')
  const enOff = enView.mount(enHost)
  await sleep(40)
  const enText = enHost.textContent
  A.ok(enText.includes('Flashcards'), 'en 渲染出英文标题')
  A.ok(enText.includes('Generate deck from note') && enText.includes('New deck'), 'en 渲染出英文按钮')
  A.equal(/[一-鿿]/.test(enText), false, `en 界面不许有残留中文:${enText.replace(/\s+/g, ' ').slice(0, 140)}`)

  // ③ 判定标准:切语言时视图**不重挂**也要跟着变(靠「下次打开才变」不算双语)
  A.equal(localeSubs.size, 1, '视图挂载期间应持有一条语言订阅')
  localeNow = 'zh'
  for (const cb of localeSubs) cb('zh')
  await sleep(20)
  const zhText = enHost.textContent
  A.notEqual(zhText, enText, '语言切换必须真的改了同一挂载实例的文案')
  A.ok(zhText.includes('记忆闪卡') && zhText.includes('新建卡组'), '切中文后原地重绘成中文')
  localeNow = 'en'
  for (const cb of localeSubs) cb('en')
  await sleep(20)
  A.equal(/[一-鿿]/.test(enHost.textContent), false, '切回英文同样即时生效')

  // ④ 引导页之外的两个高频面(复习会话 / 卡组编辑器)同样全英文 —— 真机门禁只量得到引导页
  const enRoot = (h) => h.children.find((c) => c.className === 'fc-root')
  const enDeckPath = '记忆闪卡/EN.deck.md'
  const enDue = { due: new Date(NOW - DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }
  enVault.set(enDeckPath, T.serializeDeck({ name: 'Chapter 3', fsrs: { c1: enDue }, cards: [{ id: 'c1', q: 'enq', a: 'ena' }] }))
  enVault.set('记忆闪卡/.deck-index.json', JSON.stringify({ decks: [{ path: enDeckPath, name: 'Chapter 3', cards: 1, due: 1, touched: NOW }] }))
  const enHost2 = mkEl('div')
  const enOff2 = enView.mount(enHost2)
  await sleep(40)
  A.ok(enHost2.textContent.includes('Chapter 3'), 'en 复习会话渲染出到期卡')
  fire(buttonByText(enRoot(enHost2), 'Show answer'), 'click')
  A.ok(buttonByText(enRoot(enHost2), 'Good 3'), 'en 翻面后四档评分用 Anki 词表(Again/Hard/Good/Easy)')
  A.equal(/[一-鿿]/.test(enHost2.textContent), false, `en 复习会话不许有残留中文:${enHost2.textContent.replace(/\s+/g, ' ').slice(0, 140)}`)
  const enFt = enReg.fileTypes.find((f) => f.id === 'deck')
  A.ok(enFt && enFt.title === 'Deck', 'en 宿主下文件类型标题取英文')
  const enHost3 = mkEl('div')
  const enOff3 = enFt.mount(enHost3, { filePath: enDeckPath })
  await sleep(40)
  A.ok(enHost3.textContent.includes('Add card') && enHost3.textContent.includes('Review this deck'), 'en 卡组编辑器按钮为英文')
  A.equal(/[一-鿿]/.test(enHost3.textContent), false, `en 卡组编辑器不许有残留中文:${enHost3.textContent.replace(/\s+/g, ' ').slice(0, 140)}`)

  // ⑤ 订阅必须在各自 disposer 里退掉(宿主会兜底统一收,但该退还是要退)
  A.equal(localeSubs.size, 3, '三个已挂载视图各持有一条语言订阅')
  enOff3(); enOff2(); enOff()
  A.equal(localeSubs.size, 0, '视图卸载必须退订语言')

  // ══ ⑥ 门禁盲区补测(复核 2026-08-14):真机 e2e 只走得到引导页,上面的 ④ 只覆盖了会话与编辑器 edit 态。
  //    剩下六个低频相位(idle / 今日完成 / AI 建卡进度面板 / AI 建卡错误面板 / 编辑器读不到 / 编辑器格式不符)
  //    在 en 下是否零中文、切语言是否即时生效,此前两道门禁都够不到 —— 收编进来。 ══
  const CJK = /[一-鿿]/
  const enRootOf = (h) => h.children.find((c) => c.className === 'fc-root')
  const setEnLocale = async (l) => { localeNow = l; for (const cb of [...localeSubs]) cb(l); await sleep(20) }
  const lsBak = new Map(_ls)

  // (a) idle:有卡组但没有到期卡,且新卡全被每日上限扣住 → 走 idleHeld 这条最容易写歪的英文
  {
    enVault.clear()
    const p = '记忆闪卡/Idle.deck.md'
    const future = { due: new Date(NOW + 10 * DAY).toISOString(), s: 10, d: 5, reps: 3, lapses: 0, state: 2, last: new Date(NOW - DAY).toISOString() }
    enVault.set(p, T.serializeDeck({ name: 'Chapter 7', fsrs: { c1: future }, cards: [{ id: 'c1', q: 'q1', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }, { id: 'c3', q: 'q3', a: 'a3' }] }))
    enVault.set('记忆闪卡/.deck-index.json', JSON.stringify({ decks: [{ path: p, name: 'Chapter 7', cards: 3, due: 0, touched: NOW }] }))
    _ls.set('plugin.flashcards.dailyLimit', '0') // 上限 0 = 关掉新卡:英文不许读成「额度用完了」
    _ls.delete('plugin.flashcards.daily')
    const h = mkEl('div')
    const off = enView.mount(h)
    await sleep(60)
    const txt = h.textContent
    A.ok(txt.includes('Nothing due right now'), `en idle 相位应渲出英文空态:${txt.replace(/\s+/g, ' ').slice(0, 160)}`)
    A.ok(txt.includes('Held by the daily limit (0)') && txt.includes('New cards waiting: 2'),
      `en idle 每日上限提示应是「被上限扣住」而非「额度已用完」:${txt.replace(/\s+/g, ' ').slice(0, 200)}`)
    A.equal(CJK.test(txt), false, `en idle 相位不许有残留中文:${txt.replace(/\s+/g, ' ').slice(0, 160)}`)
    await setEnLocale('zh')
    A.ok(h.textContent.includes('暂无到期卡片') && h.textContent.includes('因每日上限(0)暂缓'), 'idle 相位切中文原地即时生效')
    await setEnLocale('en')
    A.equal(CJK.test(h.textContent), false, 'idle 相位切回英文原地即时生效')
    off()
  }

  // (b) 今日完成(done):评完最后一张 → 庆祝态
  {
    enVault.clear()
    _ls.set('plugin.flashcards.dailyLimit', '50')
    _ls.delete('plugin.flashcards.daily')
    _ls.delete('plugin.flashcards.streak')
    const p = '记忆闪卡/Done.deck.md'
    const past = { due: new Date(NOW - DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }
    enVault.set(p, T.serializeDeck({ name: 'Chapter 9', fsrs: { c1: past }, cards: [{ id: 'c1', q: 'only', a: 'ans' }] }))
    enVault.set('记忆闪卡/.deck-index.json', JSON.stringify({ decks: [{ path: p, name: 'Chapter 9', cards: 1, due: 1, touched: NOW }] }))
    const h = mkEl('div')
    const off = enView.mount(h)
    await sleep(60)
    fire(buttonByText(enRootOf(h), 'Show answer'), 'click')
    fire(buttonByText(enRootOf(h), 'Easy 4'), 'click')
    await sleep(90)
    const doneTxt = h.textContent
    A.ok(doneTxt.includes('All caught up for today!') && doneTxt.includes('This session: 1'), `en done 相位应渲出英文庆祝态:${doneTxt.replace(/\s+/g, ' ').slice(0, 200)}`)
    A.equal(CJK.test(doneTxt), false, `en done 相位不许有残留中文:${doneTxt.replace(/\s+/g, ' ').slice(0, 160)}`)
    await setEnLocale('zh')
    A.ok(h.textContent.includes('今日复习完成'), 'done 相位切中文原地即时生效')
    await setEnLocale('en')
    A.equal(CJK.test(h.textContent), false, 'done 相位切回英文原地即时生效')
    off()
  }

  // (c) AI 建卡进度面板 / 错误面板(阶段名存的是**词表键**,所以语言一变必须跟着变)
  {
    const h = mkEl('div')
    const off = enView.mount(h)
    await sleep(60)
    Object.assign(T2.gen, { active: true, pct: 45, stage: 'stageWriting', error: '' })
    T2.bus.emit({ type: 'gen' })
    await sleep(10)
    A.ok(h.textContent.includes('writing cards') && h.textContent.includes('45%'), `en AI 建卡进度面板应显示英文阶段名:${h.textContent.replace(/\s+/g, ' ').slice(0, 160)}`)
    A.equal(CJK.test(h.textContent), false, `en AI 建卡进度面板不许有残留中文:${h.textContent.replace(/\s+/g, ' ').slice(0, 160)}`)
    await setEnLocale('zh')
    A.ok(h.textContent.includes('生成卡片中'), '进度面板阶段名切中文即时生效(存的是词表键不是已翻好的串)')
    await setEnLocale('en')
    Object.assign(T2.gen, { active: false, pct: 0, stage: '', error: 'boom' })
    T2.bus.emit({ type: 'gen' })
    await sleep(10)
    A.ok(h.textContent.includes('AI cards failed: boom'), `en AI 建卡错误面板应是英文:${h.textContent.replace(/\s+/g, ' ').slice(0, 160)}`)
    A.equal(CJK.test(h.textContent), false, `en AI 建卡错误面板不许有残留中文:${h.textContent.replace(/\s+/g, ' ').slice(0, 160)}`)
    Object.assign(T2.gen, { active: false, pct: 0, stage: '', error: '' })
    off()
  }

  // (d) 编辑器两个只读警示态:读不到 / 不合 .deck.md 格式(毁档防线的门面,英文用户同样要看得懂)
  {
    const hMiss = mkEl('div')
    const offMiss = enFt.mount(hMiss, { filePath: '记忆闪卡/nope.deck.md' })
    await sleep(40)
    A.ok(hMiss.textContent.includes('Cannot read this deck file'), `en 编辑器「读不到」应是英文:${hMiss.textContent.slice(0, 160)}`)
    A.equal(CJK.test(hMiss.textContent), false, `en 编辑器「读不到」不许有残留中文:${hMiss.textContent.slice(0, 160)}`)
    await setEnLocale('zh')
    A.ok(hMiss.textContent.includes('读不到这个卡组文件'), '编辑器「读不到」切中文即时生效')
    await setEnLocale('en')
    offMiss()

    enVault.set('记忆闪卡/plain.deck.md', 'just a normal note, no frontmatter, no card markers')
    const hInv = mkEl('div')
    const offInv = enFt.mount(hInv, { filePath: '记忆闪卡/plain.deck.md' })
    await sleep(40)
    A.ok(hInv.textContent.includes('not in .deck.md deck format'), `en 编辑器「格式不符」应是英文:${hInv.textContent.slice(0, 160)}`)
    A.equal(CJK.test(hInv.textContent), false, `en 编辑器「格式不符」不许有残留中文:${hInv.textContent.slice(0, 160)}`)
    await setEnLocale('zh')
    A.ok(hInv.textContent.includes('不符合 .deck.md 卡组格式'), '编辑器「格式不符」切中文即时生效')
    await setEnLocale('en')
    offInv()
    A.equal(enVault.get('记忆闪卡/plain.deck.md'), 'just a normal note, no frontmatter, no card markers', '只读警示态全程不许改写原文件(毁档防线)')
  }

  // (e) 切语言 = 编辑器整树重建:还没过防抖的草稿不许丢,落盘格式也不许跟着语言变
  {
    const p = '记忆闪卡/Draft.deck.md'
    enVault.set(p, T.serializeDeck({ name: 'Draft', fsrs: {}, cards: [{ id: 'c1', q: 'oldq', a: 'olda' }] }))
    const h = mkEl('div')
    const off = enFt.mount(h, { filePath: p })
    await sleep(40)
    const areas = findAll(enRootOf(h), 'textarea')
    A.equal(areas.length, 2, '编辑器每张卡渲出 Q/A 两个输入框')
    areas[0].value = 'USER TYPED'
    fire(areas[0], 'input') // 用户刚打完字,600ms 防抖还没到点
    await setEnLocale('zh') // ← 此刻切语言:paint() 会把整棵树重建
    const areas2 = findAll(enRootOf(h), 'textarea')
    A.equal(areas2[0] && areas2[0].value, 'USER TYPED', '切语言时未落盘的草稿不许丢字')
    await sleep(700) // 等防抖落盘
    const onDisk = String(enVault.get(p) || '')
    A.ok(onDisk.includes('USER TYPED'), '跨语言切换后草稿照常落盘')
    A.ok(/^---\ndeck: /m.test(onDisk) && /\nfsrs: /.test(onDisk), 'frontmatter 键 deck: / fsrs: 不随语言变')
    A.ok(onDisk.includes('<!-- card:c1 -->'), 'card 哨兵标记不随语言变')
    A.equal(CJK.test(h.textContent.replace(/USER TYPED/g, '')) , true, '切到中文后编辑器界面确实是中文(证明上一条不是因为没切成)')
    await setEnLocale('en')
    off()
  }

  // (f) 落盘的东西不随语言变:en 宿主下空名兜底仍是中文 canonical(路径是数据契约,不是 UI 文案)
  A.equal(T2.L(), 'en', 'T2 取的是 en 实例的钩子')
  A.equal(T2.UNTITLED_DECK, '未命名卡组', '落盘兜底卡组名钉死中文 canonical')
  A.equal(T2.sanitizeFileName('   '), '未命名卡组', 'en 宿主下空名兜底文件名仍是 未命名卡组(不许变成 Untitled deck)')
  A.equal(T2.sanitizeFileName('   '), T.sanitizeFileName('   '), '空名兜底文件名两种语言下必须同值')
  A.equal(T2.sanitizeFileName('///'), '___', '非法字符只做替换不触发兜底(替换表与语言无关)')
  A.equal(T2.folderRoot(), T.folderRoot(), '默认工作文件夹两种语言下必须同值')

  _ls.clear()
  for (const [k, v] of lsBak) _ls.set(k, v) // 归还 localStorage,别污染后面的小节
  A.equal(localeSubs.size, 0, '盲区补测挂载的视图全部退订了语言')
  enDispose()
}

// ── ② disposer 执行不抛 ──
dispose()

// 挂载冒烟全程不许有未处理的 Promise 拒绝(async render 崩溃不许静默溜走)
await sleep(80)
A.equal(rejections.length, 0, `存在未处理拒绝:${rejections.map((e) => (e && e.stack) || String(e)).join(' | ')}`)

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 1.2.0 状态栏宿主(第 6 个 mock 实例):registerStatusItem + loadData/saveData 全在场。
//    R6 / R8 / R8b / R9 / R10 / R11 / R12 / R13 与三态文案全部在这里跑 —— 新功能的验证一律
//    进新实例,既有实例只按清单改期望值(这是「不许回归」在测试文件里的写法)。
// ══════════════════════════════════════════════════════════════════════════════
const CJK6 = /[一-鿿]/
const rootOf6 = (h) => h.children.find((c) => c.className === 'fc-root')
{
  const lsBak6 = new Map(_ls)
  const IDX6 = '记忆闪卡/.deck-index.json'
  const past6 = { due: new Date(NOW - DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }
  const future6 = { due: new Date(NOW + 3 * DAY).toISOString(), s: 9, d: 4, reps: 2, lapses: 0, state: 2, last: new Date(NOW - DAY).toISOString() }
  /** 往 mock vault 里播一批卡组 + 一份 v2 索引(与插件自己写出来的行同形)。 */
  const seed6 = (vault, decks) => {
    const rows = []
    for (const d of decks) {
      vault.set(d.path, T.serializeDeck({ name: d.name, fsrs: d.fsrs, cards: d.cards }))
      const c = T.deckCounts({ name: d.name, fsrs: d.fsrs, cards: d.cards }, NOW)
      rows.push({ path: d.path, name: d.name, cards: d.cards.length, due: c.due, fresh: c.fresh, nextDue: c.nextDue, touched: NOW })
    }
    vault.set(IDX6, JSON.stringify({ decks: rows }))
  }
  const twoDue = [{ path: '记忆闪卡/S1.deck.md', name: 'S1', cards: [{ id: 'c1', q: 'q1', a: 'a1' }, { id: 'c2', q: 'q2', a: 'a2' }], fsrs: { c1: past6, c2: past6 } }]
  const noneDue = [{ path: '记忆闪卡/S2.deck.md', name: 'S2', cards: [{ id: 'c1', q: 'q1', a: 'a1' }], fsrs: { c1: future6 } }]

  /** 起一个带状态栏的宿主实例;o.seed(vault) 在求值前播种(setup 里就会 refreshStatus)。 */
  const boot6 = (o) => {
    const opt = o || {}
    const st = { views: [], items: [], updates: [], disposes: 0, notices: [], vault: new Map(), saved: [], loadCalls: 0, saveCalls: 0, locale: opt.locale || 'zh', subs: new Set() }
    if (opt.seed) opt.seed(st.vault)
    const c = {
      registerView: (v) => st.views.push(v),
      registerCommand() { },
      registerSetting() { },
      registerFileType: () => { },
      registerFileCreator() { },
      registerStatusItem: (it) => {
        st.items.push(it)
        if (opt.legacyStatus) return undefined // 2026-07-23 之前的宿主:返回 void
        return { update: (patch) => st.updates.push(patch), dispose: () => { st.disposes += 1 } }
      },
      notify: (m, x) => st.notices.push([String(m), (x && x.level) || '']),
      openView() { },
      getLocale: () => st.locale,
      subscribeLocale: (cb) => { st.subs.add(cb); return () => { st.subs.delete(cb) } },
      achievements: { registerSeries() { }, track() { } },
      app: {
        notify: (m) => st.notices.push([String(m), '']),
        readFile: async (pth) => (st.vault.has(pth) ? st.vault.get(pth) : null),
        writeFile: async (pth, x) => { st.vault.set(pth, String(x)) },
        openFile() { }, getActivePageText: () => '', workFolder: () => '记忆闪卡', prompt: async () => null,
      },
    }
    if (!opt.noData) {
      c.loadData = async () => { st.loadCalls += 1; if (opt.loadThrows) throw new Error('boom'); return opt.data || null }
      c.saveData = async (v) => { st.saveCalls += 1; if (opt.saveThrows) throw new Error('boom'); st.saved.push(v) }
    }
    globalThis.__FLASHCARDS_TEST__ = {}
    const d = new Function('ctx', src)(c)
    const hooks = Object.assign({}, globalThis.__FLASHCARDS_TEST__)
    globalThis.__FLASHCARDS_TEST__ = null // 后面的旧宿主小节必须继续在无钩子状态下求值
    return { st, T6: hooks, dispose: d }
  }
  const lastPatch = (h) => h.st.updates[h.st.updates.length - 1]
  const nudges = (h) => h.st.notices.filter((n) => n[0].includes('张卡到期') || n[0].includes('due today')).length
  const pin6 = (limit) => { _ls.set('plugin.flashcards.dailyLimit', String(limit)); _ls.delete('plugin.flashcards.daily'); _ls.delete('plugin.flashcards.streak'); _ls.delete('plugin.flashcards.nudge') }

  // ── 三态文案:一张都不藏。中性态是唯一不说谎的显示(readIndex 把读失败折叠成 {decks:[]}) ──
  pin6(50)
  {
    const h = boot6({ noData: true }) // 空 vault:索引读不到 → decks 0
    await sleep(40)
    A.equal(h.st.items.length, 1, '状态项注册恰一次')
    A.equal(h.st.items[0].id, 'due', '状态项 id = due(宿主命名空间后 plugin:flashcards:due)')
    A.equal(h.st.items[0].side, 'right')
    A.equal(typeof h.st.items[0].onClick, 'function', '点一下能打开复习台')
    A.equal(lastPatch(h).text, '闪卡', '三态①中性:没有卡组 / 索引读不到 → 「闪卡」,不藏起来、也不谎报「已清空」')
    h.dispose()
  }
  {
    const h = boot6({ noData: true, seed: (v) => seed6(v, noneDue) })
    await sleep(40)
    A.equal(lastPatch(h).text, '闪卡已清空', '三态②已清空:有卡组但今日无待复习')
    h.dispose()
  }
  {
    const h = boot6({ noData: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(lastPatch(h).text, '待复习 2', '三态③有待复习:显示合计张数')
    A.ok(lastPatch(h).title.includes('到期 2') && lastPatch(h).title.includes('新卡 0'), 'tooltip 拆开到期 / 今日新卡')
    A.equal(h.T6.statusPeek().n, 2)
    h.dispose()
  }

  // ── 索引自愈:v1 老行(缺 fresh/nextDue)→ 首次启动重扫一次补上 ──
  {
    const h = boot6({
      noData: true,
      seed: (v) => {
        seed6(v, twoDue)
        v.set(IDX6, JSON.stringify({ decks: [{ path: twoDue[0].path, name: 'S1', cards: 2, due: 2, touched: NOW }] })) // v1 老行
      },
    })
    await sleep(60)
    const row = JSON.parse(h.st.vault.get(IDX6)).decks[0]
    A.ok('fresh' in row && 'nextDue' in row, '索引自愈:v1 老行首次启动后被重扫补上 v2 字段')
    A.equal(lastPatch(h).text, '待复习 2', '自愈后数字正确')
    h.dispose()
  }

  // ── R6:2026-07-23 之前的宿主 registerStatusItem 返回 void → 整条功能不做 ──
  {
    const h = boot6({ legacyStatus: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(h.st.items.length, 1, 'R6:注册动作本身不抛')
    A.equal(h.st.updates.length, 0, 'R6:拿不到 handle → 一次 update 都没有')
    A.equal(h.T6.statusPeek().timer, false, 'R6:拿不到 handle → 不排定时器')
    A.equal(h.st.subs.size, 0, 'R6:拿不到 handle → 不订语言(en mock 的 localeSubs 断言正是靠这条不用改)')
    A.equal(nudges(h), 0, 'R6:拿不到 handle → 不提醒')
    h.dispose()
  }

  // ── R7:轮询间隔 ≥ 5 分钟 ──
  A.ok(T.STATUS_POLL >= 5 * 60000, `R7:轮询间隔 ≥ 5 分钟(实际 ${T.STATUS_POLL}ms)`)

  // ── R8:disposer 之后零残留(定时器 / handle / 后续 update) ──
  {
    const h = boot6({ noData: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(h.T6.statusPeek().timer, true, 'R8 前提:refresh 结束后排上了轮询定时器')
    const before = h.st.updates.length
    h.dispose()
    A.equal(h.T6.statusPeek().timer, false, 'R8:disposer 后定时器归零(否则 node check.mjs 挂死 5 分钟 × 4 时区)')
    A.equal(h.st.disposes, 1, 'R8:handle.dispose 被调过')
    await h.T6.refreshStatus()
    await sleep(20)
    A.equal(h.st.updates.length, before, 'R8:卸载后不再更新状态栏')
    A.equal(h.T6.statusPeek().timer, false, 'R8:卸载后再调 refreshStatus 也不许重臂')
  }
  // ── R8b:refreshStatus 未 settle 时 dispose —— 飞行中的那一次不许把定时器重臂回来 ──
  {
    const h = boot6({ noData: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    const flying = h.T6.refreshStatus()
    h.dispose()
    await flying
    await sleep(20)
    A.equal(h.T6.statusPeek().timer, false, 'R8b:飞行中的 refresh 不许在 dispose 之后重臂定时器')
  }

  // ── R9:一天最多一次 ──
  {
    const h = boot6({ data: null, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 1, 'R9:启动后有到期卡 → 提醒一条')
    A.equal(h.st.notices.find((n) => n[0].includes('张卡到期'))[1], 'info', 'R9:级别 info')
    await h.T6.refreshStatus()
    A.equal(nudges(h), 1, 'R9:同一会话第二次 refresh 不再提醒(防轮询骚扰)')
    A.deepEqual(h.st.saved[0], { lastNudgeDate: '2026-08-06' }, 'R9:持久标记落 lastNudgeDate(本地日期)')
    h.dispose()
  }
  {
    const h = boot6({ data: { lastNudgeDate: '2026-08-06' }, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 0, 'R9:今天已经提醒过 → 零提醒')
    A.equal(h.st.saveCalls, 0, 'R9:不提醒就不写 blob')
    h.dispose()
  }
  {
    const h = boot6({ data: { lastNudgeDate: '2026-08-05', keep: 'me' }, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 1, 'R9:跨日再来一次')
    A.deepEqual(h.st.saved[0], { keep: 'me', lastNudgeDate: '2026-08-06' }, 'R9:saveData 是整体覆盖 → 必须合并写,别抹掉 blob 里别的键')
    h.dispose()
  }
  {
    _ls.set('plugin.flashcards.nudge', 'false')
    const h = boot6({ data: null, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 0, 'R9:设置 nudge=false → 一条都不提醒')
    A.equal(lastPatch(h).text, '待复习 2', 'R9:关掉提醒后状态栏数字照旧(两者独立)')
    h.dispose()
    _ls.delete('plugin.flashcards.nudge')
  }

  // ── R10:P0#1 / P0#3 —— 读失败 ≠ 没提醒过;标记只在通知发出后才落 ──
  {
    const h = boot6({ noData: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 0, 'R10:宿主没有 loadData/saveData → 一次都不提醒(兑现不了「一天最多一次」就不承诺)')
    A.equal(lastPatch(h).text, '待复习 2', 'R10:但状态栏数字照常')
    h.dispose()
  }
  {
    const h = boot6({ loadThrows: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 0, 'R10/P0#1:loadData 抛错 → 零提醒(读失败不许折叠成「还没提醒过」)')
    A.equal(h.st.saveCalls, 0, 'R10/P0#1:读失败绝不写回(写回会当场盖掉那份读不出来的 blob)')
    h.dispose()
  }
  {
    const h = boot6({ data: null, saveThrows: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(nudges(h), 1, 'R10/P0#3:通知先发、标记后落')
    await h.T6.refreshStatus()
    A.equal(nudges(h), 1, 'R10/P0#3:saveData 抛错不崩,本会话也不再重复提醒(最多下次启动多提醒一次,可重来)')
    h.dispose()
  }

  // ── R11:双语 + 原位更新(切语言不重注册) ──
  {
    const h = boot6({ noData: true, locale: 'en', seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(h.st.items.length, 1, 'R11:状态项只注册一次')
    A.equal(CJK6.test(lastPatch(h).text + lastPatch(h).title), false, `R11:en 下状态栏零中文:${JSON.stringify(lastPatch(h))}`)
    A.ok(lastPatch(h).text.includes('Due 2'), 'R11:en 文案')
    const n0 = h.st.updates.length
    h.st.locale = 'zh'
    for (const cb of [...h.st.subs]) cb('zh')
    A.ok(h.st.updates.length > n0, 'R11:切语言必须触发一次原位 update(状态栏是能实时跟随语言的宿主面)')
    A.equal(lastPatch(h).text, '待复习 2', 'R11:切中文后文案变中文')
    A.equal(h.st.items.length, 1, 'R11:全程只注册一次 —— 绝不 teardown 重注册')
    h.dispose()
    A.equal(h.st.subs.size, 0, 'R11:disposer 退掉状态栏的语言订阅')
  }

  // ── R12:复习进度原位更新(评分一张 → 数字减一,不重注册) ──
  {
    pin6(50)
    const h = boot6({ noData: true, seed: (v) => seed6(v, twoDue) })
    await sleep(40)
    A.equal(h.T6.statusPeek().n, 2, 'R12 前提:状态栏说 2 张')
    const items0 = h.st.items.length
    const host = mkEl('div')
    const off = h.st.views.find((v) => v.id === 'review').mount(host)
    await sleep(60)
    fire(buttonByText(rootOf6(host), '显示答案'), 'click')
    fire(buttonByText(rootOf6(host), '记得 3'), 'click')
    await sleep(150)
    A.equal(h.T6.statusPeek().n, 1, 'R12:复习一张后状态栏数字原位减一')
    A.equal(lastPatch(h).text, '待复习 1')
    A.equal(h.st.items.length, items0, 'R12:全程不重注册状态项')
    off()
    h.dispose()
  }

  // ── R13:用户数据绝不进宿主状态栏(它不过我们的 renderMarkdown) ──
  {
    pin6(50)
    const evil = '<img src=x onerror=1>'
    const h = boot6({ noData: true, seed: (v) => seed6(v, [{ path: '记忆闪卡/S3.deck.md', name: evil, cards: [{ id: 'c1', q: 'q1', a: 'a1' }], fsrs: { c1: past6 } }]) })
    await sleep(40)
    A.ok(h.st.updates.length > 0, 'R13 前提:状态栏确实被 update 过')
    for (const u of h.st.updates) {
      A.equal(String(u.text).includes(evil), false, 'R13:状态栏 text 绝不拼用户的卡组名')
      A.equal(String(u.title).includes(evil), false, 'R13:状态栏 title 绝不拼用户的卡组名')
    }
    A.equal(String(h.st.items[0].text).includes(evil), false, 'R13:注册时的初值同样只由词表串构成')
    h.dispose()
  }

  _ls.clear()
  for (const [k, v] of lsBak6) _ls.set(k, v)
}

// ══ 🆕 BRIEF #9:v4/unified 载体路由 —— 插件从不读 blocks/order,也从不写活动页正文 ══
{
  const touched = []
  const page = { token: 'tok1', path: '笔记.md', status: 'ready', text: '一段正文', model: 'text', fmExtra: '' }
  Object.defineProperty(page, 'blocks', { get() { touched.push('blocks'); return {} }, enumerable: true })
  Object.defineProperty(page, 'order', { get() { touched.push('order'); return [] }, enumerable: true })
  const st = { notices: [], inserts: [], writes: [] }
  const c = {
    registerView() { }, registerCommand() { }, registerSetting() { },
    registerFileType: () => { }, registerFileCreator() { },
    notify: (m) => st.notices.push(String(m)), openView() { },
    achievements: { registerSeries() { }, track() { } },
    app: {
      notify: (m) => st.notices.push(String(m)),
      readFile: async () => null, writeFile: async (pth) => { st.writes.push(pth) }, openFile() { },
      getActivePageText: () => page.text,
      getPage: () => page,
      insertMarkdown: (tok, md, where) => st.inserts.push([tok, md, where]),
      workFolder: () => '记忆闪卡',
    },
  }
  globalThis.__FLASHCARDS_TEST__ = {}
  const d = new Function('ctx', src)(c)
  const T4 = Object.assign({}, globalThis.__FLASHCARDS_TEST__)
  globalThis.__FLASHCARDS_TEST__ = null
  await T4.generateFromNote() // 未登录 → 早退,但正文这一步已经走完
  A.deepEqual(touched, [], 'v4 路由:插件一次都没去读 page.blocks / page.order(正文只走 getActivePageText)')
  A.ok(st.notices.length > 0, 'v4 路由前提:确实走到了「拿正文 → 检查登录」这一步(否则上一条断言是空的)')
  A.equal(st.inserts.length, 0, 'v4 路由:本插件不改活动页正文,连 insertMarkdown 都不需要(产物是独立的 .deck.md)')
  A.equal(st.writes.length, 0, '未登录时不产出任何文件')
  d()
}

// ══ 🆕 BRIEF #10:活动页写保护 —— 降级宿主下卡组正开在笔记编辑器里 ══
{
  const lsBakW = new Map(_ls)
  const P = '记忆闪卡/Act.deck.md'
  const pastW = { due: new Date(NOW - DAY).toISOString(), s: 2, d: 5, reps: 1, lapses: 0, state: 2, last: new Date(NOW - 2 * DAY).toISOString() }
  const bootW = (withFt) => {
    const st = { views: [], notices: [], writes: [], vault: new Map() }
    st.vault.set(P, T.serializeDeck({ name: 'Act', fsrs: { c1: pastW }, cards: [{ id: 'c1', q: 'q1', a: 'a1' }] }))
    st.vault.set('记忆闪卡/.deck-index.json', JSON.stringify({ decks: [{ path: P, name: 'Act', cards: 1, due: 1, fresh: 0, nextDue: 0, touched: NOW }] }))
    const c = {
      registerView: (v) => st.views.push(v),
      registerCommand() { }, registerSetting() { }, registerFileCreator() { },
      notify: (m) => st.notices.push(String(m)), openView() { },
      achievements: { registerSeries() { }, track() { } },
      app: {
        notify: (m) => st.notices.push(String(m)),
        readFile: async (pth) => (st.vault.has(pth) ? st.vault.get(pth) : null),
        writeFile: async (pth, x) => { st.writes.push(pth); st.vault.set(pth, String(x)) },
        openFile() { }, getActivePageText: () => '', workFolder: () => '记忆闪卡',
        getActivePage: () => P, // ← 用户正把这个卡组开在笔记编辑器里
      },
    }
    if (withFt) c.registerFileType = () => { }
    return { st, dispose: new Function('ctx', src)(c) }
  }
  const rateOnce = async (h) => {
    const host = mkEl('div')
    const off = h.st.views.find((v) => v.id === 'review').mount(host)
    await sleep(60)
    fire(buttonByText(rootOf6(host), '显示答案'), 'click')
    fire(buttonByText(rootOf6(host), '记得 3'), 'click')
    await sleep(150)
    return { host, off }
  }
  // (a) 降级宿主(无 registerFileType):.deck.md 只是普通笔记 → 拒写 + 提示 + 跳过这张卡
  {
    _ls.set('plugin.flashcards.dailyLimit', '50')
    _ls.delete('plugin.flashcards.daily')
    _ls.delete('plugin.flashcards.streak')
    const h = bootW(false)
    const before = h.st.vault.get(P)
    h.st.writes.length = 0
    const m = await rateOnce(h)
    A.equal(h.st.writes.filter((x) => x === P).length, 0, 'R15:降级宿主 + 卡组正开在编辑器 → 零 writeFile(整篇覆写会抹掉用户正在敲的字)')
    A.equal(h.st.vault.get(P), before, 'R15:卡组文件逐字未变')
    A.ok(h.st.notices.some((x) => x.includes('正开在笔记编辑器里')), 'R15:给出 deckActiveBlocked 提示')
    A.equal(T.readDaily().reviewed, 0, 'R15:跳过的卡不计入今日复习数(不谎报成功)')
    A.equal(T.parseDeck(h.st.vault.get(P)).fsrs.c1.due, pastW.due, 'R15:调度状态没被改 → 这张卡仍留在到期队列里,下次再来')
    m.off()
    h.dispose()
  }
  // (b) 现代宿主(有 registerFileType):同一路径照常写盘 —— 无条件闸会把「编辑器开着 → 复习本组」打死
  {
    _ls.delete('plugin.flashcards.daily')
    const h = bootW(true)
    h.st.writes.length = 0
    const m = await rateOnce(h)
    A.ok(h.st.writes.filter((x) => x === P).length > 0, 'R15:现代宿主(ftReady)下同一路径照常写盘 —— 行为零变化')
    A.equal(T.readDaily().reviewed, 1, 'R15:现代宿主下照常计数')
    A.ok(!h.st.notices.some((x) => x.includes('正开在笔记编辑器里')), 'R15:现代宿主不弹这条提示')
    A.notEqual(T.parseDeck(h.st.vault.get(P)).fsrs.c1.due, pastW.due, 'R15:现代宿主下调度状态确实更新了')
    m.off()
    h.dispose()
  }
  _ls.clear()
  for (const [k, v] of lsBakW) _ls.set(k, v)
}

await sleep(60)
A.equal(rejections.length, 0, `1.2.0 新增小节存在未处理拒绝:${rejections.map((e) => (e && e.stack) || String(e)).join(' | ')}`)

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
  A.ok(!('registerStatusItem' in oldCtx), 'R5(a):旧宿主(a)根本没有状态栏 API,插件也不许去碰')
}

// ── ⑥ 旧宿主(b):仅缺 registerFileType → 复习台照常,建卡入口整体隐藏 ──
{
  const bReg = { views: [], commands: [], settings: [], creators: [], notices: [], statusItems: [], statusUpdates: [], statusDisposes: 0 }
  const bCtx = {
    registerView: (v) => bReg.views.push(v),
    registerCommand: (c) => bReg.commands.push(c),
    registerSetting: (s) => bReg.settings.push(s),
    // registerStatusItem 是 2026-07-23 的接缝,比只读 vault 面还老 —— 只缺 registerFileType 的宿主现实中就该有它
    registerStatusItem: (it) => { bReg.statusItems.push(it); return { update: (pt) => bReg.statusUpdates.push(pt), dispose: () => { bReg.statusDisposes += 1 } } },
    openView() { },
    app: { notify: (m) => bReg.notices.push(m), readFile: async () => null, writeFile: async () => { }, openFile() { }, getActivePageText: () => '' },
  }
  const bDispose = new Function('ctx', src)(bCtx)
  A.equal(typeof bDispose, 'function', '旧宿主(b)setup 应返回 disposer 且不抛')
  bDispose()
  A.deepEqual(bReg.views.map((v) => v.id), ['review'], '复习台照常注册')
  A.deepEqual(bReg.commands.map((c) => c.id), ['flashcards-open'], '只留打开命令;from-note 不注册(避免建出被笔记编译器改写的文件)')
  A.deepEqual(bReg.settings.map((s) => s.key), ['dailyLimit', 'nudge'])
  A.equal(bReg.creators.length, 0)
  // R5(b):有视图、只缺文件类型 → 状态栏照常注册(且只注册一次),disposer 把 handle 还回去
  A.equal(bReg.statusItems.length, 1, 'R5(b):降级宿主下状态栏常驻项照常注册')
  A.equal(bReg.statusItems[0].id, 'due', 'R5(b):状态项 id 钉死 due(宿主命名空间后 = plugin:flashcards:due)')
  A.equal(bReg.statusItems[0].side, 'right', 'R5(b):side=right')
  A.equal(typeof bReg.statusItems[0].onClick, 'function', 'R5(b):点击可打开复习台')
  A.equal(bReg.statusDisposes, 1, 'R5(b):disposer 必须归还状态栏 handle')
}

// ── 内置抢占 .deck.md(registerFileType === false)→ 整体退让,只留提示 ──
{
  const cReg = { views: [], commands: [], settings: [], creators: [], notices: [], statusItems: [] }
  const cCtx = {
    registerView: (v) => cReg.views.push(v),
    registerCommand: (c) => cReg.commands.push(c),
    registerSetting: (s) => cReg.settings.push(s),
    registerFileType: () => false,
    registerFileCreator: (f) => cReg.creators.push(f),
    registerStatusItem: (it) => { cReg.statusItems.push(it); return { update() { }, dispose() { } } },
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
  A.equal(cReg.statusItems.length, 0, 'R5(c):退让时状态栏也不注册(它与设置同住那个 else 分支)')
}

// ══════════════════════════════════════════════════════════════════════════
// [回归] 2026-08-21 对抗评审三条 P0(REVIEW-flashcards.md Finding 1/2/4)
//   共同病根:宿主 readFile 对「文件不存在」「fs 读失败」「库根未就位」一律返回 null
//   (真源 electron/amadeus/ipc.ts:981-988),插件把 null 折叠成「还没有」。
// ══════════════════════════════════════════════════════════════════════════
{
  const mk = (o) => {
    const opt = o || {}
    const st = { vault: new Map(), writes: [], notices: [], ls: new Set() }
    if (opt.seed) opt.seed(st.vault, st.ls)
    const c = {
      registerView() {}, registerCommand() {}, registerSetting() {}, registerFileType: () => {},
      registerFileCreator() {}, registerStatusItem: () => ({ update() {}, dispose() {} }),
      notify: (m, x) => st.notices.push([String(m), (x && x.level) || '']),
      openView() {}, getLocale: () => 'zh', subscribeLocale: () => () => {},
      achievements: { registerSeries() {}, track() {} },
      loadData: async () => null, saveData: async () => {},
      app: {
        notify: (m) => st.notices.push([String(m), '']),
        readFile: async (pth) => (opt.failRead && opt.failRead.has(pth) ? null : (st.vault.has(pth) ? st.vault.get(pth) : null)),
        writeFile: async (pth, x) => { st.vault.set(pth, String(x)); st.writes.push(pth) },
        openFile() {}, getActivePage: () => null, getActivePageText: () => '',
        workFolder: () => '记忆闪卡', prompt: async () => null,
      },
    }
    if (!opt.noEnum) c.app.listFiles = async () => Array.from(st.ls)
    globalThis.__FLASHCARDS_TEST__ = {}
    const d = new Function('ctx', src)(c)
    const T = Object.assign({}, globalThis.__FLASHCARDS_TEST__)
    globalThis.__FLASHCARDS_TEST__ = null
    return { st, T, dispose: d, ctx: c }
  }
  const DECK = '记忆闪卡/高数.deck.md'
  const BODY = '---\ndeck: 高数\nfsrs: {"c1":{"due":"2030-01-01T00:00:00.000Z"}}\n---\n\n<!-- card:c1 -->\nQ: a\nA: b\n'

  // R-P0-1:盘上已有卡组,但这一刻该路径 readFile 读失败(null)。
  //   占位判定必须靠只读枚举面 / 索引账本,绝不能把 null 当「路径空着」。
  {
    const h = mk({ seed: (v, ls) => { v.set(DECK, BODY); ls.add(DECK) }, failRead: new Set([DECK]) })
    const got = await h.T.uniqueDeckPath('高数', null)
    A.notEqual(got, DECK, 'R-P0-1 读失败时绝不把被占用的路径当空位返回')
    A.equal(got, '记忆闪卡/高数 2.deck.md', 'R-P0-1 让位到序号名')
    A.equal(h.st.vault.get(DECK), BODY, 'R-P0-1 用户既有卡组一个字节没动')
    h.dispose()
  }
  // R-P0-1b:枚举面看不到、但我们自己的索引账本记着 → 同样算占用
  {
    const IDX = '记忆闪卡/.deck-index.json'
    const h = mk({
      seed: (v) => { v.set(DECK, BODY); v.set(IDX, JSON.stringify({ decks: [{ path: DECK, name: '高数', cards: 1 }] })) },
      failRead: new Set([DECK]),
    })
    A.equal(await h.T.uniqueDeckPath('高数', null), '记忆闪卡/高数 2.deck.md', 'R-P0-1b 索引账本也是占位证据')
    h.dispose()
  }
  // R-P0-1c:反向 —— 路径真的空着时不许乱让位(别拒过头)
  {
    const h = mk({ seed: (v, ls) => { ls.add('记忆闪卡/别的.deck.md') } })
    A.equal(await h.T.uniqueDeckPath('高数', null), DECK, 'R-P0-1c 真空位仍取原名')
    h.dispose()
  }
  // R-P0-2:索引读失败/坏 JSON 时一律不落盘(否则把「读不出来」持久化成「这些卡组不存在」)
  {
    const IDX = '记忆闪卡/.deck-index.json'
    const h = mk({ seed: (v) => { v.set(IDX, '{坏 JSON') } })
    const idx = await h.T.readIndex()
    A.equal(idx.ok, false, 'R-P0-2 坏 JSON = 读失败态,不是「还没有索引」')
    h.st.writes.length = 0
    await h.T.refreshDeckRow(DECK, h.T.parseDeck(BODY))
    A.equal(h.st.writes.indexOf(IDX), -1, 'R-P0-2 索引读失败时绝不 writeIndex')
    A.equal(h.st.vault.get(IDX), '{坏 JSON', 'R-P0-2 坏索引原样保留,等下一次自愈')
    h.dispose()
  }
  // R-P0-2b:没有索引(全新用户)是正常初始态,照常落盘
  {
    const IDX = '记忆闪卡/.deck-index.json'
    const h = mk({})
    A.equal((await h.T.readIndex()).ok, true, 'R-P0-2b 没写过索引 = ok 态')
    await h.T.refreshDeckRow(DECK, h.T.parseDeck(BODY))
    A.ok(h.st.writes.includes(IDX), 'R-P0-2b 正常态照常写索引')
    h.dispose()
  }
}

// [回归 2026-08-21 · 评审 Finding 4②] 文件还在、只是这一刻读不到(云盘占位 / 权限 / 切库瞬间)→
//   一律保留该行且**不落盘**。1.2.0 起 5 分钟轮询会无人值守跑这条路,剔了就是让用户的卡组
//   从复习队列与状态栏里永久消失(文件明明还在)。
{
  const IDX0 = V.get('记忆闪卡/.deck-index.json') // 本块结束后逐字节还原,别污染后面的有状态用例
  const KEEP = '记忆闪卡/C.deck.md'
  V.set(KEEP, '---\ndeck: 组C\nfsrs: {}\n---\n\n<!-- card:c9 -->\nQ: q\nA: a\n')
  await T.refreshDeckRow(KEEP)
  const before = JSON.parse(V.get('记忆闪卡/.deck-index.json')).decks.map((d) => d.path).sort()
  A.ok(before.includes(KEEP), 'R-F4 前置:C 已在索引里')
  const realRead = ctx.app.readFile
  ctx.app.readFile = async (x) => (x === KEEP ? null : (V.has(x) ? V.get(x) : null)) // 文件还在,只是读不出来
  const w0 = writes.length
  await T.buildQueue(null)
  ctx.app.readFile = realRead
  const after = JSON.parse(V.get('记忆闪卡/.deck-index.json')).decks.map((d) => d.path).sort()
  A.deepEqual(after, before, 'R-F4 读不到但文件还在 → 索引一行都没少')
  A.equal(writes.filter((x) => x === '记忆闪卡/.deck-index.json').length - writes.slice(0, w0).filter((x) => x === '记忆闪卡/.deck-index.json').length, 0, 'R-F4 这一轮的残缺 rows 不许落盘')
  V.delete(KEEP)
  await T.buildQueue(null) // 真删掉之后照旧自愈
  A.ok(!JSON.parse(V.get('记忆闪卡/.deck-index.json')).decks.some((d) => d.path === KEEP), 'R-F4 真删了才剔除(自愈仍然成立)')
  V.set('记忆闪卡/.deck-index.json', IDX0)
}

console.log(`check ok [TZ=${process.env.FC_TZ}] — 贡献点/FSRS 向量(含钳制)/契约往返(保真三防线)/围栏解析(内嵌代码块)/ID 分配/XSS/索引自愈/队列/连击/挂载冒烟(焦点·合并写·守卫·创建契约)/双语(键集合·en 真渲·切换即变·退订)/旧宿主两档/内置退让/状态栏(口径不变式·三态·索引自愈·泄漏防线·提醒 P0)/v4 路由/活动页写保护/[08-21 回归]占位判定不信 readFile 的 null·索引读失败不落盘 全部通过`)
