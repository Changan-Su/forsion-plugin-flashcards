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
 * 双语(1.1.0):UI 文案全部走 MSG/t(),语言取 ctx.getLocale(),订 ctx.subscribeLocale 原地重绘
 *   (视图不重挂也要变);卡组名/问答正文/落盘路径/localStorage 键/默认工作文件夹一律不随语言变。
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

// ── 双语词表(2026-08-14 起 ctx.getLocale / ctx.subscribeLocale;两侧键集合必须完全相等) ──
// 只翻 UI 文案。用户数据(卡组名 / 问题 / 答案 / 笔记正文)、落盘路径、localStorage 键、
// 默认工作文件夹一律不随语言变 —— 切成英文不该像换了个数据目录。
const MSG = {
  zh: {
    appName: '记忆闪卡',
    deckFileType: '卡组',
    cancel: '取消',
    ok: '确定',
    dismiss: '知道了',
    refresh: '刷新',
    refreshTip: '重新收集到期卡片',
    open: '打开',
    review: '复习',
    delete: '删除',
    heroBlurb: '把知识拆成卡片,用 FSRS 间隔重复对抗遗忘。卡组是笔记库里的 .deck.md 文件,复习进度也存在文件里。',
    genFromNote: '从当前笔记生成卡组',
    newDeck: '新建卡组',
    guideHint: '也可以在文件树右键「新建卡组」,或在聊天里让 Tangu 直接写一份 .deck.md(随包 flashcard-format 技能已教会它格式;聊天里建的卡组在文件树里打开一次即进入复习队列)。',
    guideHintLegacy: '当前宿主版本较旧,不支持 .deck.md 一等文件类型:复习台可用,新建 / AI 建卡入口已隐藏。升级 Forsion 桌面端后解锁。',
    deckCount: '{n} 个卡组',
    scopeChip: '只看:{name} ✕',
    loading: '正在收集到期卡片…',
    progressToday: '今日进度 · 已复习 {n} 张',
    progressLeft: ' · 剩余 {n} 张',
    genRunning: 'AI 建卡:{label} · {pct}%',
    genFailed: 'AI 建卡失败:{err}',
    genBusy: '进行中',
    stageSubmit: '提交任务',
    stageQueued: '排队中',
    stageReading: '模型阅读笔记中',
    stageWriting: '生成卡片中',
    stageDone: '完成',
    idleNoneScoped: '这组暂无到期卡片',
    idleNone: '暂无到期卡片',
    idleToday: '今天已复习 {n} 张',
    idleHeld: ' · 还有 {n} 张新卡因每日上限({lim})暂缓,明天见',
    decksLabel: '卡组',
    deckRowCounts: '{cards} 张 · {due} 到期',
    doneTitle: '今日复习完成!',
    doneSession: '本次复习 {n} 张',
    doneToday: '今天累计 {n} 张',
    doneStreak: '连续 {n} 天',
    doneAgain: '再查一遍到期卡片',
    cardMeta: '{deck} · {kind} · 第 {i} / {n} 张',
    emptyQ: '(空问题)',
    emptyA: '(空答案)',
    showAnswer: '显示答案',
    kbdFlip: '空格 / 回车 翻面',
    kbdRate: '按 1-4 评分:1 重来 · 2 困难 · 3 记得 · 4 简单',
    rate1: '重来',
    rate2: '困难',
    rate3: '记得',
    rate4: '简单',
    stateNew: '新卡',
    stateLearning: '学习中',
    stateRelearning: '重学中',
    stateDue: '到期',
    stateIn: '{d}后',
    deltaMin: '{n} 分钟',
    deltaHour: '{n} 小时',
    deltaDay: '{n} 天',
    deckNamePh: '卡组名',
    addCard: '加卡',
    reviewThisDeck: '复习本组',
    editorStats: '{n} 张卡 · {due} 张到期 · {fresh} 张新卡',
    editorStatsBroken: ' · fsrs 行损坏(已原样保留,复习暂停)',
    editorEmpty: '这组还没有卡片。点右上角「加卡」写第一张;或打开一篇笔记,用命令「记忆闪卡:从当前笔记生成卡组」交给 AI。',
    qLabel: '问题 Q',
    aLabel: '答案 A',
    qPh: '支持多行 markdown',
    aPh: '答案尽量短',
    deckMissing: '读不到这个卡组文件(可能已被移动或删除)。',
    deckInvalid: '这个文件不符合 .deck.md 卡组格式(没有 frontmatter,也没有 <!-- card:cN --> 标记)。为避免误覆盖内容,已停用编辑与自动保存;请手动补格式或改回普通 .md 后缀。',
    saveFailed: '保存失败:{err}',
    deckGone: '卡组文件不见了(已移动或删除)',
    deckBrokenSkip: '这组 frontmatter 的 fsrs 行已损坏,为保护复习进度跳过写入(修复后再复习)',
    progressSaveFailed: '复习进度保存失败:{err}',
    newDeckAtRoot: '在库根目录新建卡组',
    newDeckInFolder: '在「{folder}」中新建卡组',
    newDeckFailed: '新建卡组失败:{err}',
    noActiveNote: '当前没有打开的笔记(或笔记为空),先打开一篇再生成',
    genBusyToast: '已有一个建卡任务在进行中',
    needLogin: '请先登录 Forsion',
    needEngine: '未连接到 Tangu 引擎',
    noteClipped: '笔记过长,AI 建卡只使用前 {n} 字(其余部分不参与出卡)',
    genCreated: '已生成卡组「{name}」({n} 张卡)',
    errNoFence: '模型没有返回有效的 ```deck 卡组块,请重试',
    errStart: '起 run 失败 HTTP {code}',
    errNoRunId: '引擎未返回 runId',
    errSubscribe: '订阅事件失败 HTTP {code}',
    errGeneric: '生成失败',
    errStream: '与引擎的连接中断,未收到完成事件(可重试)',
    cmdOpen: '记忆闪卡:打开复习台',
    cmdFromNote: '记忆闪卡:从当前笔记生成卡组',
    setDailyLimit: '每日新卡上限',
    setDailyLimitDesc: '每天最多引入多少张新卡进入复习队列(到期复习不受限)',
    setNudge: '启动时提醒到期复习',
    setNudgeDesc: '每天最多一次;关掉后只保留状态栏的数字',
    statusDue: '待复习 {n}',
    statusClear: '闪卡已清空',
    statusNoDeck: '闪卡',
    statusTip: '记忆闪卡 · 到期 {due} + 新卡 {fresh} · 点击打开复习台',
    nudgeMsg: '今天有 {n} 张卡到期,打开复习台清一清吧',
    deckActiveBlocked: '这个卡组正开在笔记编辑器里,已跳过这张卡(先关掉它再复习)',
    achFirstTitle: '初试记忆',
    achFirstDesc: '完成第一次卡片复习',
    ach100Title: '百炼成钢',
    ach100Desc: '累计复习 100 张卡片',
    achStreakTitle: '七日之约',
    achStreakDesc: '连续 7 天完成复习',
    warnNoView: '记忆闪卡需要更新版本的 Forsion 桌面端(缺少工作台视图 API),本次未注册任何界面',
    warnTaken: '「.deck.md」后缀已被内置文件类型接管,记忆闪卡整体退让,未注册任何入口(请检查插件更新)',
    warnNoFileType: '当前宿主较旧,不支持 .deck.md 一等文件类型:复习台可用,新建 / AI 建卡入口已隐藏(升级桌面端解锁)',
  },
  en: {
    appName: 'Flashcards',
    deckFileType: 'Deck',
    cancel: 'Cancel',
    ok: 'OK',
    dismiss: 'Dismiss',
    refresh: 'Refresh',
    refreshTip: 'Collect due cards again',
    open: 'Open',
    review: 'Review',
    delete: 'Delete',
    heroBlurb: 'Break what you learn into cards and beat forgetting with FSRS spaced repetition. A deck is a .deck.md file in your vault, and review progress lives in that file too.',
    genFromNote: 'Generate deck from note',
    newDeck: 'New deck',
    guideHint: 'You can also right-click in the file tree and pick "New deck", or ask Tangu in chat to write a .deck.md for you (the bundled flashcard-format skill taught it the format; open a chat-made deck once in the file tree and it joins the review queue).',
    guideHintLegacy: 'This host is too old for .deck.md as a first-class file type: the review board still works, but deck creation and AI generation are hidden. Update Forsion Desktop to unlock them.',
    deckCount: 'Decks: {n}',
    scopeChip: 'Only: {name} ✕',
    loading: 'Collecting due cards…',
    progressToday: 'Today · Reviewed: {n}',
    progressLeft: ' · Left: {n}',
    genRunning: 'AI cards · {label} · {pct}%',
    genFailed: 'AI cards failed: {err}',
    genBusy: 'working',
    stageSubmit: 'submitting',
    stageQueued: 'queued',
    stageReading: 'reading the note',
    stageWriting: 'writing cards',
    stageDone: 'done',
    idleNoneScoped: 'Nothing due in this deck',
    idleNone: 'Nothing due right now',
    idleToday: 'Reviewed today: {n}',
    idleHeld: ' · Held by the daily limit ({lim}) · New cards waiting: {n}',
    decksLabel: 'Decks',
    deckRowCounts: 'Cards: {cards} · Due: {due}',
    doneTitle: 'All caught up for today!',
    doneSession: 'This session: {n}',
    doneToday: 'Today: {n}',
    doneStreak: 'Streak: {n} days',
    doneAgain: 'Check for due cards again',
    cardMeta: '{deck} · {kind} · {i} / {n}',
    emptyQ: '(no question)',
    emptyA: '(no answer)',
    showAnswer: 'Show answer',
    kbdFlip: 'Space / Enter to flip',
    kbdRate: 'Rate with 1-4 · 1 Again · 2 Hard · 3 Good · 4 Easy',
    rate1: 'Again',
    rate2: 'Hard',
    rate3: 'Good',
    rate4: 'Easy',
    stateNew: 'New',
    stateLearning: 'Learning',
    stateRelearning: 'Relearning',
    stateDue: 'Due',
    stateIn: 'in {d}',
    deltaMin: '{n} min',
    deltaHour: '{n} h',
    deltaDay: '{n} d',
    deckNamePh: 'Deck name',
    addCard: 'Add card',
    reviewThisDeck: 'Review this deck',
    editorStats: 'Cards: {n} · Due: {due} · New: {fresh}',
    editorStatsBroken: ' · fsrs line is corrupted (kept verbatim, reviews paused)',
    editorEmpty: 'No cards in this deck yet. Hit "Add card" at the top right to write the first one, or open a note and run "Flashcards: Generate deck from note" to let the AI draft them.',
    qLabel: 'Question',
    aLabel: 'Answer',
    qPh: 'Multi-line markdown is fine',
    aPh: 'Keep the answer short',
    deckMissing: 'Cannot read this deck file. It may have been moved or deleted.',
    deckInvalid: 'This file is not in .deck.md deck format (no frontmatter, no <!-- card:cN --> markers). Editing and autosave are switched off so nothing gets overwritten. Add the format by hand, or rename it back to a plain .md file.',
    saveFailed: 'Save failed: {err}',
    deckGone: 'The deck file is gone (moved or deleted)',
    deckBrokenSkip: 'The fsrs line in this deck frontmatter is corrupted. The write was skipped to protect review progress. Fix the line, then review.',
    progressSaveFailed: 'Could not save review progress: {err}',
    newDeckAtRoot: 'New deck in the vault root',
    newDeckInFolder: 'New deck in "{folder}"',
    newDeckFailed: 'Could not create the deck: {err}',
    noActiveNote: 'No note is open (or it is empty). Open one first, then generate.',
    genBusyToast: 'A deck is already being generated',
    needLogin: 'Sign in to Forsion first',
    needEngine: 'Not connected to the Tangu engine',
    noteClipped: 'This note is long, so only the first {n} characters are used to make cards',
    genCreated: 'Deck "{name}" created · Cards: {n}',
    errNoFence: 'The model did not return a valid ```deck block. Try again.',
    errStart: 'Could not start the run (HTTP {code})',
    errNoRunId: 'The engine returned no runId',
    errSubscribe: 'Could not subscribe to run events (HTTP {code})',
    errGeneric: 'Generation failed',
    errStream: 'Lost the connection to the engine before it finished. You can retry.',
    cmdOpen: 'Flashcards: Open review board',
    cmdFromNote: 'Flashcards: Generate deck from note',
    setDailyLimit: 'Daily new-card limit',
    setDailyLimitDesc: 'How many new cards may enter the review queue each day (due reviews are never capped)',
    setNudge: 'Remind me when cards are due',
    setNudgeDesc: 'At most once a day; turn it off to keep only the status bar count',
    statusDue: 'Due {n}',
    statusClear: 'Flashcards clear',
    statusNoDeck: 'Flashcards',
    statusTip: 'Flashcards · {due} due + {fresh} new · click to open the review board',
    nudgeMsg: '{n} card(s) due today — open the review board',
    deckActiveBlocked: 'This deck is open in the note editor — card skipped. Close it, then review.',
    achFirstTitle: 'First rep',
    achFirstDesc: 'Review your first card',
    ach100Title: 'Hundred reps',
    ach100Desc: 'Review 100 cards in total',
    achStreakTitle: 'Seven in a row',
    achStreakDesc: 'Review on 7 consecutive days',
    warnNoView: 'Flashcards needs a newer Forsion Desktop (the workbench view API is missing), so no interface was registered',
    warnTaken: 'A built-in file type already owns ".deck.md", so Flashcards stood down and registered nothing (check for a plugin update)',
    warnNoFileType: 'This host is older and does not support .deck.md as a first-class file type: the review board works, but deck creation and AI generation are hidden (update the desktop app to unlock)',
  },
}
/** 当前语言(旧宿主缺席 → 中文 canonical);未知值一律当中文。 */
const L = () => { try { return ctx.getLocale && ctx.getLocale() === 'en' ? 'en' : 'zh' } catch { return 'zh' } }
/**
 * 取串:缺键回退中文,再缺回退键名;占位符一律 {name} 形式(英文语序与中文不同,禁模板串拼)。
 * 替换必须**单趟**:逐键 split/join 会让先替进去的用户数据被后面的轮次再扫一遍 ——
 * 卡组名叫 `{n}` 时 `已生成卡组「{n}」({n} 张卡)` 会被吃成 `已生成卡组「5」(5 张卡)`。
 * 没给值的占位符原样留着(不许替成 "undefined")。
 */
const t = (k, vars) => {
  const d = MSG[L()] || MSG.zh
  const s = d[k] != null ? d[k] : (MSG.zh[k] != null ? MSG.zh[k] : k)
  return vars ? s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m)) : s
}
/**
 * 落盘兜底卡组名 —— **数据契约,永不随界面语言变**。走 t() 的话,同一个「模型没给名字」
 * 在 en 下会落成 `Untitled deck.deck.md`、zh 下落成 `未命名卡组.deck.md`,切语言就像换了个数据目录
 * (README / CHANGELOG 承诺过卡组文件路径不随语言变)。与 folderRoot() 兜底 '记忆闪卡' 同口径取中文
 * canonical;故意不放进 MSG —— 它不是 UI 文案,是写进用户笔记库的文件名。
 */
const UNTITLED_DECK = '未命名卡组'

function sanitizeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || UNTITLED_DECK
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
/**
 * 引擎事件 → 进度(status/token 都是真事件;生成阶段按已产出字数往 92% 爬,只保证单调)。
 * 给的是**词表键**不是成品串:进度条会在语言切换后重绘,存成品串就成了半英半中。
 */
function stageOf(ev, content) {
  const p = ev.payload || {}
  if (ev.type === 'status') return p.state === 'queued' ? { pct: 10, key: 'stageQueued' } : p.state === 'running' ? { pct: 16, key: 'stageReading' } : null
  if (ev.type === 'token') return { pct: Math.min(92, 30 + content.length / 60), key: 'stageWriting' }
  return null
}
async function runAgent(cfg, sessionId, message, onTick, signal, onStage) {
  const stage = (pct, key) => { if (onStage) onStage(pct, key) }
  stage(6, 'stageSubmit')
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }
  const start = await fetch(`${cfg.backendUrl}/agent/runs`, {
    method: 'POST', headers: h, signal,
    body: JSON.stringify({ session_id: sessionId, model_id: cfg.modelId || undefined, app_id: APP_ID, message, attachments: [] }),
  })
  if (!start.ok) throw new Error((await start.text().catch(() => '')) || t('errStart', { code: start.status }))
  const { runId } = await start.json()
  if (!runId) throw new Error(t('errNoRunId'))
  const res = await fetch(`${cfg.backendUrl}/agent/runs/${encodeURIComponent(runId)}/events?fromSeq=0`, { headers: h, signal })
  if (!res.ok || !res.body) throw new Error(t('errSubscribe', { code: res.status }))
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
      if (st) stage(st.pct, st.key)
      if (ev.type === 'token') continue
      if (ev.type === 'done') { stage(100, 'stageDone'); return (ev.payload && ev.payload.content) || content }
      if (ev.type === 'error') throw new Error((ev.payload && ev.payload.error) || t('errGeneric'))
    }
  }
  throw new Error(t('errStream'))
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
/** 三态:`ok:true` = 读到了(空索引也算);`ok:false` = 读失败 / 坏 JSON。
 *  ⚠️ 折叠成「还没有索引」再无条件 writeIndex,等于把「读不出来」持久化成「这些卡组不存在」——
 *     其余卡组从复习队列与状态栏里消失,而 1.2.0 新增的 5 分钟轮询会**无人值守**地触发这条路。 */
async function readIndex() {
  let t = null
  try { t = await ctx.app.readFile(indexPath()) } catch { return { decks: [], ok: false } }
  // ⚠️ 已知残余:`.deck-index.json` 是**点文件**,`collectFiles` 明确跳过点开头
  //    (vaultManager.ts:81)→ 只读枚举面看不到它,「还没建过索引」与「这一刻读不出来」
  //    在当前宿主 API 下**分不开**。试过拿「本会话见过几行」当判据,但切库时索引本来就该是空的,
  //    那条启发式会把切库判成读失败、从此不再写索引 —— 比原病更坏,已回退。
  //    真正的下游损失由 buildQueue 那条闸兜住(卡组行只在**枚举面确认文件不在了**时才剔),
  //    索引本身被削一次的代价是「其余卡组要等下次打开才回到队列」,不丢文件、不丢进度。
  if (t == null) return { decks: [], ok: true }
  try {
    const j = JSON.parse(t)
    return j && Array.isArray(j.decks) ? { decks: j.decks, ok: true } : { decks: [], ok: false }
  } catch { return { decks: [], ok: false } } // 写了半截的坏 JSON:绝不当成「没有卡组」
}
const writeIndex = (idx) => (idx && idx.ok === false
  ? Promise.resolve() // 读失败态 / 这一轮有读不到的行 —— 一律不落盘
  : ctx.app.writeFile(indexPath(), JSON.stringify({ decks: (idx && idx.decks) || [] }, null, 2)))
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
    // 口径单源:到期/新卡的判据必须与 buildQueue 的入队判据逐字一致(deckCounts),否则
    // 索引记 1、队列收 0 —— 状态栏就会「说 3 张、点进去 0 张」(1.2.0 修)。
    const cnt = deckCounts(deck, now)
    rows.unshift({ path, name: deck.name || basename(path), cards: deck.cards.length, due: cnt.due, fresh: cnt.fresh, nextDue: cnt.nextDue, touched: now })
  }
  // 索引读失败时只更新内存与状态栏,**不落盘** —— 落盘就把「读不出来」变成「其余卡组不存在」。
  if (idx.ok) await writeIndex({ decks: rows })
  paintStatus(rows)
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
  // ⚠️ 占位判定**绝不能**用 readFile 的 null:宿主对「文件不存在」「fs 读失败(EACCES/EIO/
  //    云盘掉线)」「库根未就位」一律返回 null(真源 electron/amadeus/ipc.ts:981-988)。
  //    把读失败当空位 → 下一行 writeFile 整篇盖掉用户既有卡组 = 卡片与全部 FSRS 进度当场消失。
  //    所以改用两个**不受单次读失败影响**的存在性证据:宿主只读枚举面 + 我们自己的索引账本。
  let taken = {}
  try {
    const files = ctx.app.listFiles ? await ctx.app.listFiles() : null
    for (const f of files || []) taken[f] = true
  } catch { /* 枚举面缺席/抛错:退到索引账本 */ }
  try {
    for (const r of (await readIndex()).decks) if (r && r.path) taken[r.path] = true
  } catch { /* ignore */ }
  for (let n = 1; n < 100; n++) {
    const p = `${prefix}${base}${n > 1 ? ` ${n}` : ''}.deck.md`
    if (taken[p]) continue
    // 枚举面与账本都说这个路径空着,再用 readFile 复核一次:读到内容 = 确实被占(枚举有洞时的兜底)。
    // 反过来 readFile 给 null 已经不能单独作数了 —— 上面两条证据才是判据。
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
  // ⚠️ 「孤儿行」只能靠**存在性**判,不能靠 readFile 给不给内容:1.2.0 起 5 分钟轮询会**无人值守**
  //    地跑这条路,某个卡组正文这一刻读不到(云盘占位 / 权限 / 切库瞬间)就会被永久剔除并落盘 ——
  //    文件还在盘上,却从复习队列与状态栏里消失了。拿只读枚举面复核:`.deck.md` 非点文件,枚举得到。
  let listed = null
  try { if (ctx.app.listFiles) listed = new Set(await ctx.app.listFiles()) } catch { listed = null }
  let skipped = 0 // 这一轮有几行是「读不到但没被证明消失」——有就不许落盘(那份 rows 是残的)
  for (const row of idx.decks) {
    if (!row || !row.path) continue
    const t = await ctx.app.readFile(row.path)
    if (t == null) {
      // 枚举面明确说它不在了 → 真孤儿,剔除;否则(还在 / 判不了)一律**保留原行**
      if (listed && listed.size && !listed.has(row.path)) continue
      rows.push(row)
      skipped++
      continue
    }
    const deck = parseDeck(t)
    const name = deck.name || basename(row.path)
    const inScope = !scope || !scope.path || row.path === scope.path
    // fsrs 行损坏的卡组不进队列:此时 fsrs 是空对象,若照常入队,评分写盘会把全组当新卡
    // 重建调度 —— 修好 frontmatter 前只展示,不复习(毁档防线)。
    const usable = !deck.fsrsBroken
    for (const c of deck.cards) {
      const st = deck.fsrs[c.id]
      if (st) {
        const dts = Date.parse(st.due || '')
        if (Number.isFinite(dts) && dts <= now) {
          if (usable && inScope && c.q) due.push({ path: row.path, deckName: name, id: c.id, q: c.q, a: c.a, prev: st, dueTs: dts })
        }
      } else if (usable && inScope && c.q) {
        fresh.push({ path: row.path, deckName: name, id: c.id, q: c.q, a: c.a, prev: null, dueTs: Infinity })
      }
    }
    // 行计数走 deckCounts(与上面的入队判据同源;scope 只影响队列,不影响索引里的全库计数)
    const cnt = deckCounts(deck, now)
    rows.push({ path: row.path, name, cards: deck.cards.length, due: cnt.due, fresh: cnt.fresh, nextDue: cnt.nextDue, touched: row.touched || now })
  }
  // 索引读失败、或这一轮有读不到的卡组 → 只更新内存与状态栏,**不落盘**(落了就把「读不出来」写死)
  await writeIndex({ decks: rows, ok: idx.ok && skipped === 0 })
  paintStatus(rows)
  due.sort((x, y) => x.dueTs - y.dueTs)
  const allow = Math.max(0, dailyLimit() - readDaily().introduced)
  return { items: due.concat(fresh.slice(0, allow)), decks: rows.length, freshSkipped: Math.max(0, fresh.length - allow), rows }
}

// ── 状态栏「今日待复习」(1.2.0):计数纯函数 + 常驻项运行时 ────────────────────
// 计数必须便宜:平时只读 .deck-index.json 这一个小 JSON;全量扫盘(逐个 readFile 卡组正文)
// 只发生在①启动第一次(v1 老索引缺 fresh/nextDue → 强制自愈)②某张卡真的跨过到期时刻
// ③用户自己打开复习台。轮询自身封在 STATUS_POLL,且一律 setTimeout 自排程(禁 setInterval)。

/**
 * 单个卡组的计数 —— **口径真源**。判据逐字对齐 buildQueue 的入队条件:
 * 坏 fsrs 行的卡组一张都不算(它一张都进不了队列),空问题的卡不算(同上),
 * fsrs 里的孤儿键(卡已删)不算(只遍历 cards)。
 * nextDue = 未来最近的一个到期时刻;没有则 0(0 = 「没有下一个时刻」,不是「立刻过期」)。
 */
function deckCounts(deck, now) {
  const out = { due: 0, fresh: 0, nextDue: 0 }
  if (!deck || !Array.isArray(deck.cards) || deck.fsrsBroken) return out
  const fsrs = deck.fsrs || {}
  for (const c of deck.cards) {
    if (!c || !c.q) continue
    const st = fsrs[c.id]
    if (!st) { out.fresh += 1; continue }
    const dts = Date.parse(st.due || '')
    if (!Number.isFinite(dts)) continue
    if (dts <= now) out.due += 1
    else if (out.nextDue === 0 || dts < out.nextDue) out.nextDue = dts
  }
  return out
}
/**
 * 索引行 → 今日待复习总数。新卡受每日上限压(与 buildQueue 的 allow 同式),
 * 于是 n 恒等于复习台队列长度(check.mjs R1 把这条钉成不变式)。
 * 缺字段的 v1 老行按 0 计(不猜);负数 / 非数 / 空行一律钳到 0。
 */
function dueSummary(rows, daily, limit) {
  let due = 0
  let fresh = 0
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue
    due += Math.max(0, num(r.due, 0))
    fresh += Math.max(0, num(r.fresh, 0))
  }
  const allow = Math.max(0, num(limit, 0) - Math.max(0, num(daily && daily.introduced, 0)))
  fresh = Math.min(fresh, allow)
  return { due, fresh, n: due + fresh }
}
/** 索引是否需要一次全量重扫:v1 老行(缺 fresh/nextDue)→ 自愈一次;有卡真的到点了 → 重算。 */
function isIndexStale(rows, now) {
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue
    if (r.fresh == null || r.nextDue == null) return true
    const nd = num(r.nextDue, 0)
    if (nd > 0 && nd <= now) return true
  }
  return false
}
/** 提醒判据(纯):五条全过才提醒 —— 开着 / 真有到期卡 / 本会话没提过 / 今天没提过。 */
function shouldNudge(lastKey, todayKey, enabled, n, sessionDone) {
  if (!enabled || sessionDone) return false
  if (!(num(n, 0) > 0)) return false
  return String(lastKey == null ? '' : lastKey) !== String(todayKey)
}

const STATUS_POLL = 5 * MIN // 轮询下限:≥5 分钟,且只有 isIndexStale 才会真的扫盘
const nudgeOn = () => lsGet('nudge', 'true') !== 'false' // 关掉只关通知,状态栏数字照旧
let statusHandle = null
let statusPollTimer = null
let offStatusLocale = null
let statusDisposed = false
let nudgedSession = false
let statusLast = { n: 0, due: 0, fresh: 0, decks: 0 }

/** 索引行 → 状态栏。复习/建卡后调用方本来就握着 rows,零额外读盘。 */
function paintStatus(rows) {
  const list = Array.isArray(rows) ? rows : []
  const s = dueSummary(list, readDaily(), dailyLimit())
  statusLast = { n: s.n, due: s.due, fresh: s.fresh, decks: list.length }
  paintStatusText()
}
/**
 * 只读 statusLast + 词表 → handle.update():**原位**更新,永不重注册(重注册会让宿主的
 * 显示/排序设置错位)。三态都不藏起来 —— 状态项消失比数字不准更让人以为插件坏了;
 * 而「中性态」是必需的:readIndex 把读失败折叠成 {decks:[]},没有中性态就只能谎报「已清空」。
 * text/title 只由数字 + 词表串构成,绝不拼用户的卡组名(它渲染在宿主状态栏,不过我们的渲染器)。
 */
function paintStatusText() {
  if (!statusHandle) return
  const s = statusLast
  const text = s.decks === 0 ? t('statusNoDeck') : (s.n > 0 ? t('statusDue', { n: s.n }) : t('statusClear'))
  try { statusHandle.update({ text, title: t('statusTip', { due: s.due, fresh: s.fresh }) }) } catch { /* 宿主收走了这枚项 */ }
}
async function refreshStatus() {
  if (statusDisposed || !statusHandle) return
  try {
    const idx = await readIndex()
    if (statusDisposed) return
    if (isIndexStale(idx.decks, Date.now())) await buildQueue(null) // 内部会 paintStatus
    else paintStatus(idx.decks)
  } catch { /* 读不到就保持上次显示,不谎报 */ }
  if (statusDisposed) return
  await maybeNudge(statusLast.n)
  if (statusDisposed) return
  schedulePoll()
}
function schedulePoll() {
  if (statusDisposed || !statusHandle) return
  if (statusPollTimer) { clearTimeout(statusPollTimer); statusPollTimer = null }
  statusPollTimer = setTimeout(() => { statusPollTimer = null; refreshStatus().catch(() => { }) }, STATUS_POLL)
}
/**
 * 启动提醒:一天最多一次,记在插件自己的 JSON blob 里(按本地日期判)。
 * P0#1 读失败 ≠ 没提醒过 —— 本会话闭嘴,**且绝不写回**(写回会盖掉那份读不出来的 blob)。
 * P0#3 持久标记只在通知真的发出去之后才落;写失败最多让下次启动多提醒一次(可重来,不丢数据)。
 * 没有 loadData/saveData 的宿主 = 兑现不了「一天最多一次」→ 一次都不提醒(不许留下做不到的承诺)。
 */
async function maybeNudge(n) {
  if (nudgedSession || statusDisposed || !statusHandle) return
  if (typeof ctx.loadData !== 'function' || typeof ctx.saveData !== 'function') return
  let data
  try { data = await ctx.loadData() } catch { nudgedSession = true; return }
  if (statusDisposed || nudgedSession) return
  const today = dayKey(Date.now())
  if (!shouldNudge(data && data.lastNudgeDate, today, nudgeOn(), n, false)) return
  nudgedSession = true // 先占后发:挡住并发轮询重入
  say(t('nudgeMsg', { n }), { level: 'info' })
  try { await ctx.saveData(Object.assign({}, data || {}, { lastNudgeDate: today })) } catch { /* 下次启动重来 */ }
}

// ── 跨视图小总线 + 待办打开请求 ──────────────────────────────────────────────
const bus = (() => { const subs = new Set(); return { on: (f) => (subs.add(f), () => subs.delete(f)), emit: (e) => subs.forEach((f) => { try { f(e) } catch { /* ignore */ } }) } })()
let pendingReview = null // { path, name } — 编辑视图「复习本组」→ 复习台消费
let ftReady = false // 一等文件类型是否就位(旧宿主缺席 → 复习台照常,建卡入口隐藏)

// ── AI 建卡(模块级:切走视图任务照跑;复习台顶部显示进度,可取消) ────────────
const gen = { active: false, pct: 0, stage: '', error: '', controller: null }
function genSet(patch) { Object.assign(gen, patch); bus.emit({ type: 'gen' }) }
async function generateFromNote() {
  const note = ctx.app.getActivePageText ? String(ctx.app.getActivePageText() || '') : ''
  if (!note.trim()) { say(t('noActiveNote'), { level: 'warning' }); return }
  if (gen.active) { say(t('genBusyToast'), { level: 'warning' }); if (ctx.openView) ctx.openView('review'); return }
  const cfg = await getCfg()
  if (!cfg.backendUrl || !cfg.token) { say(cfg.backendUrl ? t('needLogin') : t('needEngine'), { level: 'error' }); return }
  if (ctx.openView) ctx.openView('review')
  const clip = clipNote(note)
  if (clip.truncated) say(t('noteClipped', { n: NOTE_CAP }), { level: 'warning' })
  const controller = new AbortController()
  genSet({ active: true, pct: 6, stage: 'stageSubmit', error: '', controller })
  try {
    const out = await runAgent(cfg, uuid(), GEN_PROMPT(clip.text), null, controller.signal, (pct, key) => genSet({ pct: Math.max(gen.pct, pct), stage: key }))
    const fence = parseDeckFence(out)
    if (!fence) throw new Error(t('errNoFence'))
    const deck = { name: fence.name || UNTITLED_DECK, fsrs: {}, cards: [] }
    for (const c of fence.cards) deck.cards.push({ id: nextCardId(deck), q: c.q, a: c.a })
    const path = await uniqueDeckPath(deck.name)
    await ctx.app.writeFile(path, serializeDeck(deck))
    await refreshDeckRow(path, deck)
    genSet({ active: false, pct: 100, stage: 'stageDone', controller: null })
    bus.emit({ type: 'decks' })
    say(t('genCreated', { name: deck.name, n: deck.cards.length }), { level: 'success' })
    if (ctx.app.openFile) ctx.app.openFile(path)
  } catch (e) {
    const aborted = controller.signal.aborted
    genSet({ active: false, pct: 0, stage: '', error: aborted ? '' : (e && e.message) || String(e), controller: null })
    if (!aborted) say(t('genFailed', { err: gen.error }), { level: 'error' })
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
    no.textContent = t('cancel')
    const ok = document.createElement('button')
    ok.textContent = t('ok')
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
  if (v < 90 * MIN) return t('deltaMin', { n: Math.max(1, Math.round(v / MIN)) })
  if (v < 0.75 * DAY) return t('deltaHour', { n: Math.round(v / 3600000) })
  return t('deltaDay', { n: Math.max(1, Math.round(v / DAY)) })
}
function stateLabel(st, now) {
  if (!st) return { text: t('stateNew'), cls: 'new' }
  if (st.state === 1) return { text: t('stateLearning'), cls: 'learn' }
  if (st.state === 3) return { text: t('stateRelearning'), cls: 'learn' }
  const dts = Date.parse(st.due || '')
  if (!Number.isFinite(dts) || dts <= now) return { text: t('stateDue'), cls: 'due' }
  return { text: t('stateIn', { d: fmtDelta(dts - now) }), cls: 'ok' }
}
/** 评分四档(Anki 词表:Again / Hard / Good / Easy);每次取,语言切换后跟着变。 */
const rateKeys = () => [[1, t('rate1')], [2, t('rate2')], [3, t('rate3')], [4, t('rate4')]]

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
      // 活动页写保护:降级宿主(没有 registerFileType)下 .deck.md 就是一篇普通笔记,可能正开在
      // 笔记编辑器里 —— writeFile 是整文件覆写,会把用户这 800ms 内敲的字连同 fsrs 行一起抹掉。
      // 拒写 + 提示 + 跳过这张卡(不写盘、不计数、不发成就,仍留在到期队列里下次再来)。
      // 闸**只**限 !ftReady:单活页模型下现代宿主打开卡组编辑器就会把该路径报成活动页,
      // 无条件闸会把「编辑器开着 → 复习本组」这条既有主流程整个打死(ftReady 时行为零变化)。
      if (!ftReady && ctx.app.getActivePage && ctx.app.getActivePage() === it.path) {
        say(t('deckActiveBlocked'), { level: 'warning' })
        pos += 1
        flipped = false
        if (pos >= items.length) { phase = 'done'; flushActivity() }
        render()
        return
      }
      const now = Date.now()
      const st = schedule(it.prev, g, now)
      let saved = false
      try {
        const text = await ctx.app.readFile(it.path)
        if (text == null) throw new Error(t('deckGone'))
        const deck = parseDeck(text)
        if (deck.fsrsBroken) throw new Error(t('deckBrokenSkip'))
        deck.fsrs[it.id] = st
        await ctx.app.writeFile(it.path, serializeDeck(deck))
        saved = true
        refreshDeckRow(it.path, deck).catch(() => { /* 索引下次自愈 */ })
      } catch (e) {
        say(t('progressSaveFailed', { err: (e && e.message) || e }), { level: 'error' })
      }
      // ⚠️ 进度没落盘就一个持久标记都不许落(P0 模板 3)。以前失败照样 daily.reviewed++ /
      //    daily.introduced++(每日新卡额度被白吃一格,当天少学一张)/ 成就 +1 / 连击开始 ——
      //    进度零落盘却对外宣称「今日已复习 1 张」。口径与 1.2.0 新加的 deckActiveBlocked 闸对齐:
      //    跳过这张卡、不计数、不发成就,下一轮还能重来。
      if (saved) {
        const daily = readDaily()
        daily.reviewed += 1
        if (!it.prev) daily.introduced += 1
        writeDaily(daily)
        sessionReviewed += 1
        unlogged += 1
        if (ctx.achievements && ctx.achievements.track) ctx.achievements.track('review')
        updateStreak()
      }
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
    // innerHTML 只放编译期字面量骨架:一切文案(含词表串与用户卡组名)一律 textContent 落。
    root.innerHTML = `
<div class="fc-hdr">
  <span style="font-weight:600" data-title></span>
  <span class="fc-chip due" data-scope style="display:none;cursor:pointer"></span>
  <span style="flex:1"></span>
  <span class="fc-muted" data-count style="font-size:11px;font-variant-numeric:tabular-nums"></span>
  <button class="fc-btn ghost sm" data-refresh></button>
</div>
<div class="fc-body">
  <div data-gen></div>
  <div class="fc-prog" data-prog style="display:none">
    <div class="fc-prog-head"><span data-progtext></span><span data-progpct></span></div>
    <div class="fc-prog-track"><div class="fc-prog-fill" data-progfill></div></div>
  </div>
  <div data-main></div>
</div>`
    root.querySelector('[data-title]').textContent = t('appName')
    const scopeEl = root.querySelector('[data-scope]')
    if (scope) {
      scopeEl.style.display = ''
      scopeEl.textContent = t('scopeChip', { name: scope.name || basename(scope.path) })
      scopeEl.addEventListener('click', () => { scope = null; rebuild({ focus: true }) })
    }
    const cnt = root.querySelector('[data-count]')
    cnt.textContent = phase === 'loading' ? '' : t('deckCount', { n: meta.decks })
    const refreshBtn = root.querySelector('[data-refresh]')
    refreshBtn.textContent = t('refresh')
    refreshBtn.setAttribute('title', t('refreshTip'))
    refreshBtn.addEventListener('click', () => rebuild({ focus: true }))
    renderGen()
    renderProgress()
    const main = root.querySelector('[data-main]')
    if (phase === 'loading') {
      const d = document.createElement('div')
      d.className = 'fc-empty'
      d.textContent = t('loading')
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
    root.querySelector('[data-progtext]').textContent = t('progressToday', { n: daily.reviewed }) + (remain ? t('progressLeft', { n: remain }) : '')
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
      lab.textContent = t('genRunning', { label: gen.stage ? t(gen.stage) : t('genBusy'), pct: Math.round(gen.pct) })
      const cancel = document.createElement('button')
      cancel.className = 'fc-btn ghost sm'
      cancel.textContent = t('cancel')
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
      er.textContent = t('genFailed', { err: gen.error })
      const x = document.createElement('button')
      x.className = 'fc-btn ghost sm'
      x.textContent = t('dismiss')
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
<h1 data-h></h1>
<p data-blurb></p>
<div class="fc-row" style="justify-content:center" data-acts></div>
<p class="fc-muted" data-hint style="font-size:11px;margin-top:14px"></p>`
    hero.querySelector('[data-h]').textContent = t('appName')
    hero.querySelector('[data-blurb]').textContent = t('heroBlurb')
    const acts = hero.querySelector('[data-acts]')
    const hint = hero.querySelector('[data-hint]')
    if (ftReady) {
      const gen1 = document.createElement('button')
      gen1.className = 'fc-btn primary'
      gen1.textContent = t('genFromNote')
      gen1.addEventListener('click', () => { generateFromNote() })
      const mk = document.createElement('button')
      mk.className = 'fc-btn'
      mk.textContent = t('newDeck')
      mk.addEventListener('click', () => { createDeckInteractive(null) })
      acts.appendChild(gen1); acts.appendChild(mk)
      hint.textContent = t('guideHint')
    } else {
      hint.textContent = t('guideHintLegacy')
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
    h.textContent = scope ? t('idleNoneScoped') : t('idleNone')
    const sub = document.createElement('div')
    sub.className = 'fc-muted'
    sub.style.fontSize = '12px'
    sub.textContent = t('idleToday', { n: daily.reviewed }) + (meta.freshSkipped ? t('idleHeld', { n: meta.freshSkipped, lim: dailyLimit() }) : '')
    p.appendChild(h); p.appendChild(sub)
    wrap.appendChild(p)
    const cap = document.createElement('div')
    cap.className = 'fc-label'
    cap.style.margin = '16px 2px 2px'
    cap.textContent = t('decksLabel')
    wrap.appendChild(cap)
    for (const r of rows) {
      const row = document.createElement('div')
      row.className = 'fc-deckrow'
      const nm = document.createElement('span')
      nm.className = 'nm'
      nm.textContent = r.name
      const ct = document.createElement('span')
      ct.className = 'ct'
      ct.textContent = t('deckRowCounts', { cards: r.cards, due: r.due })
      const open = document.createElement('button')
      open.className = 'fc-btn ghost sm'
      open.textContent = t('open')
      open.addEventListener('click', () => { if (ctx.app.openFile) ctx.app.openFile(r.path) })
      const rv = document.createElement('button')
      rv.className = 'fc-btn sm'
      rv.textContent = t('review')
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
      gen1.textContent = t('genFromNote')
      gen1.addEventListener('click', () => { generateFromNote() })
      const mk = document.createElement('button')
      mk.className = 'fc-btn ghost'
      mk.textContent = t('newDeck')
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
<div style="font-size:17px;font-weight:600" data-done></div>
<div class="fc-muted" data-sum style="margin-top:6px;font-size:12.5px"></div>
<div class="fc-row" style="justify-content:center;margin-top:16px" data-acts></div>`
    box.querySelector('[data-done]').textContent = t('doneTitle')
    const parts = [t('doneSession', { n: sessionReviewed }), t('doneToday', { n: daily.reviewed })]
    if (num(streak.len, 0) > 1) parts.push(t('doneStreak', { n: streak.len }))
    box.querySelector('[data-sum]').textContent = parts.join(' · ')
    const again = document.createElement('button')
    again.className = 'fc-btn ghost'
    again.textContent = t('doneAgain')
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
    dn.textContent = t('cardMeta', { deck: it.deckName, kind: it.prev ? t('review') : t('stateNew'), i: pos + 1, n: items.length })
    card.appendChild(dn)
    const qEl = document.createElement('div')
    qEl.className = 'fc-face'
    renderMarkdown(qEl, it.q || t('emptyQ'))
    card.appendChild(qEl)
    const kbd = document.createElement('div')
    kbd.className = 'fc-kbd'
    if (!flipped) {
      const flipBox = document.createElement('div')
      flipBox.className = 'fc-flip'
      const b = document.createElement('button')
      b.className = 'fc-btn primary'
      b.style.minWidth = '160px'
      b.textContent = t('showAnswer')
      b.addEventListener('click', () => { flipped = true; render() })
      flipBox.appendChild(b)
      card.appendChild(flipBox)
      kbd.textContent = t('kbdFlip')
    } else {
      const dv = document.createElement('div')
      dv.className = 'fc-divider'
      card.appendChild(dv)
      const aEl = document.createElement('div')
      aEl.className = 'fc-face'
      renderMarkdown(aEl, it.a || t('emptyA'))
      card.appendChild(aEl)
      const rateRow = document.createElement('div')
      rateRow.className = 'fc-rate'
      const now = Date.now()
      for (const [g, label] of rateKeys()) {
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
      kbd.textContent = t('kbdRate')
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

  // 语言变了必须**原地**重绘(不重挂):宿主只广播变化,初值走 L()。旧宿主没这个接缝 → 可选链。
  const offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(() => { if (alive) render() }) : null

  rebuild({ focus: true })
  return () => { alive = false; if (deckTimer) clearTimeout(deckTimer); flushActivity(); offBus(); offTheme(); if (offLocale) offLocale() }
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
      const text = await ctx.app.readFile(filePath)
      // ⚠️ 读不到就**一律中止**,绝不跳过合并照写:null 有三个来源(文件被删/改名、fs 读失败、
      //    库根未就位),任何一个下继续写都是灾难 —— 要么用挂载那一刻的陈旧 fsrs 快照把复习台刚
      //    写进去的进度整体回滚(这段合并存在的理由就是防它),要么把已删/已改名的卡组凭空造回来。
      //    与 rate() 的 `if (text == null) throw` 同一条纪律。
      if (text == null) throw new Error(t('deckGone'))
      const disk = parseDeck(text)
      deck.fsrs = disk.fsrs
      deck.preamble = disk.preamble
      deck.fmExtra = disk.fmExtra
      deck.fsrsBroken = disk.fsrsBroken
      deck.fsrsRaw = disk.fsrsRaw
      await ctx.app.writeFile(filePath, serializeDeck(deck))
      await refreshDeckRow(filePath, deck)
      bus.emit({ type: 'decks' })
      if (alive) updateStats()
    } catch (e) {
      dirty = true
      say(t('saveFailed', { err: (e && e.message) || e }), { level: 'error' })
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
      else { const dts = Date.parse(st.due || ''); if (Number.isFinite(dts) && dts <= now) due++ }
    }
    s.textContent = t('editorStats', { n: deck.cards.length, due, fresh }) + (deck.fsrsBroken ? t('editorStatsBroken') : '')
  }

  function render() {
    root.innerHTML = `
<div class="fc-hdr">
  <input class="fc-input" data-name style="max-width:260px;font-weight:600" />
  <span class="fc-muted" data-stats style="font-size:11.5px;font-variant-numeric:tabular-nums"></span>
  <span style="flex:1"></span>
  <button class="fc-btn" data-add></button>
  <button class="fc-btn primary" data-review></button>
</div>
<div class="fc-body"><div data-list style="max-width:760px;margin:0 auto"></div></div>`
    const nameEl = root.querySelector('[data-name]')
    nameEl.value = deck.name
    nameEl.setAttribute('placeholder', t('deckNamePh'))
    nameEl.addEventListener('input', () => { deck.name = nameEl.value; scheduleSave() })
    const addBtn = root.querySelector('[data-add]')
    addBtn.textContent = t('addCard')
    addBtn.addEventListener('click', addCard)
    const reviewBtn = root.querySelector('[data-review]')
    reviewBtn.textContent = t('reviewThisDeck')
    reviewBtn.addEventListener('click', async () => {
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
      d.textContent = t('editorEmpty')
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
    del.textContent = t('delete')
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
    mk(t('qLabel'), 'q', t('qPh'))
    mk(t('aLabel'), 'a', t('aPh'))
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

  /** 只读警示态(读不到 / 不合格式):同样要能跟着语言重绘,所以走 paint 而不是就地写死。 */
  function warn(key) {
    root.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'fc-empty'
    d.textContent = t(key)
    root.appendChild(d)
  }
  let mode = 'loading' // loading | missing | invalid | edit
  function paint() {
    if (mode === 'missing') { warn('deckMissing'); return }
    if (mode === 'invalid') { warn('deckInvalid'); return }
    if (mode === 'edit' && deck) render()
  }

  async function load() {
    let text = null
    try { text = await ctx.app.readFile(filePath) } catch { text = null }
    if (!alive) return
    if (text == null) { mode = 'missing'; paint(); return }
    const parsed = parseDeck(text)
    // 毁档防线:内容非空、又没有 frontmatter、也没解析出任何卡 —— 这不是卡组文件
    // (多半是改错后缀的普通笔记)。进只读警示态,绝不允许用空 deck 把它覆盖掉。
    if (text.trim() !== '' && !parsed.hadFm && parsed.cards.length === 0) { mode = 'invalid'; paint(); return }
    deck = parsed
    if (!deck.name) deck.name = basename(filePath)
    mode = 'edit'
    paint()
    refreshDeckRow(filePath, deck).catch(() => { /* 索引下次自愈 */ })
  }

  const offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(() => { if (alive) paint() }) : null

  load()
  return () => {
    alive = false
    if (saveTimer) clearTimeout(saveTimer)
    if (dirty && deck) flush().catch(() => { /* 尽力落盘(flush 内部已合并盘上 fsrs) */ })
    offTheme()
    if (offLocale) offLocale()
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
    const title = where == null ? t('newDeck') : where === '' ? t('newDeckAtRoot') : t('newDeckInFolder', { folder: where.split('/').pop() })
    const name = await askName(title, '')
    if (!name) return
    const deck = { name, fsrs: {}, cards: [] }
    const path = await uniqueDeckPath(name, where)
    await ctx.app.writeFile(path, serializeDeck(deck))
    await refreshDeckRow(path, deck)
    bus.emit({ type: 'decks' })
    if (ctx.app.openFile) ctx.app.openFile(path)
  } catch (e) {
    say(t('newDeckFailed', { err: (e && e.message) || e }), { level: 'error' })
  }
}

// ── 统一左栏列表源(宿主 2026-08-25+;可选链,老宿主静默跳过) ─────────────────────
// 卡组清单交给宿主统一左栏渲染(与会话/笔记行同一套 UI);点一行 = 只复习这一组。
// 插件对界面无状态:搜索词由宿主持有,经 items({query}) 回传。卡组之间没有文件夹层级,故不给 groups()。
let deckCache = [] // items() 必须同步且便宜 —— 索引的同步快照,绝不在 items() 里读盘
function registerDeckList() {
  if (!ctx.registerListSource) return
  const listSubs = new Set()
  const fireList = () => listSubs.forEach((f) => { try { f() } catch { /* ignore */ } })
  // ⚠️ 索引三态照旧:ok:false(读失败/坏 JSON)一律**保留上一份**,绝不当成「没有卡组」清空列表。
  //    另:插件在宿主**启动期**装载,那时活动库还没恢复,readFile 静默给 null → 只在 setup 里读一次
  //    的话列表会永久空着(青鸟 2026-08-28 实报的同一个坑)。宿主挂载列表面/切库都会重订阅。
  const listReload = () => readIndex().then((r) => { if (r.ok) deckCache = r.decks || []; fireList() }, () => { /* 保留上一份 */ })
  bus.on((e) => { if (e.type === 'decks') void listReload() })
  ctx.registerListSource({
    id: 'deck-list',
    title: t('appName'),
    search: true,
    items: (f) => {
      const q = ((f && f.query) || '').trim().toLowerCase()
      return deckCache
        .filter((r) => r && r.path)
        .filter((r) => !q || String(r.name || '').toLowerCase().includes(q))
        .map((r) => ({
          key: r.path,
          title: r.name || basename(r.path),
          // 右侧数字 = 今天到期张数(纯数字,语言中立,不进词表);没有就留空,不画 0。
          hint: r.due ? String(r.due) : '',
          icon: 'database', // 与 .deck.md 文件类型的树图标同一枚
        }))
    },
    actions: ctx.registerFileCreator ? [{ id: 'new', label: t('newDeck'), run: () => { createDeckInteractive(null) } }] : undefined,
    subscribe: (cb) => { listSubs.add(cb); void listReload(); return () => listSubs.delete(cb) },
    // 与编辑视图「复习本组」同一条路:置 pendingReview + 播总线(视图已挂载就现场换范围)。
    open: (item) => {
      const row = deckCache.find((r) => r.path === item.key)
      const name = (row && row.name) || basename(item.key)
      pendingReview = { path: item.key, name }
      bus.emit({ type: 'review-open', path: item.key, name })
      if (ctx.openView) ctx.openView('review')
    },
  })
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
    title: t('deckFileType'),
    mount: (el, f) => mountDeck(el, f.filePath),
  }) === false
}
// 贡献点标题(命令面板 / 斜杠菜单 / 设置页 / 文件类型 / 新建入口 / 成就系列的标题与描述)取的是**注册时**的语言:
// 宿主目前不对它们做运行时重解析,语言切换后这些宿主面要等重启才跟上(已知缺口,README 有写)。
// 不许为它做「语言变了就 teardown 重注册」——会打断进行中的建卡任务与已打开的视图。
if (!CAN_VIEW) {
  say(t('warnNoView'), { level: 'warning' })
} else if (ftRefused) {
  say(t('warnTaken'), { level: 'warning' })
} else {
  ftReady = CAN_FT
  ctx.registerView({ id: 'review', title: t('appName'), mount: mountReview, singleton: true, workspaceSource: 'deck-list' })
  registerDeckList()
  if (ctx.registerCommand) ctx.registerCommand({ id: 'flashcards-open', title: t('cmdOpen'), keywords: 'flashcards 闪卡 复习 记忆 卡片 间隔重复 fsrs anki review deck spaced repetition', run: () => { if (ctx.openView) ctx.openView('review') } })
  if (ctx.registerSetting) ctx.registerSetting({ key: 'dailyLimit', label: t('setDailyLimit'), type: 'number', default: 50, min: 0, max: 999, description: t('setDailyLimitDesc') })
  if (ctx.registerSetting) ctx.registerSetting({ key: 'nudge', label: t('setNudge'), type: 'boolean', default: true, description: t('setNudgeDesc') })
  // 全局状态栏常驻项(宿主命名空间 plugin:flashcards:due)。数据驱动形态,数字经 handle.update()
  // 原位更新;2026-07-23 前的宿主返回 void → 拿不到 handle 就整条功能不做(不排定时器、不订语言)。
  const _statusItem = typeof ctx.registerStatusItem === 'function'
    ? ctx.registerStatusItem({ id: 'due', text: t('statusNoDeck'), title: t('statusTip', { due: 0, fresh: 0 }), side: 'right', onClick: () => { if (ctx.openView) ctx.openView('review') } })
    : null
  statusHandle = _statusItem && typeof _statusItem.update === 'function' ? _statusItem : null
  if (statusHandle) {
    // 状态栏文案是少数能实时跟随语言的宿主面(命令面板 / 设置页标题仍是注册时快照,见 README)
    if (ctx.subscribeLocale) offStatusLocale = ctx.subscribeLocale(() => { paintStatusText() })
    refreshStatus().catch(() => { }) // 自排程:结尾会 schedulePoll()
  }
  if (ctx.achievements && ctx.achievements.registerSeries) {
    ctx.achievements.registerSeries({
      id: 'review',
      title: t('appName'),
      achievements: [
        { id: 'first-review', title: t('achFirstTitle'), desc: t('achFirstDesc'), event: 'review', goal: 1, points: 5 },
        { id: 'review-100', title: t('ach100Title'), desc: t('ach100Desc'), event: 'review', goal: 100, points: 20 },
        { id: 'streak-7', title: t('achStreakTitle'), desc: t('achStreakDesc'), event: 'streak', goal: 7, points: 30 },
      ],
    })
  }
  if (ftReady) {
    if (ctx.registerCommand) ctx.registerCommand({ id: 'flashcards-from-note', title: t('cmdFromNote'), keywords: 'flashcards 闪卡 生成 建卡 AI deck 笔记 generate note cards', run: () => { generateFromNote() } })
    if (ctx.registerFileCreator) ctx.registerFileCreator({ id: 'deck-new', label: t('newDeck'), icon: 'database', run: (parentFolder) => createDeckInteractive(typeof parentFolder === 'string' ? parentFolder : null) })
  } else {
    say(t('warnNoFileType'), { level: 'info' })
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
    MSG, L, t, rateKeys, UNTITLED_DECK,
    onColorOf, readableOn, contrast, GEN_PROMPT, stageOf, gen,
    clipNote, escapeCardLine, unescapeCardLine, generateFromNote, bus,
    deckCounts, dueSummary, isIndexStale, shouldNudge, nudgeOn,
    paintStatus, paintStatusText, refreshStatus, STATUS_POLL,
    statusPeek: () => ({ n: statusLast.n, due: statusLast.due, fresh: statusLast.fresh, decks: statusLast.decks, timer: !!statusPollTimer, disposed: statusDisposed, nudged: nudgedSession }),
    peekPending: () => pendingReview,
  })
}

return () => {
  // statusDisposed 不可省:重臂发生在 refreshStatus 的尾部,只清 timer 会被**正在飞的那一次**
  // refresh 重新排上 → 泄漏一个 5 分钟定时器(node check.mjs 会当场挂死)。
  statusDisposed = true
  if (statusPollTimer) { clearTimeout(statusPollTimer); statusPollTimer = null }
  if (statusHandle && typeof statusHandle.dispose === 'function') { try { statusHandle.dispose() } catch { /* ignore */ } }
  statusHandle = null // 之后所有 paintStatus / refreshStatus 自动成 no-op
  if (offStatusLocale) { try { offStatusLocale() } catch { /* ignore */ } }
  offStatusLocale = null
  if (gen.controller) gen.controller.abort() // 未完成的建卡任务收干净
  if (_layer && _layer.remove) _layer.remove()
}
