/**
 * 记忆闪卡 —— Forsion 桌面插件(裸 setup(ctx) 体,宿主 new Function('ctx', code) 装载)。
 *
 * 一句话:`.deck.md` 卡组文件 + FSRS 间隔重复复习台 + 一条命令让 Tangu 从当前笔记生成卡组。
 *
 * 数据契约(与随包技能 flashcard-format 一致,冻结):
 *   - 卡片身份 = `<!-- card:cN -->` 标记;新建 ID 取全文 max+1(含 fsrs 孤儿键,不靠计数器)。
 *   - FSRS 状态在 frontmatter `fsrs:` 单行 JSON,按 ID 键控;手改 Q/A 永不触碰调度状态;
 *     删卡 = 复习端惰性忽略孤儿状态键,写文件时清理。
 *   - 索引 = <workFolder>/.deck-index.json,新建/打开/复习都刷新对应行(自愈),孤儿行剔除。
 *
 * 引擎接入(照 bluebird 配方,纯文本 run:不指定 agent、不要宿主执行面,默认助手即可):
 *   POST /agent/runs + SSE /events,模型回一个 ```deck 代码块,插件自己解析、分配 ID、writeFile。
 * 安全:模型/用户产出的 Markdown 一律走自建 renderMarkdown(只 createElement+textContent)。
 */
const PLUGIN_ID = 'flashcards'
const APP_ID = 'tangu'
const DAY = 86400000
const MIN = 60000

// ── 小工具 ───────────────────────────────────────────────────────────────────
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const lsGet = (k, d) => { try { const v = localStorage.getItem(`plugin.${PLUGIN_ID}.${k}`); return v == null ? d : v } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(`plugin.${PLUGIN_ID}.${k}`, v) } catch { /* ignore */ } }
const lsJSON = (k, d) => { try { const o = JSON.parse(lsGet(k, '')); return o && typeof o === 'object' ? o : d } catch { return d } }
function sanitizeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名卡组'
}
const basename = (p) => String(p || '').split('/').pop().replace(/\.deck\.md$/i, '')
function safeHref(u) {
  const s = String(u || '').trim()
  return /^(https?:\/\/|#|mailto:)/i.test(s) ? s : ''
}

// ── FSRS-4.5 精简版(核心纯函数:不读全局钟,now 由调用方传) ─────────────────
// 官方默认权重(open-spaced-repetition FSRS-4.5,17 参数)。
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755]
const DECAY = -0.5
const FACTOR = 19 / 81
const clampD = (d) => Math.min(10, Math.max(1, d))
const r4 = (x) => Math.round(x * 10000) / 10000
const initD = (g) => clampD(W[4] - (g - 3) * W[5])
const nextD = (d, g) => clampD(W[7] * W[4] + (1 - W[7]) * (d - W[6] * (g - 3)))
const retrievability = (days, s) => Math.pow(1 + FACTOR * Math.max(0, days) / Math.max(0.01, s), DECAY)
const recallS = (d, s, r, g) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1))
const forgetS = (d, s, r) => Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)))
// Anki 式最大间隔:100 年。没有上限时,手改/agent 写坏的巨大 s(如 1e9)会让
// new Date(due).toISOString() 直接 RangeError,连带 renderCard 四档预览与 rate 全崩。
const MAX_IVL = 36500
const ivlDays = (s) => Math.min(MAX_IVL, Math.max(1, Math.round(num(s, 1))))

/**
 * schedule(cardState|null, rating 1-4, now) → newState
 * state: 0=new 1=learning 2=review 3=relearning;输出 due/s/d/reps/lapses/state/last(due/last 为 ISO)。
 * 设计定式:新卡 Good 毕业 = 次日(+1 天整);学习/重学步 1min→10min;review 间隔 = round(s) 天(FSRS 目标保留率 0.9 时 间隔≈s)。
 * 对手写 fsrs 的畸形输入全部兜底(NaN 不进文件)。
 */
function schedule(prev, rating, now) {
  const g = Math.min(4, Math.max(1, Math.round(num(rating, 3))))
  const p = prev && typeof prev === 'object' ? prev : null
  const st = p && (p.state === 1 || p.state === 2 || p.state === 3) ? p.state : 0
  const reps = Math.max(0, Math.round(num(p && p.reps, 0))) + 1
  let lapses = Math.max(0, Math.round(num(p && p.lapses, 0)))
  let s, d, state, due
  if (!p || st === 0) {
    d = initD(g)
    s = r4(W[g - 1])
    if (g === 1) { state = 1; due = now + MIN }
    else if (g === 2) { state = 1; due = now + 10 * MIN }
    else if (g === 3) { state = 2; due = now + DAY } // 新卡 Good = 次日毕业
    else { state = 2; due = now + ivlDays(s) * DAY }
  } else if (st === 1 || st === 3) {
    d = nextD(clampD(num(p.d, initD(3))), g)
    s = r4(Math.max(0.01, num(p.s, W[g - 1])))
    if (g === 1) { state = st; due = now + MIN }
    else if (g === 2) { state = st; due = now + 10 * MIN }
    else if (g === 3) { state = 2; due = now + ivlDays(s) * DAY }
    else { state = 2; due = now + Math.max(4, ivlDays(s)) * DAY } // 照 Anki:学习中直接 Easy ≥4 天
  } else {
    const s0 = Math.max(0.01, num(p.s, W[2]))
    const d0 = clampD(num(p.d, initD(3)))
    const lastT = Date.parse(p.last || '')
    const elapsed = Number.isFinite(lastT) ? Math.max(0, (now - lastT) / DAY) : 0
    const r = retrievability(elapsed, s0)
    d = nextD(d0, g)
    if (g === 1) { lapses += 1; state = 3; s = r4(Math.max(0.01, forgetS(d0, s0, r))); due = now + 10 * MIN }
    else { state = 2; s = r4(Math.max(0.01, recallS(d0, s0, r, g))); due = now + ivlDays(s) * DAY }
  }
  // 出口钳制:s 封顶 MAX_IVL、due 必须是合法时间戳(畸形输入绝不产 Invalid Date / NaN 进文件)。
  const sOut = r4(Math.min(MAX_IVL, Math.max(0.01, num(s, 1))))
  const dueOut = Number.isFinite(due) ? due : now + DAY
  return { due: new Date(dueOut).toISOString(), s: sOut, d: r4(clampD(num(d, initD(3)))), reps, lapses, state, last: new Date(now).toISOString() }
}

// ── .deck.md 解析 / 序列化(数据契约,frontmatter 手写解析,不上 YAML 库) ────
// 保真三原则(毁档防线):①标记判定宽容(大小写 / 冒号后空格 / 行尾空白);②认不出的一切
// (首个 card 标记前的正文、未知 frontmatter 键、坏掉的 fsrs 行)原样保留、原样写回;
// ③正文里长得像 card 标记的行写盘时转义(card\:)、读回时还原,内容永远撑不破结构。
const CARD_RE = /^<!--\s*card\s*:\s*([A-Za-z0-9_-]+)\s*-->\s*$/i
const escapeCardLine = (l) => l.replace(/^(<!--\s*card\s*)(\\*)(\s*:)/i, (m, a, b, c) => a + b + '\\' + c)
const unescapeCardLine = (l) => l.replace(/^(<!--\s*card\s*)(\\*)\\(\s*:)/i, (m, a, b, c) => a + b + c)

function splitQA(content) {
  const lines = String(content == null ? '' : content).split('\n')
  let qi = -1
  let ai = -1
  for (let j = 0; j < lines.length; j++) {
    if (qi < 0 && /^Q:/.test(lines[j])) { qi = j; continue }
    if (qi >= 0 && ai < 0 && /^A:/.test(lines[j])) { ai = j; break }
  }
  if (qi < 0) return { q: String(content == null ? '' : content).trim(), a: '' }
  const q = [lines[qi].replace(/^Q:\s?/, '')].concat(lines.slice(qi + 1, ai < 0 ? lines.length : ai)).join('\n').trim()
  const a = ai < 0 ? '' : [lines[ai].replace(/^A:\s?/, '')].concat(lines.slice(ai + 1)).join('\n').trim()
  return { q, a }
}

/**
 * 解析卡组。frontmatter 里 `deck:` / `fsrs:` 之外的键进 fmExtra 原样保留;首个 card 标记前
 * 的正文进 preamble 原样保留;fsrs 坏 JSON → fsrsBroken=true 并把原始行留在 fsrsRaw
 * (序列化时原样写回,绝不重写成 {} 抹掉调度状态);hadFm = 是否认出 frontmatter 对。
 */
function parseDeck(text) {
  const raw = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')
  let name = ''
  let fsrs = {}
  const fmExtra = []
  let hadFm = false
  let fsrsBroken = false
  let fsrsRaw = ''
  let bodyStart = 0
  let k = 0
  while (k < lines.length && lines[k].trim() === '') k++ // 容忍开头空行
  if (k < lines.length && lines[k].trim() === '---') { // 开 / 闭栏一律 trim 比较(行尾空格 / \t 不致命)
    let close = -1
    for (let j = k + 1; j < lines.length; j++) { const t = lines[j].trim(); if (t === '---' || t === '...') { close = j; break } }
    if (close > 0) {
      hadFm = true
      for (let j = k + 1; j < close; j++) {
        const dm = /^\s*deck:\s*(.*)$/.exec(lines[j])
        if (dm) { name = dm[1].trim(); continue }
        const fm = /^\s*fsrs:\s*(.*)$/.exec(lines[j])
        if (fm) {
          let sj = fm[1].trim()
          if (/^['"]/.test(sj) && sj.length > 1 && sj[0] === sj[sj.length - 1]) sj = sj.slice(1, -1)
          let ok = false
          try { const o = JSON.parse(sj); if (o && typeof o === 'object' && !Array.isArray(o)) { fsrs = o; ok = true } } catch { /* 标损坏 */ }
          if (!ok) { fsrsBroken = true; fsrsRaw = lines[j] }
          continue
        }
        fmExtra.push(lines[j]) // 未知键(tags:/icon:/aliases:…)原样保留
      }
      bodyStart = close + 1
    }
  }
  const cards = []
  const preamble = []
  let cur = null
  let buf = []
  const flush = () => {
    if (cur != null) { const qa = splitQA(buf.map(unescapeCardLine).join('\n')); cards.push({ id: cur, q: qa.q, a: qa.a }) }
    else { for (const l of buf) preamble.push(l) } // 首个标记前的正文不丢
    buf = []
  }
  for (let i = bodyStart; i < lines.length; i++) {
    const m = CARD_RE.exec(lines[i])
    if (m) { flush(); cur = m[1] } else buf.push(lines[i])
  }
  flush()
  return { name, fsrs, cards, preamble, fmExtra, hadFm, fsrsBroken, fsrsRaw }
}

/**
 * 序列化卡组。孤儿 fsrs 状态键(无对应卡片)在此清理;preamble / 未知 frontmatter 键 /
 * 坏掉的 fsrs 原始行全部原样写回(保真三原则);Q/A 续行里长得像 card 标记的行转义后写
 * (首行有 Q:/A: 前缀天然安全,不转义 —— 转义了反而毁内容)。
 */
function serializeDeck(deck) {
  const cards = deck && Array.isArray(deck.cards) ? deck.cards : []
  const src = deck && deck.fsrs && typeof deck.fsrs === 'object' ? deck.fsrs : {}
  const ids = new Set(cards.map((c) => c.id))
  const keep = {}
  for (const k of Object.keys(src)) { if (ids.has(k)) keep[k] = src[k] }
  const name = String((deck && deck.name) || '').replace(/[\r\n]+/g, ' ').trim()
  const out = ['---', `deck: ${name}`]
  if (deck && deck.fsrsBroken && deck.fsrsRaw) out.push(deck.fsrsRaw)
  else out.push(`fsrs: ${JSON.stringify(keep)}`)
  for (const l of (deck && deck.fmExtra) || []) out.push(l)
  out.push('---')
  const pre = (deck && deck.preamble) || []
  if (pre.length) { for (const l of pre) out.push(l) } else out.push('')
  for (const c of cards) {
    out.push(`<!-- card:${c.id} -->`)
    const q = String(c.q == null ? '' : c.q).split('\n')
    out.push('Q: ' + q[0])
    for (let j = 1; j < q.length; j++) out.push(escapeCardLine(q[j]))
    const a = String(c.a == null ? '' : c.a).split('\n')
    out.push('A: ' + a[0])
    for (let j = 1; j < a.length; j++) out.push(escapeCardLine(a[j]))
    out.push('')
  }
  return out.join('\n')
}

/** 新卡 ID = 扫描全文取最大(卡片 ID 与 fsrs 孤儿键都算)+1,不靠计数器 → 手删中间卡也不撞。 */
function nextCardId(deck) {
  let max = 0
  const scan = (id) => { const m = /^c(\d+)$/.exec(String(id || '')); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  for (const c of (deck && deck.cards) || []) scan(c.id)
  for (const k of Object.keys((deck && deck.fsrs) || {})) scan(k)
  return `c${max + 1}`
}

/**
 * 从模型输出抠 ```deck 块(前后夹杂废话也能抠):首行 deck: 名,随后 Q:/A: 对。
 * 逐行扫描并记围栏深度:答案里内嵌 ```python 代码块不会被当成 deck 块的闭栏
 * (非贪婪正则会在第一个 ``` 提前截断,静默丢卡)。未闭合 → null(提示重试)。
 */
function parseDeckFence(text) {
  const all = String(text || '').replace(/\r\n/g, '\n').split('\n')
  let start = -1
  for (let j = 0; j < all.length; j++) { if (/^```deck\b/i.test(all[j].trim())) { start = j; break } }
  if (start < 0) return null
  const body = []
  let depth = 0
  let closed = false
  for (let j = start + 1; j < all.length; j++) {
    const t = all[j].trim()
    if (/^```/.test(t)) {
      if (/^`+$/.test(t)) { // 裸闭栏
        if (depth === 0) { closed = true; break }
        depth--
      } else depth++ // 带语言名的内嵌开栏
    }
    body.push(all[j])
  }
  if (!closed) return null
  const lines = body
  let name = ''
  let seenName = false
  const rest = []
  for (const l of lines) {
    const dm = /^deck:\s*(.*)$/.exec(l)
    if (dm && !seenName) { name = dm[1].trim(); seenName = true; continue }
    rest.push(l)
  }
  const chunks = []
  let cur = null
  for (const l of rest) {
    if (/^Q:/.test(l)) { if (cur) chunks.push(cur); cur = [l] }
    else if (cur) cur.push(l)
  }
  if (cur) chunks.push(cur)
  const cards = []
  for (const ch of chunks) {
    const qa = splitQA(ch.join('\n'))
    if (qa.q && qa.a) cards.push({ q: qa.q, a: qa.a })
  }
  return cards.length ? { name, cards } : null
}

// ── 日期纪律(Date.now 单源;单次日差 = 两本地正午之差 ÷24h 加 round,DST 安全) ──
function dayKey(ts) {
  const d = new Date(ts == null ? Date.now() : ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function dayDiff(aKey, bKey) {
  const t = (k) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : NaN }
  const d = (t(aKey) - t(bKey)) / DAY
  return Number.isFinite(d) ? Math.round(d) : 0
}
/** 今日复习/新卡计数(跨日自动清零)。 */
function readDaily() {
  const today = dayKey(Date.now())
  const o = lsJSON('daily', {})
  return o.date === today ? { date: today, introduced: Math.max(0, num(o.introduced, 0)), reviewed: Math.max(0, num(o.reviewed, 0)) } : { date: today, introduced: 0, reviewed: 0 }
}
const writeDaily = (d) => lsSet('daily', JSON.stringify(d))
function dailyLimit() {
  const n = parseInt(String(lsGet('dailyLimit', '50')), 10)
  return Number.isFinite(n) && n >= 0 ? n : 50
}
/** 连续复习天数:昨天也复习过才 +1;只有刷新历史纪录才发成就事件(计数器 = 历史最长连击)。 */
function updateStreak() {
  const today = dayKey(Date.now())
  const s = lsJSON('streak', {})
  if (s.last === today) return s
  const len = s.last && dayDiff(today, s.last) === 1 ? Math.max(0, num(s.len, 0)) + 1 : 1
  const max = Math.max(0, num(s.max, 0))
  const out = { last: today, len, max: Math.max(max, len) }
  if (len > max && ctx.achievements && ctx.achievements.track) ctx.achievements.track('streak', len - max)
  lsSet('streak', JSON.stringify(out))
  return out
}

// ── 行内 / 块 Markdown → 安全 DOM(只 createElement+textContent,绝不 innerHTML 不可信) ──
function inline(text) {
  const frag = document.createDocumentFragment()
  let rest = String(text == null ? '' : text)
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/
  let m
  while ((m = re.exec(rest))) {
    if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)))
    if (m[1] != null) { const b = document.createElement('strong'); b.textContent = m[1]; frag.appendChild(b) }
    else if (m[2] != null) { const c = document.createElement('code'); c.textContent = m[2]; frag.appendChild(c) }
    else if (m[3] != null) {
      const a = document.createElement('a')
      a.textContent = m[3]
      const href = safeHref(m[4])
      if (href) { a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') }
      frag.appendChild(a)
    } else if (m[5] != null) { const e = document.createElement('em'); e.textContent = m[5]; frag.appendChild(e) }
    else if (m[6] != null) { const e = document.createElement('em'); e.textContent = m[6]; frag.appendChild(e) }
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) frag.appendChild(document.createTextNode(rest))
  return frag
}
function renderMarkdown(container, md) {
  container.textContent = ''
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let para = []
  let list = null
  let listTag = null
  const flushPara = () => { if (para.length) { const p = document.createElement('p'); p.appendChild(inline(para.join(' '))); container.appendChild(p); para = [] } }
  const flushList = () => { if (list) { container.appendChild(list); list = null; listTag = null } }
  while (i < lines.length) {
    const t = lines[i].replace(/\s+$/, '').trim()
    if (/^```/.test(t)) {
      flushPara(); flushList()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = buf.join('\n')
      pre.appendChild(code)
      container.appendChild(pre)
      continue
    }
    if (t === '') { flushPara(); flushList(); i++; continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) { flushPara(); flushList(); const el = document.createElement('h' + Math.min(4, h[1].length)); el.appendChild(inline(h[2])); container.appendChild(el); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); flushList(); container.appendChild(document.createElement('hr')); i++; continue }
    if (/^>\s?/.test(t)) { flushPara(); flushList(); const bq = document.createElement('blockquote'); bq.appendChild(inline(t.replace(/^>\s?/, ''))); container.appendChild(bq); i++; continue }
    const ul = /^[-*]\s+(.*)$/.exec(t)
    const ol = /^\d+\.\s+(.*)$/.exec(t)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      if (list && listTag !== want) flushList()
      if (!list) { list = document.createElement(want); listTag = want }
      const li = document.createElement('li')
      li.appendChild(inline(ul ? ul[1] : ol[1]))
      list.appendChild(li)
      i++
      continue
    }
    flushList()
    para.push(t)
    i++
  }
  flushPara(); flushList()
}

// ── 引擎配置 + 纯文本 run(bluebird 配方;不指定 agent,不要宿主执行面) ────────
async function getCfg() {
  try {
    const c = await (globalThis.window && window.tangu && window.tangu.getConfig ? window.tangu.getConfig() : null)
    if (c && c.backendUrl) return { backendUrl: c.backendUrl, token: c.token || '', modelId: c.modelId || '' }
  } catch { /* web 回退 */ }
  try { return { backendUrl: location.origin + '/api', token: localStorage.getItem('forsion_token') || '', modelId: '' } } catch { /* ignore */ }
  return { backendUrl: '', token: '', modelId: '' }
}
/** 引擎事件 → 进度(status/token 都是真事件;生成阶段按已产出字数往 92% 爬,只保证单调)。 */
function stageOf(ev, content) {
  const p = ev.payload || {}
  if (ev.type === 'status') return p.state === 'queued' ? { pct: 10, label: '排队中' } : p.state === 'running' ? { pct: 16, label: '模型阅读笔记中' } : null
  if (ev.type === 'token') return { pct: Math.min(92, 30 + content.length / 60), label: '生成卡片中' }
  return null
}
async function runAgent(cfg, sessionId, message, onTick, signal, onStage) {
  const stage = (pct, label) => { if (onStage) onStage(pct, label) }
  stage(6, '提交任务')
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }
  const start = await fetch(`${cfg.backendUrl}/agent/runs`, {
    method: 'POST', headers: h, signal,
    body: JSON.stringify({ session_id: sessionId, model_id: cfg.modelId || undefined, app_id: APP_ID, message, attachments: [] }),
  })
  if (!start.ok) throw new Error((await start.text().catch(() => '')) || `起 run 失败 HTTP ${start.status}`)
  const { runId } = await start.json()
  if (!runId) throw new Error('引擎未返回 runId')
  const res = await fetch(`${cfg.backendUrl}/agent/runs/${encodeURIComponent(runId)}/events?fromSeq=0`, { headers: h, signal })
  if (!res.ok || !res.body) throw new Error(`订阅事件失败 HTTP ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let lastSeq = 0
  let content = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() || ''
    for (const line of parts) {
      const s = line.trim()
      if (!s || s.startsWith(':') || !s.startsWith('data:')) continue
      const data = s.slice(5).replace(/^ /, '')
      if (!data) continue
      let ev
      try { ev = JSON.parse(data) } catch { continue }
      if (typeof ev.seq === 'number') { if (ev.seq <= lastSeq) continue; lastSeq = ev.seq }
      if (ev.type === 'token') { const dta = ev.payload && ev.payload.delta; if (dta) { content += dta; if (onTick) onTick(content) } }
      const st = stageOf(ev, content)
      if (st) stage(st.pct, st.label)
      if (ev.type === 'token') continue
      if (ev.type === 'done') { stage(100, '完成'); return (ev.payload && ev.payload.content) || content }
      if (ev.type === 'error') throw new Error((ev.payload && ev.payload.error) || '生成失败')
    }
  }
  throw new Error('与引擎的连接中断,未收到完成事件(可重试)')
}

// 超长笔记只取前 NOTE_CAP 字喂模型 —— 但必须提示用户,不许静默截(否则像模型漏读)。
const NOTE_CAP = 20000
function clipNote(note) {
  const s = String(note == null ? '' : note)
  return s.length > NOTE_CAP ? { text: s.slice(0, NOTE_CAP), truncated: true } : { text: s, truncated: false }
}

// 注入模型的指令段:一律英文(语言纪律);笔记原文是用户的,原样带上。
const GEN_PROMPT = (note) => `Create spaced-repetition flashcards from the note below.

Reply with EXACTLY ONE fenced code block tagged \`deck\`. Anything outside the block is ignored. Format:

\`\`\`deck
deck: <short deck name, same language as the note>
Q: <question>
A: <answer>

Q: <next question>
A: <next answer>
\`\`\`

Rules:
- 8 to 20 cards. Each card tests ONE atomic fact - no multi-part questions.
- Answers must be short: one sentence or a compact list.
- A question may continue over several markdown lines; the answer starts at the first following line that begins with "A:".
- Card content language = the note's language.
- Do NOT include card markers, IDs, fsrs data, or numbering - the plugin assigns card IDs itself.

NOTE:
${note}`

// ── 卡组落盘:工作文件夹 + 索引自愈 ───────────────────────────────────────────
const folderRoot = () => (ctx.app.workFolder ? ctx.app.workFolder() : '记忆闪卡')
const indexPath = () => `${folderRoot()}/.deck-index.json`
async function readIndex() {
  try {
    const t = await ctx.app.readFile(indexPath())
    const j = t ? JSON.parse(t) : null
    return j && Array.isArray(j.decks) ? { decks: j.decks } : { decks: [] }
  } catch { return { decks: [] } }
}
const writeIndex = (idx) => ctx.app.writeFile(indexPath(), JSON.stringify(idx, null, 2))
/** 索引自愈:刷新一行(parsed 可省,省了就现读);文件读不到 = 孤儿行,剔除。 */
async function refreshDeckRow(path, parsed) {
  const idx = await readIndex()
  let deck = parsed || null
  if (!deck) {
    const t = await ctx.app.readFile(path)
    deck = t == null ? null : parseDeck(t)
  }
  const rows = idx.decks.filter((r) => r && r.path && r.path !== path)
  if (deck) {
    const now = Date.now()
    let due = 0
    for (const c of deck.cards) {
      const st = deck.fsrs[c.id]
      if (st) { const t = Date.parse(st.due || ''); if (Number.isFinite(t) && t <= now) due++ }
    }
    rows.unshift({ path, name: deck.name || basename(path), cards: deck.cards.length, due, touched: now })
  }
  await writeIndex({ decks: rows })
  return rows
}
/**
 * 重名加序号(名字 2.deck.md),绝不破 `.deck.md` 后缀(破了就掉出文件类型判定)。
 * folder 语义与宿主 fileCreator 契约一致:'' = 库根(types.ts 钉死),null/undefined = 无归属 → 工作文件夹。
 */
async function uniqueDeckPath(name, folder) {
  const base = sanitizeFileName(name)
  const root = folder == null ? folderRoot() : String(folder).replace(/\/+$/, '')
  const prefix = root ? `${root}/` : ''
  for (let n = 1; n < 100; n++) {
    const p = `${prefix}${base}${n > 1 ? ` ${n}` : ''}.deck.md`
    const t = await ctx.app.readFile(p)
    if (t == null) return p
  }
  return `${prefix}${base} ${Date.now()}.deck.md`
}
/**
 * 跨卡组到期队列:读索引 → 逐个 readFile(孤儿行剔除、行计数顺手刷新)。
 * 到期卡(due<=now)按 due 升序在前;新卡(无 fsrs 键 → 孤儿状态自动被视作新? 不——无键才算新)按每日上限补足。
 */
async function buildQueue(scope) {
  const idx = await readIndex()
  const due = []
  const fresh = []
  const rows = []
  const now = Date.now()
  for (const row of idx.decks) {
    if (!row || !row.path) continue
    const t = await ctx.app.readFile(row.path)
    if (t == null) continue // 孤儿行剔除
    const deck = parseDeck(t)
    const name = deck.name || basename(row.path)
    const inScope = !scope || !scope.path || row.path === scope.path
    let dueN = 0
    // fsrs 行损坏的卡组不进队列:此时 fsrs 是空对象,若照常入队,评分写盘会把全组当新卡
    // 重建调度 —— 修好 frontmatter 前只展示,不复习(毁档防线)。
    const usable = !deck.fsrsBroken
    for (const c of deck.cards) {
      const st = deck.fsrs[c.id]
      if (st) {
        const dts = Date.parse(st.due || '')
        if (Number.isFinite(dts) && dts <= now) {
          dueN++
          if (usable && inScope && c.q) due.push({ path: row.path, deckName: name, id: c.id, q: c.q, a: c.a, prev: st, dueTs: dts })
        }
      } else if (usable && inScope && c.q) {
        fresh.push({ path: row.path, deckName: name, id: c.id, q: c.q, a: c.a, prev: null, dueTs: Infinity })
      }
    }
    rows.push({ path: row.path, name, cards: deck.cards.length, due: dueN, touched: row.touched || now })
  }
  await writeIndex({ decks: rows })
  due.sort((x, y) => x.dueTs - y.dueTs)
  const allow = Math.max(0, dailyLimit() - readDaily().introduced)
  return { items: due.concat(fresh.slice(0, allow)), decks: rows.length, freshSkipped: Math.max(0, fresh.length - allow), rows }
}

// ── 跨视图小总线 + 待办打开请求 ──────────────────────────────────────────────
const bus = (() => { const subs = new Set(); return { on: (f) => (subs.add(f), () => subs.delete(f)), emit: (e) => subs.forEach((f) => { try { f(e) } catch { /* ignore */ } }) } })()
let pendingReview = null // { path, name } — 编辑视图「复习本组」→ 复习台消费
let ftReady = false // 一等文件类型是否就位(旧宿主缺席 → 复习台照常,建卡入口隐藏)

// ── AI 建卡(模块级:切走视图任务照跑;复习台顶部显示进度,可取消) ────────────
const gen = { active: false, pct: 0, label: '', error: '', controller: null }
function genSet(patch) { Object.assign(gen, patch); bus.emit({ type: 'gen' }) }
async function generateFromNote() {
  const note = ctx.app.getActivePageText ? String(ctx.app.getActivePageText() || '') : ''
  if (!note.trim()) { say('当前没有打开的笔记(或笔记为空),先打开一篇再生成', { level: 'warning' }); return }
  if (gen.active) { say('已有一个建卡任务在进行中', { level: 'warning' }); if (ctx.openView) ctx.openView('review'); return }
  const cfg = await getCfg()
  if (!cfg.backendUrl || !cfg.token) { say(cfg.backendUrl ? '请先登录 Forsion' : '未连接到 Tangu 引擎', { level: 'error' }); return }
  if (ctx.openView) ctx.openView('review')
  const clip = clipNote(note)
  if (clip.truncated) say(`笔记过长,AI 建卡只使用前 ${NOTE_CAP} 字(其余部分不参与出卡)`, { level: 'warning' })
  const controller = new AbortController()
  genSet({ active: true, pct: 6, label: '提交任务', error: '', controller })
  try {
    const out = await runAgent(cfg, uuid(), GEN_PROMPT(clip.text), null, controller.signal, (pct, label) => genSet({ pct: Math.max(gen.pct, pct), label }))
    const fence = parseDeckFence(out)
    if (!fence) throw new Error('模型没有返回有效的 ```deck 卡组块,请重试')
    const deck = { name: fence.name || '未命名卡组', fsrs: {}, cards: [] }
    for (const c of fence.cards) deck.cards.push({ id: nextCardId(deck), q: c.q, a: c.a })
    const path = await uniqueDeckPath(deck.name)
    await ctx.app.writeFile(path, serializeDeck(deck))
    await refreshDeckRow(path, deck)
    genSet({ active: false, pct: 100, label: '完成', controller: null })
    bus.emit({ type: 'decks' })
    say(`已生成卡组「${deck.name}」(${deck.cards.length} 张卡)`, { level: 'success' })
    if (ctx.app.openFile) ctx.app.openFile(path)
  } catch (e) {
    const aborted = controller.signal.aborted
    genSet({ active: false, pct: 0, label: '', error: aborted ? '' : (e && e.message) || String(e), controller: null })
    if (!aborted) say(`AI 建卡失败:${gen.error}`, { level: 'error' })
  }
}

// ── 浮层容器 + 主题(bluebird 血泪全套:吃宿主 token,缺哪个才从计算样式派生) ──
let _layer = null
function layer() {
  if (!globalThis.document || !document.body) return null
  if (_layer && _layer.isConnected) return _layer
  _layer = document.createElement('div')
  _layer.className = 'fc-layer'
  document.body.appendChild(_layer)
  return _layer
}
let _probe = null
function parseColor(css) {
  const s = (css || '').trim()
  if (!s) return null
  if (!_probe) { const c = document.createElement('canvas'); c.width = c.height = 1; _probe = c.getContext('2d', { willReadFrequently: true }) }
  if (!_probe) return null
  _probe.fillStyle = '#000000'; _probe.fillStyle = s
  const a = _probe.fillStyle
  _probe.fillStyle = '#ffffff'; _probe.fillStyle = s
  if (a === '#000000' && _probe.fillStyle === '#ffffff') return null
  _probe.clearRect(0, 0, 1, 1); _probe.fillRect(0, 0, 1, 1)
  const d = _probe.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3] / 255]
}
function opaqueBgOf(start) {
  for (let n = start; n; n = n.parentElement) {
    const c = parseColor(getComputedStyle(n).backgroundColor)
    if (c && c[3] > 0.95) return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
  }
  return null
}
const relL = (c) => { const g = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }; return 0.2126 * g(c[0]) + 0.7152 * g(c[1]) + 0.0722 * g(c[2]) }
const contrast = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** 强调色上的字色兜底:白 / 近黑取对比度高的一方(宿主没给 --on-accent 时)。 */
const onColorOf = (accent) => (contrast(accent, [255, 255, 255]) >= contrast(accent, [22, 22, 26]) ? '#ffffff' : '#16161a')
/** 强调色当前景(选中态/进度)用时,与底色对比不足就朝文字色掺,掺到 3:1 为止。 */
function readableOn(fg, bg, text, min = 3) {
  let c = [fg[0], fg[1], fg[2]]
  for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = c.map((v, k) => v + (text[k] - v) * 0.18)
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`
}
/** 铺出全套 --fc-*(同时铺到浮层容器),自动跟随宿主深浅与配色。 */
function syncTheme(root) {
  const cs = getComputedStyle(root)
  const tok = (n) => (cs.getPropertyValue(n) || '').trim()
  const rgb = parseColor(tok('--text')) || parseColor(cs.color) || [40, 40, 40, 1]
  const dark = relL(rgb) > 0.5 // 前景偏亮 = 暗色主题
  const bgc = parseColor(tok('--bg')) || parseColor(opaqueBgOf(root.parentElement) || '') || (dark ? [23, 24, 28] : [255, 255, 255])
  const rd = (n) => Math.round(n)
  const f = (a) => `rgba(${rd(rgb[0])},${rd(rgb[1])},${rd(rgb[2])},${a})`
  const accent = tok('--accent') || tok('--am-accent') || (dark ? '#cfc9ff' : '#4C2585')
  const arc = parseColor(accent) || [76, 37, 133, 1]
  const af = (a) => `rgba(${rd(arc[0])},${rd(arc[1])},${rd(arc[2])},${a})`
  const targets = [root, layer()].filter(Boolean)
  const set = (k, v) => targets.forEach((t) => t.style.setProperty(`--fc-${k}`, v))
  targets.forEach((t) => { t.style.colorScheme = dark ? 'dark' : 'light' })
  set('text', tok('--text') || `rgb(${rd(rgb[0])},${rd(rgb[1])},${rd(rgb[2])})`)
  set('text-sec', tok('--text-light') || f(0.72))
  set('text-muted', tok('--text-muted') || f(0.5))
  set('text-subtle', tok('--text-faint') || f(0.32))
  set('bg', tok('--bg') || `rgb(${rd(bgc[0])},${rd(bgc[1])},${rd(bgc[2])})`)
  set('elev', tok('--bg-card') || tok('--bg') || `rgb(${rd(bgc[0])},${rd(bgc[1])},${rd(bgc[2])})`) // 浮层必须不透明
  set('surf', tok('--bg-card') || f(0.045))
  set('surf-sub', tok('--overlay-subtle') || f(0.025))
  set('input', tok('--overlay-light') || f(0.05))
  set('hover', tok('--overlay-medium') || f(0.08))
  set('border', tok('--border') || f(0.16))
  set('border-sub', tok('--overlay-medium') || f(0.09))
  // 强调色两种用法分开:填充用原色 + 宿主字色(绝不写死白字);前景用对比校正过的
  set('fill', accent)
  set('fill-hover', tok('--accent-hover') || accent)
  set('on-fill', tok('--on-accent') || onColorOf(arc))
  set('primary', readableOn(arc, bgc, rgb))
  set('glow', af(0.22))
  set('tint', tok('--accent-light') || af(0.13))
  set('danger', tok('--danger') || (dark ? '#e08a7d' : '#b03a2e'))
  set('shadow', tok('--card-shadow') || (dark ? '0 4px 20px rgba(0,0,0,.4)' : '0 2px 12px rgba(0,0,0,.08)'))
}
function themeObserver(root) {
  syncTheme(root)
  const ob = new MutationObserver(() => syncTheme(root))
  for (let n = root.parentElement; n; n = n.parentElement) ob.observe(n, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme', 'style'] })
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
  const onMq = () => syncTheme(root)
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq)
  return () => { ob.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq) }
}
const say = (m, o) => (ctx.notify ? ctx.notify(m, o) : ctx.app.notify(m))
/** 输入弹层:优先宿主 ctx.app.prompt(Electron 无 window.prompt);老宿主退回自绘。拒绝一律当取消。 */
function askName(title, def) {
  if (ctx.app.prompt) return Promise.resolve(ctx.app.prompt(title, def || '')).catch(() => null)
  return new Promise((resolve) => {
    const host = layer()
    if (!host) { resolve(null); return }
    const ov = document.createElement('div')
    ov.style.cssText = 'position:absolute;left:50%;top:30%;transform:translateX(-50%);pointer-events:auto;min-width:280px;padding:14px;border-radius:12px;background:var(--fc-elev,#f5f5f5);color:var(--fc-text,#222);border:1px solid var(--fc-border,rgba(0,0,0,.2));box-shadow:0 8px 30px rgba(0,0,0,.25)'
    const cap = document.createElement('div')
    cap.style.cssText = 'font-size:12px;margin-bottom:8px'
    cap.textContent = title
    const inp = document.createElement('input')
    inp.style.cssText = 'width:100%;padding:8px 10px;font:inherit;border-radius:9px;border:1.5px solid var(--fc-border,rgba(0,0,0,.2));background:transparent;color:inherit;outline:none'
    inp.value = def || ''
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px'
    const no = document.createElement('button')
    no.textContent = '取消'
    const ok = document.createElement('button')
    ok.textContent = '确定'
    for (const b of [no, ok]) b.style.cssText = 'padding:5px 12px;font:inherit;border-radius:9px;border:1px solid var(--fc-border,rgba(0,0,0,.2));background:transparent;color:inherit;cursor:pointer'
    const done = (v) => { ov.remove(); resolve(v) }
    ok.addEventListener('click', () => done(inp.value.trim() || null))
    no.addEventListener('click', () => done(null))
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null) })
    row.appendChild(no); row.appendChild(ok)
    ov.appendChild(cap); ov.appendChild(inp); ov.appendChild(row)
    host.appendChild(ov)
    inp.focus()
  })
}

// ── 视觉(fc-* 作用域;先吃宿主 token 再回退派生;深浅双模式都能看) ─────────────
const STYLE = `
.fc-root{height:100%;min-height:0;display:flex;flex-direction:column;color:inherit;background:var(--fc-bg);font-size:13px;line-height:1.55;outline:none}
.fc-root *{box-sizing:border-box}
.fc-root ::-webkit-scrollbar{width:6px;height:6px}.fc-root ::-webkit-scrollbar-thumb{background:var(--fc-border);border-radius:3px}
.fc-hdr{flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--fc-border-sub)}
.fc-body{flex:1;min-height:0;overflow:auto;padding:14px}
.fc-panel{border-radius:14px;background:var(--fc-surf);border:1px solid var(--fc-border);box-shadow:var(--fc-shadow)}
.fc-btn{padding:7px 12px;font:inherit;color:var(--fc-text-sec);border:1px solid var(--fc-border);border-radius:12px;background:var(--fc-surf);cursor:pointer;transition:background .2s,border-color .2s,color .2s;white-space:nowrap}
.fc-btn:hover:not(:disabled){background:var(--fc-tint);border-color:var(--fc-primary);color:var(--fc-primary)}
.fc-btn:active:not(:disabled){transform:scale(.98)}
.fc-btn:disabled{opacity:.5;cursor:default}
.fc-btn.primary{color:var(--fc-on-fill);background:var(--fc-fill);border-color:transparent;font-weight:500}
.fc-btn.primary:hover:not(:disabled){background:var(--fc-fill-hover);color:var(--fc-on-fill);border-color:transparent}
.fc-btn.ghost{background:transparent;color:var(--fc-text-sec);border-color:transparent}
.fc-btn.ghost:hover:not(:disabled){background:var(--fc-hover);color:var(--fc-text);border-color:transparent}
.fc-btn.sm{padding:5px 10px;font-size:12px;border-radius:9px}
.fc-btn.danger:hover:not(:disabled){border-color:var(--fc-danger);color:var(--fc-danger);background:transparent}
.fc-input{padding:8px 10px;font:inherit;color:var(--fc-text);background:var(--fc-input);border:1.5px solid var(--fc-border);border-radius:10px;outline:none;transition:border-color .2s,box-shadow .2s}
.fc-ta{width:100%;padding:8px 10px;font:inherit;color:var(--fc-text);background:var(--fc-input);border:1.5px solid var(--fc-border);border-radius:10px;outline:none;resize:vertical;min-height:34px;line-height:1.5}
.fc-ta:focus,.fc-input:focus{border-color:var(--fc-primary);box-shadow:0 0 0 3px var(--fc-glow)}
.fc-ta::placeholder,.fc-input::placeholder{color:var(--fc-text-subtle)}
.fc-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fc-text-muted)}
.fc-muted{color:var(--fc-text-muted)}
.fc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fc-chip{display:inline-block;font-size:10px;font-weight:600;padding:1px 8px;border-radius:9999px;white-space:nowrap;background:var(--fc-surf-sub);color:var(--fc-text-muted);border:1px solid var(--fc-border-sub)}
.fc-chip.due{background:var(--fc-tint);color:var(--fc-primary);border-color:transparent}
.fc-chip.learn{color:var(--fc-primary);border-color:var(--fc-primary);background:transparent}
.fc-prog{margin:0 0 12px}
.fc-prog-head{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--fc-text-muted);margin-bottom:5px;font-variant-numeric:tabular-nums}
.fc-prog-track{height:4px;border-radius:999px;background:var(--fc-border-sub);overflow:hidden}
.fc-prog-fill{height:100%;width:0;border-radius:999px;background:var(--fc-primary);transition:width .4s ease-out}
.fc-hero{max-width:560px;margin:8vh auto 0;text-align:center}
.fc-hero h1{font-size:24px;font-weight:700;margin:0 0 8px;color:var(--fc-primary)}
.fc-hero p{color:var(--fc-text-muted);margin:0 0 16px}
.fc-stage{max-width:640px;margin:0 auto}
.fc-card{border-radius:16px;background:var(--fc-surf);border:1px solid var(--fc-border);box-shadow:var(--fc-shadow);padding:20px 22px;min-height:200px;display:flex;flex-direction:column;gap:10px}
.fc-deckname{font-size:11px;color:var(--fc-text-subtle)}
.fc-face{line-height:1.65;font-size:14.5px}
.fc-face h1,.fc-face h2,.fc-face h3,.fc-face h4{margin:.7em 0 .35em;line-height:1.3}
.fc-face h1{font-size:1.3em}.fc-face h2{font-size:1.18em}.fc-face h3{font-size:1.06em}
.fc-face p{margin:.4em 0}
.fc-face pre{background:var(--fc-surf-sub);padding:10px 12px;border-radius:10px;overflow:auto}
.fc-face code{background:var(--fc-surf-sub);padding:1px 5px;border-radius:5px;font-family:ui-monospace,Menlo,monospace}
.fc-face pre code{background:transparent;padding:0}
.fc-face blockquote{margin:.5em 0;padding:2px 12px;border-left:3px solid var(--fc-primary);color:var(--fc-text-sec)}
.fc-face a{color:var(--fc-primary)}
.fc-divider{border-top:1px dashed var(--fc-border);margin:6px 0}
.fc-rate{display:flex;gap:8px;margin-top:auto}
.fc-rate .fc-btn{flex:1;display:flex;flex-direction:column;gap:2px;align-items:center;padding:9px 6px}
.fc-rate .iv{font-size:10px;color:var(--fc-text-subtle);font-weight:400}
.fc-rate .fc-btn.primary .iv{color:var(--fc-on-fill);opacity:.75}
.fc-kbd{margin-top:10px;text-align:center;font-size:11px;color:var(--fc-text-subtle)}
.fc-flip{margin-top:auto;text-align:center}
.fc-deckrow{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;border:1px solid var(--fc-border-sub);margin-top:8px;background:var(--fc-surf)}
.fc-deckrow .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fc-deckrow .ct{font-size:11px;color:var(--fc-text-muted);font-variant-numeric:tabular-nums}
.fc-cardbox{border:1px solid var(--fc-border-sub);border-radius:14px;background:var(--fc-surf);padding:12px;margin-top:10px}
.fc-cardbox .top{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.fc-cardbox .id{font-size:10.5px;color:var(--fc-text-subtle);font-variant-numeric:tabular-nums}
.fc-qa-label{font-size:10px;font-weight:700;color:var(--fc-text-muted);margin:6px 0 3px}
.fc-empty{padding:28px 12px;text-align:center;color:var(--fc-text-subtle);font-size:12.5px}
.fc-cele{text-align:center;padding:40px 16px}
.fc-cele .big{font-size:40px;margin-bottom:10px}
.fc-layer{position:fixed;inset:0;z-index:9999;pointer-events:none;color:var(--fc-text);font-size:13px;line-height:1.5}
`

// ── 展示辅助 ─────────────────────────────────────────────────────────────────
function fmtDelta(ms) {
  const v = Math.max(0, Number(ms) || 0)
  if (v < 90 * MIN) return `${Math.max(1, Math.round(v / MIN))} 分钟`
  if (v < 0.75 * DAY) return `${Math.round(v / 3600000)} 小时`
  return `${Math.max(1, Math.round(v / DAY))} 天`
}
function stateLabel(st, now) {
  if (!st) return { text: '新卡', cls: 'new' }
  if (st.state === 1) return { text: '学习中', cls: 'learn' }
  if (st.state === 3) return { text: '重学中', cls: 'learn' }
  const t = Date.parse(st.due || '')
  if (!Number.isFinite(t) || t <= now) return { text: '到期', cls: 'due' }
  return { text: `${fmtDelta(t - now)}后`, cls: 'ok' }
}
const RATE_KEYS = [[1, '重来'], [2, '困难'], [3, '记得'], [4, '简单']]

// ══ 复习台视图(跨卡组到期队列) ══════════════════════════════════════════════
function mountReview(el) {
  el.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = STYLE
  el.appendChild(style)
  const root = document.createElement('div')
  root.className = 'fc-root'
  root.tabIndex = 0
  el.appendChild(root)
  const offTheme = themeObserver(root)
  let scope = pendingReview ? { path: pendingReview.path, name: pendingReview.name || '' } : null
  pendingReview = null
  let phase = 'loading' // loading | guide | idle | session | done
  let items = []
  let pos = 0
  let flipped = false
  let meta = { decks: 0, freshSkipped: 0 }
  let rows = []
  let sessionReviewed = 0
  let unlogged = 0
  let alive = true

  async function rebuild(opts) {
    phase = 'loading'
    render(opts)
    let q = { items: [], decks: 0, freshSkipped: 0, rows: [] }
    try { q = await buildQueue(scope) } catch { /* 空态兜底 */ }
    if (!alive) return
    items = q.items; meta = q; rows = q.rows || []
    pos = 0; flipped = false
    phase = !q.decks && !scope ? 'guide' : items.length ? 'session' : sessionReviewed > 0 ? 'done' : 'idle'
    render(opts)
  }

  /** 焦点归属:只有视图本来就持有焦点(键盘流,重绘会把焦点炸掉须还回)才有资格抢。 */
  function ownsFocus() {
    try {
      const ae = document.activeElement
      return !!ae && (ae === root || (root.contains && root.contains(ae)))
    } catch { return false }
  }

  function flushActivity() {
    if (unlogged > 0) {
      if (ctx.activity && ctx.activity.log) ctx.activity.log('review', { count: unlogged, scope: scope ? scope.path : '' })
      unlogged = 0
    }
  }

  let rateBusy = false // 落盘窗口内挡住按键连发/双击:否则同卡计两次、下一张被静默跳过
  async function rate(g) {
    if (rateBusy) return
    rateBusy = true
    try {
      const it = items[pos]
      if (!it) return
      const now = Date.now()
      const st = schedule(it.prev, g, now)
      try {
        const t = await ctx.app.readFile(it.path)
        if (t == null) throw new Error('卡组文件不见了(已移动或删除)')
        const deck = parseDeck(t)
        if (deck.fsrsBroken) throw new Error('这组 frontmatter 的 fsrs 行已损坏,为保护复习进度跳过写入(修复后再复习)')
        deck.fsrs[it.id] = st
        await ctx.app.writeFile(it.path, serializeDeck(deck))
        refreshDeckRow(it.path, deck).catch(() => { /* 索引下次自愈 */ })
      } catch (e) {
        say(`复习进度保存失败:${(e && e.message) || e}`, { level: 'error' })
      }
      const daily = readDaily()
      daily.reviewed += 1
      if (!it.prev) daily.introduced += 1
      writeDaily(daily)
      sessionReviewed += 1
      unlogged += 1
      if (ctx.achievements && ctx.achievements.track) ctx.achievements.track('review')
      updateStreak()
      if (Date.parse(st.due) - now < 20 * MIN) items.push({ ...it, prev: st, dueTs: Date.parse(st.due) }) // 学习步:本节内重现
      pos += 1
      flipped = false
      if (pos >= items.length) { phase = 'done'; flushActivity() }
      render()
    } finally { rateBusy = false }
  }

  function render(opts) {
    // 在 innerHTML 重置(会把焦点炸到 body)之前判定归属:分屏下编辑器自动保存触发的
    // 重绘绝不许每 600ms 抢走用户输入焦点 —— 只有显式要求(挂载/复习本组)或本来就持有才聚焦。
    const wantFocus = !!(opts && opts.focus) || ownsFocus()
    root.innerHTML = `
<div class="fc-hdr">
  <span style="font-weight:600">记忆闪卡</span>
  <span class="fc-chip due" data-scope style="display:none;cursor:pointer"></span>
  <span style="flex:1"></span>
  <span class="fc-muted" data-count style="font-size:11px;font-variant-numeric:tabular-nums"></span>
  <button class="fc-btn ghost sm" data-refresh title="重新收集到期卡片">刷新</button>
</div>
<div class="fc-body">
  <div data-gen></div>
  <div class="fc-prog" data-prog style="display:none">
    <div class="fc-prog-head"><span data-progtext></span><span data-progpct></span></div>
    <div class="fc-prog-track"><div class="fc-prog-fill" data-progfill></div></div>
  </div>
  <div data-main></div>
</div>`
    const scopeEl = root.querySelector('[data-scope]')
    if (scope) {
      scopeEl.style.display = ''
      scopeEl.textContent = `只看:${scope.name || basename(scope.path)} ✕`
      scopeEl.addEventListener('click', () => { scope = null; rebuild({ focus: true }) })
    }
    const cnt = root.querySelector('[data-count]')
    cnt.textContent = phase === 'loading' ? '' : `${meta.decks} 个卡组`
    root.querySelector('[data-refresh]').addEventListener('click', () => rebuild({ focus: true }))
    renderGen()
    renderProgress()
    const main = root.querySelector('[data-main]')
    if (phase === 'loading') {
      const d = document.createElement('div')
      d.className = 'fc-empty'
      d.textContent = '正在收集到期卡片…'
      main.appendChild(d)
    } else if (phase === 'guide') renderGuide(main)
    else if (phase === 'idle') renderIdle(main)
    else if (phase === 'done') renderDone(main)
    else renderCard(main)
    if (wantFocus) { try { root.focus({ preventScroll: true }) } catch { /* ignore */ } }
  }

  function renderProgress() {
    const box = root.querySelector('[data-prog]')
    if (phase !== 'session' && phase !== 'done') { box.style.display = 'none'; return }
    const daily = readDaily()
    const remain = Math.max(0, items.length - pos)
    const total = daily.reviewed + remain
    const pct = total ? Math.round((daily.reviewed / total) * 100) : 100
    box.style.display = ''
    root.querySelector('[data-progtext]').textContent = `今日进度 · 已复习 ${daily.reviewed} 张` + (remain ? ` · 剩余 ${remain} 张` : '')
    root.querySelector('[data-progpct]').textContent = `${pct}%`
    root.querySelector('[data-progfill]').style.width = `${pct}%`
  }

  function renderGen() {
    const box = root.querySelector('[data-gen]')
    if (!box) return
    box.innerHTML = ''
    if (!gen.active && !gen.error) return
    const p = document.createElement('div')
    p.className = 'fc-panel'
    p.style.cssText = 'padding:10px 12px;margin-bottom:12px'
    if (gen.active) {
      const head = document.createElement('div')
      head.className = 'fc-row'
      head.style.justifyContent = 'space-between'
      const lab = document.createElement('span')
      lab.className = 'fc-muted'
      lab.style.fontSize = '11.5px'
      lab.textContent = `AI 建卡:${gen.label || '进行中'} · ${Math.round(gen.pct)}%`
      const cancel = document.createElement('button')
      cancel.className = 'fc-btn ghost sm'
      cancel.textContent = '取消'
      cancel.addEventListener('click', () => { if (gen.controller) gen.controller.abort() })
      head.appendChild(lab); head.appendChild(cancel)
      const tr = document.createElement('div')
      tr.className = 'fc-prog-track'
      tr.style.marginTop = '7px'
      const fdiv = document.createElement('div')
      fdiv.className = 'fc-prog-fill'
      fdiv.style.width = `${Math.min(100, gen.pct)}%`
      tr.appendChild(fdiv)
      p.appendChild(head); p.appendChild(tr)
    } else {
      const row = document.createElement('div')
      row.className = 'fc-row'
      row.style.justifyContent = 'space-between'
      const er = document.createElement('span')
      er.style.cssText = 'font-size:11.5px;color:var(--fc-danger)'
      er.textContent = `AI 建卡失败:${gen.error}`
      const x = document.createElement('button')
      x.className = 'fc-btn ghost sm'
      x.textContent = '知道了'
      x.addEventListener('click', () => { gen.error = ''; renderGen() })
      row.appendChild(er); row.appendChild(x)
      p.appendChild(row)
    }
    box.appendChild(p)
  }

  function renderGuide(main) {
    const hero = document.createElement('div')
    hero.className = 'fc-hero'
    hero.innerHTML = `
<h1>记忆闪卡</h1>
<p>把知识拆成卡片,用 FSRS 间隔重复对抗遗忘。卡组是笔记库里的 .deck.md 文件,复习进度也存在文件里。</p>
<div class="fc-row" style="justify-content:center" data-acts></div>
<p class="fc-muted" data-hint style="font-size:11px;margin-top:14px"></p>`
    const acts = hero.querySelector('[data-acts]')
    const hint = hero.querySelector('[data-hint]')
    if (ftReady) {
      const gen1 = document.createElement('button')
      gen1.className = 'fc-btn primary'
      gen1.textContent = '从当前笔记生成卡组'
      gen1.addEventListener('click', () => { generateFromNote() })
      const mk = document.createElement('button')
      mk.className = 'fc-btn'
      mk.textContent = '新建卡组'
      mk.addEventListener('click', () => { createDeckInteractive(null) })
      acts.appendChild(gen1); acts.appendChild(mk)
      hint.textContent = '也可以在文件树右键「新建卡组」,或在聊天里让 Tangu 直接写一份 .deck.md(随包 flashcard-format 技能已教会它格式;聊天里建的卡组在文件树里打开一次即进入复习队列)。'
    } else {
      hint.textContent = '当前宿主版本较旧,不支持 .deck.md 一等文件类型:复习台可用,新建 / AI 建卡入口已隐藏。升级 Forsion 桌面端后解锁。'
    }
    main.appendChild(hero)
  }

  function renderIdle(main) {
    const wrap = document.createElement('div')
    wrap.className = 'fc-stage'
    const p = document.createElement('div')
    p.className = 'fc-panel'
    p.style.padding = '16px'
    const daily = readDaily()
    const h = document.createElement('div')
    h.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:4px'
    h.textContent = scope ? '这组暂无到期卡片' : '暂无到期卡片'
    const sub = document.createElement('div')
    sub.className = 'fc-muted'
    sub.style.fontSize = '12px'
    sub.textContent = `今天已复习 ${daily.reviewed} 张` + (meta.freshSkipped ? ` · 还有 ${meta.freshSkipped} 张新卡因每日上限(${dailyLimit()})暂缓,明天见` : '')
    p.appendChild(h); p.appendChild(sub)
    wrap.appendChild(p)
    const cap = document.createElement('div')
    cap.className = 'fc-label'
    cap.style.margin = '16px 2px 2px'
    cap.textContent = '卡组'
    wrap.appendChild(cap)
    for (const r of rows) {
      const row = document.createElement('div')
      row.className = 'fc-deckrow'
      const nm = document.createElement('span')
      nm.className = 'nm'
      nm.textContent = r.name
      const ct = document.createElement('span')
      ct.className = 'ct'
      ct.textContent = `${r.cards} 张 · ${r.due} 到期`
      const open = document.createElement('button')
      open.className = 'fc-btn ghost sm'
      open.textContent = '打开'
      open.addEventListener('click', () => { if (ctx.app.openFile) ctx.app.openFile(r.path) })
      const rv = document.createElement('button')
      rv.className = 'fc-btn sm'
      rv.textContent = '复习'
      rv.addEventListener('click', () => { scope = { path: r.path, name: r.name }; rebuild({ focus: true }) })
      row.appendChild(nm); row.appendChild(ct)
      if (ftReady) row.appendChild(open)
      row.appendChild(rv)
      wrap.appendChild(row)
    }
    if (ftReady) {
      const acts = document.createElement('div')
      acts.className = 'fc-row'
      acts.style.marginTop = '14px'
      const gen1 = document.createElement('button')
      gen1.className = 'fc-btn'
      gen1.textContent = '从当前笔记生成卡组'
      gen1.addEventListener('click', () => { generateFromNote() })
      const mk = document.createElement('button')
      mk.className = 'fc-btn ghost'
      mk.textContent = '新建卡组'
      mk.addEventListener('click', () => { createDeckInteractive(null) })
      acts.appendChild(gen1); acts.appendChild(mk)
      wrap.appendChild(acts)
    }
    main.appendChild(wrap)
  }

  function renderDone(main) {
    const box = document.createElement('div')
    box.className = 'fc-cele'
    const streak = lsJSON('streak', {})
    const daily = readDaily()
    box.innerHTML = `
<div class="big">🎉</div>
<div style="font-size:17px;font-weight:600">今日复习完成!</div>
<div class="fc-muted" data-sum style="margin-top:6px;font-size:12.5px"></div>
<div class="fc-row" style="justify-content:center;margin-top:16px" data-acts></div>`
    const parts = [`本次复习 ${sessionReviewed} 张`, `今天累计 ${daily.reviewed} 张`]
    if (num(streak.len, 0) > 1) parts.push(`连续 ${streak.len} 天`)
    box.querySelector('[data-sum]').textContent = parts.join(' · ')
    const again = document.createElement('button')
    again.className = 'fc-btn ghost'
    again.textContent = '再查一遍到期卡片'
    again.addEventListener('click', () => { sessionReviewed = 0; rebuild({ focus: true }) })
    box.querySelector('[data-acts]').appendChild(again)
    main.appendChild(box)
  }

  function renderCard(main) {
    const it = items[pos]
    const wrap = document.createElement('div')
    wrap.className = 'fc-stage'
    const card = document.createElement('div')
    card.className = 'fc-card'
    const dn = document.createElement('div')
    dn.className = 'fc-deckname'
    dn.textContent = `${it.deckName} · ${it.prev ? '复习' : '新卡'} · 第 ${pos + 1} / ${items.length} 张`
    card.appendChild(dn)
    const qEl = document.createElement('div')
    qEl.className = 'fc-face'
    renderMarkdown(qEl, it.q || '(空问题)')
    card.appendChild(qEl)
    const kbd = document.createElement('div')
    kbd.className = 'fc-kbd'
    if (!flipped) {
      const flipBox = document.createElement('div')
      flipBox.className = 'fc-flip'
      const b = document.createElement('button')
      b.className = 'fc-btn primary'
      b.style.minWidth = '160px'
      b.textContent = '显示答案'
      b.addEventListener('click', () => { flipped = true; render() })
      flipBox.appendChild(b)
      card.appendChild(flipBox)
      kbd.textContent = '空格 / 回车 翻面'
    } else {
      const dv = document.createElement('div')
      dv.className = 'fc-divider'
      card.appendChild(dv)
      const aEl = document.createElement('div')
      aEl.className = 'fc-face'
      renderMarkdown(aEl, it.a || '(空答案)')
      card.appendChild(aEl)
      const rateRow = document.createElement('div')
      rateRow.className = 'fc-rate'
      const now = Date.now()
      for (const [g, label] of RATE_KEYS) {
        const b = document.createElement('button')
        b.className = 'fc-btn' + (g === 3 ? ' primary' : '')
        const t1 = document.createElement('span')
        t1.textContent = `${label} ${g}`
        const iv = document.createElement('span')
        iv.className = 'iv'
        iv.textContent = fmtDelta(Date.parse(schedule(it.prev, g, now).due) - now)
        b.appendChild(t1); b.appendChild(iv)
        b.addEventListener('click', () => { rate(g) })
        rateRow.appendChild(b)
      }
      card.appendChild(rateRow)
      kbd.textContent = '按 1-4 评分:1 重来 · 2 困难 · 3 记得 · 4 简单'
    }
    wrap.appendChild(card)
    wrap.appendChild(kbd)
    main.appendChild(wrap)
  }

  const onKey = (e) => {
    if (phase !== 'session') return
    if (e.key === ' ' || e.key === 'Enter') {
      if (!flipped) { e.preventDefault(); flipped = true; render() }
      return
    }
    if (flipped && e.key >= '1' && e.key <= '4') { e.preventDefault(); rate(parseInt(e.key, 10)) }
  }
  root.addEventListener('keydown', onKey)

  let deckTimer = null // 'decks' 合并窗:分屏下编辑器每 600ms 自动保存,不许每次都全量重扫+抢焦点
  const offBus = bus.on((e) => {
    if (!alive) return
    if (e.type === 'gen') { renderGen(); return }
    if (e.type === 'review-open') {
      pendingReview = null // 已挂载路径同样消费掉,否则关掉再开会被旧范围污染
      scope = { path: e.path, name: e.name || '' }
      sessionReviewed = 0
      rebuild({ focus: true })
      return
    }
    if (e.type === 'decks' && (phase === 'guide' || phase === 'idle')) {
      if (deckTimer) clearTimeout(deckTimer)
      deckTimer = setTimeout(() => {
        deckTimer = null
        if (alive && (phase === 'guide' || phase === 'idle')) rebuild()
      }, 800)
    }
  })

  rebuild({ focus: true })
  return () => { alive = false; if (deckTimer) clearTimeout(deckTimer); flushActivity(); offBus(); offTheme() }
}

// ══ 卡组编辑视图(registerFileType 的 mount) ═══════════════════════════════════
function mountDeck(el, filePath) {
  el.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = STYLE
  el.appendChild(style)
  const root = document.createElement('div')
  root.className = 'fc-root'
  el.appendChild(root)
  const offTheme = themeObserver(root)
  let deck = null
  let saveTimer = null
  let dirty = false
  let alive = true

  function scheduleSave() {
    dirty = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; flush() }, 600)
  }
  /**
   * 写盘前先读盘合并:编辑器只拥有卡组名与卡片内容,fsrs 调度状态(以及 preamble /
   * 未知 frontmatter 键)归复习链路 —— 一律以盘上最新为准。否则分屏/多窗口下,
   * 编辑器挂载时的陈旧 fsrs 快照会把复习台刚写进去的进度整体回滚。
   */
  async function flush() {
    if (!dirty || !deck) return
    dirty = false
    try {
      const t = await ctx.app.readFile(filePath)
      if (t != null) {
        const disk = parseDeck(t)
        deck.fsrs = disk.fsrs
        deck.preamble = disk.preamble
        deck.fmExtra = disk.fmExtra
        deck.fsrsBroken = disk.fsrsBroken
        deck.fsrsRaw = disk.fsrsRaw
      }
      await ctx.app.writeFile(filePath, serializeDeck(deck))
      await refreshDeckRow(filePath, deck)
      bus.emit({ type: 'decks' })
      if (alive) updateStats()
    } catch (e) {
      dirty = true
      say(`保存失败:${(e && e.message) || e}`, { level: 'error' })
    }
  }
  function updateStats() {
    const s = root.querySelector('[data-stats]')
    if (!s || !deck) return
    const now = Date.now()
    let due = 0
    let fresh = 0
    for (const c of deck.cards) {
      const st = deck.fsrs[c.id]
      if (!st) fresh++
      else { const t = Date.parse(st.due || ''); if (Number.isFinite(t) && t <= now) due++ }
    }
    s.textContent = `${deck.cards.length} 张卡 · ${due} 张到期 · ${fresh} 张新卡` + (deck.fsrsBroken ? ' · fsrs 行损坏(已原样保留,复习暂停)' : '')
  }

  function render() {
    root.innerHTML = `
<div class="fc-hdr">
  <input class="fc-input" data-name style="max-width:260px;font-weight:600" placeholder="卡组名" />
  <span class="fc-muted" data-stats style="font-size:11.5px;font-variant-numeric:tabular-nums"></span>
  <span style="flex:1"></span>
  <button class="fc-btn" data-add>加卡</button>
  <button class="fc-btn primary" data-review>复习本组</button>
</div>
<div class="fc-body"><div data-list style="max-width:760px;margin:0 auto"></div></div>`
    const nameEl = root.querySelector('[data-name]')
    nameEl.value = deck.name
    nameEl.addEventListener('input', () => { deck.name = nameEl.value; scheduleSave() })
    root.querySelector('[data-add]').addEventListener('click', addCard)
    root.querySelector('[data-review]').addEventListener('click', async () => {
      await flush()
      pendingReview = { path: filePath, name: deck.name }
      bus.emit({ type: 'review-open', path: filePath, name: deck.name })
      if (ctx.openView) ctx.openView('review')
    })
    renderList()
    updateStats()
  }

  function renderList() {
    const list = root.querySelector('[data-list]')
    if (!list) return
    list.innerHTML = ''
    if (!deck.cards.length) {
      const d = document.createElement('div')
      d.className = 'fc-empty'
      d.textContent = '这组还没有卡片。点右上角「加卡」写第一张;或打开一篇笔记,用命令「记忆闪卡:从当前笔记生成卡组」交给 AI。'
      list.appendChild(d)
      return
    }
    const now = Date.now()
    for (const c of deck.cards) list.appendChild(cardBox(c, now))
  }

  function cardBox(c, now) {
    const box = document.createElement('div')
    box.className = 'fc-cardbox'
    const top = document.createElement('div')
    top.className = 'top'
    const id = document.createElement('span')
    id.className = 'id'
    id.textContent = `#${c.id}`
    const st = stateLabel(deck.fsrs[c.id], now)
    const chip = document.createElement('span')
    chip.className = `fc-chip ${st.cls}`
    chip.textContent = st.text
    const sp = document.createElement('span')
    sp.style.flex = '1'
    const del = document.createElement('button')
    del.className = 'fc-btn ghost sm danger'
    del.textContent = '删除'
    del.addEventListener('click', () => {
      deck.cards = deck.cards.filter((x) => x.id !== c.id)
      renderList(); updateStats(); scheduleSave()
    })
    top.appendChild(id); top.appendChild(chip); top.appendChild(sp); top.appendChild(del)
    box.appendChild(top)
    const mk = (label, key, ph) => {
      const lab = document.createElement('div')
      lab.className = 'fc-qa-label'
      lab.textContent = label
      const ta = document.createElement('textarea')
      ta.className = 'fc-ta'
      ta.value = c[key]
      ta.placeholder = ph
      ta.rows = Math.min(10, Math.max(2, String(c[key] || '').split('\n').length))
      ta.addEventListener('input', () => { c[key] = ta.value; scheduleSave() })
      box.appendChild(lab); box.appendChild(ta)
    }
    mk('问题 Q', 'q', '支持多行 markdown')
    mk('答案 A', 'a', '答案尽量短')
    return box
  }

  function addCard() {
    deck.cards.push({ id: nextCardId(deck), q: '', a: '' })
    renderList(); updateStats(); scheduleSave()
    const list = root.querySelector('[data-list]')
    const tas = list ? list.querySelectorAll('textarea') : []
    const ta = tas.length >= 2 ? tas[tas.length - 2] : null
    if (ta) { ta.focus(); if (ta.scrollIntoView) ta.scrollIntoView({ block: 'center' }) }
  }

  async function load() {
    let t = null
    try { t = await ctx.app.readFile(filePath) } catch { t = null }
    if (!alive) return
    if (t == null) {
      root.innerHTML = ''
      const d = document.createElement('div')
      d.className = 'fc-empty'
      d.textContent = '读不到这个卡组文件(可能已被移动或删除)。'
      root.appendChild(d)
      return
    }
    const parsed = parseDeck(t)
    // 毁档防线:内容非空、又没有 frontmatter、也没解析出任何卡 —— 这不是卡组文件
    // (多半是改错后缀的普通笔记)。进只读警示态,绝不允许用空 deck 把它覆盖掉。
    if (t.trim() !== '' && !parsed.hadFm && parsed.cards.length === 0) {
      root.innerHTML = ''
      const d = document.createElement('div')
      d.className = 'fc-empty'
      d.textContent = '这个文件不符合 .deck.md 卡组格式(没有 frontmatter,也没有 <!-- card:cN --> 标记)。为避免误覆盖内容,已停用编辑与自动保存;请手动补格式或改回普通 .md 后缀。'
      root.appendChild(d)
      return
    }
    deck = parsed
    if (!deck.name) deck.name = basename(filePath)
    render()
    refreshDeckRow(filePath, deck).catch(() => { /* 索引下次自愈 */ })
  }

  load()
  return () => {
    alive = false
    if (saveTimer) clearTimeout(saveTimer)
    if (dirty && deck) flush().catch(() => { /* 尽力落盘(flush 内部已合并盘上 fsrs) */ })
    offTheme()
  }
}

// ── 新建卡组(文件树右键 / 复习台按钮共用) ───────────────────────────────────
/**
 * folder 语义(与宿主 fileCreator 契约对齐,types.ts 钉死 '' = 库根):
 *   string('' 含):宿主指定归属,原样落在那个文件夹(库根就是库根,不许劫持进工作文件夹);
 *   null:插件自发起(复习台按钮),无归属 → 落工作文件夹。
 * 全程不抛:取消 = 静默返回,失败 = 错误 toast(否则视图内按钮调用是 unhandled rejection,用户零反馈)。
 */
async function createDeckInteractive(folder) {
  try {
    const where = folder == null ? null : String(folder)
    const title = where == null ? '新建卡组' : where === '' ? '在库根目录新建卡组' : `在「${where.split('/').pop()}」中新建卡组`
    const name = await askName(title, '')
    if (!name) return
    const deck = { name, fsrs: {}, cards: [] }
    const path = await uniqueDeckPath(name, where)
    await ctx.app.writeFile(path, serializeDeck(deck))
    await refreshDeckRow(path, deck)
    bus.emit({ type: 'decks' })
    if (ctx.app.openFile) ctx.app.openFile(path)
  } catch (e) {
    say(`新建卡组失败:${(e && e.message) || e}`, { level: 'error' })
  }
}

// ── 注册(能力探测阶梯:老宿主优雅降级,setup 绝不抛错) ──────────────────────
const CAN_VIEW = typeof ctx.registerView === 'function'
const CAN_FT = typeof ctx.registerFileType === 'function'
let ftRefused = false
if (CAN_VIEW && CAN_FT) {
  ftRefused = ctx.registerFileType({
    id: 'deck',
    extensions: ['.deck.md'],
    icon: 'database',
    title: '卡组',
    mount: (el, f) => mountDeck(el, f.filePath),
  }) === false
}
if (!CAN_VIEW) {
  say('记忆闪卡需要更新版本的 Forsion 桌面端(缺少工作台视图 API),本次未注册任何界面', { level: 'warning' })
} else if (ftRefused) {
  say('「.deck.md」后缀已被内置文件类型接管,记忆闪卡整体退让,未注册任何入口(请检查插件更新)', { level: 'warning' })
} else {
  ftReady = CAN_FT
  ctx.registerView({ id: 'review', title: '记忆闪卡', mount: mountReview, singleton: true })
  if (ctx.registerCommand) ctx.registerCommand({ id: 'flashcards-open', title: '记忆闪卡:打开复习台', keywords: 'flashcards 闪卡 复习 记忆 卡片 间隔重复 fsrs anki review deck', run: () => { if (ctx.openView) ctx.openView('review') } })
  if (ctx.registerSetting) ctx.registerSetting({ key: 'dailyLimit', label: '每日新卡上限', type: 'number', default: 50, min: 0, max: 999, description: '每天最多引入多少张新卡进入复习队列(到期复习不受限)' })
  if (ctx.achievements && ctx.achievements.registerSeries) {
    ctx.achievements.registerSeries({
      id: 'review',
      title: '记忆闪卡',
      achievements: [
        { id: 'first-review', title: '初试记忆', desc: '完成第一次卡片复习', event: 'review', goal: 1, points: 5 },
        { id: 'review-100', title: '百炼成钢', desc: '累计复习 100 张卡片', event: 'review', goal: 100, points: 20 },
        { id: 'streak-7', title: '七日之约', desc: '连续 7 天完成复习', event: 'streak', goal: 7, points: 30 },
      ],
    })
  }
  if (ftReady) {
    if (ctx.registerCommand) ctx.registerCommand({ id: 'flashcards-from-note', title: '记忆闪卡:从当前笔记生成卡组', keywords: 'flashcards 闪卡 生成 建卡 AI deck 笔记', run: () => { generateFromNote() } })
    if (ctx.registerFileCreator) ctx.registerFileCreator({ id: 'deck-new', label: '新建卡组', icon: 'database', run: (parentFolder) => createDeckInteractive(typeof parentFolder === 'string' ? parentFolder : null) })
  } else {
    say('当前宿主较旧,不支持 .deck.md 一等文件类型:复习台可用,新建 / AI 建卡入口已隐藏(升级桌面端解锁)', { level: 'info' })
  }
}

// ── 测试钩子(check.mjs 专用;宿主里 __FLASHCARDS_TEST__ 不存在,零开销) ───────
if (globalThis.__FLASHCARDS_TEST__) {
  Object.assign(globalThis.__FLASHCARDS_TEST__, {
    W, schedule, parseDeck, serializeDeck, splitQA, nextCardId, parseDeckFence,
    sanitizeFileName, basename, safeHref, uuid,
    readIndex, writeIndex, refreshDeckRow, uniqueDeckPath, buildQueue, folderRoot,
    dayKey, dayDiff, readDaily, writeDaily, dailyLimit, updateStreak,
    inline, renderMarkdown, fmtDelta, stateLabel,
    onColorOf, readableOn, contrast, GEN_PROMPT, stageOf, gen,
    clipNote, escapeCardLine, unescapeCardLine, generateFromNote, bus,
    peekPending: () => pendingReview,
  })
}

return () => {
  if (gen.controller) gen.controller.abort() // 未完成的建卡任务收干净
  if (_layer && _layer.remove) _layer.remove()
}
