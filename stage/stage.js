// Stage renderer. Draws one stage state (from content/presets.md plus step overrides) as SVG.
// All mathematics comes from core.js (numerical core, specialist-owned); this file only draws.
// Every drawn layer is registered in the legend with its status: exact, computed or schematic.
import { makeModel, mirror } from "./core.js";
import * as V3 from "./views3.js";
import * as GEO from "./geo.js";
import * as G3 from "./graph3d.js";

const NS = "http://www.w3.org/2000/svg";
const C = {
  unstable: "#1f5fbf", stable: "#d9640b", spargel: "#4b2a85", wu00: "#3a9d5d", pocket: "#f6dcc4",
  front: "#111", threshold: "#777", escape: "#f7d9d9", ret: "#dcefdc", grey: "#999", sub: "#1b6e3a", sup: "#a0301f",
};
const SPARGEL_SHADES = ["#9b7fd1", "#7f5fc2", "#6747ad", "#523597", "#40287f", "#2f1c66", "#22134f"];

// ---------- small SVG helpers ----------
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, cls = "lbl", attrs = {}) {
  const t = el("text", { x, y, class: cls, ...attrs }, parent);
  t.textContent = str;
  return t;
}
function svgRoot(container, w, h) {
  container.innerHTML = "";
  return el("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "xMidYMid meet" }, container);
}
// Plot frame mapping data box -> pixel rect.
function frame(svg, box, rect, opts = {}) {
  const [x0, x1, y0, y1] = box, [X, Y, W, H] = rect;
  const fx = (x) => X + ((x - x0) / (x1 - x0)) * W;
  const fy = (y) => Y + H - ((y - y0) / (y1 - y0)) * H;
  const g = el("g", {}, svg);
  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  const cp = el("clipPath", { id: clipId }, el("defs", {}, svg));
  el("rect", { x: X, y: Y, width: W, height: H }, cp);
  const plot = el("g", { "clip-path": `url(#${clipId})` }, g);
  if (opts.axes !== false) {
    el("rect", { x: X, y: Y, width: W, height: H, fill: "none", stroke: "#bbb" }, g);
    for (const t of opts.xticks || []) {
      el("line", { x1: fx(t), x2: fx(t), y1: Y + H, y2: Y + H + 6, stroke: "#333" }, g);
      text(g, fx(t), Y + H + 26, fmt(t), "tick", { "text-anchor": "middle" });
    }
    for (const t of opts.yticks || []) {
      el("line", { x1: X - 6, x2: X, y1: fy(t), y2: fy(t), stroke: "#333" }, g);
      text(g, X - 10, fy(t) + 7, fmt(t), "tick", { "text-anchor": "end" });
    }
    if (opts.xlabel) text(g, X + W / 2, Y + H + 54, opts.xlabel, "axis-label", { "text-anchor": "middle" });
    if (opts.ylabel) text(g, X - 62, Y + H / 2, opts.ylabel, "axis-label", { "text-anchor": "middle", transform: `rotate(-90 ${X - 62} ${Y + H / 2})` });
  }
  return { g, plot, fx, fy, box, rect };
}
function fmt(t) { return Math.abs(t) < 1e-12 ? "0" : (+t.toFixed(3)).toString(); }
// Polyline with breaks: points [[x,y],...] with null entries as breaks.
function pathD(F, pts) {
  let d = "", pen = false;
  for (const p of pts) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${F.fx(p[0]).toFixed(2)},${F.fy(p[1]).toFixed(2)}`;
    pen = true;
  }
  return d;
}
function line(F, pts, style) { return el("path", { d: pathD(F, pts), fill: "none", "stroke-linejoin": "round", ...style }, F.plot); }
function dot(F, p, r, style) { return el("circle", { cx: F.fx(p[0]), cy: F.fy(p[1]), r, ...style }, F.plot); }
function label(F, p, str, dx = 8, dy = -8, cls = "lbl-i", attrs = {}) { return text(F.plot, F.fx(p[0]) + dx, F.fy(p[1]) + dy, str, cls, attrs); }
function ticks(a, b, n) { const out = [], step = niceStep((b - a) / n); for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(+t.toFixed(10)); return out; }
function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
// Convert a curve object from core.js to a point list with breaks.
function pts(curve) {
  if (!curve) return [];
  if (Array.isArray(curve)) return curve;
  if (curve.points) return curve.points.map((q) => (q ? (Array.isArray(q) ? q : [q.u ?? q.x, q.v ?? q.y]) : null));
  if (curve.us && curve.vs) return curve.us.map((u, i) => [u, curve.vs[i]]);
  return [];
}

// ---------- legend and controls ----------
function legendHTML(items) {
  return items.map(({ name, color, dash, tag }) =>
    `<div><span class="sw" style="background:${dash ? `repeating-linear-gradient(90deg,${color} 0 6px,transparent 6px 10px)` : color}"></span>${name} <span class="tag ${tag}">${tag}</span></div>`).join("");
}
// Controls panel (key c): one slider per live quantity listed under "controls", built after the view has drawn,
// with the range the view uses (state._ctl[key] = [min, max, step], set by the view; defaults below).
// Dragging the drawn object is the primary control; the panel and the keys are alternatives.
// The sliders are kept while the slide, build and quantities stay the same, and only their values and labels are
// updated on redraws: rebuilding them on every input event would end a slider drag after its first step.
function buildControls(container, state, onChange) {
  const alias = { rhopm: ["rhom", "rhop"] };
  const list = (state.controls || "").split(",").map((s) => s.trim()).filter(Boolean).flatMap((k) => alias[k] || [k]);
  const ctl = state._ctl || {};
  const L = (+state.L1 || 0.4) + (+state.L2 || 0.8);
  const defaults = { a: [+state._amin || 0.3, +state._amax || 0.7, 0.001], s: [0, L - 1e-6, 0.001], j: [0, 6, 1] };
  // each slider is labelled by the quantity as the figure draws it (on the prescribed-source view, s is the interface rho)
  const names = { rhom: "ρ₋", rhop: "ρ₊", sigma: "σ", s: state.view === "prescribed" ? "ρ" : "s" };
  const rows = list.map((key) => ({ key, r: ctl[key] || defaults[key], v: +(state["_" + key] ?? state[key]) })).filter((x) => x.r);
  const label = (key, r, x) => `${key === "j" ? "curves" : `<i>${names[key] || key}</i>`} = ${r[2] >= 1 ? x : (+x).toFixed(3)}`;
  const sig = `${rows.map((x) => x.key).join(",")}|${state.preset || ""}|${state.build || 0}`;
  if (container.dataset.sig === sig && container.children.length === rows.length) {
    rows.forEach(({ key, r, v }, i) => {
      const lab = container.children[i], span = lab.firstElementChild, inp = lab.lastElementChild, busy = inp.dataset.busy === "1";
      Object.assign(inp, { min: r[0], max: r[1], step: r[2] });
      if (!busy && Number.isFinite(v)) inp.value = v;
      span.innerHTML = label(key, r, busy ? inp.value : Number.isFinite(v) ? v : r[0]);
    });
    return;
  }
  container.innerHTML = "";
  container.dataset.sig = sig;
  for (const { key, r, v } of rows) {
    const lab = document.createElement("label");
    const span = document.createElement("span");
    span.innerHTML = label(key, r, Number.isFinite(v) ? v : r[0]);
    const inp = document.createElement("input");
    Object.assign(inp, { type: "range", min: r[0], max: r[1], step: r[2], value: Number.isFinite(v) ? v : r[0] });
    inp.addEventListener("input", () => { span.innerHTML = label(key, r, inp.value); onChange({ [key]: inp.value }); });
    // held by the pointer: redraws leave its value alone; released: it gives the keys back to the deck
    inp.addEventListener("pointerdown", () => {
      inp.dataset.busy = "1";
      const up = () => { delete inp.dataset.busy; inp.blur(); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
      window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    });
    lab.append(span, inp);
    container.appendChild(lab);
  }
}

// Resolve symbolic values in presets.
function num(state, key, model) {
  const v = state[key];
  if (v === undefined || v === "") return NaN;
  const t = String(v).trim();
  const a = () => num(state, "a", model);
  switch (t) {
    case "half": return 0.5;
    case "aMinus": return model.aMinus;
    case "aPlus": return model.aPlus;
    case "L1": return model.P.L1;
    case "L1/2": return model.P.L1 / 2;
    case "rhoP": return model.roots(a()).rhoP;
    case "rhoQ": return model.roots(a()).rhoQ;
    default: return parseFloat(t);
  }
}

// ---------- model cache ----------
const models = new Map();
function getModel(state) {
  const P = { alpha: +state.alpha, L1: +state.L1, L2: +state.L2 };
  const key = `${P.alpha},${P.L1},${P.L2}`;
  if (!models.has(key)) { const m = makeModel(P); m.P = P; m.cache = new Map(); models.set(key, m); }
  return models.get(key);
}
function memo(model, key, fn) { if (!model.cache.has(key)) model.cache.set(key, fn()); return model.cache.get(key); }

// ---------- entry point ----------
// `items` collects what is drawn, with its status (exact / computed / schematic).
// It is shown only in the development script panel, never on the slide.
export function renderStage({ stage, controls, state, items = [], onChange, exportMode }) {
  const view = state.view || "none";
  V3.cancelAnimations();
  if (view === "none" || view === "title") { stage.innerHTML = ""; controls.innerHTML = ""; controls.dataset.sig = ""; return; }
  const noModel = ["junction3d", "geo-cubic", "necklace", "unrolled", "reduction", "images", "junction", "cubic", "cubic-portrait", "lengths", "smooth-hop", "smooth-map", "smooth-manifolds"];
  const model = noModel.includes(view) ? null : getModel(state);
  ({ necklace: drawNecklace, unrolled: drawUnrolled, homogeneous: drawHomogeneous, "period-map": drawPeriodMap,
     profile: drawProfileView, figure: drawFigure,
     images: V3.drawImages, junction: V3.drawJunction, cubic: V3.drawCubic, "cubic-portrait": V3.drawCubicPortrait,
     cloud: V3.drawCloud, crossing: V3.drawCrossing, interval: V3.drawInterval, lengths: V3.drawLengths,
     orientation: V3.drawOrientation, prescribed: V3.drawPrescribed, "only-way": V3.drawOnlyWay, builder: V3.drawBuilder, builder4: V3.drawBuilder4, "geo-cubic": GEO.drawGeoCubic, necklace3d: G3.drawNecklace3d, junction3d: G3.drawJunction3d, "geo-mckean": GEO.drawGeoMcKean, "geo-orientation": GEO.drawGeoOrientation, stability: GEO.drawStability, "necklace-front": V3.drawNecklaceFront, reduction: V3.drawReduction, answers: V3.drawAnswers,
     "smooth-hop": V3.drawSmoothHop, "smooth-map": V3.drawSmoothMap, "smooth-manifolds": V3.drawSmoothManifolds,
  })[view]?.({ stage, state, model, items, exportMode, onChange });
  // drag handles stay on top of everything drawn after them
  for (const g of stage.querySelectorAll("svg > g.handles")) g.parentNode.appendChild(g);
  buildControls(controls, state, onChange);
}

// ---------- mouse interaction ----------
function liveControls(state) { return new Set(String(state.controls || "").split(",").map((t) => t.trim()).filter(Boolean)); }
// Drag the drawn object that represents a quantity (round 5): a wide transparent stroke over the object,
// a vertical line x = at (axis "x", dragged sideways) or a horizontal line y = at (axis "y", dragged up and down),
// optionally limited to lo..hi along the line. The quantity grabbed at pointerdown is kept until release,
// whatever the pointer passes over; set(v) receives at + gain·(pointer displacement in data units).
// With range = [min, max] the value is clamped to it, and the gain is reduced where needed so that the whole range
// takes at least minPx pixels of pointer travel (a short range drawn small would otherwise jump to its ends).
// q (the state key it changes) and name (the quantity as drawn, default q) let the page name the handle
// on hover and in the per-slide hint (published version).
function dragHandle(svg, F, { axis = "x", at, lo, hi, set, gain = 1, cursor, range, minPx = 300, q, name }) {
  if (!set || !Number.isFinite(at)) return null;
  const [X, Y, W, H] = F.rect, [x0, x1, y0, y1] = F.box;
  if (range) {
    const perPx = axis === "x" ? Math.abs(x1 - x0) / W : Math.abs(y1 - y0) / H;
    gain = Math.min(gain, (range[1] - range[0]) / minPx / perPx);
    const raw = set; set = (v) => raw(Math.min(range[1], Math.max(range[0], v)));
  }
  if (axis === "x" ? at < Math.min(x0, x1) || at > Math.max(x0, x1) : at < Math.min(y0, y1) || at > Math.max(y0, y1)) return null;
  const g = svg.querySelector(":scope > g.handles") || el("g", { class: "handles" }, svg);
  const ends = axis === "x"
    ? { x1: F.fx(at), x2: F.fx(at), y1: lo !== undefined ? F.fy(lo) : Y, y2: hi !== undefined ? F.fy(hi) : Y + H }
    : { y1: F.fy(at), y2: F.fy(at), x1: lo !== undefined ? F.fx(lo) : X, x2: hi !== undefined ? F.fx(hi) : X + W };
  const h = el("line", { ...ends, class: "handle", stroke: "transparent", "stroke-width": 26, "stroke-linecap": "round",
    style: `cursor:${cursor || (axis === "x" ? "ew-resize" : "ns-resize")}` }, g);
  if (q || name) { h.setAttribute("data-q", q || ""); h.setAttribute("data-name", name || q); }
  h.setAttribute("data-axis", axis); h.setAttribute("data-v", at);
  h.addEventListener("pointerdown", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const m = svg.getScreenCTM().inverse();
    const toData = (e) => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      return axis === "x" ? x0 + ((p.x - X) / W) * (x1 - x0) : y0 + (1 - (p.y - Y) / H) * (y1 - y0);
    };
    const start = toData(ev);
    const move = (e) => set(at + gain * (toData(e) - start));
    const up = () => { for (const [t, f] of [["pointermove", move], ["pointerup", up], ["pointercancel", up]]) window.removeEventListener(t, f); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  });
  return h;
}
// A click target (a word, a dot, a letter): marked so that the page can show what a click does.
// tip: beside the pointer; hint: the phrase for the line under the figure ("Click …").
function clickTip(node, tip, hint) { node.classList.add("clickable"); node.setAttribute("data-tip", tip); if (hint) node.setAttribute("data-hint", hint); return node; }
// A white plate behind a label, so that curves passing under it do not cut it (round 5 review).
function plate(t) {
  try { const b = t.getBBox(); t.parentNode.insertBefore(el("rect", { x: b.x - 4, y: b.y - 1, width: b.width + 8, height: b.height + 2, fill: "#fff", opacity: 0.88, rx: 3 }), t); } catch (e) { /* no layout */ }
  return t;
}
// A frame-like mapping for handles on objects outside a plotted frame (e.g. a tick on a height scale).
function pseudoFrame(rect, box) {
  const [X, Y, W, H] = rect, [x0, x1, y0, y1] = box;
  return { rect, box, fx: (x) => X + ((x - x0) / (x1 - x0)) * W, fy: (y) => Y + H - ((y - y0) / (y1 - y0)) * H };
}
// Dragging: map the pointer's x position into the data coordinate of frame F and report it.
function dragX(F, svg, onValue, cursor = "ew-resize") {
  const [X, Y, W, H] = F.rect;
  const hit = el("rect", { x: X, y: Y, width: W, height: H, fill: "transparent", style: `cursor:${cursor}` }, F.g);
  hit.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scale = Math.min(box.width / vb.width, box.height / vb.height);
    const ox = box.left + (box.width - vb.width * scale) / 2;
    const toData = (cx) => F.box[0] + (((cx - ox) / scale - X) / W) * (F.box[1] - F.box[0]);
    const move = (e) => onValue(Math.min(F.box[1], Math.max(F.box[0], toData(e.clientX))));
    move(ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  return hit;
}
// A draggable threshold line u = a in frame F (only where the preset lists "a" as a live control).
function thresholdHandle(F, svg, a, onChange) {
  if (!onChange) return;
  const h = el("line", { x1: F.fx(a), x2: F.fx(a), y1: F.rect[1], y2: F.rect[1] + F.rect[3], stroke: "transparent", "stroke-width": 24, style: "cursor:ew-resize" }, F.g);
  h.addEventListener("pointerdown", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const scale = Math.min(box.width / vb.width, box.height / vb.height);
    const ox = box.left + (box.width - vb.width * scale) / 2;
    const [X, , W] = F.rect;
    const move = (e) => {
      const u = F.box[0] + (((e.clientX - ox) / scale - X) / W) * (F.box[1] - F.box[0]);
      onChange({ a: Math.min(+F.amax || 0.7, Math.max(+F.amin || 0.3, u)) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

// ---------- schematic views ----------
function drawNecklace({ stage, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const y = 405, L1 = 170, L2h = 130, x0 = 20;
  let x = x0;
  for (let k = 0; k < 4; k++) {
    el("line", { x1: x, y1: y, x2: x + L1, y2: y, stroke: "#222", "stroke-width": 6 }, svg);
    if (k === 1) text(svg, x + L1 / 2, y - 22, "L₁", "lbl-i", { "text-anchor": "middle" });
    x += L1;
    const r = L2h / 2;
    el("path", { d: `M${x},${y} A${r},${r * 0.8} 0 0 1 ${x + L2h},${y}`, fill: "none", stroke: "#222", "stroke-width": 6 }, svg);
    el("path", { d: `M${x},${y} A${r},${r * 0.8} 0 0 0 ${x + L2h},${y}`, fill: "none", stroke: "#222", "stroke-width": 6 }, svg);
    if (k === 1) text(svg, x + L2h / 2, y - r * 0.8 - 16, "L₂/2", "lbl-i", { "text-anchor": "middle" });
    el("circle", { cx: x, cy: y, r: 8, fill: "#222" }, svg);
    el("circle", { cx: x + L2h, cy: y, r: 8, fill: "#222" }, svg);
    x += L2h;
  }
  items.push({ name: "necklace graph", color: "#222", tag: "schematic" });
}

function drawUnrolled({ stage, items }) {
  const svg = drawNecklaceSmall(stage);
  const y = 520, x0 = 40, w1 = 150, w2 = 220;
  let x = x0;
  for (let k = 0; k < 3; k++) {
    el("rect", { x, y: y - 26, width: w1, height: 52, fill: "#fff", stroke: "#222", "stroke-width": 2 }, svg);
    text(svg, x + w1 / 2, y + 8, "p = 1", "lbl-i", { "text-anchor": "middle" });
    x += w1;
    el("rect", { x, y: y - 26, width: w2, height: 52, fill: "#e5e5e5", stroke: "#222", "stroke-width": 2 }, svg);
    text(svg, x + w2 / 2, y + 8, "p = 4", "lbl-i", { "text-anchor": "middle" });
    x += w2;
  }
  text(svg, x0 + w1 / 2, y + 62, "L₁", "lbl-i", { "text-anchor": "middle" });
  text(svg, x0 + w1 + w2 / 2, y + 62, "L₂", "lbl-i", { "text-anchor": "middle" });
  items.push({ name: "necklace and unrolled line", color: "#222", tag: "schematic" });
}
function drawNecklaceSmall(stage) {
  const svg = svgRoot(stage, 1000, 810);
  const y = 220, L1 = 150, L2h = 110;
  let x = 40;
  for (let k = 0; k < 3; k++) {
    el("line", { x1: x, y1: y, x2: x + L1, y2: y, stroke: "#222", "stroke-width": 4 }, svg);
    x += L1;
    const r = L2h / 2;
    el("path", { d: `M${x},${y} A${r},${r * 0.75} 0 0 1 ${x + L2h},${y}`, fill: "none", stroke: "#222", "stroke-width": 4 }, svg);
    el("path", { d: `M${x},${y} A${r},${r * 0.75} 0 0 0 ${x + L2h},${y}`, fill: "none", stroke: "#222", "stroke-width": 4 }, svg);
    el("line", { x1: x, y1: y + 60, x2: x - 0.0, y2: y + 230, stroke: "#aaa", "stroke-dasharray": "6 6" }, svg);
    x += L2h;
  }
  return svg;
}

function drawFigure({ stage, state, items }) {
  stage.innerHTML = `<img src="build/fig/${state.figure}" style="width:100%;height:100%;object-fit:contain">`;
  items.push({ name: `manuscript figure (${state.figure})`, color: "#444", tag: state.figuretag || "computed" });
}

// ---------- Beat 1: homogeneous phase plane ----------
function drawHomogeneous({ stage, state, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const box = state.box.split(",").map(Number);
  const a = parseFloat(state.a) || 0.5;
  const F = frame(svg, box, [110, 40, 860, 680], { xticks: ticks(box[0], box[1], 5), yticks: ticks(box[2], box[3], 5), xlabel: "u", ylabel: "v = u′" });
  const layers = layerSet(state);
  if (layers.has("threshold")) { line(F, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 }); label(F, [a, box[3]], "u = a", 6, 26); }
  if (layers.has("separatrices")) {
    line(F, [[a, a - 1], [1, 0]], { stroke: C.unstable, "stroke-width": 5 });
    line(F, [[0, 0], [a, -a]], { stroke: C.stable, "stroke-width": 5 });
    label(F, [0.5 * (a + 1), 0.5 * (a - 1)], "v = u − 1", 14, 6, "direct", { fill: C.unstable });
    label(F, [0.5 * a, -0.5 * a], "v = −u", -110, 6, "direct", { fill: C.stable });
    items.push({ name: "v = u − 1 (u ≥ a), from (1,0)", color: C.unstable, tag: "exact" });
    items.push({ name: "v = −u (u ≤ a), into (0,0)", color: C.stable, tag: "exact" });
  }
  if (layers.has("gap")) {
    line(F, [[a, a - 1], [a, -a]], { stroke: "#000", "stroke-width": 3 });
    label(F, [a, (a - 1 - a) / 2], `gap 2(a − ½) = ${(2 * (a - 0.5)).toFixed(3)}`, 12, 8, "lbl");
  }
  if (layers.has("front-orbit") && Math.abs(a - 0.5) < 1e-9) {
    line(F, [[1, 0], [0.5, -0.5], [0, 0]], { stroke: C.front, "stroke-width": 2, "stroke-dasharray": "2 5" });
    items.push({ name: "orbit of every translate of the front", color: C.front, dash: true, tag: "exact" });
  }
  dot(F, [0, 0], 7, { fill: "#000" }); dot(F, [1, 0], 7, { fill: "#000" });
  label(F, [0, 0], "(0,0)", 8, -12, "lbl"); label(F, [1, 0], "(1,0)", -70, -12, "lbl");
  if (layers.has("threshold") && liveControls(state).has("a")) thresholdHandle(F, svg, a, onChange);
}

// ---------- period-map phase plane ----------
function layerSet(state) { return new Set((state.layers || "").split(",").map((s) => s.trim()).filter(Boolean)); }

function drawPeriodMap({ stage, state, model, items, exportMode, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  let box = state.box === "pocket" ? [0, 1, -1, 0] : state.box.split(",").map(Number);
  let a = num(state, "a", model);
  if (state.clampa) {
    // keep a strictly inside (a-, a+): the base-and-spargel construction is used inside the interval
    const m = +state.clampa;
    a = Math.min(model.aPlus - m, Math.max(model.aMinus + m, a));
    state.a = a; state._amin = model.aMinus + m; state._amax = model.aPlus - m;
  }
  const s = num(state, "s", model), j = +state.j || 0;
  state._a = a; state._s = s;
  const wordList = !!state.wordlabels;
  if (state.box === "pocket") {
    // frame the pocket at this a (base [Q0, P0] and escaping arc E), with a margin and equal scales
    const pk0 = memo(model, `pocket:${a}`, () => model.pocketObjects(a));
    const P = [pk0.Q0, pk0.P0, ...pts(pk0.E).filter(Boolean)];
    let u0 = Math.min(...P.map((p) => p[0])), u1 = Math.max(...P.map((p) => p[0]));
    let v0 = Math.min(...P.map((p) => p[1])), v1 = Math.max(...P.map((p) => p[1]));
    const mg = 0.1 * Math.max(u1 - u0, v1 - v0, 0.02); u0 -= mg; u1 += mg; v0 -= mg; v1 += mg;
    const k = Math.max((u1 - u0) / 540, (v1 - v0) / 480), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    box = [cu - k * 270, cu + k * 270, cv - k * 240, cv + k * 240];
  }
  const L = model.L;
  if (state.zoomonly) { drawZooms(svg, model, state, a, items, true); return; }
  const PANEL = [120, 585, 850, 160]; // leaves room for the panel axis title inside the 810-high viewBox
  const F = frame(svg, box, wordList ? [110, 30, 540, 480] : state.panel ? [120, 30, 850, 470] : state.pairzoom ? [110, 40, 560, 680] : [120, 40, 850, 680], { xticks: ticks(box[0], box[1], 5), yticks: ticks(box[2], box[3], 5), xlabel: "u", ylabel: "v = p u′" });
  const layers = layerSet(state);
  const has = (k) => layers.has(k);
  items.push({ name: `α = ${model.P.alpha}, L₁ = ${model.P.L1}, L₂ = ${model.P.L2}; a = ${a.toFixed(4)}, s = ${Number.isFinite(s) ? s.toFixed(4) : "–"}`, color: "#999", tag: "exact" });

  if (has("escape-return")) {
    // Region u<a split by the stable line v = -r_-(s) u: below escapes, above returns (Remark 5.7).
    const rm = model.rMinus(s);
    const vl = (u) => -rm * u;
    el("path", { d: pathD(F, [[box[0], vl(box[0])], [a, vl(a)], [a, box[2]], [box[0], box[2]]]), fill: C.escape, stroke: "none" }, F.plot);
    el("path", { d: pathD(F, [[box[0], vl(box[0])], [a, vl(a)], [a, box[3]], [box[0], box[3]]]), fill: C.ret, stroke: "none" }, F.plot);
    label(F, [box[0] + 0.03, box[2] + 0.06], "escape", 0, 0, "lbl");
    label(F, [a - 0.03, box[3] - 0.2], "return", 0, 0, "lbl", { "text-anchor": "end" });
    items.push({ name: "u < a: escape (below) / return (above) the stable line", color: "#c9a", tag: "exact" });
  }
  if (has("pocket") || has("pocket-endpoint") || has("endpoint-markers") || has("E") || has("base") || has("base-crossings")) {
    var pk = memo(model, `pocket:${a}`, () => model.pocketObjects(a));
  }
  if ((has("pocket") || has("pocket-endpoint")) && pk) {
    // Fill only when the computed boundary arc E has no breaks; never bridge an unresolved piece.
    const Ep = pts(pk.E);
    const complete = Ep.length > 1 && Ep.every(Boolean) && !(pk.E.breaks && pk.E.breaks.length);
    if (complete) {
      el("path", { d: pathD(F, [...Ep, pk.Q0, pk.P0]) + "Z", fill: C.pocket, stroke: "none" }, F.plot);
      items.push({ name: "pocket", color: C.pocket, tag: "computed" });
    } else items.push({ name: "pocket fill omitted: boundary arc not fully resolved", color: C.pocket, tag: "computed" });
  }
  if (has("threshold")) { line(F, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 }); }
  if (has("eigenlines")) {
    const sp = model.straightParts(s, a, box);
    line(F, pts(sp.unstableLine), { stroke: C.unstable, "stroke-width": 1.5, opacity: 0.6 });
    line(F, pts(sp.stableLine), { stroke: C.stable, "stroke-width": 1.5, opacity: 0.6 });
    items.push({ name: "eigenlines of the linearized period map", color: "#aaa", tag: "exact" });
  }
  if (has("straight-parts")) {
    const sp = model.straightParts(s, a);
    line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 5 });
    line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 5 });
    if (!state.nolabels && !state.plain) {
      const mu = pts(sp.unstable), ms = pts(sp.stable);
      const mid = (q) => [0.35 * q[0][0] + 0.65 * q[1][0], 0.35 * q[0][1] + 0.65 * q[1][1]];
      subText(F.plot, F.fx(mid(mu)[0]) + 14, F.fy(mid(mu)[1]) + 26, ["W", ["^u"], "(1,0)"], "direct", { fill: C.unstable });
      subText(F.plot, F.fx(mid(ms.slice().reverse())[0]) - 16, F.fy(mid(ms.slice().reverse())[1]) + 30, ["W", ["^s"], "(0,0)"], "direct", { fill: C.stable, "text-anchor": "end" });
    }
    items.push({ name: "straight part of W^u(1,0)", color: C.unstable, tag: "exact" });
    items.push({ name: "straight part of W^s(0,0)", color: C.stable, tag: "exact" });
  }
  if (has("gap")) {
    const vu = -(1 - a) * model.rPlus(s), vs = -a * model.rMinus(s);
    line(F, [[a, vu], [a, vs]], { stroke: "#000", "stroke-width": 3 });
    if (Math.abs(vu - vs) > 1e-6) label(F, [a, (vu + vs) / 2], `gap = ${(vu - vs).toFixed(3)}`, -12, 8, "lbl", { "text-anchor": "end" });
    items.push({ name: "gap (r₊+r₋)(a−b(s)) at u = a", color: "#000", tag: "exact" });
  }
  if (has("b-point")) {
    const bs = model.b(s), vb = -model.rMinus(s) * bs;
    dot(F, [bs, vb], 7, { fill: "#fff", stroke: "#000", "stroke-width": 2.5 });
    line(F, [[bs, vb], [bs, box[2]]], { stroke: "#000", "stroke-dasharray": "3 5" });
    label(F, [bs, box[2]], "b(s)", 6, -10);
    items.push({ name: "crossing point of the two lines, u = b(s)", color: "#000", tag: "exact" });
  }
  if (has("roots") && Math.abs(model.b(s) - a) < 1e-6) {
    dot(F, [a, -(1 - a) * model.rPlus(s)], 9, { fill: "#000" });
    label(F, [a, -(1 - a) * model.rPlus(s)], "threshold state of a front", 14, 20, "lbl");
    items.push({ name: "threshold state at a root of b = a", color: "#000", tag: "computed" });
  }
  if (has("trajectory-uP") || has("trajectory-uP-faint") || has("samples-uP")) {
    const rhoP = model.roots(a).rhoP;
    const Z = [a, -(1 - a) * model.rPlus(rhoP)];
    const span = 4 * L;
    const tr = memo(model, `trajP:${a}`, () => model.trajectory(Z, rhoP, rhoP - span, a, {}));
    const tf = memo(model, `trajPf:${a}`, () => model.trajectory(Z, rhoP, rhoP + span, a, {}));
    const curve = [...pts(tr).reverse(), null, ...pts(tf)];
    if (has("trajectory-uP")) {
      const p = line(F, curve, { stroke: C.front, "stroke-width": 3 });
      const len = p.getTotalLength ? p.getTotalLength() : 0;
      if (len && !exportMode) { p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 5000, fill: "forwards" }); }
      items.push({ name: "trajectory x ↦ (u, p u′) of u^P", color: C.front, tag: "computed" });
    }
    if (has("trajectory-uP-faint")) { line(F, curve, { stroke: C.front, "stroke-width": 1.5, opacity: 0.25 }); items.push({ name: "trajectory of u^P (faint)", color: "#bbb", tag: "computed" }); }
    if (has("samples-uP")) {
      for (let k = -4; k <= 4; k++) {
        const Zk = memo(model, `sampleP:${a}:${s}:${k}`, () => model.flow(Z, rhoP, s + k * L, a));
        dot(F, Zk, 7, { fill: "#fff", stroke: C.front, "stroke-width": 2.5 });
      }
      items.push({ name: "samples of u^P at x = s + kL", color: C.front, tag: "computed" });
    }
  }
  if (has("I")) {
    const I = memo(model, `I:${a}:${s}`, () => model.segmentI(s, a));
    const c0 = I.cRange[0], c1 = I.cRange[1];
    line(F, [I.point(c0), I.point(c1)], { stroke: C.unstable, "stroke-width": 7 });
    label(F, I.point((c0 + c1) / 2), "I", 10, -6);
    items.push({ name: "segment I of the straight unstable part", color: C.unstable, tag: "exact" });
  }
  if (has("E") && pk) {
    line(F, pts(pk.E), { stroke: "#203f8f", "stroke-width": 3 });
    if (!state.plain) label(F, pts(pk.E).filter(Boolean)[Math.floor(pts(pk.E).filter(Boolean).length / 2)], "E", -28, -6);
    items.push({ name: "escaping arc E", color: "#203f8f", tag: "computed" });
  }
  if (has("spargels") || has("spargels-faint")) {
    const faint = has("spargels-faint");
    for (let k = 0; k <= j; k++) {
      const sp = memo(model, `sp:${a}:${k}:0.01`, () => model.spargel(k, a, { maxChord: 0.01 }));
      const shades = state.plain ? ["#7fa6e0", "#5f8fd6", "#3f78cb", "#2a63b8", "#1d4f9c", "#163f80", "#10316a"] : SPARGEL_SHADES; // talk: W^u(1,0) stays blue
      line(F, pts(sp), { stroke: shades[Math.min(k, shades.length - 1)], "stroke-width": faint ? 1.5 : 2.5, opacity: faint ? 0.45 : 1 });
    }
    if (!faint && !state.plain) {
      const last = pts(memo(model, `sp:${a}:${j}:0.01`, () => model.spargel(j, a, { maxChord: 0.01 }))).filter(Boolean);
      const inBox = last.filter((q) => q[0] > box[0] && q[0] < box[1] && q[1] > box[2] && q[1] < box[3]);
      const top = inBox.reduce((m, q) => (q[1] > m[1] ? q : m), inBox[0] || [0, 0]);
      const dy = F.fy(top[1]) - 10 < F.rect[1] + 28 ? 30 : -10; // keep the label inside the frame
      label(F, top, j === 0 ? "Σ₀" : `Σ${sub(j)}`, 10, dy, "direct", { fill: C.spargel });
    }
    items.push({ name: `spargels Σ₀ … Σ${sub(j)}`, color: C.spargel, tag: "computed" });
  }
  if (has("mirror-faint")) {
    for (let k = 0; k <= j; k++) {
      const sp = memo(model, `sp:${a}:${k}:0.01`, () => model.spargel(k, a, { maxChord: 0.01 }));
      line(F, pts(sp).map((q) => (q ? mirror(q) : null)), { stroke: C.stable, "stroke-width": 1.5, opacity: 0.45 });
    }
    items.push({ name: "mirror images R(Σ_k) ⊂ W^s(0,0)", color: C.stable, tag: "computed" });
  }
  if (has("arcs-C")) {
    for (let r = 0; r <= 3; r++) {
      const c = memo(model, `C:${a}:${r}`, () => model.arcC(r, a, { maxChord: 0.01 }));
      line(F, pts(c), { stroke: state.plain ? "#888" : C.wu00, "stroke-width": 2, opacity: 0.85 });
    }
    if (!state.plain) subText(F.plot, F.fx(0.08), F.fy(0.25), ["W", ["^u"], "(0,0)"], "direct", { fill: C.wu00 });
    items.push({ name: "arcs C₀ … C₃ of W^u(0,0)", color: C.wu00, tag: "computed" });
  }
  if (has("base") && pk) {
    line(F, [pk.Q0, pk.P0], { stroke: C.stable, "stroke-width": 6 });
    if (state.plain) for (const [nm, p] of [["P", pk.P0], ["Q", pk.Q0]]) { dot(F, p, 8, { fill: nm === "P" ? "#2b8a3e" : "#8e3fae" }); subText(F.plot, F.fx(p[0]) + (nm === "Q" ? -12 : 12), F.fy(p[1]) + (nm === "Q" ? 8 : 26), ["u", ["^" + nm]], "direct", { fill: nm === "P" ? "#2b8a3e" : "#8e3fae", "text-anchor": nm === "Q" ? "end" : "start" }); }
    else for (const [nm, p] of [["P₀", pk.P0], ["Q₀", pk.Q0], ["P₁", pk.P1]]) { dot(F, p, 6, { fill: "#000" }); label(F, p, nm, 10, 22); }
    items.push({ name: "base [Q₀, P₀] (stable segment)", color: C.stable, tag: "exact" });
  }
  if (has("base-crossings")) {
    const bc = memo(model, `bc:${a}:${j}`, () => model.baseCrossings(j, a, {}));
    const list = (bc.crossings || bc || []).slice().sort((p, q) => p.point[0] - q.point[0]); // order along the base from Q0 to P0, as in Figure 4(c)
    // The selection is a word, not a position in the list (round 5): it stays on that word while the word exists,
    // nothing is selected while it does not, and it comes back when a returns to where it exists.
    const wordOf = (c) => {
      const fr = memo(model, `front:${a}:${s}:${c.point[0].toFixed(12)}:${c.point[1].toFixed(12)}`, () => model.reconstructFront(c.point, s, a, {}));
      const w = model.crossingWord(fr.crossings || [], a, parseFloat(state.cut || "0"));
      return w.letters ? w.letters.map((l, q) => `${l ?? "?"}${sub(w.slots[q])}`).join("") : String(w.word);
    };
    const words = wordList ? list.map(wordOf) : [];
    if (wordList && state.selword === undefined && +state.select) state.selword = words[+state.select - 1];
    state._words = words;
    const sel = wordList ? words.indexOf(state.selword) : (+state.select || 0) - 1;
    const pick = (i) => onChange && onChange(wordList ? { selword: words[i] } : { select: i + 1 });
    // Crossings closer than 12 px: in the word list their dots are drawn slightly off the base, alternately on either side,
    // with a short tick to the true point, so that each can be seen and selected.
    const scr = (p) => [F.fx(p[0]), F.fy(p[1])];
    let nrm = [0, -1];
    if (pk) { const [x0, y0] = scr(pk.Q0), [x1, y1] = scr(pk.P0), d = Math.hypot(x1 - x0, y1 - y0) || 1; nrm = [-(y1 - y0) / d, (x1 - x0) / d]; }
    let cluster = 0;
    list.forEach((c, i) => {
      const prev = list[i - 1];
      cluster = prev && Math.hypot(F.fx(c.point[0]) - F.fx(prev.point[0]), F.fy(c.point[1]) - F.fy(prev.point[1])) < 12 ? cluster + 1 : 0;
      const next = list[i + 1], close = cluster > 0 || (next && Math.hypot(F.fx(c.point[0]) - F.fx(next.point[0]), F.fy(c.point[1]) - F.fy(next.point[1])) < 12);
      let [X, Y] = scr(c.point);
      if (wordList && close) {
        const off = (cluster % 2 ? 1 : -1) * 15;
        el("line", { x1: X, y1: Y, x2: X + off * nrm[0], y2: Y + off * nrm[1], stroke: i === sel ? "#c00" : "#000", "stroke-width": 1.5 }, F.plot);
        X += off * nrm[0]; Y += off * nrm[1];
      }
      const d = el("circle", { cx: X, cy: Y, r: i === sel ? 9 : 6, fill: i === sel ? "#c00" : "#000", style: "cursor:pointer" }, F.plot);
      if (onChange) { d.addEventListener("click", () => pick(i)); d.setAttribute("r", i === sel ? 10 : 8); clickTip(d, "click to select this word"); }
      if (wordList) {
        const n = list.length, y = 40 + ((i + 0.5) * Math.min(36, 470 / Math.max(n, 1)));
        el("line", { x1: X, y1: Y, x2: 690, y2: y - 6, stroke: i === sel ? "#c00" : "#999", "stroke-width": i === sel ? 2 : 1 }, svg);
        const tl = text(svg, 696, y, `${i + 1}  ${words[i]}`, "lbl", { fill: i === sel ? "#c00" : "#222", style: "cursor:pointer" });
        if (onChange) { tl.addEventListener("click", () => pick(i)); clickTip(tl, "click to select this word"); }
        return;
      }
      if (state.plain) return;
      const side = i % 2 ? 1 : -1, off = 22 + 18 * Math.floor(cluster / 2);
      const LX = X + side * off * 0.7, LY = Y + side * off;
      el("line", { x1: X, y1: Y, x2: LX, y2: LY, stroke: "#888", "stroke-width": 1 }, F.plot);
      text(F.plot, LX + (side > 0 ? 3 : -3), LY + (side > 0 ? 18 : -4), String(i + 1), "small", { "text-anchor": side > 0 ? "start" : "end", fill: i === sel ? "#c00" : "#000" });
    });
    items.push({ name: `crossings of Σ${sub(j)} with the base`, color: "#000", tag: "computed" });
    const prect = wordList ? [110, 610, 860, 130] : PANEL;
    if (state.panel === "profile" && list[sel] && state.plain) drawFrontPanel(svg, prect, model, list[sel].point, s, a, items, parseFloat(state.cut || "0"), true);
    else if (state.panel === "profile" && list[sel]) drawFrontPanel(svg, PANEL, model, list[sel].point, s, a, items, parseFloat(state.cut || "0"));
    else if (state.panel === "profile" && wordList) {
      // say why the panel is empty instead of leaving a blank
      const msg = !list.length ? "no intersection with the open base found on this computed arc"
        : state.selword ? `${state.selword}: not found among the computed crossings at this a` : "click a word to see its front";
      text(svg, prect[0] + prect[2] / 2, prect[1] + prect[3] / 2, msg, "lbl", { "text-anchor": "middle", fill: "#777" });
    }
  }
  if (has("spargel-j") || has("mirror-j")) {
    const sp = memo(model, `sp:${a}:${j}:0.0005`, () => model.spargel(j, a, { maxChord: 0.0005 }));
    if (has("spargel-j")) line(F, pts(sp), { stroke: "#2b8a3e", "stroke-width": 3 });
    if (has("mirror-j")) line(F, pts(sp).map((q) => (q ? mirror(q) : null)), { stroke: C.stable, "stroke-width": 3 });
    text(F.plot, F.rect[0] + 16, F.rect[1] + 40, `Σ${sub(j)}`, "direct", { fill: "#2b8a3e" });
    text(F.plot, F.rect[0] + 16, F.rect[1] + 72, `R(Σ${sub(j)})`, "direct", { fill: C.stable });
    items.push({ name: `Σ${sub(j)}`, color: "#2b8a3e", tag: "computed" }, { name: `R(Σ${sub(j)})`, color: C.stable, tag: "computed" });
    if (has("mirror-intersections")) {
      const ints = memo(model, `mi:${a}:${j}:0.0005`, () => polylineIntersections(pts(sp), pts(sp).map((q) => (q ? mirror(q) : null))));
      for (const p of ints) dot(F, p, 7, { fill: "#000" });
      items.push({ name: "intersections (fronts)", color: "#000", tag: "computed" });
    }
  }
  if (has("images-I")) {
    const I = memo(model, `I:${a}:${s}`, () => model.segmentI(s, a));
    line(F, [I.point(I.cRange[0]), I.point(I.cRange[1])], { stroke: C.unstable, "stroke-width": 6 });
    for (let k = 1; k <= 3; k++) {
      const c = memo(model, `imgI:${a}:${s}:${k}`, () => model.imageCurve(I.point, I.cRange, s, a, k, { maxChord: 0.01 }));
      line(F, pts(c), { stroke: SPARGEL_SHADES[2 * k - 1], "stroke-width": 2.5 });
    }
    items.push({ name: "I and Ψ(I), Ψ²(I), Ψ³(I)", color: C.spargel, tag: "computed" });
  }
  if (has("escape-trajectory")) {
    const er = model.escapeOrReturn(s, a, 6 * L);
    line(F, pts(er.trajectory || er), { stroke: "#000", "stroke-width": 2.5 });
    dot(F, [a, -(1 - a) * model.rPlus(s)], 8, { fill: "#000" });
    const outcomeText = { return: "returns to u = a", escape: "u → −∞ (leaves the box)", "stable-tail": "stable tail: decays to 0", xMax: "undecided within the drawn range" }[er.outcome] || er.outcome;
    label(F, [a, -(1 - a) * model.rPlus(s)], outcomeText, 12, 26, "lbl");
    items.push({ name: "trajectory from the end of the unstable straight part", color: "#000", tag: "computed" });
  }
  if (has("equilibria")) {
    dot(F, [0, 0], 7, { fill: "#000" }); dot(F, [1, 0], 7, { fill: "#000" });
    label(F, [0, 0], "(0,0)", 8, -12, "lbl"); label(F, [1, 0], "(1,0)", -70, -12, "lbl");
  }
  if (has("endpoint-markers") && pk) {
    const coincide = (p, q) => dist(p, q) < 1e-9;
    if (coincide(pk.Q0, pk.P1)) { dot(F, pk.P0, 7, { fill: "#000" }); label(F, pk.P0, "P₀", 10, 24, "lbl"); dot(F, pk.Q0, 7, { fill: "#000" }); label(F, pk.Q0, "Q₀ = P₁", 10, 24, "lbl"); }
    else if (coincide(pk.Q0, pk.P0)) { dot(F, pk.P0, 8, { fill: "#000" }); label(F, pk.P0, "P₀ = Q₀", 10, 24, "lbl"); dot(F, pk.P1, 6, { fill: "#000" }); label(F, pk.P1, "P₁", 10, 24, "lbl"); }
    items.push({ name: "endpoint samples (limits of P₀, Q₀, P₁)", color: "#000", tag: "computed" });
  }
  if (state.zoom) drawZooms(svg, model, state, a, items);
  if (state.pairzoom) {
    const w = V3.drawPairZoom(svg, model, state, a, s, j, items);
    if (w) el("rect", { x: F.fx(w[0] - w[2]), y: F.fy(w[1] + w[2]), width: F.fx(w[0] + w[2]) - F.fx(w[0] - w[2]), height: F.fy(w[1] - w[2]) - F.fy(w[1] + w[2]), fill: "none", stroke: "#c00", "stroke-width": 2 }, F.plot);
  }
  if (state.panel === "b") drawBPanel(svg, PANEL, model, s, a, items, liveControls(state).has("s") ? onChange : null);
  // labels drawn last, on plates: u = a, and the phase of this return-map plane
  if (has("threshold")) plate(label(F, [a, box[3]], "u = a", 6, 26));
  if (Number.isFinite(s)) plate(subText(F.plot, F.rect[0] + F.rect[2] - 250, F.rect[1] + F.rect[3] - 16, (String(state.s).trim() === "rhoP" ? ["Ψ", ["^s"], ",  s = ρ", ["P"], ` = ${s.toFixed(3)}`] : ["Ψ", ["^s"], `,  s = ${s.toFixed(3)}`]), "lbl-i", { fill: "#333" }));
  if (has("threshold") && liveControls(state).has("a") && onChange) {
    // drag the line u = a; slowly (the whole range over about 900 px of pointer travel) and in steps of 0.0005,
    // so that words can be watched as they form and disappear, also where the frame follows the pocket
    const lo = state._amin ?? 0.3, hi = state._amax ?? 0.7;
    dragHandle(svg, F, { q: "a", axis: "x", at: a, range: [lo, hi], minPx: 900, set: (v) => onChange({ a: Math.min(hi, Math.max(lo, Math.round(v * 2000) / 2000)) }) });
  }
  state._ctl = { a: [state._amin ?? 0.3, state._amax ?? 0.7, 0.0005], j: [0, 6, 1] };
}

function sub(n) { return String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]); }
function dist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
function polylineIntersections(A, B) {
  const out = [];
  for (let i = 0; i + 1 < A.length; i++) {
    const p = A[i], q = A[i + 1]; if (!p || !q) continue;
    for (let k = 0; k + 1 < B.length; k++) {
      const r = B[k], t = B[k + 1]; if (!r || !t) continue;
      const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
      if (Math.abs(d) < 1e-15) continue;
      const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d;
      const w = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      if (u >= 0 && u <= 1 && w >= 0 && w <= 1) out.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
    }
  }
  return out;
}

// Zoom insets at the threshold state of u^P / u^Q, or at the endpoint contact.
function subText(parent, x, y, parts, cls = "small", attrs = {}) {
  // parts: strings, or [string] for a subscript
  const t = el("text", { x, y, class: cls, ...attrs }, parent);
  for (const p of parts) {
    const sup = Array.isArray(p) && p[0].startsWith("^");
    const sp = el("tspan", Array.isArray(p) ? { "baseline-shift": sup ? "super" : "sub", "font-size": "75%" } : {}, t);
    sp.textContent = Array.isArray(p) ? p[0].replace(/^\^/, "") : p;
  }
  return t;
}
function drawZooms(svg, model, state, a, items, big = false) {
  const which = state.zoom.split(",").map((s) => s.trim());
  which.forEach((z, i) => {
    let s0;
    if (z === "P") s0 = model.roots(a).rhoP;
    else if (z === "Q") s0 = model.roots(a).rhoQ;
    else s0 = Math.abs(a - model.aPlus) < 1e-9 ? 0 : model.P.L1;
    const vstar = -(1 - a) * model.rPlus(s0);
    const h = 0.02;
    const arcs = memo(model, `arcs:${a}:${s0}`, () => model.localArcs(s0, a, h));
    const rect = big ? [90 + i * 480, 110, 400, 560] : which.length === 1 ? [380, 70, 300, 160] : [120 + i * 430, 330, 330, 240];
    const dv = h * Math.max(model.rPlus(s0), model.rMinus(s0)) * 1.4;
    const F = frame(svg, [a - h, a + h, vstar - dv, vstar + dv], rect, { xticks: [], yticks: [], xlabel: big ? "u" : undefined });
    el("rect", { x: rect[0], y: rect[1], width: rect[2], height: rect[3], fill: "#fff", opacity: 0.94 }, F.plot);
    line(F, [[a, vstar - dv], [a, vstar + dv]], { stroke: C.threshold, "stroke-dasharray": "6 5" });
    line(F, pts(arcs.unstable), { stroke: C.unstable, "stroke-width": big ? 5 : 3.5 });
    line(F, pts(arcs.stable), { stroke: C.stable, "stroke-width": big ? 5 : 3.5 });
    dot(F, [a, vstar], 7, { fill: "#000" });
    const tx = rect[0] + 8, ty = big ? rect[1] - 14 : rect[1] + rect[3] + 26;
    if (z === "contact") subText(svg, tx, ty, [`contact at a = ${a.toFixed(4)}, s = ${s0.toFixed(2)}`], big ? "lbl" : "small");
    else {
      subText(svg, tx, ty - (big ? 30 : 0), ["sampled at ρ", [z], z === "P" ? " (single edge)" : " (stretched pair)"], big ? "lbl" : "small");
      if (big) subText(svg, tx, ty, ["for u > a: unstable branch ", z === "P" ? "above" : "below", " stable"], "lbl");
    }
  });
  items.push({ name: "local arc of W^u(1,0)", color: C.unstable, tag: "computed" }, { name: "local arc of W^s(0,0)", color: C.stable, tag: "computed" });
}

// Side panel (inside the stage SVG): matching function b(s) over one period, threshold a, current s, roots.
function drawBPanel(svg, rect, model, s, a, items, onChange) {
  const L = model.L, lo = model.aMinus - 0.02, hi = model.aPlus + 0.02;
  const F = frame(svg, [0, L, lo, hi], rect, { xticks: [0, model.P.L1, L], yticks: [model.aMinus, model.aPlus], xlabel: "s", ylabel: "b(s)" });
  el("rect", { x: F.fx(0), y: F.fy(hi), width: F.fx(model.P.L1) - F.fx(0), height: F.fy(lo) - F.fy(hi), fill: "#eef3fb" }, F.plot);
  const N = 300, curve = [];
  for (let i = 0; i <= N; i++) { const x = (i / N) * L; curve.push([x, model.b(x)]); }
  line(F, curve, { stroke: "#000", "stroke-width": 3 });
  line(F, [[0, a], [L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  text(svg, rect[0] + rect[2] + 8, F.fy(a) + 7, "a", "lbl-i");
  if (a > model.aMinus && a < model.aPlus) {
    const { rhoP, rhoQ } = model.roots(a);
    dot(F, [rhoP, a], 7, { fill: "#000" }); subText(F.plot, F.fx(rhoP) - 30, F.fy(a) - 12, ["ρ", ["P"]]);
    dot(F, [rhoQ, a], 7, { fill: "#000" }); subText(F.plot, F.fx(rhoQ) + 8, F.fy(a) - 12, ["ρ", ["Q"]]);
    items.push({ name: "roots ρ_P, ρ_Q of b = a", color: "#000", tag: "computed" });
  } else if (Math.abs(a - model.aMinus) < 1e-9 || Math.abs(a - model.aPlus) < 1e-9) {
    const r = model.roots(a).rhoP;
    dot(F, [r, a], 7, { fill: "#000" });
    items.push({ name: "single root of b = a (endpoint)", color: "#000", tag: "computed" });
  }
  if (Number.isFinite(s)) { line(F, [[s, lo], [s, hi]], { stroke: "#c00", "stroke-width": 2 }); dot(F, [s, model.b(s)], 6, { fill: "#c00" }); }
  text(svg, F.fx(model.P.L1 / 2), rect[1] + 24, "p = 1", "small", { "text-anchor": "middle" });
  text(svg, F.fx((model.P.L1 + L) / 2), rect[1] + 24, "p = 4", "small", { "text-anchor": "middle" });
  if (onChange && Number.isFinite(s)) dragX(F, svg, (x) => onChange({ s: Math.min(L - 1e-6, Math.max(0, x)) }));
  items.push({ name: "matching function b(s) (red: current s)", color: "#000", tag: "exact" });
}

// Side panel: a reconstructed front with its crossings and word.
function drawFrontPanel(svg, rect, model, Z, s, a, items, cut = 0, plain = false) {
  const fr = memo(model, `front:${a}:${s}:${Z[0].toFixed(12)}:${Z[1].toFixed(12)}`, () => model.reconstructFront(Z, s, a, {}));
  const xs = fr.xs, us = fr.us;
  const F = frame(svg, [xs[0], xs[xs.length - 1], -0.05, 1.05], rect, { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  const L = model.L;
  for (let k = Math.floor(xs[0] / L); k * L < xs[xs.length - 1]; k++) {
    el("rect", { x: F.fx(k * L + model.P.L1), y: F.fy(1.05), width: F.fx(model.P.L2) - F.fx(0), height: F.fy(-0.05) - F.fy(1.05), fill: plain ? "#f6ecd0" : "#eeeeee" }, F.plot);
  }
  line(F, [[xs[0], a], [xs[xs.length - 1], a]], { stroke: C.threshold, "stroke-dasharray": "6 5" });
  line(F, xs.map((x, i) => [x, us[i]]), { stroke: C.front, "stroke-width": 2.5 });
  for (const c of fr.crossings || []) dot(F, [c.x, a], 5, { fill: "#c00" });
  const w = model.crossingWord(fr.crossings || [], a, cut);
  const word = w.letters ? w.letters.map((l, i) => `${l ?? "?"}${sub(w.slots[i])}`).join("") : String(w.word);
  if (plain) text(svg, rect[0] + rect[2] / 2, rect[1] - 10, `the front at the red point: ${word}`, "lbl", { "text-anchor": "middle" });
  else text(svg, rect[0] + rect[2] / 2, rect[1] - 10, `selected front: word ${word}   (cut c = ${cut}; first slot shifted to 0)`, "lbl", { "text-anchor": "middle" });
  items.push({ name: "reconstructed front; grey: p = 4", color: C.front, tag: "computed" });
}

// ---------- Beat 4: profiles u^P and B_rho ----------
function drawProfileView({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model);
  const { rhoP } = model.roots(a);
  const d = +state.rho || 0.06, L = model.L;
  const x0 = rhoP - 1.5 * L, x1 = rhoP + 1.5 * L;
  const uP = model.stepProfile(rhoP), Bm = model.shiftedProfile(rhoP - d, a), Bp = model.shiftedProfile(rhoP + d, a);
  const val = (f, x) => { const r = f(x); return Array.isArray(r) ? r[0] : (r && r.u !== undefined ? r.u : r); };
  const N = 600, X = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const top = frame(svg, [x0, x1, -0.05, 1.05], [110, 30, 850, 250], { xticks: [], yticks: [0, a, 1], ylabel: "u" });
  const bot = frame(svg, [x0, x1, -0.06, 0.06], [110, 330, 850, 180], { xticks: [], yticks: [-0.05, 0, 0.05], xlabel: "x", ylabel: "B − u^P" });
  for (const F of [top, bot]) for (let k = Math.floor(x0 / L) - 1; k * L < x1; k++)
    el("rect", { x: F.fx(k * L + model.P.L1), y: F.rect[1], width: F.fx(model.P.L2) - F.fx(0), height: F.rect[3], fill: "#eeeeee" }, F.plot);
  line(top, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  line(top, X.map((x) => [x, val(uP, x)]), { stroke: C.front, "stroke-width": 3 });
  line(top, X.map((x) => [x, val(Bm, x)]), { stroke: C.sub, "stroke-width": 2.5, "stroke-dasharray": "10 6" });
  line(top, X.map((x) => [x, val(Bp, x)]), { stroke: C.sup, "stroke-width": 2.5, "stroke-dasharray": "10 6" });
  line(bot, [[x0, 0], [x1, 0]], { stroke: C.front, "stroke-width": 2 });
  line(bot, X.map((x) => [x, val(Bm, x) - val(uP, x)]), { stroke: C.sub, "stroke-width": 3 });
  line(bot, X.map((x) => [x, val(Bp, x) - val(uP, x)]), { stroke: C.sup, "stroke-width": 3 });
  items.push({ name: "u^P", color: C.front, tag: "exact" });
  items.push({ name: `B at ρ_P − ${d.toFixed(3)}: subsolution`, color: C.sub, tag: "exact" });
  items.push({ name: `B at ρ_P + ${d.toFixed(3)}: supersolution`, color: C.sup, tag: "exact" });
  items.push({ name: "grey: p = 4", color: "#ddd", tag: "exact" });
  subText(top.plot, top.rect[0] + top.rect[2] - 8, top.fy(0.92), ["u", ["^P"]], "direct", { "text-anchor": "end" });
  text(bot.plot, bot.rect[0] + bot.rect[2] - 8, bot.rect[1] + 30, "supersolution (ρ > ρ_P)", "direct", { fill: C.sup, "text-anchor": "end" });
  text(bot.plot, bot.rect[0] + bot.rect[2] - 8, bot.rect[1] + bot.rect[3] - 12, "subsolution (ρ < ρ_P)", "direct", { fill: C.sub, "text-anchor": "end" });
  if (state.panel === "b") drawBPanel(svg, [120, 585, 850, 160], model, rhoP, a, items);
}

export { el, text, svgRoot, frame, line, dot, label, pts, ticks, subText, memo, num, layerSet, liveControls, dragX, dragHandle, pseudoFrame, plate, clickTip, C, sub, pathD };
