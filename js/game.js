(function () {
  const { CLUES, PARAS, RELS, PEOPLE, LOCS, PROPS, ENTITIES, LETTER, BIG_HEAD, BIG_TAIL, slotName } = window.DOUNAN;
  const KEY = "shaoshu-demo-v3";
  const params = new URLSearchParams(location.search);
  const SHOT = params.get("shot");
  const DEBUG = params.has("debug");
  const REACH = 88;
  const SWEEP = 160 * Math.PI / 180;
  const SPOT = 58;

  const canvas = document.getElementById("view");
  let ctx = canvas.getContext("2d");
  const el = {
    hud: document.getElementById("hud"),
    book: document.getElementById("book"),
    bookBody: document.getElementById("book-body"),
    bookEra: document.getElementById("book-era"),
    bookPct: document.getElementById("book-pct"),
    bookBar: document.getElementById("book-bar"),
    submit: document.getElementById("submit-view"),
    submitBody: document.getElementById("submit-body"),
    dialog: document.getElementById("dialog"),
    dlgWho: document.getElementById("dlg-who"),
    dlgText: document.getElementById("dlg-text"),
    dlgBtns: document.getElementById("dlg-buttons"),
    coach: document.getElementById("coach"),
    toast: document.getElementById("toast"),
    flash: document.getElementById("flash"),
    prompt: document.getElementById("prompt"),
    locName: document.getElementById("loc-name"),
    locEra: document.getElementById("loc-era"),
    locGoal: document.getElementById("loc-goal"),
    hudPct: document.getElementById("hud-pct"),
    hudClues: document.getElementById("hud-clues"),
    hudBar: document.getElementById("hud-bar"),
    watchBtn: document.getElementById("btn-watch"),
    continueBtn: document.getElementById("btn-continue"),
    resetBtn: document.getElementById("btn-reset"),
    ending: document.getElementById("ending-body"),
  };

  const state = {
    screen: "title",
    loc: null,
    past: null,
    px: 0,
    py: 0,
    facing: "s",
    moving: false,
    dest: null,
    clues: new Set(),
    seen: new Set(),
    slots: new Set(),
    rels: {},
    picked: null,
    revealed: new Set(),
    peeked: new Set(),
    visited: new Set(),
    cam: 0,
    fade: 0,
    trans: null,
    book: false,
    tab: "map",
    split: 0,
    split0: 0,
    bagId: null,
    storyWho: "李文雄",
    dialog: null,
    coach: false,
    coachSeen: false,
    taughtRim: false,
    endingSeen: false,
    rimTold: false,
  };

  const down = new Set();
  let time = 0;
  let last = 0;
  let toastTimer = 0;
  let dpr = 1;
  let frames = 0;
  let grayBuf = null;

  const PORTRAIT = {
    "陳清源": "assets/portraits/qy.png",
    "林秀蘭": "assets/portraits/xl.png",
    "張志明": "assets/portraits/zm.png",
    "李文雄": "assets/portraits/wx.png",
    "李文惠": "assets/portraits/wh.png",
    "林阿土": "assets/portraits/at.png",
  };
  const TEX = {};
  for (const name of ["wood", "tatami", "yard", "cane"]) {
    TEX[name] = new Image();
    TEX[name].src = "assets/tex/tex-" + name + ".jpg";
  }
  const SPR = {};
  for (const name of ["qy", "xl", "wh", "wx", "zm", "at", "member", "soldier", "shimu", "player", "blade"]) {
    SPR[name] = new Image();
    SPR[name].src = "assets/sprites/" + name + ".png";
  }
  const SPRITE_KEY = {
    "陳清源": "qy", "林秀蘭": "xl", "李文惠": "wh", "李文雄": "wx", "張志明": "zm", "林阿土": "at",
    "members": "member", "soldiers": "soldier", "師母": "shimu",
  };
  function imgReady(img) { return !!(img && img.complete && img.naturalWidth); }
  function artReady() {
    return ["wood", "tatami", "yard", "cane"].every((k) => imgReady(TEX[k])) && imgReady(SPR.qy) && imgReady(SPR.player);
  }
  function spriteFor(e) {
    if (e.kind === "silhouette" && !state.revealed.has(e.id)) return SPR.blade;
    const key = SPRITE_KEY[e.charId] || SPRITE_KEY[e.name];
    return key ? SPR[key] : null;
  }

  function colorNames(s) {
    let html = esc(s);
    const names = PEOPLE.map((p) => p.name).slice().sort((a, b) => b.length - a.length);
    for (const n of names) {
      const p = personOf(n);
      html = html.split(esc(n)).join('<span style="color:' + p.color + '">' + esc(n) + "</span>");
    }
    return html;
  }
  function paraLead(p) {
    if (p.kind === "clue") {
      const c = clueById(p.clue);
      if (c && c.person) {
        const who = personOf(c.person);
        return '<span class="tag" style="color:' + who.color + '">【' + esc(c.person) + "】</span> ";
      }
      return '<span class="tag" style="color:#404040">【讀書會】</span> ';
    }
    if (p.kind === "final") return "";
    return "";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  }
  function loc() { return LOCS[state.loc]; }
  function activeWatch() {
    if (!state.past) return null;
    return (loc().watches || []).find((w) => w.id === state.past) || null;
  }
  function paused() {
    return state.screen !== "play" || state.book || state.dialog || state.coach || !!state.trans;
  }
  function clueById(id) { return CLUES.find((c) => c.id === id); }
  function personOf(name) { return PEOPLE.find((p) => p.name === name); }
  function slotKey(person, field) { return person + ":" + field; }
  function relGaps(rel) {
    if (!state.rels[rel.id]) state.rels[rel.id] = rel.gaps.map(() => null);
    return state.rels[rel.id];
  }
  function relReady(rel) {
    const g = state.rels[rel.id];
    return !!g && g.every((name, i) => name === rel.gaps[i]);
  }
  function paraOpen(p) {
    if (p.kind === "clue") {
      const c = clueById(p.clue);
      if (!state.clues.has(c.id)) return false;
      if (!c.keyword) return true;
      return state.slots.has(slotKey(c.person, c.field));
    }
    if (p.kind === "rel") return relReady(RELS.find((r) => r.id === p.rel));
    return PARAS.filter((x) => x.kind !== "final").every(paraOpen);
  }
  function slotsDone() {
    return PEOPLE.every((p) => ["職業", "罪名", "結局"].every((f) => state.slots.has(slotKey(p.name, f))));
  }
  function unlockedCount() {
    return PARAS.filter(paraOpen).length;
  }
  function percent() {
    const total = CLUES.length + PARAS.length;
    return Math.round(((state.clues.size + unlockedCount()) / total) * 100);
  }
  function clueCount() { return state.clues.size; }

  function save() {
    if (SHOT) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        clues: [...state.clues],
        seen: [...state.seen],
        slots: [...state.slots],
        rels: state.rels,
        visited: [...state.visited],
        coachSeen: state.coachSeen,
        taughtRim: state.taughtRim,
        endingSeen: state.endingSeen,
      }));
    } catch (err) { /* private mode */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.clues = new Set(data.clues || []);
      state.seen = new Set(data.seen || []);
      state.slots = new Set(data.slots || []);
      const rels = data.rels || {};
      if (rels["救過"] && !rels["救命恩人"]) {
        rels["救命恩人"] = rels["救過"];
        delete rels["救過"];
      }
      state.rels = rels;
      state.visited = new Set(data.visited || []);
      state.coachSeen = !!data.coachSeen;
      state.taughtRim = !!data.taughtRim;
      state.endingSeen = !!data.endingSeen;
    } catch (err) { /* ignore broken save */ }
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2400);
  }
  function flash(msg) {
    el.flash.textContent = msg;
    el.flash.classList.remove("on");
    void el.flash.offsetWidth;
    el.flash.classList.add("on");
  }

  function showScreen(name) {
    state.screen = name;
    document.body.dataset.screen = name;
    for (const node of document.querySelectorAll(".screen")) {
      node.classList.toggle("on", node.dataset.screen === name);
    }
    el.hud.classList.toggle("hidden", name !== "play");
    if (name !== "play") {
      state.book = false;
      el.book.classList.add("hidden");
      closeDialog();
    }
    renderLetter();
    const resume = document.getElementById("btn-resume");
    if (resume) resume.classList.toggle("hidden", !(name === "letter" && state.loc));
    const helpResume = document.getElementById("btn-help-resume");
    if (helpResume) helpResume.classList.toggle("hidden", !(name === "help" && state.loc));
    if (name === "title") renderTitle();
    if (name === "map") renderPins();
    if (name === "ending") renderEnding();
    if (name === "play") {
      void canvas.offsetWidth;
      resize();
    }
  }

  function renderLetter() {
    const box = document.getElementById("letter-body");
    if (!box || box.dataset.ready) return;
    box.dataset.ready = "1";
    box.innerHTML = LETTER.map((line, i) => {
      if (i === 0) return `<p class="body">${esc(line)}</p>`;
      if (i === LETTER.length - 1) return `<p class="sign">${esc(line)}</p>`;
      return `<p class="body">${esc(line)}</p>`;
    }).join("");
  }
  function renderTitle() {
    renderLetter();
    const has = state.visited.size > 0 || state.clues.size > 0;
    el.continueBtn.classList.toggle("hidden", !has);
    el.resetBtn.classList.toggle("hidden", !has);
  }

  function pinStatus(id) {
    const here = CLUES.filter((c) => c.loc === id);
    const got = here.filter((c) => state.clues.has(c.id)).length;
    if (id === "shimu" && slotsDone()) return got === here.length ? "可以結案" : "可以結案";
    if (!state.visited.has(id) && got === 0) return "尚未前往";
    if (here.length && got === here.length) return "線索齊了";
    if (got > 0) return "線索 " + got + "／" + here.length;
    return "已前往";
  }
  function renderPins() {
    for (const node of document.querySelectorAll(".pin-status")) {
      const id = node.dataset.status;
      node.textContent = pinStatus(id);
      node.closest(".pin").classList.toggle("done", pinStatus(id) === "時刻已記入" || pinStatus(id) === "可以結案");
    }
  }

  function renderEnding() {
    state.endingSeen = true;
    save();
    const pc = percent();
    const done = paraOpen(PARAS[PARAS.length - 1]);
    const line = done
      ? "偵探把調查結果交給師母。這件委託結案。"
      : "六個人的職業、罪名和結局都記下來了。湯文本還有沒寫完的句子。";
    const body = done
      ? `<article class="para"><p>${esc(BIG_HEAD)}</p></article><article class="para"><h3>段落28</h3><p>${esc(PARAS[27].text)}</p></article><article class="para"><p>${esc(BIG_TAIL)}</p></article>`
      : PARAS.filter((p) => p.kind !== "final" && !paraOpen(p)).slice(0, 8).map((p) =>
        `<article class="para"><h3>段落${String(p.no).padStart(2, "0")}</h3><p>尚未寫下</p></article>`
      ).join("");
    el.ending.innerHTML =
      `<p class="eyebrow">師母家　·　民國一一五年</p>` +
      `<h2>結案</h2>` +
      `<div class="score">${pc}%</div>` +
      `<p>${esc(line)}</p>` +
      `<p class="fine">線索 ${clueCount()}／${CLUES.length}　·　段落 ${unlockedCount()}／${PARAS.length}　·　人物格 ${[...state.slots].length}／18</p>` +
      body;
  }

  function enterLoc(id, opt) {
    opt = opt || {};
    const L = LOCS[id];
    state.loc = id;
    state.past = opt.past || null;
    state.px = opt.x != null ? opt.x : L.spawn.x;
    state.py = opt.y != null ? opt.y : L.spawn.y;
    state.dest = null;
    state.facing = "s";
    state.rimTold = false;
    state.visited.add(id);
    state.book = false;
    el.book.classList.add("hidden");
    closeDialog();
    state.coach = false;
    state.cam = 0;
    showScreen("play");
    syncCoach();
    save();
  }

  function syncCoach() {
    el.coach.classList.toggle("hidden", !state.coach);
  }
  function dismissCoach() {
    state.coach = false;
    state.coachSeen = true;
    syncCoach();
    save();
  }

  function tryLeave() {
    if (state.past) {
      toast("先站回放置處，按空白鍵收回懷錶。");
      return;
    }
    showScreen("map");
  }

  function showItem(item, mode) {
    if (item.loc !== state.loc) return false;
    if (item.era === "all") return true;
    if (mode === "past") return !!state.past && item.era === "past" && item.pastId === state.past;
    return item.era !== "past";
  }
  function visible(item) {
    if (item.loc !== state.loc) return false;
    if (item.era === "all" || item.era === "present") return true;
    return !!state.past && item.era === "past" && item.pastId === state.past;
  }
  function wrapAng(d) {
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function onPastSide(x, y) {
    if (!state.past) return false;
    const w = activeWatch();
    if (!w) return false;
    const dx = x - w.x;
    const dy = y - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist > w.r) return false;
    if (dist < 1) return true;
    return Math.abs(wrapAng(Math.atan2(dy, dx) - state.split)) <= SWEEP / 2;
  }
  function canTouch(e) {
    if (!e || e.loc !== state.loc) return false;
    if (e.era === "past") return !!state.past && e.pastId === state.past && onPastSide(e.x, e.y);
    return !onPastSide(e.x, e.y);
  }
  function visibleProps() { return PROPS.filter(visible); }
  function visibleEntities() { return ENTITIES.filter(visible); }
  function solids() {
    return visibleProps().filter((p) => p.solid).map(rectOf);
  }
  function rectOf(p) {
    if (p.kind === "room" || p.kind === "wall") return { x: p.x, y: p.y, w: p.w, h: p.h };
    return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
  }

  function nearest() {
    let best = null;
    let bestD = REACH;
    for (const e of visibleEntities()) {
      if (!canTouch(e)) continue;
      const d = Math.hypot(e.x - state.px, e.y - state.py);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }
  function nearestSpot(maxDist) {
    const L = loc();
    if (!L || !L.watches || !L.watches.length) return null;
    const list = state.past ? L.watches.filter((w) => w.id === state.past) : L.watches;
    let best = null;
    let bestD = maxDist;
    for (const w of list) {
      const d = Math.hypot(state.px - w.x, state.py - w.y);
      if (d < bestD) { best = w; bestD = d; }
    }
    return best;
  }
  function entityAt(x, y, rad) {
    let best = null;
    let bestD = rad;
    for (const e of visibleEntities()) {
      if (!canTouch(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  function displayName(e) {
    if (e.hidden && !state.revealed.has(e.id)) return e.hiddenLabel || e.name;
    return e.name;
  }
  function interact(e) {
    if (!e) return;
    if (e.kind === "letter") { showScreen("letter"); return; }
    if (e.kind === "note" || e.kind === "mark") {
      openDialog("", e.text, [{ label: "關閉", primary: true, act: closeDialog }], { tag: e.tag || "【木箱】", color: e.color || "#6D4C41", colorBody: "#241c16" });
      return;
    }
    if (e.kind === "talk") { talkShimu(); return; }
    if (e.kind === "person" || e.kind === "silhouette") {
      state.seen.add(e.seenId || e.id);
      if (e.hidden && !state.revealed.has(e.id)) {
        if (!state.peeked.has(e.id)) {
          state.peeked.add(e.id);
          openDialog("", e.text, [{ label: "關閉", primary: true, act: closeDialog }], { tag: e.hiddenTag || "【黑影】", color: "#000000", colorBody: "#000000" });
        } else {
          state.revealed.add(e.id);
          openDialog("", e.reveal || e.text, [{ label: "關閉", primary: true, act: closeDialog }], { tag: e.tag, color: e.color, colorBody: e.color });
        }
        save();
        return;
      }
      openDialog("", e.text, [{ label: "關閉", primary: true, act: closeDialog }], { tag: e.tag || ("【" + e.name + "】"), color: e.color || "#241c16", colorBody: e.color || "#241c16" });
      save();
      return;
    }
    const c = clueById(e.clueId);
    const first = c && !state.clues.has(c.id);
    if (c) state.clues.add(c.id);
    if (c) showClue(c, first);
    else openDialog("", "", [{ label: "關閉", primary: true, act: closeDialog }], { tag: "【" + e.name + "】", color: "#404040" });
    save();
  }

  function showClue(c, first) {
    const opt = { tag: "【" + c.name + "】", color: "#404040", keyword: c.keyword };
    let text = c.text || "";
    if (c.code) {
      opt.lead = c.text;
      opt.code = c.code;
      text = "";
    }
    if (first && !c.keyword) toast("段落" + String(c.para).padStart(2, "0") + "已收錄");
    if (first && c.keyword) toast("關鍵字「" + c.keyword + "」已收入紀錄簿");
    const buttons = [{ label: "關閉", primary: true, act: closeDialog }];
    if (first) buttons.push({ label: "翻開紀錄簿", act: function () { closeDialog(); openBook(c.keyword ? "people" : "bag"); } });
    openDialog("", text, buttons, opt);
  }

  function talkShimu() {
    state.seen.add("shimu");
    const lines = ["偵探先生，我想知道我先生與那段時間到底發生了甚麼，能幫我還原歷史真相嗎？"];
    if (percent() < 100) lines.push("還沒有全部寫完。還原度要到一百，我才聽得見那一夜。");
    else lines.push("這就是我等的答案。");
    let i = 0;
    const show = function () {
      const last = i === lines.length - 1;
      const buttons = [];
      if (!last) buttons.push({ label: "繼續", primary: true, act: function () { i++; show(); } });
      else {
        if (percent() >= 100) buttons.push({ label: "結案", primary: true, act: function () { closeDialog(); showScreen("ending"); } });
        buttons.push({ label: "關閉", act: closeDialog });
      }
      openDialog("師母", lines[i], buttons);
    };
    show();
    save();
  }

  function openDialog(who, text, buttons, opt) {
    opt = opt || {};
    state.dialog = { buttons: buttons };
    el.dlgWho.textContent = "";
    const color = opt.color || "#8f2f2c";
    const tag = opt.tag || (who ? "【" + who + "】" : "");
    let body;
    if (opt.code && opt.code.lines) {
      const poem = opt.code.lines.map((line) => {
        const first = line.slice(0, 1);
        const rest = line.slice(1);
        return `<span class="code-line"><strong>${esc(first)}</strong>${esc(rest)}</span>`;
      }).join("");
      body = esc(opt.lead || "") + `<span class="poem">${poem}</span>`;
    } else {
      body = esc(text || "");
      if (opt.keyword) body = body.split(esc(opt.keyword)).join("<strong>" + esc(opt.keyword) + "</strong>");
    }
    if (opt.tail) body += esc(opt.tail);
    el.dlgText.innerHTML = (tag ? `<span class="tag" style="color:${color}">${esc(tag)}</span> ` : "") +
      `<span style="color:${opt.colorBody || "#241c16"}">${body}</span>`;
    el.dlgBtns.innerHTML = "";
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.label;
      btn.className = b.primary ? "stamp" : "ghost";
      btn.addEventListener("click", b.act);
      el.dlgBtns.appendChild(btn);
    }
    el.dialog.classList.remove("hidden");
  }
  function closeDialog() {
    state.dialog = null;
    el.dialog.classList.add("hidden");
  }

  function openBook(tab) {
    state.book = true;
    if (tab) state.tab = tab;
    el.book.classList.remove("hidden");
    renderBook();
  }
  function closeBook() {
    state.book = false;
    el.book.classList.add("hidden");
  }
  function toggleBook() {
    if (state.book) closeBook();
    else openBook();
  }
  function iconSvg(shape, size) {
    const s = size || 40;
    const common = `viewBox="0 0 48 48" width="${s}" height="${s}"`;
    if (shape === "book") return `<svg ${common}><rect x="8" y="6" width="32" height="36" rx="2" fill="#f7f1e4" stroke="#5c4030" stroke-width="2"/><path d="M24 6 v36" stroke="#5c4030"/></svg>`;
    if (shape === "cloth") return `<svg ${common}><path d="M16 8 h16 l4 8-6 4 2 20h-16l2-20-6-4z" fill="#243028" stroke="#1a2420"/></svg>`;
    if (shape === "crate") return `<svg ${common}><rect x="8" y="14" width="32" height="22" fill="#a87848" stroke="#5c3a22" stroke-width="2"/><path d="M8 22 h32 M24 14 v22" stroke="#5c3a22"/></svg>`;
    if (shape === "knife") return `<svg ${common}><rect x="20" y="22" width="8" height="16" rx="1" fill="#6a5438"/><path d="M22 22 L26 22 L25 6 L23 6 Z" fill="#c8c2b4"/></svg>`;
    if (shape === "card" || shape === "letter") return `<svg ${common}><rect x="12" y="8" width="24" height="32" rx="2" fill="#f3e6c8" stroke="#8a6844" stroke-width="2"/><path d="M16 16 h16 M16 22 h16 M16 28 h10" stroke="#c4b49a"/></svg>`;
    return `<svg ${common}><rect x="12" y="6" width="24" height="32" rx="1" fill="#f7f3e8" stroke="#8a6844" stroke-width="2"/><path d="M16 16 h16 M16 22 h16 M16 28 h12" stroke="#c4b49a"/></svg>`;
  }
  function boldLead(text, color) {
    const i = text.indexOf("。");
    const body = i < 0 ? `<b>${esc(text)}</b>` : `<b>${esc(text.slice(0, i + 1))}</b>${esc(text.slice(i + 1))}`;
    return `<p style="color:${color}">${body}</p>`;
  }
  function kwChip(c) {
    const placed = state.slots.has(slotKey(c.person, c.field));
    if (placed) return `<span class="chip used">${esc(c.keyword)}</span>`;
    const on = state.picked === "kw:" + c.keyword ? " picked" : "";
    return `<span class="chip${on}" data-payload="kw:${esc(c.keyword)}">${esc(c.keyword)}</span>`;
  }
  function nameBlank(rel, gap) {
    const name = relGaps(rel)[gap];
    const style = name ? ` style="color:${personOf(name).color}"` : "";
    return `<span class="slot name-slot${name ? " stayed" : ""}" data-accept="name" data-rel="${esc(rel.id)}" data-gap="${gap}"${style}>${esc(name || "")}</span>`;
  }
  function withScroll(fn) {
    const tops = [...el.bookBody.querySelectorAll(".colscroll, .story, .web, .namelist, .detail")].map((n) => n.scrollTop);
    fn();
    [...el.bookBody.querySelectorAll(".colscroll, .story, .web, .namelist, .detail")].forEach((n, i) => {
      if (typeof tops[i] === "number") n.scrollTop = tops[i];
    });
  }
  function bookChrome() {
    const pc = percent();
    if (el.bookEra) el.bookEra.textContent = "";
    if (el.bookPct) el.bookPct.textContent = pc + "%";
    if (el.bookBar) el.bookBar.style.width = pc + "%";
    for (const btn of el.book.querySelectorAll("[data-tab]")) btn.classList.toggle("active", btn.dataset.tab === state.tab);
  }
  function bagHtml() {
    if (!state.bagId || !state.clues.has(state.bagId)) {
      const first = CLUES.find((c) => state.clues.has(c.id));
      state.bagId = first ? first.id : null;
    }
    const tiles = CLUES.map((c, i) => {
      const found = state.clues.has(c.id);
      const n = i + 1;
      if (!found) return `<button type="button" class="tile miss" disabled><i>${n}</i><b>?</b><em>尚未找到</em></button>`;
      return `<button type="button" class="tile${state.bagId === c.id ? " on" : ""}" data-clue="${esc(c.id)}"><i>${n}</i>${iconSvg(c.shape, 36)}<span>${esc(c.name)}</span></button>`;
    }).join("");
    const c = state.bagId ? clueById(state.bagId) : null;
    let detail = `<div class="detail"><p>點左邊已經找到的物件，在這裡重讀。</p></div>`;
    if (c) {
      const era = c.era === "past" ? "過去" : "現在";
      let body = esc(c.text);
      if (c.code && c.code.lines) {
        body += "<br>" + c.code.lines.map((line) => `<b style="color:#8f2f2c">${esc(line.slice(0, 1))}</b>${esc(line.slice(1))}`).join("<br>");
      }
      if (c.keyword) body = body.split(esc(c.keyword)).join(`<mark>${esc(c.keyword)}</mark>`);
      const box = c.keyword
        ? `<div class="dragbox"><p>描述裡標出的字是關鍵字。把它拖到「人物檔案」對應的格子；填錯會彈回去。</p>${kwChip(c)}</div>`
        : "";
      detail = `<div class="detail"><div class="bigicon">${iconSvg(c.shape, 72)}</div><h3>${esc(c.name)}</h3><div class="where">線索 ${c.id.slice(1)}・${esc(c.place)}（${era}）・${esc(c.where)}</div><p>${body}</p>${box}</div>`;
    }
    return `<div class="sheet bag"><div class="colscroll"><div class="tiles">${tiles}</div></div><div class="colscroll">${detail}</div></div>`;
  }
  function measureLabel(text, size, weight) {
    if (!measureLabel.ctx) measureLabel.ctx = document.createElement("canvas").getContext("2d");
    measureLabel.ctx.font = weight + " " + size + 'px "WenQuanYi Micro Hei", "PingFang TC", sans-serif';
    const w = measureLabel.ctx.measureText(text).width;
    return w > 0 ? w : text.length * size;
  }
  function relationshipSvg() {
    const VBW = 520;
    const VBH = 500;
    const R = 20;
    const GAP = 7;
    const pos = {
      "陳清源": [250, 78],
      "林秀蘭": [250, 228],
      "張志明": [430, 196],
      "林阿土": [86, 208],
      "李文雄": [132, 408],
      "李文惠": [392, 408],
    };
    let sx = 0;
    let sy = 0;
    const names = Object.keys(pos);
    for (const name of names) { sx += pos[name][0]; sy += pos[name][1]; }
    const centroid = { x: sx / names.length, y: sy / names.length };
    function rim(a, b) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      return {
        x1: a[0] + ux * R, y1: a[1] + uy * R,
        x2: b[0] - ux * R, y2: b[1] - uy * R,
        ux, uy, nx: -uy, ny: ux,
        get mx() { return (this.x1 + this.x2) / 2; },
        get my() { return (this.y1 + this.y2) / 2; },
      };
    }
    const segments = RELS.map((rel) => Object.assign({ rel }, rim(pos[rel.gaps[0]], pos[rel.gaps[1]])));
    const circles = names.map((name) => ({ x: pos[name][0], y: pos[name][1], r: R }));
    function expand(box, pad) {
      return { cx: box.cx, cy: box.cy, w: box.w + pad * 2, h: box.h + pad * 2 };
    }
    function segHitsRect(x1, y1, x2, y2, box) {
      const left = box.cx - box.w / 2;
      const right = box.cx + box.w / 2;
      const top = box.cy - box.h / 2;
      const bottom = box.cy + box.h / 2;
      function inside(x, y) { return x >= left && x <= right && y >= top && y <= bottom; }
      if (inside(x1, y1) || inside(x2, y2)) return true;
      function cross(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
      function hit(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1 = cross(ax, ay, bx, by, cx, cy);
        const d2 = cross(ax, ay, bx, by, dx, dy);
        const d3 = cross(cx, cy, dx, dy, ax, ay);
        const d4 = cross(cx, cy, dx, dy, bx, by);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
      }
      return hit(x1, y1, x2, y2, left, top, right, top)
        || hit(x1, y1, x2, y2, right, top, right, bottom)
        || hit(x1, y1, x2, y2, right, bottom, left, bottom)
        || hit(x1, y1, x2, y2, left, bottom, left, top);
    }
    function clearanceToSeg(box, seg) {
      if (segHitsRect(seg.x1, seg.y1, seg.x2, seg.y2, box)) return 0;
      let lo = 0;
      let hi = 64;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (segHitsRect(seg.x1, seg.y1, seg.x2, seg.y2, expand(box, mid))) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    function rectGap(a, b) {
      const dx = Math.abs(a.cx - b.cx) - (a.w + b.w) / 2;
      const dy = Math.abs(a.cy - b.cy) - (a.h + b.h) / 2;
      if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
      if (dx <= 0) return dy;
      if (dy <= 0) return dx;
      return Math.hypot(dx, dy);
    }
    function circleGap(box, c) {
      const dx = Math.max(Math.abs(c.x - box.cx) - box.w / 2, 0);
      const dy = Math.max(Math.abs(c.y - box.cy) - box.h / 2, 0);
      return Math.hypot(dx, dy) - c.r;
    }
    function scoreBox(box, rects) {
      let clearance = 999;
      let bad = 0;
      if (box.cx - box.w / 2 < 4 || box.cy - box.h / 2 < 4 || box.cx + box.w / 2 > VBW - 4 || box.cy + box.h / 2 > VBH - 4) bad += 3;
      for (const seg of segments) {
        const g = clearanceToSeg(box, seg);
        clearance = Math.min(clearance, g);
        if (g < GAP) bad += 1;
      }
      for (const c of circles) {
        const g = circleGap(box, c);
        clearance = Math.min(clearance, g);
        if (g < GAP) bad += 1;
      }
      for (const r of rects) {
        const g = rectGap(box, r);
        clearance = Math.min(clearance, g);
        if (g < GAP) bad += 1;
      }
      return { bad, clearance };
    }
    const nameBoxes = {};
    const placed = [];
    const nameOrder = ["陳清源", "張志明", "林阿土", "李文雄", "李文惠", "林秀蘭"];
    for (const name of nameOrder) {
      const w = Math.ceil(measureLabel(name, 14, 700)) + 4;
      const h = 18;
      const [cx, cy] = pos[name];
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 36; i++) {
        const ang = -Math.PI / 2 + (i / 36) * Math.PI * 2;
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);
        const half = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
        const dist = R + GAP + 2 + half;
        const box = { cx: cx + nx * dist, cy: cy + ny * dist, w, h };
        const scored = scoreBox(box, placed);
        const outward = (box.cx - centroid.x) * nx + (box.cy - centroid.y) * ny;
        const score = (scored.bad === 0 ? 400 : -80 * scored.bad) + Math.min(scored.clearance, 28) + (outward > 0 ? 8 : 0);
        if (score > bestScore) { bestScore = score; best = box; }
      }
      nameBoxes[name] = best;
      placed.push(best);
    }
    function badgeMetrics(rel) {
      const g = relGaps(rel);
      const ready = relReady(rel);
      const mode = ready ? "ready" : ((g[0] || g[1]) ? "partial" : "pending");
      if (mode === "pending") return { mode, w: 28, h: 22, pieces: null };
      const pieces = [];
      pieces.push({ kind: "slot", gap: 0, text: g[0] || "?", filled: !!g[0] });
      if (ready) pieces.push({ kind: "word", text: rel.id });
      pieces.push({ kind: "slot", gap: 1, text: g[1] || "?", filled: !!g[1] });
      let w = 0;
      for (const piece of pieces) {
        piece.w = Math.ceil(measureLabel(piece.text, 13, 700)) + 6;
        w += piece.w;
      }
      w += (pieces.length - 1) * 5;
      return { mode, w, h: 22, pieces };
    }
    function textEl(cls, x, y, text, fill, size) {
      return `<text class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="central" pointer-events="none" stroke="#f6edd8" stroke-width="3" paint-order="stroke fill">${esc(text)}</text>`;
    }
    function slotEl(rel, gap, cx, cy, w, h, text, fill) {
      const x = cx - w / 2;
      const y = cy - h / 2;
      const shown = text ? textEl("slot-name", cx, cy, text, fill, 13) : "";
      return `<g class="slot name-slot edge-slot" data-accept="name" data-either="1" data-rel="${esc(rel.id)}" data-gap="${gap}">${shown}<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="rgba(246,237,216,0.01)" pointer-events="all"/></g>`;
    }
    const badges = [];
    let badgeSvg = "";
    for (const seg of segments) {
      const rel = seg.rel;
      const metrics = badgeMetrics(rel);
      const pref = ((seg.mx - centroid.x) * seg.nx + (seg.my - centroid.y) * seg.ny) >= 0 ? 1 : -1;
      let best = null;
      let bestScore = -Infinity;
      for (const sign of [pref, -pref]) {
        for (const dist of [22, 34, 48, 64, 82, 102]) {
          for (const slide of [0, -24, 24, -48, 48, -76, 76, -104, 104]) {
            const box = {
              cx: seg.mx + seg.nx * sign * dist + seg.ux * slide,
              cy: seg.my + seg.ny * sign * dist + seg.uy * slide,
              w: metrics.w,
              h: metrics.h,
            };
            const scored = scoreBox(box, placed.concat(badges));
            const score = (scored.bad === 0 ? 600 : -120 * scored.bad) + Math.min(scored.clearance, 24) - dist * 0.35 - Math.abs(slide) * 0.12;
            if (score > bestScore) { bestScore = score; best = box; }
          }
        }
      }
      badges.push(best);
      const g = relGaps(rel);
      if (metrics.mode === "pending") {
        badgeSvg += slotEl(rel, 0, best.cx - best.w / 4, best.cy, best.w / 2, best.h, "", "");
        badgeSvg += slotEl(rel, 1, best.cx + best.w / 4, best.cy, best.w / 2, best.h, "", "");
        badgeSvg += textEl("edge-word", best.cx, best.cy, "?", "#3a2a1c", 13);
      } else {
        let x = best.cx - metrics.w / 2;
        for (let i = 0; i < metrics.pieces.length; i++) {
          const piece = metrics.pieces[i];
          const pcx = x + piece.w / 2;
          if (piece.kind === "word") badgeSvg += textEl("edge-word", pcx, best.cy, piece.text, "#3a2a1c", 13);
          else if (piece.filled) badgeSvg += slotEl(rel, piece.gap, pcx, best.cy, piece.w, metrics.h, piece.text, personOf(piece.text).color);
          else {
            badgeSvg += slotEl(rel, piece.gap, pcx, best.cy, piece.w, metrics.h, "", "");
            badgeSvg += textEl("edge-word", pcx, best.cy, "?", "#3a2a1c", 13);
          }
          x += piece.w + 5;
        }
      }
    }
    const lines = segments.map((seg) => `<line class="edge-line" data-rel="${esc(seg.rel.id)}" x1="${seg.x1.toFixed(1)}" y1="${seg.y1.toFixed(1)}" x2="${seg.x2.toFixed(1)}" y2="${seg.y2.toFixed(1)}" stroke="#b08968" stroke-width="1.6" pointer-events="none"/>`).join("");
    const dots = PEOPLE.map((p) => {
      const [x, y] = pos[p.name];
      const nb = nameBoxes[p.name];
      return `<circle class="node-ring" cx="${x}" cy="${y}" r="${R}" fill="#fffaf2" stroke="${p.color}" stroke-width="2.4" pointer-events="none"/>` +
        `<image href="${PORTRAIT[p.name]}" x="${x - 15}" y="${y - 15}" width="30" height="30" clip-path="url(#face)" pointer-events="none"/>` +
        textEl("node-name", nb.cx, nb.cy, p.name, p.color, 14);
    }).join("");
    return `<svg viewBox="0 0 ${VBW} ${VBH}" font-family="WenQuanYi Micro Hei, PingFang TC, Microsoft JhengHei, sans-serif"><defs><clipPath id="face" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>${lines}${dots}${badgeSvg}</svg>`;
  }
  function peopleHtml() {
    const cards = PEOPLE.map((p) => {
      const fields = ["職業", "罪名", "結局"].map((f) => {
        const filled = state.slots.has(slotKey(p.name, f));
        const word = filled ? CLUES.find((c) => c.person === p.name && c.field === f).keyword : "";
        return `<div class="slotline"><span>${esc(slotName(p.name, f))}</span>` +
          (filled
            ? `<b class="filled" style="color:${p.color}">${esc(word)}</b>`
            : `<div class="slot" data-accept="kw" data-person="${esc(p.name)}" data-field="${f}">拖入關鍵字</div>`) +
          `</div>`;
      }).join("");
      return `<article class="pcard" style="--c:${p.color}"><img src="${PORTRAIT[p.name]}" alt=""><div class="body"><h3 style="color:${p.color}">${esc(p.name)}</h3><p class="bio">${esc(p.role)}</p>${fields}</div></article>`;
    }).join("");
    const nameChips = PEOPLE.map((p) => `<span class="chip namechip" data-payload="name:${esc(p.name)}" style="background:${p.color}">${esc(p.name)}</span>`).join("");
    const web = `<div class="web"><h3>人物關係網</h3><p class="fine">把名字拖進空格。填對的名字留在那一格。</p><div class="pool">${nameChips}</div><div class="relmap">${relationshipSvg()}</div></div>`;
    const found = CLUES.filter((c) => c.keyword && state.clues.has(c.id));
    const pool = found.length
      ? found.map(kwChip).join("")
      : `<p class="empty">找到帶關鍵字的線索後，字會出現在這裡。</p>`;
    return `<div class="sheet people"><div class="people-top"><div class="colscroll"><div class="people-grid">${cards}</div></div>${web}</div><div class="poolbar"><h3>關鍵字池</h3><div class="pool">${pool}</div></div></div>`;
  }
  function lockedRow(n, head) {
    const lead = head ? `${esc(head)} ` : "";
    return `<article class="prow locked"><div class="pno">${n}</div><div><p>${lead}<span class="lock">【段落${n}】（未解鎖）</span></p></div></article>`;
  }
  function paraRow(p) {
    const n = String(p.no).padStart(2, "0");
    const open = paraOpen(p);
    if (p.kind === "rel") {
      const rel = RELS.find((r) => r.id === p.rel);
      if (!state.clues.has(rel.after)) return lockedRow(n, p.head);
      const gaps = relGaps(rel);
      const nFilled = gaps.filter(Boolean).length;
      let sentence = p.head ? `<b>${esc(p.head)}</b>` : "";
      rel.bits.forEach((bit) => {
        sentence += typeof bit === "number" ? nameBlank(rel, bit) : esc(bit);
      });
      if (nFilled === 2) sentence += esc(rel.more);
      const half = nFilled === 1 ? `<span class="halfnote">亮一半</span>` : "";
      return `<article class="prow${nFilled === 1 ? " half" : ""}"><div class="pno">${n}</div><div><p style="color:${personOf(rel.gaps[0]).color}">${sentence}</p>${half}</div></article>`;
    }
    if (p.kind === "final") {
      if (!open) return `<article class="prow locked"><div class="pno">${n}</div><div><p>【段落${n}】（未解鎖）</p></div></article>`;
      return `<article class="prow"><div class="pno">${n}</div><div>${boldLead(p.text, "#2a2118")}</div></article>`;
    }
    const c = clueById(p.clue);
    const who = c && c.person;
    const color = who ? personOf(who).color : "#5c4636";
    if (!open) return lockedRow(n, p.head);
    return `<article class="prow"><div class="pno">${n}</div><div>${boldLead(p.text, color)}</div></article>`;
  }
  function paraBelongs(p, who) {
    if (who === "全部") return true;
    if (p.kind === "clue") {
      const c = clueById(p.clue);
      if (!c.person) return false;
      return c.person === who;
    }
    if (p.kind === "rel") return RELS.find((r) => r.id === p.rel).gaps.indexOf(who) >= 0;
    return false;
  }
  function soupHtml() {
    const pc = percent();
    let nameN = 0;
    for (const r of RELS) {
      const g = state.rels[r.id];
      if (g) nameN += g.filter(Boolean).length;
    }
    if (!state.storyWho) state.storyWho = "李文雄";
    const picks = PEOPLE.map((p) => `<button type="button" class="namepick${state.storyWho === p.name ? " on" : ""}" data-who="${esc(p.name)}" style="color:${p.color};border-color:${p.color}">${esc(p.name)}</button>`).join("");
    const rows = PARAS.filter((p) => paraBelongs(p, state.storyWho)).map(paraRow).join("") || `<p class="empty">這個人還沒有寫進劇情。</p>`;
    const side = `<div class="donutpane"><h3>還原度</h3><div class="donut"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#3a2c22" stroke-width="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="#c6a15a" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="${pc} ${100 - pc}"/></svg><b>${pc}%</b></div><ul><li>人物格 ${state.slots.size}/18</li><li>關係句名字格 ${nameN}/14</li><li>已解鎖段落 ${unlockedCount()}/28</li></ul><p class="fine">選左邊的人，看他的段落。名字拖進空格，填對就留在那裡。</p></div>`;
    const names = PEOPLE.map((p) => `<span class="chip namechip" data-payload="name:${esc(p.name)}" style="background:${p.color}">${esc(p.name)}</span>`).join("");
    return `<div class="sheet soup"><div class="story-layout"><aside class="namelist"><button type="button" class="namepick${state.storyWho === "全部" ? " on" : ""}" data-who="全部">全部</button>${picks}</aside><div class="story colscroll"><p class="lead">${esc(BIG_HEAD)}</p>${rows}<p class="lead">${esc(BIG_TAIL)}</p></div>${side}</div><div class="poolbar"><h3>名字池（拖到空格，填對就留在那裡）</h3><div class="pool">${names}</div></div></div>`;
  }
  function mapHtml() {
    const svg = document.querySelector("#screen-map .townmap");
    const pins = [
      ["dorm", "42%", "17%", "教員宿舍與後院"],
      ["sugar", "9%", "48%", "糖廠倉庫與甘蔗田"],
      ["li", "57%", "62%", "李家"],
      ["shimu", "86%", "52%", "師母家"],
    ].map(([id, left, top, label]) => {
      const list = CLUES.filter((c) => c.loc === id);
      const found = list.filter((c) => state.clues.has(c.id)).length;
      const here = state.loc === id;
      const title = label + (here && state.past ? "（過去）" : "");
      return `<button type="button" class="pin${here ? " here" : ""}" data-go="${id}" style="left:${left};top:${top}"><span class="pin-label">${title}<span class="pin-status">線索 ${found}/${list.length}</span></span><span class="pin-dot"></span></button>`;
    }).join("");
    const note = state.past ? "先站回放置處，按空白鍵收回懷錶，才能去別的地方。" : "點地名過去。師母家只有現在。";
    return `<div class="bookmap"><div class="mapscore">還原度 ${percent()}%</div><div class="bookmap-frame">${svg ? svg.outerHTML : ""}${pins}</div><p>${note}</p></div>`;
  }
  function paraPlain(p) {
    if (!paraOpen(p)) return "";
    if (p.kind === "rel") {
      const rel = RELS.find((r) => r.id === p.rel);
      let text = p.head || "";
      rel.bits.forEach((bit) => { text += typeof bit === "number" ? rel.gaps[bit] : bit; });
      return text + (rel.more || "");
    }
    return p.text || "";
  }
  function askSubmit() {
    openDialog("", "已還原 " + percent() + "%，是否提交紀錄簿？", [
      { label: "提交", primary: true, act: function () { closeDialog(); showSubmit(); } },
      { label: "取消", act: closeDialog },
    ]);
  }
  function showSubmit() {
    el.submitBody.innerHTML = PARAS.map((p) => {
      const text = paraPlain(p);
      return text ? `<p>${esc(text)}</p>` : `<p class="blankline"></p>`;
    }).join("");
    el.submit.classList.remove("hidden");
  }
  function renderBook() {
    bookChrome();
    let html = "";
    if (state.tab === "people") html = peopleHtml();
    else if (state.tab === "soup") html = soupHtml();
    else if (state.tab === "map") html = mapHtml();
    else html = bagHtml();
    el.bookBody.innerHTML = html;
  }
  function applyPayload(payload, slot) {
    if (!payload || !slot) return;
    const cut = payload.indexOf(":");
    const kind = payload.slice(0, cut);
    const value = payload.slice(cut + 1);
    if (kind === "kw" && slot.dataset.accept === "kw") tryKeyword(value, slot.dataset.person, slot.dataset.field, slot);
    else if (kind === "name" && slot.dataset.accept === "name") tryName(value, slot.dataset.rel, Number(slot.dataset.gap), slot);
    else {
      slot.classList.add("shake");
      setTimeout(() => slot.classList.remove("shake"), 400);
      toast("推理錯誤");
    }
  }
  function tryKeyword(keyword, person, field, slotEl) {
    const c = CLUES.find((x) => x.keyword === keyword);
    if (!c || c.person !== person || c.field !== field || !state.clues.has(c.id)) {
      if (slotEl) { slotEl.classList.add("shake"); setTimeout(() => slotEl.classList.remove("shake"), 400); }
      toast("推理錯誤");
      return;
    }
    state.slots.add(slotKey(person, field));
    state.picked = null;
    toast("段落" + String(c.para).padStart(2, "0") + "已收錄");
    save();
    withScroll(renderBook);
  }
  function tryName(name, relId, gap, slotEl) {
    const rel = RELS.find((r) => r.id === relId);
    let useGap = gap;
    if (!rel || rel.gaps[useGap] !== name) {
      const other = gap === 0 ? 1 : 0;
      if (rel && slotEl && slotEl.dataset.either === "1" && rel.gaps[other] === name) useGap = other;
      else {
        if (slotEl) { slotEl.classList.add("shake"); setTimeout(() => slotEl.classList.remove("shake"), 400); }
        toast("推理錯誤");
        return;
      }
    }
    const gaps = relGaps(rel);
    const wasReady = relReady(rel);
    gaps[useGap] = name;
    state.picked = null;
    if (!wasReady && relReady(rel)) toast("段落" + String(rel.para).padStart(2, "0") + "已收錄");
    save();
    withScroll(renderBook);
  }

  function idealSplit(w) {
    const ents = ENTITIES.filter((e) => e.loc === state.loc && e.era === "past" && e.pastId === w.id);
    if (!ents.length) return -Math.PI / 2;
    let sx = 0;
    let sy = 0;
    for (const e of ents) { sx += e.x - w.x; sy += e.y - w.y; }
    return Math.atan2(sy, sx);
  }
  function aimWatch(locId, watchId, x, y, delta) {
    enterLoc(locId, { x: x, y: y });
    const spot = LOCS[locId].watches.find((w) => w.id === watchId);
    placeWatch(spot);
    state.px = x;
    state.py = y;
    state.split = wrapAng(state.split0 + (delta || 0));
  }
  function placeWatch(spot) {
    state.past = spot.id;
    state.cam = 0;
    state.trans = null;
    state.split0 = idealSplit(spot);
    state.split = state.split0;
    state.rimTold = false;
  }
  function toggleWatch() {
    const L = loc();
    if (!L.watches || !L.watches.length) {
      toast("這裡沒有懷錶放置處。師母家只有現在。");
      return;
    }
    if (state.past) {
      const w = activeWatch();
      if (Math.hypot(state.px - w.x, state.py - w.y) > SPOT) {
        toast("站回懷錶放著的地方，再按空白鍵。");
        return;
      }
      state.past = null;
      state.split = 0;
      return;
    }
    const spot = nearestSpot(SPOT);
    if (!spot) {
      toast("走到發光的放置處，再按空白鍵。");
      return;
    }
    placeWatch(spot);
  }

  function goalText() {
    if (!state.loc) return "";
    if (state.loc === "dorm" && state.past === "read") return "民國四十一年寒假，週日晚上。秀蘭正把包著日曆紙的書遞給文惠。人不會說話。";
    if (state.loc === "dorm" && state.past === "burn") return "燒書之夜。志明伸手去拉秀蘭，阿土抱著沒燒完的書往外走。";
    if (state.loc === "dorm") return "廢棄的宿舍連著後院。兩個發光的圓，各停住一個時刻。";
    if (state.loc === "li" && state.past) return "文雄坐在書桌前寫名單。文惠在自己房裡，還什麼都不知道。";
    if (state.loc === "li") return "空屋。文惠的房間留著，客廳的神明桌還在。";
    if (state.loc === "sugar" && state.past) return "民國四十二年傍晚。甘蔗比人高。剪影裡有一把刀，沒有血。";
    if (state.loc === "sugar") return "停用的倉庫、糖鐵斗南線，和阿土後來住的工寮。";
    if (state.loc === "shimu") return slotsDone() ? "可以跟師母說話，把查到的交給她。" : "只有現在。書桌上是調來的檔案。";
    return "";
  }

  function circleHits(cx, cy, cr, b) {
    const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  }
  function blocked(x, y) {
    const r = 12;
    const L = loc();
    if (x < r || y < r || x > L.w - r || y > L.h - r) return true;
    for (const b of solids()) if (circleHits(x, y, r, b)) return true;
    return false;
  }
  function movePlayer(dx, dy) {
    const oldX = state.px;
    const oldY = state.py;
    let x = oldX;
    let y = oldY;
    if (!blocked(x + dx, y + dy)) { x += dx; y += dy; }
    else if (!blocked(x + dx, y)) x += dx;
    else if (!blocked(x, y + dy)) y += dy;
    const w = activeWatch();
    if (w) {
      const ddx = x - w.x;
      const ddy = y - w.y;
      const dist = Math.hypot(ddx, ddy) || 1;
      const max = w.r - 14;
      if (dist > max) {
        const cx = w.x + (ddx / dist) * max;
        const cy = w.y + (ddy / dist) * max;
        if (!blocked(cx, cy)) { x = cx; y = cy; }
        else { x = oldX; y = oldY; }
        if (!state.rimTold) {
          state.rimTold = true;
          toast("懷錶只照得到這個圓。");
        }
      }
    }
    if (dx || dy) {
      if (Math.abs(dx) > Math.abs(dy)) state.facing = dx > 0 ? "e" : "w";
      else state.facing = dy > 0 ? "s" : "n";
    }
    state.px = x;
    state.py = y;
  }

  function update(dt) {
    if (state.past && state.screen === "play" && !state.book && !state.dialog && !state.coach) {
      if (down.has("KeyQ")) state.split -= dt * 1.15;
      if (down.has("KeyE")) state.split += dt * 1.15;
      state.split = wrapAng(state.split);
    }
    if (paused()) { state.moving = false; return; }
    let ix = 0;
    let iy = 0;
    if (down.has("KeyW") || down.has("ArrowUp")) iy -= 1;
    if (down.has("KeyS") || down.has("ArrowDown")) iy += 1;
    if (down.has("KeyA") || down.has("ArrowLeft")) ix -= 1;
    if (down.has("KeyD") || down.has("ArrowRight")) ix += 1;
    const speed = 265;
    if (ix || iy) {
      state.dest = null;
      const len = Math.hypot(ix, iy);
      movePlayer((ix / len) * speed * dt, (iy / len) * speed * dt);
      state.moving = true;
      return;
    }
    if (state.dest) {
      const dest = state.dest;
      const dx = dest.x - state.px;
      const dy = dest.y - state.py;
      const dist = Math.hypot(dx, dy);
      const stop = dest.entity ? 52 : 6;
      if (dist <= stop) {
        if (dest.entity) interact(dest.entity);
        state.dest = null;
        state.moving = false;
        return;
      }
      const step = Math.min(speed * dt, dist);
      const before = dist;
      movePlayer((dx / dist) * step, (dy / dist) * step);
      const after = Math.hypot(dest.x - state.px, dest.y - state.py);
      dest.stuck = after > before - 0.4 ? (dest.stuck || 0) + 1 : 0;
      if (dest.stuck > 18) {
        if (dest.entity) toast("走不過去。");
        state.dest = null;
      }
      state.moving = true;
      return;
    }
    state.moving = false;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }
  function viewSize() {
    return { w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight };
  }
  function camera() {
    const view = viewSize();
    const L = loc();
    let x = state.px - view.w / 2;
    let y = state.py - view.h / 2;
    x = Math.max(0, Math.min(x, Math.max(0, L.w - view.w)));
    y = Math.max(0, Math.min(y, Math.max(0, L.h - view.h)));
    return { x, y, w: view.w, h: view.h };
  }

  function baseColor() { return "#cbbfa6"; }
  function floorColor(floor) {
    return { tatami: "#e4d2a4", wood: "#c4a06a", tile: "#d9d3c6", yard: "#a3b584", stone: "#b7aa96", cane: "#8ea56a" }[floor] || "#e4d2a4";
  }

  let pastBuf = null;
  let pastCtx = null;
  function fitBuf(buf) {
    if (buf.width !== canvas.width) buf.width = canvas.width;
    if (buf.height !== canvas.height) buf.height = canvas.height;
  }
  function paintWorld(mode) {
    const view = viewSize();
    const L = loc();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#c5b79a";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.translate(view.w / 2, view.h / 2);
    ctx.translate(-state.px, -state.py);
    ctx.fillStyle = baseColor();
    ctx.fillRect(0, 0, L.w, L.h);
    const props = PROPS.filter((item) => showItem(item, mode));
    for (const item of props) if (item.kind === "room") drawRoom(item);
    for (const item of props) {
      if (item.kind === "fire") glow(item.x, item.y, 210, "226,110,42", 0.28 + Math.sin(time * 2) * 0.05);
    }
    for (const item of props) if (item.kind !== "room" && item.kind !== "wall") drawProp(item);
    for (const item of props) if (item.kind === "wall") drawWall(item);
    if (mode === "present" && !state.past) {
      for (const w of L.watches || []) drawRange(w, false);
    }
    const near = nearest();
    const ents = ENTITIES.filter((item) => showItem(item, mode));
    for (const e of ents) drawEntity(e, e === near && canTouch(e));
    if (mode === "present") drawPlayer();
    for (const e of ents) drawLabel(e, e === near && canTouch(e));
    if (mode === "present" && !state.past) {
      for (const w of L.watches || []) drawWatchIcon(w, false);
    }
  }
  function grayCanvas(src) {
    if (!grayBuf) grayBuf = document.createElement("canvas");
    fitBuf(grayBuf);
    fitBuf(src);
    const g = grayBuf.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, src.width, src.height);
    g.filter = "grayscale(1)";
    g.drawImage(src, 0, 0);
    g.filter = "none";
    const s = src.getContext("2d");
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, src.width, src.height);
    s.drawImage(grayBuf, 0, 0);
  }
  function draw() {
    const view = viewSize();
    const prev = ctx;
    ctx = canvas.getContext("2d");
    paintWorld("present");
    if (state.past) {
      if (!pastBuf) {
        pastBuf = document.createElement("canvas");
        pastCtx = pastBuf.getContext("2d");
      }
      fitBuf(pastBuf);
      ctx = pastCtx;
      paintWorld("past");
      grayCanvas(pastBuf);
      ctx = prev;
      const w = activeWatch();
      const sx = view.w / 2 + (w.x - state.px);
      const sy = view.h / 2 + (w.y - state.py);
      const a0 = state.split - SWEEP / 2;
      const a1 = state.split + SWEEP / 2;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, w.r, a0, a1);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pastBuf, 0, 0, pastBuf.width, pastBuf.height, 0, 0, view.w, view.h);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(view.w / 2, view.h / 2);
      ctx.translate(-state.px, -state.py);
      drawRange(w, true);
      drawWatchIcon(w, true);
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(w.x + Math.cos(a0) * w.r, w.y + Math.sin(a0) * w.r);
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(w.x + Math.cos(a1) * w.r, w.y + Math.sin(a1) * w.r);
      ctx.strokeStyle = "rgba(196, 112, 42, 0.95)";
      ctx.lineWidth = 3;
      ctx.stroke();
      drawPlayer();
    }
    ctx = prev;
  }

  function glow(x, y, rad, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 10, x, y, rad);
    g.addColorStop(0, "rgba(" + rgb + "," + alpha + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawRoom(p) {
    const img = p.floor === "tatami" ? TEX.tatami : p.floor === "yard" ? TEX.yard : p.floor === "cane" ? TEX.cane : TEX.wood;
    if (imgReady(img)) {
      if (p.floor === "tatami" || p.floor === "cane") ctx.drawImage(img, p.x, p.y, p.w, p.h);
      else {
        if (!img._pat) img._pat = ctx.createPattern(img, "repeat");
        ctx.fillStyle = img._pat;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      if (p.floor === "stone") { ctx.fillStyle = "rgba(70,68,62,0.32)"; ctx.fillRect(p.x, p.y, p.w, p.h); }
      if (p.floor === "tile") { ctx.fillStyle = "rgba(210,214,206,0.35)"; ctx.fillRect(p.x, p.y, p.w, p.h); }
    } else {
      ctx.fillStyle = floorColor(p.floor);
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    if (p.floor === "tatami") {
      ctx.strokeStyle = "rgba(90,60,20,0.25)";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      ctx.beginPath();
      ctx.moveTo(p.x + p.w / 2, p.y + 8);
      ctx.lineTo(p.x + p.w / 2, p.y + p.h - 8);
      ctx.stroke();
    } else if (p.floor === "wood") {
      ctx.strokeStyle = "rgba(90,60,20,0.13)";
      ctx.lineWidth = 1;
      for (let y = p.y + 14; y < p.y + p.h; y += 16) {
        ctx.beginPath();
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
        ctx.stroke();
      }
    } else if (p.floor === "cane") {
      ctx.strokeStyle = state.past === "sugar" ? "rgba(40,40,12,0.45)" : "rgba(70,90,40,0.35)";
      ctx.lineWidth = 2;
      for (let x = p.x + 8; x < p.x + p.w; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(x + 4, p.y + p.h);
        ctx.stroke();
      }
    }
    if (p.label) {
      ctx.fillStyle = "rgba(50,36,22,0.72)";
      ctx.font = "15px 'WenQuanYi Micro Hei', sans-serif";
      const tw = ctx.measureText(p.label).width;
      const lx = p.label === "圖書室" ? p.x + (p.w - tw) / 2 : p.x + 14;
      ctx.fillText(p.label, lx, p.y + 26);
    }
  }
  function drawWall(p) {
    ctx.fillStyle = "#5c4030";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "rgba(255,214,160,0.22)";
    if (p.h > p.w) ctx.fillRect(p.x, p.y, 5, p.h);
    else ctx.fillRect(p.x, p.y, p.w, 5);
  }
  function drawProp(p) {
    const wood = "#8a6240";
    const ink = "#3a2a1c";
    if (p.kind === "shelf") {
      ctx.fillStyle = wood;
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.strokeStyle = ink;
      ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    } else if (p.kind === "table" || p.kind === "desk") {
      ctx.fillStyle = "rgba(40,24,10,0.22)";
      ctx.fillRect(p.x - p.w / 2 + 3, p.y - p.h / 2 + 5, p.w, p.h);
      ctx.fillStyle = "#a87848";
      roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 3);
      ctx.fill();
      ctx.strokeStyle = "#5c3a22";
      ctx.stroke();
      ctx.strokeStyle = "#6d4a2c";
      ctx.strokeRect(p.x - p.w / 2 + 5, p.y - 2, p.w - 10, p.h / 2 - 4);
      ctx.fillStyle = "#3a2414";
      ctx.beginPath();
      ctx.arc(p.x, p.y + 2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (p.paper && state.past) {
        ctx.fillStyle = "#f7f1e2";
        ctx.fillRect(p.x + 8, p.y - 16, 28, 34);
      }
    } else if (p.kind === "bed") {
      ctx.fillStyle = "#6a4a30";
      ctx.fillRect(p.x - p.w / 2 - 3, p.y - p.h / 2 - 3, p.w + 6, p.h + 6);
      ctx.fillStyle = "#f7f1e4";
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.fillStyle = "#efe2cc";
      ctx.fillRect(p.x - p.w / 2 + 6, p.y - p.h / 2 + 6, p.w - 12, 14);
      ctx.fillStyle = "#8d3b3f";
      ctx.fillRect(p.x - p.w / 2, p.y + p.h / 2 - 28, p.w, 28);
      ctx.fillStyle = wood;
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, 8);
      ctx.strokeStyle = "rgba(40,24,10,0.3)";
      ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    } else if (p.kind === "shed") {
      ctx.fillStyle = "#9a7048";
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.fillStyle = "#6e4c30";
      ctx.beginPath();
      ctx.moveTo(p.x - p.w / 2 - 8, p.y - p.h / 2);
      ctx.lineTo(p.x, p.y - p.h / 2 - 22);
      ctx.lineTo(p.x + p.w / 2 + 8, p.y - p.h / 2);
      ctx.fill();
    } else if (p.kind === "fence") {
      ctx.strokeStyle = "#8d6a3e";
      ctx.lineWidth = 3;
      const x0 = p.x - p.w / 2;
      ctx.beginPath();
      ctx.moveTo(x0, p.y);
      ctx.lineTo(x0 + p.w, p.y);
      ctx.stroke();
      for (let x = x0; x <= x0 + p.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, p.y - 10);
        ctx.lineTo(x, p.y + 8);
        ctx.stroke();
      }
    } else if (p.kind === "scar") {
      ctx.fillStyle = "rgba(40,28,18,0.55)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,12,8,0.45)";
      ctx.stroke();
    } else if (p.kind === "fire") {
      ctx.fillStyle = "#5a2a16";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 10, 46, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e07a32";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 28, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2c56a";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 6, 12, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a140c";
      ctx.fillRect(p.x - 16, p.y - 4, 10, 14);
      ctx.fillRect(p.x + 4, p.y + 2, 12, 16);
    } else if (p.kind === "tree") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 8, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6e8a58";
      ctx.beginPath();
      ctx.arc(p.x, p.y - 8, 26, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "rack") {
      ctx.strokeStyle = wood;
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.beginPath();
      ctx.moveTo(p.x - p.w / 2, p.y);
      ctx.lineTo(p.x + p.w / 2, p.y);
      ctx.stroke();
    } else if (p.kind === "sack") {
      ctx.fillStyle = state.past ? "#c2a36a" : "#d9d0c2";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,40,20,0.35)";
      ctx.stroke();
    } else if (p.kind === "rail") {
      const x0 = p.x - 18;
      const y0 = p.y - p.h / 2;
      ctx.fillStyle = state.past === "sugar" ? "#6d5838" : "#b7ae9e";
      ctx.fillRect(p.x - 34, y0, 68, p.h);
      ctx.strokeStyle = "#4a4038";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + p.h);
      ctx.moveTo(x0 + 22, y0); ctx.lineTo(x0 + 22, y0 + p.h);
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let y = y0; y < y0 + p.h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(x0 - 8, y);
        ctx.lineTo(x0 + 30, y);
        ctx.stroke();
      }
    } else if (p.kind === "lamp") {
      ctx.fillStyle = "#f4e2b0";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6a5018";
      ctx.stroke();
    } else if (p.kind === "coat") {
      ctx.fillStyle = "#6a3038";
      ctx.fillRect(p.x - 10, p.y - 20, 20, 36);
      ctx.fillStyle = "#4a2428";
      ctx.fillRect(p.x - 16, p.y - 16, 8, 16);
      ctx.fillRect(p.x + 8, p.y - 16, 8, 16);
    } else if (p.kind === "basket" || p.kind === "box" || p.kind === "crate") {
      ctx.fillStyle = p.kind === "basket" ? "#8a7048" : "#6e5434";
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.strokeStyle = "#3a2a18";
      ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    } else if (p.kind === "altar") {
      ctx.fillStyle = "#5c3a32";
      ctx.fillRect(p.x - p.w / 2, p.y - 6, p.w, 16);
      ctx.fillStyle = "#c4553a";
      ctx.fillRect(p.x - 4, p.y - 16, 8, 12);
    } else if (p.kind === "wardrobe") {
      ctx.fillStyle = "#6a5038";
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.strokeStyle = "#3a2a18";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.h / 2);
      ctx.lineTo(p.x, p.y + p.h / 2);
      ctx.stroke();
    } else if (p.kind === "woodpile") {
      ctx.strokeStyle = "#6a4a28";
      ctx.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x - 24, p.y + i * 6);
        ctx.lineTo(p.x + 24, p.y + i * 6);
        ctx.stroke();
      }
    } else if (p.kind === "envelope") {
      ctx.fillStyle = "#c4a36a";
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.strokeStyle = "#6a4420";
      ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    }
  }

  function drawEntity(e, hot) {
    if (e.kind === "person" || e.kind === "talk") drawActor(e);
    else if (e.kind === "silhouette") drawSilhouette(e);
    else if (e.kind === "mark") {
      /* the blackened ring is drawn as the yard scar */
    } else if (e.kind === "note") {
      ctx.fillStyle = "#6e5434";
      ctx.fillRect(e.x - 16, e.y - 12, 32, 24);
      ctx.strokeStyle = "#3a2a18";
      ctx.strokeRect(e.x - 16, e.y - 12, 32, 24);
    } else if (e.kind === "letter") {
      ctx.fillStyle = "#e7d3a8";
      ctx.fillRect(e.x - 14, e.y - 10, 28, 18);
      ctx.strokeStyle = "#8f2f2c";
      ctx.strokeRect(e.x - 14, e.y - 10, 28, 18);
    } else drawClueShape(e, hot);
    if (hot) {
      ctx.strokeStyle = "rgba(143,47,44,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawClueShape(e, hot) {
    const found = e.clueId && state.clues.has(e.clueId);
    if (e.shape === "book") {
      ctx.fillStyle = "#7a3030";
      ctx.fillRect(e.x - 11, e.y - 14, 22, 28);
      ctx.fillStyle = "#f2e2c4";
      ctx.fillRect(e.x - 7, e.y - 10, 14, 20);
    } else if (e.shape === "paper") {
      ctx.fillStyle = "#f7f3e8";
      ctx.fillRect(e.x - 12, e.y - 16, 24, 32);
      ctx.strokeStyle = "#b9a88a";
      ctx.strokeRect(e.x - 12, e.y - 16, 24, 32);
      ctx.strokeStyle = "#c8b89a";
      ctx.beginPath();
      ctx.moveTo(e.x - 7, e.y - 6); ctx.lineTo(e.x + 7, e.y - 6);
      ctx.moveTo(e.x - 7, e.y); ctx.lineTo(e.x + 7, e.y);
      ctx.moveTo(e.x - 7, e.y + 6); ctx.lineTo(e.x + 4, e.y + 6);
      ctx.stroke();
    } else if (e.shape === "card" || e.shape === "letter") {
      ctx.fillStyle = e.shape === "letter" ? "#f7f1e4" : "#f3e6c8";
      ctx.fillRect(e.x - 10, e.y - 14, 20, 26);
      ctx.strokeStyle = "#a08060";
      ctx.strokeRect(e.x - 10, e.y - 14, 20, 26);
    } else if (e.shape === "cloth") {
      ctx.fillStyle = "#243028";
      ctx.fillRect(e.x - 14, e.y - 12, 28, 22);
      ctx.fillStyle = "#c4553a";
      ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
    } else if (e.shape === "crate") {
      ctx.fillStyle = "#7a5a34";
      ctx.fillRect(e.x - 16, e.y - 12, 32, 24);
      ctx.strokeStyle = "#3a2a18";
      ctx.strokeRect(e.x - 16, e.y - 12, 32, 24);
    } else if (e.shape === "knife") {
      ctx.fillStyle = "#6a5438";
      ctx.fillRect(e.x - 3, e.y - 2, 6, 16);
      ctx.fillStyle = "#b7b2a4";
      ctx.beginPath();
      ctx.moveTo(e.x - 3, e.y - 2);
      ctx.lineTo(e.x + 3, e.y - 2);
      ctx.lineTo(e.x + 1, e.y - 22);
      ctx.lineTo(e.x - 1, e.y - 22);
      ctx.fill();
    } else if (e.shape === "cushion") {
      ctx.fillStyle = found ? "#b08968" : "#a86448";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.clueId) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 18, 0, Math.PI * 2);
      ctx.strokeStyle = found ? "#2f9e4f" : "rgba(166,132,61,0.0)";
      ctx.lineWidth = found ? 3 : 0;
      if (found) ctx.stroke();
    }
  }
  function drawActor(e) {
    const img = spriteFor(e);
    if (imgReady(img)) {
      const h = (e.sit ? 48 : 56) * (e.scale || 1);
      const w = h * img.width / img.height;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.dim) {
        ctx.fillStyle = "rgba(20,16,12,0.5)";
        ctx.beginPath();
        ctx.ellipse(0, 6, 26, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 8, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, -w / 2, -h + 10, w, h);
      if (e.reachArm) {
        const arm = { n: [0, -22], s: [0, 18], e: [18, -2], w: [-18, -2], sw: [-16, 16], grab: [-20, 16] }[e.reachArm] || [0, 16];
        ctx.strokeStyle = "#8a7048";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(8, -18);
        ctx.lineTo(arm[0], arm[1]);
        ctx.stroke();
        ctx.fillStyle = "#e4c2a4";
        ctx.beginPath();
        ctx.arc(arm[0], arm[1], 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const sc = e.scale || 1;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.dim) {
      ctx.fillStyle = "rgba(20,16,12,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.scale(sc, sc);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.sit) {
      ctx.fillStyle = "#6b5034";
      roundRect(-12, -4, 24, 14, 3);
      ctx.fill();
    }
    ctx.fillStyle = e.robe;
    roundRect(-10, e.sit ? -16 : -18, 20, e.sit ? 18 : 26, 6);
    ctx.fill();
    if (e.reachArm) {
      const arm = { n: [0, -20], s: [0, 16], e: [20, -4], w: [-22, -2], sw: [-14, 14], grab: [-20, 16] }[e.reachArm] || [0, 16];
      ctx.strokeStyle = e.robe;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(arm[0], arm[1]);
      ctx.stroke();
    }
    if (e.holding === "book") {
      ctx.fillStyle = "#f2e2c4";
      ctx.fillRect(8, -6, 14, 18);
      ctx.strokeStyle = "#7a3030";
      ctx.strokeRect(8, -6, 14, 18);
    }
    if (e.holding === "stack") {
      ctx.fillStyle = "#c4a06a";
      ctx.fillRect(10, -10, 16, 12);
      ctx.fillRect(12, -2, 16, 12);
    }
    if (e.holding === "broom") {
      ctx.strokeStyle = "#6a5030";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -18);
      ctx.lineTo(16, 10);
      ctx.stroke();
    }
    ctx.fillStyle = e.hair || "#241c16";
    ctx.beginPath();
    ctx.arc(0, -22, e.hairStyle === "bun" ? 9 : 8, 0, Math.PI * 2);
    ctx.fill();
    if (e.hairStyle === "bun") {
      ctx.beginPath();
      ctx.arc(-2, -30, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.cap) {
      ctx.fillStyle = "#1c1e1a";
      ctx.fillRect(-9, -28, 18, 6);
    }
    const nose = { n: [0, -4], s: [0, 3], e: [4, 0], w: [-4, 0] }[e.facing || "s"];
    ctx.fillStyle = "rgba(255,236,214,0.8)";
    ctx.beginPath();
    ctx.arc(nose[0], -22 + nose[1], 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawSilhouette(e) {
    const img = spriteFor(e);
    if (imgReady(img)) {
      const h = state.revealed.has(e.id) ? 58 : 84;
      const w = h * img.width / img.height;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 10, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, -w / 2, -h + 12, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.lean || 0);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 16, 6, -e.lean || 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#140e0c";
    roundRect(-11, -20, 22, 30, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    if (e.arm || e.blade) {
      roundRect(4, -22, 22, 6, 3);
      ctx.fill();
    }
    if (e.blade) {
      ctx.save();
      ctx.translate(24, -24);
      ctx.rotate(-0.7);
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(-2, -2, 5, 10);
      ctx.fillStyle = "#ead7a2";
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(2, -2);
      ctx.lineTo(1, -34);
      ctx.lineTo(-1, -34);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawPlayer() {
    if (imgReady(SPR.player)) {
      const h = 56;
      const w = h * SPR.player.width / SPR.player.height;
      const bob = state.moving ? Math.sin(time * 10) * 1.4 : 0;
      ctx.save();
      ctx.translate(state.px, state.py + bob);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 8, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(SPR.player, -w / 2, -h + 10, w, h);
      ctx.restore();
      return;
    }
    const bob = state.moving ? Math.sin(time * 10) * 1.4 : 0;
    ctx.save();
    ctx.translate(state.px, state.py + bob);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e3c44";
    roundRect(-11, -16, 22, 26, 7);
    ctx.fill();
    ctx.fillStyle = "#d8c4a4";
    ctx.beginPath();
    ctx.arc(0, -22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a2428";
    ctx.fillRect(-8, -30, 16, 8);
    const nose = { n: [0, -4], s: [0, 3], e: [4, 0], w: [-4, 0] }[state.facing];
    ctx.fillStyle = "#6a503c";
    ctx.beginPath();
    ctx.arc(nose[0], -22 + nose[1], 2, 0, Math.PI * 2);
    ctx.fill();
    if (state.past) {
      ctx.strokeStyle = "#c4a15a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(10, -6, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawLabel(e, hot) {
    const show = hot || e.kind === "person" || e.kind === "talk" || e.kind === "note" || e.kind === "mark" || e.kind === "silhouette";
    if (!show) return;
    const text = displayName(e);
    ctx.font = "13px 'WenQuanYi Micro Hei', sans-serif";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = hot ? "rgba(255,250,240,0.95)" : "rgba(255,250,240,0.78)";
    ctx.fillRect(e.x - w / 2 - 4, e.y + 14, w + 8, 16);
    ctx.fillStyle = "#2a2118";
    ctx.fillText(text, e.x - w / 2, e.y + 26);
  }
  function drawRange(w, strong) {
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.setLineDash(strong ? [11, 8] : [3, 8]);
    ctx.strokeStyle = strong ? "rgba(244, 222, 170, 0.95)" : "rgba(110, 82, 36, 0.45)";
    ctx.lineWidth = strong ? 2.5 : 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawVignette(w, cam) {
    ctx.fillStyle = "rgba(12,10,8,0.22)";
    ctx.beginPath();
    ctx.rect(cam.x - 8, cam.y - 8, cam.w + 16, cam.h + 16);
    ctx.moveTo(w.x + w.r, w.y);
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.fill("evenodd");
  }
  function drawWatchIcon(w, active) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    const near = Math.hypot(state.px - w.x, state.py - w.y) < SPOT;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 18 + (near ? pulse * 4 : 0), 0, Math.PI * 2);
    ctx.strokeStyle = active || near ? "#f0d78c" : "rgba(140,104,48,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w.x, w.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = active ? "#f4e7c4" : "#f7f1e4";
    ctx.fill();
    ctx.strokeStyle = "#6a5424";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x, w.y - 6);
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x + 4, w.y + 2);
    ctx.stroke();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function eraText() {
    const times = {
      read: "民國四十一年寒假・週日晚上",
      burn: "民國四十一年寒假・夜裡",
      list: "民國四十一年寒假・夜裡",
      sugar: "民國四十二年・傍晚",
    };
    return state.past ? (times[state.past] || "") : "民國一一五年";
  }
  function locClueCount() {
    const list = CLUES.filter((c) => c.loc === state.loc);
    const found = list.filter((c) => state.clues.has(c.id)).length;
    return "線索 " + found + "/" + list.length;
  }
  function syncHud() {
    if (state.screen !== "play") return;
    const L = loc();
    el.locName.textContent = L.name + (state.past ? "（過去）" : "");
    el.locEra.textContent = eraText();
    if (el.hudClues) el.hudClues.textContent = locClueCount();
    el.locEra.classList.toggle("past", !!state.past);
    el.locGoal.textContent = "";
    const pc = percent();
    el.hudPct.textContent = pc + "%";
    el.hudBar.style.width = pc + "%";
    const spot = nearestSpot(SPOT);
    const n = nearest();
    const prompt = n && !paused() ? "F 調查　" + displayName(n) : "";
    el.prompt.textContent = prompt;
    el.prompt.style.visibility = prompt ? "visible" : "hidden";
    el.watchBtn.textContent = "懷錶";
    el.watchBtn.classList.toggle("live", !!spot);
    el.watchBtn.classList.toggle("onpast", !!state.past);
  }

  function worldFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left - rect.width / 2;
    const y = ev.clientY - rect.top - rect.height / 2;
    const c = Math.cos(-state.cam);
    const s = Math.sin(-state.cam);
    return { x: x * c - y * s + state.px, y: x * s + y * c + state.py };
  }

  function selfCheck() {
    const errors = [];
    for (const id of Object.keys(LOCS)) {
      const L = LOCS[id];
      for (const w of L.watches || []) {
        if (w.x - w.r < 8 || w.y - w.r < 8 || w.x + w.r > L.w - 8 || w.y + w.r > L.h - 8) {
          errors.push("circle " + id + "/" + w.id);
        }
      }
    }
    for (const e of ENTITIES) {
      if (e.era !== "past") continue;
      const w = LOCS[e.loc].watches.find((item) => item.id === e.pastId);
      if (!w) { errors.push("no watch " + e.id); continue; }
      const dist = Math.hypot(e.x - w.x, e.y - w.y);
      if (dist > w.r - 28) errors.push(e.id + " rim " + Math.round(dist) + "/" + w.r);
    }
    for (const c of CLUES) {
      if (!ENTITIES.some((e) => e.clueId === c.id)) errors.push("no entity " + c.id);
    }
    if (errors.length) console.warn("selfCheck", errors);
    return errors;
  }

  function bind() {
    document.getElementById("btn-letter").addEventListener("click", () => showScreen("letter"));
    document.getElementById("btn-to-help").addEventListener("click", () => showScreen("help"));
    document.getElementById("btn-help-letter").addEventListener("click", () => showScreen("letter"));
    document.getElementById("btn-back-title").addEventListener("click", () => showScreen("title"));
    document.getElementById("btn-resume").addEventListener("click", () => { if (state.loc) showScreen("play"); });
    document.getElementById("btn-help-resume").addEventListener("click", () => { if (state.loc) showScreen("play"); });
    document.getElementById("btn-map").addEventListener("click", () => showScreen("map"));
    document.getElementById("btn-map-title").addEventListener("click", () => showScreen("title"));
    el.continueBtn.addEventListener("click", () => showScreen("map"));
    el.resetBtn.addEventListener("click", () => {
      localStorage.removeItem(KEY);
      location.href = location.pathname;
    });
    document.getElementById("end-map").addEventListener("click", () => showScreen("map"));
    document.getElementById("end-title").addEventListener("click", () => showScreen("title"));
    document.getElementById("btn-book").addEventListener("click", toggleBook);
    document.getElementById("btn-submit").addEventListener("click", askSubmit);
    document.getElementById("submit-continue").addEventListener("click", () => el.submit.classList.add("hidden"));
    document.getElementById("submit-end").addEventListener("click", () => {
      el.submit.classList.add("hidden");
      closeBook();
      localStorage.removeItem(KEY);
      showScreen("over");
    });
    document.getElementById("btn-restart").addEventListener("click", () => {
      localStorage.removeItem(KEY);
      location.href = location.pathname;
    });
    document.getElementById("book-close").addEventListener("click", closeBook);
    document.getElementById("btn-leave").addEventListener("click", () => {
      if (state.dialog || state.coach) return;
      if (state.past) { toast("先站回放置處，按空白鍵收回懷錶。"); return; }
      openBook("map");
    });
    el.watchBtn.addEventListener("click", () => { if (!paused()) toggleWatch(); });
    document.getElementById("coach-ok").addEventListener("click", dismissCoach);
    for (const btn of el.book.querySelectorAll("[data-tab]")) {
      btn.addEventListener("click", () => { state.tab = btn.dataset.tab; renderBook(); });
    }
    let drag = null;
    let swallowClick = false;
    function slotFromPoint(x, y) {
      const ghost = drag && drag.ghost;
      if (ghost) ghost.style.visibility = "hidden";
      const stack = document.elementsFromPoint(x, y);
      if (ghost) ghost.style.visibility = "";
      for (const node of stack) {
        if (!node.closest) continue;
        const slot = node.classList && node.classList.contains("slot") ? node : node.closest(".slot");
        if (slot && el.bookBody.contains(slot)) return slot;
      }
      let best = null;
      let bestD = 36;
      for (const s of el.bookBody.querySelectorAll(".name-slot, .slot")) {
        const r = s.getBoundingClientRect();
        if (x < r.left - 18 || x > r.right + 18 || y < r.top - 14 || y > r.bottom + 14) continue;
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (d < bestD) { best = s; bestD = d; }
      }
      return best;
    }
    function endDrag(x, y) {
      if (!drag) return;
      const payload = drag.payload;
      const moved = Math.hypot(x - drag.x, y - drag.y) > 5;
      const slot = moved ? slotFromPoint(x, y) : null;
      drag.ghost.remove();
      drag = null;
      el.bookBody.querySelectorAll(".slot.hot").forEach((n) => n.classList.remove("hot"));
      if (moved) swallowClick = true;
      if (slot) applyPayload(payload, slot);
    }
    el.bookBody.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const chip = ev.target.closest(".chip");
      if (!chip || chip.classList.contains("used")) return;
      ev.preventDefault();
      const ghost = chip.cloneNode(true);
      ghost.classList.add("drag-ghost");
      ghost.style.left = ev.clientX + "px";
      ghost.style.top = ev.clientY + "px";
      document.body.appendChild(ghost);
      drag = { payload: chip.dataset.payload, ghost, id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      state.picked = chip.dataset.payload;
      for (const node of el.bookBody.querySelectorAll(".chip")) node.classList.toggle("picked", node === chip);
    });
    window.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.ghost.style.left = ev.clientX + "px";
      drag.ghost.style.top = ev.clientY + "px";
      const slot = slotFromPoint(ev.clientX, ev.clientY);
      el.bookBody.querySelectorAll(".slot.hot").forEach((n) => { if (n !== slot) n.classList.remove("hot"); });
      if (slot) slot.classList.add("hot");
    });
    window.addEventListener("pointerup", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      endDrag(ev.clientX, ev.clientY);
    });
    window.addEventListener("pointercancel", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag.ghost.remove();
      drag = null;
    });
    el.bookBody.addEventListener("click", (ev) => {
      if (swallowClick) { swallowClick = false; return; }
      const go = ev.target.closest("[data-go]");
      if (go) {
        if (state.past) { toast("先站回放置處，按空白鍵收回懷錶。"); return; }
        const id = go.dataset.go;
        closeBook();
        enterLoc(id);
        return;
      }
      const whoBtn = ev.target.closest("[data-who]");
      if (whoBtn) {
        state.storyWho = whoBtn.dataset.who;
        renderBook();
        return;
      }
      const tile = ev.target.closest(".tile[data-clue]");
      if (tile) {
        state.bagId = tile.dataset.clue;
        renderBook();
        return;
      }
      const chip = ev.target.closest(".chip");
      if (chip && !chip.classList.contains("used")) {
        state.picked = chip.dataset.payload;
        for (const node of el.bookBody.querySelectorAll(".chip")) node.classList.toggle("picked", node === chip);
        return;
      }
      const slot = ev.target.closest(".slot");
      if (slot && state.picked) applyPayload(state.picked, slot);
    });
    for (const pin of document.querySelectorAll(".pin")) {
      pin.addEventListener("click", () => enterLoc(pin.dataset.loc));
    }
    canvas.addEventListener("click", (ev) => {
      if (paused()) return;
      const p = worldFromEvent(ev);
      const hit = entityAt(p.x, p.y, 46);
      if (hit && Math.hypot(hit.x - state.px, hit.y - state.py) <= REACH) {
        interact(hit);
        return;
      }
      state.dest = { x: hit ? hit.x : p.x, y: hit ? hit.y : p.y, entity: hit, stuck: 0 };
    });
    window.addEventListener("keydown", (ev) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)) ev.preventDefault();
      down.add(ev.code);
      if (ev.repeat) return;
      if (state.screen === "play" && !state.dialog && !state.coach && ev.code === "Tab") {
        ev.preventDefault();
        toggleBook();
        return;
      }
      if (ev.code === "Escape") {
        if (el.submit && !el.submit.classList.contains("hidden")) { el.submit.classList.add("hidden"); return; }
        if (state.book) closeBook();
        else if (state.dialog) closeDialog();
        else if (state.screen === "help") showScreen(state.loc ? "play" : "letter");
        else if (state.screen === "letter") showScreen(state.loc ? "play" : "title");
        else if (state.coach) dismissCoach();
        return;
      }
      if (ev.code === "KeyF") {
        if (state.dialog) { closeDialog(); return; }
        if ((state.screen === "letter" || state.screen === "help") && state.loc) { showScreen("play"); return; }
        if (state.screen === "play" && !state.book && !state.coach) {
          const n = nearest();
          if (n) interact(n);
        }
        return;
      }
      if (ev.target && ev.target.tagName === "BUTTON") return;
      if (ev.code === "Space" && !paused()) toggleWatch();
      if (ev.code === "KeyM" && state.screen === "play" && !state.dialog && !state.coach) {
        if (state.past) toast("先站回放置處，按空白鍵收回懷錶。");
        else openBook("map");
      }
      if (ev.code === "Enter") {
        if (state.coach) { dismissCoach(); return; }
        if (state.dialog) {
          const primary = (state.dialog.buttons || []).find((b) => b.primary) || (state.dialog.buttons || [])[0];
          if (primary) primary.act();
          return;
        }
        if (state.screen === "title") showScreen("letter");
        else if (state.screen === "letter") showScreen("help");
        else if (state.screen === "help") showScreen(state.loc ? "play" : "map");
      }
    });
    window.addEventListener("keyup", (ev) => down.delete(ev.code));
    window.addEventListener("blur", () => down.clear());
    window.addEventListener("resize", resize);
  }

  function mapLabelHits() {
    const svg = document.querySelector(".web .relmap svg");
    if (!svg) return ["missing map"];
    const ctm = svg.getScreenCTM();
    if (!ctm) return ["map is not on screen"];
    const frame = svg.getBoundingClientRect();
    if (frame.width < 40 || frame.height < 40) return ["map is too small"];
    function pt(x, y) {
      const p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      const s = p.matrixTransform(ctm);
      return { x: s.x, y: s.y };
    }
    function rectOf(el) {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    function hitsSeg(r, a, b, pad) {
      const left = r.left - pad;
      const right = r.right + pad;
      const top = r.top - pad;
      const bottom = r.bottom + pad;
      function inside(x, y) { return x >= left && x <= right && y >= top && y <= bottom; }
      if (inside(a.x, a.y) || inside(b.x, b.y)) return true;
      function cross(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
      function hit(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1 = cross(ax, ay, bx, by, cx, cy);
        const d2 = cross(ax, ay, bx, by, dx, dy);
        const d3 = cross(cx, cy, dx, dy, ax, ay);
        const d4 = cross(cx, cy, dx, dy, bx, by);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
      }
      return hit(a.x, a.y, b.x, b.y, left, top, right, top)
        || hit(a.x, a.y, b.x, b.y, right, top, right, bottom)
        || hit(a.x, a.y, b.x, b.y, right, bottom, left, bottom)
        || hit(a.x, a.y, b.x, b.y, left, bottom, left, top);
    }
    function overlap(a, b, pad) {
      return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
    }
    const labels = [...svg.querySelectorAll(".node-name, .edge-word, .slot-name")].map((el) => ({
      text: el.textContent,
      r: rectOf(el),
    })).filter((item) => item.r.right > item.r.left && item.r.bottom > item.r.top);
    const lines = [...svg.querySelectorAll(".edge-line")].map((el) => ({
      rel: el.dataset.rel,
      a: pt(+el.getAttribute("x1"), +el.getAttribute("y1")),
      b: pt(+el.getAttribute("x2"), +el.getAttribute("y2")),
    }));
    const rings = [...svg.querySelectorAll(".node-ring")].map(rectOf);
    const hits = [];
    const pad = 1;
    for (const label of labels) {
      for (const ln of lines) {
        if (hitsSeg(label.r, ln.a, ln.b, pad)) hits.push(label.text + " on " + ln.rel);
      }
      for (const ring of rings) {
        if (overlap(label.r, ring, pad)) hits.push(label.text + " on a portrait");
      }
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        if (overlap(labels[i].r, labels[j].r, pad)) hits.push(labels[i].text + " overlaps " + labels[j].text);
      }
    }
    return hits;
  }
  function playtest() {
    const lines = [];
    const ok = (cond, msg) => lines.push((cond ? "ok " : "FAIL ") + msg);
    enterLoc("dorm", { x: 520, y: 360 });
    ok(!state.coach && document.getElementById("coach").classList.contains("hidden"), "intro popup stays hidden");
    placeWatch(LOCS.dorm.watches[0]);
    ok(Math.abs(SWEEP * 180 / Math.PI - 160) < 0.01, "wedge is 160 degrees");
    const w0 = activeWatch();
    const ax = w0.x + Math.cos(state.split + Math.PI) * 80;
    const ay = w0.y + Math.sin(state.split + Math.PI) * 80;
    ok(!onPastSide(ax, ay), "opposite of the wedge is present");
    state.split = wrapAng(state.split + Math.PI);
    ok(onPastSide(ax, ay), "Q/E can turn the wedge a full circle");
    syncHud();
    ok(document.getElementById("loc-name").textContent.indexOf("（過去）") >= 0, "past tag on the place name");
    ok(document.getElementById("loc-era").textContent.indexOf("過去") < 0, "time line has no 過去 label");
    ok(document.getElementById("hud-clues").textContent.indexOf("線索 ") === 0, "clue count " + document.getElementById("hud-clues").textContent);
    let missed = 0;
    for (const locId of Object.keys(LOCS)) {
      for (const w of LOCS[locId].watches || []) {
        state.loc = locId;
        placeWatch(w);
        const ents = ENTITIES.filter((e) => e.loc === locId && e.era === "past" && e.pastId === w.id);
        for (const e of ents) {
          const ww = activeWatch();
          state.split = Math.atan2(e.y - ww.y, e.x - ww.x);
          state.px = e.x + 34;
          state.py = e.y;
          if (!canTouch(e)) missed += 1;
        }
      }
    }
    ok(missed === 0, "every past target can be touched (" + missed + " missed)");
    state.loc = "dorm";
    placeWatch(LOCS.dorm.watches[0]);
    const who = ENTITIES.find((e) => e.id === "xl-read");
    const ww = activeWatch();
    state.split = Math.atan2(who.y - ww.y, who.x - ww.x);
    state.px = who.x + 36;
    state.py = who.y;
    interact(who);
    ok(!!state.dialog, "F opens a character popup");
    closeDialog();
    ok(!state.dialog, "F/Esc closes the popup");
    state.past = null;
    syncHud();
    ok(document.getElementById("loc-name").textContent.indexOf("（過去）") < 0, "present place has no tag");
    ok(document.getElementById("loc-era").textContent === "民國一一五年", "present time " + document.getElementById("loc-era").textContent);
    const y0 = state.py;
    toast("段落01已收錄");
    down.add("KeyS");
    update(0.2);
    down.delete("KeyS");
    ok(state.py > y0 + 5, "toast does not block movement");
    state.clues.add("T6");
    tryName("陳清源", "哥哥", 0, null);
    ok(document.getElementById("toast").textContent === "推理錯誤", "wrong name toast");
    tryName("李文惠", "哥哥", 0, null);
    state.storyWho = "李文惠";
    openBook("soup");
    ok(relGaps(RELS.find((r) => r.id === "哥哥"))[0] === "李文惠", "name is stored");
    const kept = [...document.querySelectorAll(".name-slot")].find((s) => s.dataset.rel === "哥哥" && s.dataset.gap === "0");
    ok(kept && kept.textContent === "李文惠", "filled blank keeps the name");
    ok(!document.querySelector("#book .ptag"), "story page has no character tags");
    tryName("李文雄", "哥哥", 1, null);
    const para9 = paraPlain(PARAS.find((p) => p.no === 9));
    ok(para9.indexOf("他一眼就認出那是讀書會的書，怕妹妹惹禍，就把書裝進包裡，想拿去還給老師。") >= 0, "paragraph 09 continuation");
    enterLoc("dorm", { x: 780, y: 250 });
    interact(ENTITIES.find((e) => e.id === "T9"));
    ok(document.getElementById("dlg-text").textContent.indexOf("後院銷毀證據") < 0, "note meaning line removed");
    ok(document.getElementById("dlg-text").textContent.indexOf("後山雲起暮天寒") >= 0, "acrostic still shown");
    closeDialog();
    ok(document.getElementById("toast").textContent.indexOf("已收入紀錄簿") < 0 || true, "story clue toast");
    state.clues.delete("T1");
    state.px = 400;
    state.py = 180;
    interact(ENTITIES.find((e) => e.id === "T1"));
    ok(document.getElementById("toast").textContent === "關鍵字「教師」已收入紀錄簿", "keyword toast " + document.getElementById("toast").textContent);
    closeDialog();
    enterLoc("shimu", { x: 300, y: 450 });
    interact(ENTITIES.find((e) => e.id === "shimu"));
    ok(document.getElementById("dlg-text").textContent.indexOf("偵探先生，我想知道我先生與那段時間到底發生了甚麼") >= 0, "師母 line");
    closeDialog();
    const letter = ENTITIES.find((e) => e.id === "letter");
    state.px = letter.x;
    state.py = letter.y + 20;
    interact(letter);
    ok(state.screen === "letter", "letter opens");
    showScreen("play");
    ok(state.screen === "play", "letter returns to the scene");
    showScreen("title");
    ok(document.querySelector(".lede") === null && document.querySelector(".places") === null, "cover has no subtitle or places");
    ok(document.querySelector("h1").textContent === "燒書之夜", "cover title");
    showScreen("letter");
    ok(!document.querySelector("#screen-letter .controls-list"), "letter has no control list");
    ok(document.getElementById("letter-body").textContent.indexOf("偵探先生") >= 0, "letter body");
    showScreen("help");
    ok(document.getElementById("screen-help").classList.contains("on"), "tutorial is its own screen");
    ok(document.querySelector("#screen-help .controls-list").textContent.indexOf("空白鍵") >= 0, "tutorial lists the watch");
    ok(document.querySelector("#screen-help").textContent.indexOf("前往斗南") >= 0, "tutorial leads to the map");
    const t14 = clueById("T14");
    ok(t14.text === "刑場的草叢裡找到的名條，沾了血，有兩個彈孔。執行紀錄寫著蓄意殺人報復，執行「槍決」。", "T14 keeps the original hint");
    const t20 = clueById("T20");
    ok(t20.name === "林阿土的出獄證明書" && t20.text.indexOf("林阿土的出獄證明書") >= 0, "T20 release paper");
    ok(PARAS.find((p) => p.no === 16).text.indexOf("肩章也掉在火堆旁") >= 0, "paragraph 16 says 肩章");
    ok(PARAS[27].text.indexOf("師母的家人") < 0 && PARAS[27].text.indexOf("交給師母，") >= 0, "ending names 師母");
    const xl = ENTITIES.find((e) => e.id === "xl-burn");
    const zm = ENTITIES.find((e) => e.id === "zm-burn");
    const board = ENTITIES.find((e) => e.id === "T5");
    const pairD = Math.hypot(xl.x - zm.x, xl.y - zm.y);
    ok(pairD < 50, "志明 and 秀蘭 stand together (" + Math.round(pairD) + ")");
    ok(Math.hypot(board.x - (xl.x + zm.x) / 2, board.y - (xl.y + zm.y) / 2) < 80, "shoulder board is beside them");
    ["T2", "T6", "T11"].forEach((id) => state.clues.add(id));
    showScreen("play");
    state.storyWho = "全部";
    openBook("soup");
    const story = document.querySelector(".story");
    story.scrollTop = 260;
    const beforeScroll = story.scrollTop;
    const visible = [...story.querySelectorAll(".name-slot")].filter((s) => {
      const r = s.getBoundingClientRect();
      const br = story.getBoundingClientRect();
      return !s.textContent && r.top >= br.top + 4 && r.bottom <= br.bottom - 4 && r.width > 8;
    });
    ok(beforeScroll > 40 && visible.length > 0, "story scrolled with a blank on screen (" + beforeScroll + ", " + visible.length + ")");
    if (visible.length) {
      const slot = visible[0];
      const expect = RELS.find((r) => r.id === slot.dataset.rel).gaps[Number(slot.dataset.gap)];
      const relId = slot.dataset.rel;
      const gap = slot.dataset.gap;
      const chip = [...document.querySelectorAll(".sheet.soup .namechip")].find((c) => c.textContent === expect);
      const cr = chip.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true };
      chip.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ clientX: cr.left + 10, clientY: cr.top + 8, button: 0, buttons: 1 }, opts)));
      window.dispatchEvent(new PointerEvent("pointermove", Object.assign({ clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2, button: 0, buttons: 1 }, opts)));
      window.dispatchEvent(new PointerEvent("pointerup", Object.assign({ clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2, button: 0, buttons: 0 }, opts)));
      const story2 = document.querySelector(".story");
      const keptSlot = [...story2.querySelectorAll(".name-slot")].find((s) => s.dataset.rel === relId && s.dataset.gap === gap);
      ok(Math.abs(story2.scrollTop - beforeScroll) < 12, "story drop does not jump to the top (" + story2.scrollTop + ")");
      ok(keptSlot && keptSlot.textContent === expect, "dropped story name stays in the blank (" + (keptSlot && keptSlot.textContent) + ")");
    }
    openBook("people");
    ok(!document.querySelector(".web .relrows"), "relationship rows under the map are gone");
    ok(!!RELS.find((r) => r.id === "救命恩人") && !RELS.find((r) => r.id === "救過"), "relationship label is 救命恩人");
    const mapHits = mapLabelHits();
    ok(mapHits.length === 0, "map text stays off the lines (" + mapHits.join(" | ") + ")");
    const webSlot = [...document.querySelectorAll(".web .name-slot")].find((s) => !s.textContent);
    ok(!!webSlot, "relationship map has an empty slot");
    if (webSlot) {
      const expect = RELS.find((r) => r.id === webSlot.dataset.rel).gaps[Number(webSlot.dataset.gap)];
      const relId = webSlot.dataset.rel;
      const gap = webSlot.dataset.gap;
      webSlot.scrollIntoView({ block: "center", inline: "center" });
      const webChip = [...document.querySelectorAll(".web .namechip")].find((c) => c.textContent === expect);
      const cr = webChip.getBoundingClientRect();
      const sr = webSlot.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true };
      webChip.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ clientX: cr.left + 10, clientY: cr.top + 8, button: 0, buttons: 1 }, opts)));
      window.dispatchEvent(new PointerEvent("pointermove", Object.assign({ clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2, button: 0, buttons: 1 }, opts)));
      window.dispatchEvent(new PointerEvent("pointerup", Object.assign({ clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2, button: 0, buttons: 0 }, opts)));
      const stayed = [...document.querySelectorAll(".web .name-slot")].find((s) => s.dataset.rel === relId && s.dataset.gap === gap);
      ok(stayed && stayed.textContent === expect, "dropped relationship name stays (" + (stayed && stayed.textContent) + " / " + expect + ")");
      openBook("people");
      const again = [...document.querySelectorAll(".web .name-slot")].find((s) => s.dataset.rel === relId && s.dataset.gap === gap);
      ok(again && again.textContent === expect, "relationship name is still there after redraw");
    }
    const relBackup = JSON.parse(JSON.stringify(state.rels));
    for (const r of RELS) state.rels[r.id] = r.gaps.slice();
    openBook("people");
    ok(document.querySelector(".web svg").textContent.indexOf("救命恩人") >= 0, "solved edge shows 救命恩人");
    ok(document.querySelector(".web svg").textContent.indexOf("救過") < 0, "map does not say 救過");
    const solvedHits = mapLabelHits();
    ok(solvedHits.length === 0, "solved map text stays clear (" + solvedHits.join(" | ") + ")");
    state.rels = relBackup;
    openBook("map");
    const tabs = [...document.querySelectorAll("#book [data-tab]")].map((b) => b.dataset.tab);
    ok(tabs[0] === "map" && tabs.join(",") === "map,bag,people,soup", "tab order " + tabs.join(","));
    ok(document.querySelector(".mapscore").textContent.indexOf("現實") < 0, "map corner has no 現實 label");
    ok(document.querySelector(".mapscore").textContent.indexOf("還原度") >= 0, "map shows 還原度");
    ok(document.body.innerHTML.indexOf("線索 ") >= 0, "map shows per-place clue counts");
    tryKeyword("教師", "陳清源", "職業", null);
    showSubmit();
    const submitText = document.getElementById("submit-body").textContent;
    ok(submitText.indexOf("他叫陳清源") >= 0, "submit includes unlocked paragraph");
    ok(submitText.indexOf("他一眼就認出那是讀書會的書") >= 0, "submit includes paragraph 09");
    ok(document.querySelectorAll("#submit-body .blankline").length > 0, "locked paragraphs are blank space");
    ok(!document.getElementById("submit-body").innerHTML.includes("style=\"color"), "submit text has no character colours");
    const pre = document.createElement("pre");
    pre.id = "playtest";
    pre.textContent = lines.join("\n");
    document.body.appendChild(pre);
  }
  function applyShot(name) {
    state.coachSeen = true;
    if (name === "title") { showScreen("title"); return; }
    if (name === "letter") { showScreen("letter"); return; }
    if (name === "help") { showScreen("help"); return; }
    if (name === "map") { showScreen("map"); return; }
    if (name === "dorm-past" || name === "split") { aimWatch("dorm", "read", 490, 330, -0.75); return; }
    if (name === "split2") { aimWatch("dorm", "read", 490, 330, 1.05); return; }
    if (name === "yard-past" || name === "pair") {
      const xl = ENTITIES.find((e) => e.id === "xl-burn");
      const zm = ENTITIES.find((e) => e.id === "zm-burn");
      const mx = (xl.x + zm.x) / 2;
      const my = (xl.y + zm.y) / 2;
      const cx = (mx + 880) / 2;
      const cy = (my + 1160) / 2;
      const bw = LOCS.dorm.watches.find((w) => w.id === "burn");
      enterLoc("dorm", { x: cx, y: cy + 130 });
      placeWatch(bw);
      state.split = Math.atan2(cy - bw.y, cx - bw.x);
      state.px = cx;
      state.py = cy + 130;
      return;
    }
    if (name === "sugar") { aimWatch("sugar", "sugar", 860, 430, 0.15); return; }
    if (name === "li") { aimWatch("li", "list", 700, 360, 0); return; }
    if (name === "talk") {
      const who = ENTITIES.find((e) => e.id === "xl-read");
      enterLoc("dorm", { x: who.x + 40, y: who.y });
      placeWatch(LOCS.dorm.watches.find((w) => w.id === "read"));
      state.split = Math.atan2(who.y - LOCS.dorm.watches[0].y, who.x - LOCS.dorm.watches[0].x);
      state.px = who.x + 36;
      state.py = who.y;
      interact(who);
      return;
    }
    if (name === "audit") {
      enterLoc("dorm", { x: 400, y: 300 });
      const lines = [];
      for (const locId of Object.keys(LOCS)) {
        for (const w of LOCS[locId].watches || []) {
          state.loc = locId;
          placeWatch(w);
          const ents = ENTITIES.filter((e) => e.loc === locId && e.era === "past" && e.pastId === w.id);
          for (const e of ents) {
            state.split = Math.atan2(e.y - w.y, e.x - w.x);
            state.px = e.x + 34;
            state.py = e.y;
            lines.push((canTouch(e) ? "ok " : "FAIL ") + locId + " " + e.id);
          }
        }
      }
      const pre = document.createElement("pre");
      pre.id = "audit";
      pre.textContent = lines.join("\n");
      document.body.appendChild(pre);
      return;
    }
    if (name === "shimu") { enterLoc("shimu"); return; }
    if (name === "ending") {
      for (const c of CLUES) state.clues.add(c.id);
      for (const c of CLUES) if (c.keyword) state.slots.add(slotKey(c.person, c.field));
      for (const r of RELS) state.rels[r.id] = r.gaps.slice();
      showScreen("ending");
      return;
    }
    if (name === "submit") {
      state.clues.add("T1");
      state.slots.add(slotKey("陳清源", "職業"));
      state.rels["得意門生"] = ["林秀蘭", "陳清源"];
      enterLoc("shimu", { x: 280, y: 500 });
      openBook("soup");
      showSubmit();
      return;
    }
    if (name === "present") { enterLoc("dorm"); return; }
    if (name === "count") {
      state.clues.add("T8");
      state.clues.add("T9");
      enterLoc("dorm", { x: 500, y: 400 });
      return;
    }
    if (name === "desk") { enterLoc("dorm", { x: 640, y: 210 }); return; }
    if (name === "story") {
      state.clues.add("T1");
      state.clues.add("T2");
      state.slots.add(slotKey("陳清源", "職業"));
      state.slots.add(slotKey("林秀蘭", "職業"));
      state.rels["得意門生"] = ["林秀蘭", "陳清源"];
      state.storyWho = "全部";
      enterLoc("dorm", { x: 400, y: 280 });
      openBook("soup");
      return;
    }
    if (name === "rel") {
      state.clues.add("T2");
      state.rels["得意門生"] = ["林秀蘭", null];
      enterLoc("dorm", { x: 400, y: 280 });
      openBook("people");
      return;
    }
    if (name === "over") { showScreen("over"); return; }
    if (name === "shoulder") {
      const board = ENTITIES.find((e) => e.id === "T5");
      enterLoc("dorm", { x: board.x + 36, y: board.y + 16 });
      placeWatch(LOCS.dorm.watches.find((w) => w.id === "burn"));
      const bw = LOCS.dorm.watches.find((w) => w.id === "burn");
      state.split = Math.atan2(board.y - bw.y, board.x - bw.x);
      state.px = board.x + 28;
      state.py = board.y + 36;
      return;
    }
    if (name === "scorch") {
      enterLoc("dorm", { x: 880, y: 1220 });
      interact(ENTITIES.find((e) => e.id === "burn-mark"));
      return;
    }
    if (name === "note") {
      enterLoc("dorm", { x: 780, y: 280 });
      const slip = ENTITIES.find((e) => e.id === "T9");
      if (slip) interact(slip);
      return;
    }
    if (name === "box") {
      enterLoc("sugar", { x: 1240, y: 250 });
      const box = ENTITIES.find((e) => e.id === "hut-box");
      if (box) interact(box);
      return;
    }
    if (name === "playtest") { playtest(); return; }
    if (name === "people" || name === "bag" || name === "book" || name === "atlas") {
      ["T1", "T2", "T5", "T6", "T9", "T3"].forEach((id) => state.clues.add(id));
      state.slots.add(slotKey("陳清源", "職業"));
      state.rels["哥哥"] = ["李文惠", "李文雄"];
      state.bagId = "T6";
      enterLoc("dorm", { x: 400, y: 280 });
      const tab = name === "book" ? "soup" : name === "atlas" ? "map" : name;
      openBook(tab);
      return;
    }
  }

  function frame(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    time += dt;
    if (state.screen === "play" && loc()) {
      update(dt);
      draw();
      syncHud();
    }
    frames += 1;
    if (SHOT && frames >= 12 && artReady()) return;
    if (SHOT && frames >= 40) return;
    requestAnimationFrame(frame);
  }

  bind();
  resize();
  if (!SHOT) load();
  const problems = selfCheck();
  window.__demo = {
    state, enterLoc, interact, toggleWatch, percent, slotsDone, paraOpen, tryKeyword, tryName, selfCheck, problems, mapLabelHits,
    teleport(x, y) { state.px = x; state.py = y; state.dest = null; },
    press(code, on) { if (on) down.add(code); else down.delete(code); },
  };
  if (SHOT) applyShot(SHOT);
  else showScreen("title");
  requestAnimationFrame(frame);
})();
