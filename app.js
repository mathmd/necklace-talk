// Presentation shell.
// Reads content/steps.txt and, for each step folder, slide.md (stage block + slide text),
// full.md (spoken text) and bullet.md (speaker bullets).
// Steps through them with the keyboard; the stage of each step can be adjusted live
// by keys and mouse (see index.html, "?" help). The script panel ("s") is for development.
import { renderStage } from "./stage/stage.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const EXPORT = params.has("export");
// Published version (tools/publish.sh sets data-mode="public"; ?public previews it): on-screen navigation,
// a hint under each interactive figure, names on hover, a glow on what can be dragged, notes = the bullets.
const PUBLIC = !EXPORT && (document.body.dataset.mode === "public" || params.has("public"));
if (PUBLIC) document.body.classList.add("public");
window.__frame = params.has("frame") ? +params.get("frame") : null; // null: each view chooses its export frame

async function load(path, optional = false) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) { if (optional) return ""; throw new Error(`cannot load ${path}`); }
  return (await r.text()).replace(/<!--[\s\S]*?-->/g, "");
}

// "key: value" lines -> object
function parseKeyValues(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parsePresets(text) {
  const presets = {};
  let name = null, buf = [];
  const flush = () => { if (name) presets[name] = parseKeyValues(buf.join("\n")); };
  for (const line of text.split("\n")) {
    const m = line.match(/^##\s+(\S+)/);
    if (m) { flush(); name = m[1]; buf = []; } else buf.push(line);
  }
  flush();
  return presets;
}

// slide.md: an optional fenced ```stage block, then the slide text.
function parseSlide(text) {
  const m = text.match(/^\s*```stage\s*\n([\s\S]*?)\n```\s*\n?/);
  return m ? { stage: parseKeyValues(m[1]), md: text.slice(m[0].length) } : { stage: {}, md: text };
}

// Markdown with LaTeX: protect math from Markdown, render it with KaTeX afterwards.
function renderMarkdown(src, { breaks = false } = {}) {
  const math = [];
  const hold = (tex, display) => { math.push({ tex, display }); return `@@MATH${math.length - 1}@@`; };
  let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => hold(t, true));
  s = s.replace(/\$([^$\n]+?)\$/g, (_, t) => hold(t, false));
  let html = marked.parse(s, { breaks });
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => {
    const { tex, display } = math[+i];
    try { return katex.renderToString(tex, { displayMode: display, throwOnError: false }); }
    catch (e) { return `<code>${tex}</code>`; }
  });
  return html;
}

const deck = { steps: [], presets: {}, index: 0, live: null, items: [], script: params.get("script") || "off" };

function resolveState(step) {
  const name = step.stage.preset || "none";
  if (!deck.presets[name]) console.warn(`unknown preset ${name}`);
  return { ...deck.presets.defaults, ...(deck.presets[name] || {}), ...step.stage, preset: name };
}

// A step may declare "builds: n" (in its preset or stage block): → reveals builds 1..n before the next step.
const nBuilds = () => parseInt(deck.live?.builds, 10) || 0;
// "buildK: key=value; key=value" in a preset sets values from build K on.
// Moving between builds of the same step keeps the live values of its controls (round 5),
// unless a build sets them itself.
const CARRY = { a: ["a"], s: ["s"], j: ["j"], rho3: ["d1", "d2", "d3", "active", "word"], rhopm: ["rhom", "rhop"], sigma: ["sigma"], word: ["word"] };
function setBuild(k, carry = false) {
  const prev = deck.live, base = resolveState(deck.steps[deck.index]), patched = new Set();
  for (let i = 1; i <= k; i++)
    for (const kv of String(base["build" + i] || "").split(";")) {
      const m = kv.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
      if (m) { base[m[1]] = m[2]; patched.add(m[1]); }
    }
  if (carry && prev) {
    const keys = String(base.controls || "").split(",").flatMap((t) => CARRY[t.trim()] || []).concat(["selword"]);
    for (const key of keys) if (!patched.has(key) && prev[key] !== undefined) base[key] = prev[key];
  }
  base.build = k;
  deck.live = base;
}
// Slide text may hold blocks shown only at some builds: a line "::: build K" (from build K on)
// or "::: build K-M" (builds K to M), the block, a line ":::".
function slideText(md, build) {
  return md.replace(/^::: *build +(\d+)(?:-(\d+))? *\n([\s\S]*?)^::: *\n?/gm,
    (_, k, m, body) => (build >= +k && (m === undefined || build <= +m) ? body : ""));
}
function drawText() {
  const key = `${deck.index}:${deck.live.build || 0}`;
  if (deck.textKey === key) return;
  deck.textKey = key;
  $("text").innerHTML = renderMarkdown(slideText(deck.steps[deck.index].md, deck.live.build || 0), { breaks: true });
}
function show(i, atEnd = false) {
  deck.index = Math.max(0, Math.min(deck.steps.length - 1, i));
  const step = deck.steps[deck.index];
  deck.live = resolveState(step);
  // Export: the build given by ?build=k (default: the last), and window.__frame for animations (?frame=u in [0,1]).
  setBuild(EXPORT ? (params.has("build") ? Math.min(nBuilds(), +params.get("build")) : nBuilds()) : atEnd ? nBuilds() : 0);
  // Export only: ?set=a:0.5,s:0.3 overrides preset values (used for review screenshots).
  if (EXPORT && params.has("set")) for (const kv of params.get("set").split(",")) { const [k, v] = kv.split(":"); deck.live[k] = v; }
  for (const c of [...document.body.classList]) if (c.startsWith("layout-")) document.body.classList.remove(c);
  document.body.classList.add(`layout-${deck.live.layout || "split"}`);
  deck.textKey = null;
  drawProgress();
  if (!EXPORT && location.hash !== `#${deck.index + 1}`) history.replaceState(null, "", `#${deck.index + 1}`);
  if (PUBLIC) { $("intro").hidden = (deck.live.layout || "split") !== "title"; if (!tipOn.drag) tipOn.el = null; }
  draw();
  glow(true);
}
const atFirst = () => deck.index === 0 && !(deck.live.build > 0);
const atLast = () => deck.index === deck.steps.length - 1 && !(deck.live.build < nBuilds());
function next() {
  if (deck.live.build < nBuilds()) { setBuild(deck.live.build + 1, true); draw(); glow(); drawProgress(); }
  else if (!atLast()) show(deck.index + 1);
}
function prev() {
  if (deck.live.build > 0) { setBuild(deck.live.build - 1, true); draw(); glow(); drawProgress(); }
  else if (!atFirst()) show(deck.index - 1, true);
}

// Progress line at the foot of the slide: one segment per section (the "beat" of each step),
// the current section's name on the left and the step number on the right.
function drawProgress() {
  const focused = PUBLIC && document.activeElement?.closest?.("#progress button[data-act]")?.dataset.act;
  drawProgressBar();
  if (focused) document.querySelector(`#progress button[data-act="${focused}"]`)?.focus(); // keep keyboard focus (Tab, Enter)
}
function drawProgressBar() {
  const i = deck.index;
  if (i >= deck.main) { $("progress").innerHTML = `<div class="where"><span>Backup</span>${PUBLIC ? navHTML("backup") : "<span></span>"}</div>`; return; }
  const steps = deck.steps.slice(0, deck.main);
  const sections = [];
  steps.forEach((st, k) => {
    const last = sections[sections.length - 1];
    if (last && last.beat === st.beat) last.end = k; else sections.push({ beat: st.beat, start: k, end: k });
  });
  const bar = sections.map((sec) => {
    const n = sec.end - sec.start + 1;
    const done = Math.max(0, Math.min(n, i - sec.start + 1));
    const cls = i > sec.end ? "done" : i >= sec.start ? "now" : "";
    return `<span class="seg ${cls}" style="flex:${n}"><i style="width:${(100 * done) / n}%"></i></span>`;
  }).join("");
  const name = renderMarkdown(steps[i].beat || "").replace(/^<p>|<\/p>\s*$/g, "");
  $("progress").innerHTML = `<div class="bar">${bar}</div><div class="where"><span>${name}</span>` +
    (PUBLIC ? navHTML(`${i + 1} / ${steps.length}`) : `<span>${i + 1} / ${steps.length}</span>`) + `</div>`;
}
// Published version: back and next around the slide number, then the panels.
function navHTML(count) {
  const sliders = String(deck.live.controls || "").trim() !== "";
  const btn = (act, label, title, on = false, off = false) =>
    `<button type="button" data-act="${act}" class="${on ? "on" : ""}" title="${title}"${off ? " disabled" : ""}>${label}</button>`;
  return `<span class="nav">${btn("prev", "‹", "Back (←)", false, atFirst())}<span class="count">${count}</span>${btn("next", "›", deck.index === deck.main - 1 && !(deck.live.build < nBuilds()) ? "Backup slide (→)" : "Next (→ or Space)", false, atLast())}` +
    `<span class="sep"></span>${btn("notes", "Notes", "The speaker's notes for this slide (n)", deck.script === "bullet")}` +
    (sliders ? btn("sliders", "Sliders", "Sliders for the quantities on this slide (c)", !$("controls").hidden) : `<button type="button" class="slot" tabindex="-1" disabled>Sliders</button>`) +
    `${btn("help", "?", "How to use these slides (?)", !$("help").hidden)}</span>`;
}

function draw() {
  document.body.dataset.ready = "0";
  drawText();
  deck.items = [];
  try {
    renderStage({
      stage: $("stage"), controls: $("controls"), state: deck.live, items: deck.items,
      onChange: (patch) => { Object.assign(deck.live, patch); requestAnimationFrame(draw); },
      exportMode: EXPORT,
    });
  } catch (e) {
    console.error(e);
    $("stage").innerHTML = `<p style="padding:2em;color:#a00">Stage error: ${e.message}</p>`;
  }
  drawScript();
  drawHint();
  if (PUBLIC) { if (!tipOn.drag) refindTip(); renderTip(); }
  document.body.dataset.ready = "1";
}

// ---------- published version: what can be done on this slide ----------
// The hint under the figure is built from what the stage actually drew: the drag handles (by the quantity
// each changes, as drawn), the click targets, and the keys that change the same quantities.
const kbd = (...ks) => ks.map((k) => `<kbd>${k}</kbd>`).join("");
const qname = (n) => `<i>${n}</i>`;
function hintHTML() {
  const st = $("stage"), s = deck.live;
  const allowed = new Set(String(s.controls || "").split(",").map((t) => t.trim()).filter(Boolean));
  const handles = new Map();
  for (const h of st.querySelectorAll("svg line.handle[data-name]")) if (!handles.has(h.dataset.name)) handles.set(h.dataset.name, h.dataset.q || "");
  const touch = matchMedia("(pointer: coarse)").matches; // primary input is touch: no key alternatives, and Tap for Click
  const or = (...ks) => (touch ? "" : ` <span class="or">or</span> ${kbd(...ks)}`);
  const groups = [], items = [];
  let crossings = [];
  for (const [n, q] of handles) {
    if (q === "a") items.push(qname(n) + or("−", "="));
    else if (q === "s" || q === "rhom" || q === "sigma") items.push(qname(n) + or(",", "."));
    else if (q === "rhop") items.push(qname(n) + or("[", "]"));
    else if (!q) crossings.push(qname(n));
    else items.push(qname(n));
  }
  if (crossings.length) items.unshift(touch ? crossings.join(", ") : `${crossings.join(", ")} <span class="or">or</span> ${kbd("1", "2", "3")} to choose and ${kbd(",", ".")} to move`);
  if (items.length) groups.push(`<b>Drag</b> a shaded line or mark: ${items.join('<span class="sep">·</span>')}`);
  const keys = [];
  if ([...handles.values()].includes("s") && allowed.has("s") && Number.isFinite(parseFloat(s._rhoP)))
    keys.push(`<b>Press</b> ${kbd("p", "q")} to send ${qname("s")} to ${qname("ρ")}<sub>P</sub>, ${qname("ρ")}<sub>Q</sub>`);
  if (allowed.has("j") && !allowed.has("rhopm")) keys.push(`<b>Press</b> ${kbd("[", "]")} for fewer or more curves`);
  if (!touch) groups.push(...keys);
  const words = Array.isArray(s._words) && s._words.length;
  const click = touch ? "Tap" : "Click";
  if (words) groups.push(touch ? `<b>Tap</b> a word to select it` : `<b>Click</b> a word <span class="or">or</span> ${kbd("↑", "↓")} to select it`);
  for (const t of new Set([...st.querySelectorAll(".clickable[data-tip]")].map((c) => c.dataset.hint || c.dataset.tip.replace(/^click (to )?/, ""))))
    if (!(words && /word/.test(t))) groups.push(`<b>${click}</b> ${t}`);
  return groups.join('<span class="sep wide">·</span>');
}
function drawHint() {
  if (!PUBLIC) return;
  const html = hintHTML(), el = $("hint");
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.hidden = !html;
  const here = document.querySelector("#help .this-slide");
  if (here) here.innerHTML = html ? `<b>On this slide:</b> ${html}` : "Nothing to adjust on this slide.";
}
// The drag handles are shaded in one pulse when a slide opens, and when a build changes what can be dragged.
function glow(force = false) {
  if (!PUBLIC) return;
  const st = $("stage"), sig = [...st.querySelectorAll("svg line.handle[data-name]")].map((h) => h.dataset.name).join("|");
  if (!force && sig === glow.sig) return;
  glow.sig = sig;
  st.classList.remove("glow"); void st.offsetWidth; st.classList.add("glow");
  clearTimeout(glow.t); glow.t = setTimeout(() => st.classList.remove("glow"), 1400);
}
// Over a handle: its name, value and direction beside the pointer, kept while dragging. Over a click target: what a click does.
const tipOn = { el: null, x: -1, y: -1, drag: false, touch: false };
const TIP_SEL = "svg line.handle[data-name], svg .clickable[data-tip]";
function refindTip() {
  if (tipOn.touch || tipOn.x < 0) { tipOn.el = null; return; }
  const u = document.elementFromPoint(tipOn.x, tipOn.y)?.closest?.(TIP_SEL);
  tipOn.el = u && $("stage").contains(u) ? u : null;
}
function placeTip() { const t = $("tip"); t.style.left = `${tipOn.x + 14}px`; t.style.top = `${tipOn.y - 34}px`; }
function renderTip() {
  const t = $("tip"), h = tipOn.el;
  if (!h) { t.hidden = true; return; }
  if (h.classList.contains("handle")) {
    const q = h.dataset.q, n = h.dataset.name;
    let v = null;
    for (const k of ["_" + q, q]) { const x = parseFloat(deck.live[k]); if (q && Number.isFinite(x)) { v = x; break; } }
    const cur = !q && [...$("stage").querySelectorAll("svg line.handle[data-name]")].find((x) => x.dataset.name === n);
    if (v === null && cur && Number.isFinite(parseFloat(cur.dataset.v))) v = parseFloat(cur.dataset.v); // the crossings rho_j
    t.innerHTML = `${qname(n)}${v === null ? "" : ` = ${v.toFixed(3)}`} <span class="how">drag ${h.dataset.axis === "y" ? "↕" : "↔"}</span>`;
  } else t.textContent = h.dataset.tip;
  t.hidden = false;
  placeTip();
}
function initPublic() {
  const st = $("stage");
  st.addEventListener("pointerdown", (e) => { if (e.target.closest?.("svg line.handle[data-name]")) tipOn.drag = true; }, true);
  window.addEventListener("pointermove", (e) => {
    tipOn.touch = e.pointerType === "touch"; tipOn.x = e.clientX; tipOn.y = e.clientY;
    if (tipOn.drag) { if (tipOn.el && !tipOn.touch) placeTip(); else $("tip").hidden = true; return; }
    refindTip(); renderTip();
  });
  window.addEventListener("pointerup", () => { if (!tipOn.drag) return; tipOn.drag = false; refindTip(); renderTip(); });
  document.documentElement.addEventListener("mouseleave", () => { if (!tipOn.drag) { tipOn.el = null; renderTip(); } });
  // buttons: act on click, never keep the focus after a mouse click (Space would then press them again)
  document.addEventListener("mousedown", (e) => { if (e.target.closest("button[data-act]")) e.preventDefault(); });
  document.addEventListener("click", (e) => { const b = e.target.closest("button[data-act]"); if (b && !b.disabled) act(b.dataset.act); });
  document.addEventListener("pointerdown", (e) => {
    if (!$("help").hidden && !e.target.closest("#help") && !e.target.closest('button[data-act="help"]')) { $("help").hidden = true; drawProgress(); }
  });
}
function act(a) {
  if (a === "next") next();
  else if (a === "prev") prev();
  else if (a === "notes") { deck.script = deck.script === "bullet" ? "off" : "bullet"; draw(); drawProgress(); }
  else if (a === "sliders") { $("controls").hidden = !$("controls").hidden; drawProgress(); }
  else if (a === "help") { $("help").hidden = !$("help").hidden; tipOn.el = null; renderTip(); drawHint(); drawProgress(); }
}

// Development panel: the spoken text or bullets for this step, and what is on the stage.
function drawScript() {
  const on = deck.script === "full" || deck.script === "bullet";
  document.body.classList.toggle("script-on", on);
  $("script").hidden = !on;
  if (!on) return;
  const step = deck.steps[deck.index];
  if (PUBLIC) { // notes for readers: the bullets only
    $("script").innerHTML = `<div class="notes-head"><span>Speaker's notes</span><button type="button" data-act="notes" title="Close (n or Esc)">×</button></div>` +
      renderMarkdown((step.bullet || "*(no notes for this slide)*").replace(/^\*\*Q:\*\*/m, "**Question:**"));
    return;
  }
  const text = deck.script === "full" ? step.full : step.bullet;
  const layers = deck.items.map(({ name, tag }) => `<div>${name} <span class="tag ${tag}">${tag}</span></div>`).join("");
  $("script").innerHTML =
    `<div class="meta"><span class="mode">${deck.script === "full" ? "script" : "bullets"}</span> · ` +
    `step ${deck.index + 1} / ${deck.steps.length} · ${step.beat || ""}<br>` +
    `<code>content/steps/${step.name}/${deck.script === "full" ? "full" : "bullet"}.md</code> · preset <code>${deck.live.preset}</code></div>` +
    renderMarkdown(text || "*(empty)*") +
    (layers ? `<h4>On stage</h4><div class="layers">${layers}</div>` : "");
}

// Live adjustment of the stage from the keyboard.
function nudge(e) {
  const s = deck.live, big = e.shiftKey;
  const L = (+s.L1 || 0.4) + (+s.L2 || 0.8);
  // Symbolic preset values (half, rhoP, aPlus, ...) are resolved by the stage into _a and _s.
  const num = (k, d) => { const v = parseFloat(s[k]); if (Number.isFinite(v)) return v; const r = parseFloat(s["_" + k]); return Number.isFinite(r) ? r : d; };
  // Only the quantities listed under "controls" in the preset can be changed live:
  // other values would leave the construction shown on that step (e.g. a front outside [a-, a+]).
  const allowed = new Set(String(s.controls || "").split(",").map((t) => t.trim()));
  switch (e.key) {
    case ",": case "<": case ".": case ">":
      if (allowed.has("sigma") && s._sigma !== undefined && s._rhom === undefined) { // step 14, u^Q
        s.sigma = num("sigma", 0.03) + ((e.key === "," || e.key === "<") ? -1 : 1) * (big ? 0.005 : 0.001); return true; }
      if (allowed.has("rhopm") && s._rhom !== undefined) { s.rhom = num("rhom", 0) + ((e.key === "," || e.key === "<") ? -1 : 1) * (big ? 0.02 : 0.004); return true; }
      if (allowed.has("rho3")) { const k = +s.active || 1, Lp = (+s.L1 || 0.4) + (+s.L2 || 0.8), st = (big ? 0.03 : 0.008) * Lp * ((e.key === "," || e.key === "<") ? -1 : 1);
        s["d" + k] = Math.max(-0.12 * Lp, Math.min(0.12 * Lp, (+s["d" + k] || 0) + st)); if (Math.abs(s["d" + k]) < 1e-9) s["d" + k] = 0; return true; }
      if (!allowed.has("s")) return false;
      { const step = (e.key === "." || e.key === ">" ? 1 : -1) * (big ? 0.05 : 0.01), v = num("s", 0) + step;
        s.s = s.wrap === "no" ? v : ((v % L) + L) % L; } // wrap: no lets the phase run on (step 16)
      return true;
    case "-": case "_": if (!allowed.has("a")) return false; s.a = Math.max(+s._amin || 0.3, num("a", 0.5) - (big ? 0.01 : 0.002)); return true;
    case "=": case "+": if (!allowed.has("a")) return false; s.a = Math.min(+s._amax || 0.7, num("a", 0.5) + (big ? 0.01 : 0.002)); return true;
    case "1": case "2": case "3": {
      if (allowed.has("rho3")) { s.active = +e.key; return true; } // step 17: choose which crossing , . move
      if (!allowed.has("word")) return false;
      const w = String(s.word || "PPP").toUpperCase().padEnd(3, "P"), i = +e.key - 1;
      s.word = w.slice(0, i) + (w[i] === "P" ? "Q" : "P") + w.slice(i + 1); return true;
    }
    case "p": case "q": { // send s to the root rho_P or rho_Q (steps 11 and 13)
      if (!allowed.has("s")) return false;
      const r = parseFloat(s[e.key === "p" ? "_rhoP" : "_rhoQ"]);
      if (!Number.isFinite(r)) return false;
      s.s = r; return true;
    }
    case "[": case "]": if (allowed.has("rhopm") && s._rhom !== undefined) { s.rhop = num("rhop", 0) + (e.key === "[" ? -1 : 1) * (big ? 0.02 : 0.004); return true; }
      if (e.key === "]") { if (!allowed.has("j")) return false; s.j = Math.min(6, num("j", 0) + 1); return true; }
      if (!allowed.has("j")) return false; s.j = Math.max(0, num("j", 0) - 1); return true;
    case "ArrowUp": case "ArrowDown": {
      const d = e.key === "ArrowUp" ? 1 : -1;
      if (Array.isArray(s._words) && s._words.length) { // step 17: the selection is a word
        const w = s._words, i = w.indexOf(s.selword);
        s.selword = w[i < 0 ? (d > 0 ? 0 : w.length - 1) : Math.max(0, Math.min(w.length - 1, i + d))]; return true;
      }
      if (s.select !== undefined) { s.select = Math.max(1, num("select", 1) + d); return true; }
      if (s.view === "profile" && allowed.has("rho")) { s.rho = Math.min(0.1, Math.max(0.01, num("rho", 0.06) + d * (big ? 0.02 : 0.005))); return true; }
      return false;
    }
  }
  return false;
}

function keydown(e) {
  const k = e.key;
  if (e.target.tagName === "INPUT" && /^(Arrow|Page|Home|End)/.test(k)) return; // a focused slider keeps its own keys
  // leave browser shortcuts alone (Ctrl, Cmd, Alt+arrows), but not AltGr (Ctrl+Alt) or Option characters such as [ ]
  if (e.metaKey || (e.ctrlKey && !e.altKey) || (e.altKey && !e.ctrlKey && /^(Arrow|Page|Home|End)/.test(k))) return;
  if (["ArrowRight", " ", "PageDown"].includes(k)) { next(); e.preventDefault(); return; }
  if (["ArrowLeft", "PageUp", "Backspace"].includes(k)) { prev(); e.preventDefault(); return; }
  if (nudge(e)) { e.preventDefault(); requestAnimationFrame(draw); return; }
  if (k === "Home") show(0);
  else if (k === "End") show(PUBLIC ? deck.main - 1 : deck.steps.length - 1);
  else if (k === "r") show(deck.index);
  else if (PUBLIC && ["c", "n", "s", "?"].includes(k)) act({ c: "sliders", n: "notes", s: "notes", "?": "help" }[k]);
  else if (PUBLIC && k === "Escape") { $("help").hidden = true; if (deck.script === "bullet") { deck.script = "off"; draw(); } drawProgress(); }
  else if (k === "c") $("controls").hidden = !$("controls").hidden;
  else if (k === "s") { deck.script = { off: "full", full: "bullet", bullet: "off" }[deck.script] || "off"; draw(); }
  else if (k === "?") $("help").hidden = !$("help").hidden;
  else if (k === "f") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === "g") { const n = parseInt(prompt(PUBLIC ? `Go to slide (1–${deck.main}):` : "Go to step number:"), 10); if (n) show(n - 1); }
}

async function main() {
  const [order, presetsText] = await Promise.all([load("content/steps.txt"), load("content/presets.md")]);
  deck.presets = parsePresets(presetsText);
  // A line "backup" in steps.txt starts the backup slides: reachable, but outside the progress count.
  const lines = order.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const cut = lines.indexOf("backup");
  const names = lines.filter((l) => l !== "backup");
  deck.main = cut < 0 ? names.length : cut;
  deck.steps = await Promise.all(names.map(async (name) => {
    const dir = `content/steps/${name}`;
    const [slide, full, bullet] = await Promise.all([load(`${dir}/slide.md`), (PUBLIC ? "" : load(`${dir}/full.md`, true)), load(`${dir}/bullet.md`, true)]);
    const { stage, md } = parseSlide(slide);
    return { name, stage, md, full, bullet, beat: stage.beat };
  }));
  const start = parseInt(location.hash.slice(1), 10);
  if (PUBLIC) initPublic();
  show(Number.isFinite(start) ? start - 1 : 0);
  window.addEventListener("keydown", keydown);
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (Number.isFinite(n) && n - 1 !== deck.index) show(n - 1);
  });
  window.addEventListener("resize", () => requestAnimationFrame(draw));
  window.__deck = deck; // used by tools/export.sh
}

main().catch((e) => { $("text").textContent = `Failed to load: ${e.message}`; document.body.dataset.ready = "error"; });
