// A graph drawn in a tilted plane, with a front drawn as its height over each edge (steps 3, 4, 20).
// An edge is a curve in the plane, parametrised by the problem's coordinate x; the front is u(x).
// Drawing only: the profiles come from core.js (McKean, exact) or from junction.js (cubic, computed).
import { el, text, svgRoot, num, memo, dragHandle, pseudoFrame } from "./stage.js";

// Oblique projection: plane coordinates (X, Y) -> screen; height u -> up.
export function projector({ ox = 60, oy = 560, sx = 1, depth = 1.6, height = 230 } = {}) {
  const c = Math.cos(Math.PI / 7), s = Math.sin(Math.PI / 7);
  return (X, Y, u = 0) => [ox + sx * (X + depth * Y * c), oy - depth * Y * s - height * u];
}
// One edge: plane curve P(t), t in [0,1], carrying x from xa to xb; front values from uOf(x).
export function drawEdge(g, proj, P, { stroke = "#222", width = 5 } = {}) {
  const pts = Array.from({ length: 41 }, (_, i) => proj(...P(i / 40)));
  el("path", { d: "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L"), fill: "none", stroke, "stroke-width": width, "stroke-linecap": "round" }, g);
}
export function drawRibbon(g, proj, P, xa, xb, uOf, { stroke = "#111", fill = "#9ecae1", opacity = 0.35, width = 3, n = 40 } = {}) {
  const top = [], base = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, [X, Y] = P(t), u = uOf(xa + (xb - xa) * t);
    if (!Number.isFinite(u)) continue;
    top.push(proj(X, Y, u)); base.push(proj(X, Y, 0));
  }
  if (top.length < 2) return;
  const d = (q) => q.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
  if (fill) el("path", { d: "M" + d(top) + "L" + d(base.slice().reverse()) + "Z", fill, opacity, stroke: "none" }, g);
  el("path", { d: "M" + d(top), fill: "none", stroke, "stroke-width": width, "stroke-linejoin": "round" }, g);
}
// Height scale bar at the left: u = 0 and u = 1, and the threshold a.
export function heightScale(g, proj, X0, a) {
  const [x0, y0] = proj(X0, 0, 0), [, y1] = proj(X0, 0, 1), [, ya] = proj(X0, 0, a);
  el("line", { x1: x0, y1: y0, x2: x0, y2: y1, stroke: "#999", "stroke-width": 1.5 }, g);
  text(g, x0 - 8, y0 + 6, "0", "tick", { "text-anchor": "end" });
  text(g, x0 - 8, y1 + 6, "1", "tick", { "text-anchor": "end" });
  if (Number.isFinite(a)) { el("line", { x1: x0 - 5, y1: ya, x2: x0 + 5, y2: ya, stroke: "#777", "stroke-width": 2 }, g); text(g, x0 - 8, ya + 6, "a", "lbl-i", { "text-anchor": "end" }); }
}

// The necklace: single edges along X, each pair as two arcs; x runs along the periodic line
// (single edge [kL, kL + L1], the pair [kL + L1, (k+1)L] in the stretched coordinate).
export function necklaceEdges(model, k0, k1, W1, W2) {
  const L = model.L, L1 = model.P.L1, edges = [];
  let X = 0;
  for (let k = k0; k < k1; k++) {
    const Xs = X;
    edges.push({ P: (t) => [Xs + W1 * t, 0], xa: k * L, xb: k * L + L1 });
    X += W1;
    const Xp = X;
    for (const sg of [1, -1]) edges.push({ P: (t) => [Xp + W2 * t, sg * 0.42 * W2 * Math.sin(Math.PI * t)], xa: k * L + L1, xb: (k + 1) * L, pair: true });
    X += W2;
  }
  return { edges, width: X };
}

// Steps 4 and 20: the necklace with u^P, u^Q and one nonmonotone front (McKean, a = state.a).
export function drawNecklace3d({ stage, state, model, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), L = model.L;
  const { rhoP, rhoQ } = model.roots(a);
  const j = +state.j || 5, s = rhoP;
  const bc = memo(model, `bc:${a}:${j}`, () => model.baseCrossings(j, a, {}));
  const list = (bc.crossings || bc || []).slice().sort((p, q) => p.point[0] - q.point[0]);
  const pick = list[Math.floor(list.length / 2)];
  const fr = pick ? memo(model, `front:${a}:${s}:${pick.point[0].toFixed(12)}:${pick.point[1].toFixed(12)}`, () => model.reconstructFront(pick.point, s, a, {})) : null;
  // centre the window on the nonmonotone front's crossings
  const cr = fr && fr.crossings && fr.crossings.length ? fr.crossings.map((c) => c.x) : [rhoP];
  const k0 = Math.floor(Math.min(...cr, rhoP) / L) - 2, k1 = Math.ceil(Math.max(...cr, rhoQ) / L) + 3;
  const n = k1 - k0, W1 = 880 / n * 0.42, W2 = 880 / n * 0.58, { edges, width } = necklaceEdges(model, k0, k1, W1, W2);
  const proj = projector({ ox: 70, oy: +state.oy || 600, height: 320, depth: 1.6 });
  const uNon = fr ? ((x) => { // linear interpolation between the stored samples
    const i = fr.xs.findIndex((q) => q >= x); if (i < 0) return NaN; if (i === 0) return fr.us[0];
    const t = (x - fr.xs[i - 1]) / (fr.xs[i] - fr.xs[i - 1]); return fr.us[i - 1] + t * (fr.us[i] - fr.us[i - 1]); }) : null;
  const VP = model.stepProfile(rhoP), VQ = model.stepProfile(rhoQ);
  const fronts = [
    [(x) => VP(x)[0], "#2b8a3e", "rgba(43,138,62,0.18)"],
    [(x) => VQ(x)[0], "#8e3fae", "rgba(142,63,174,0.15)"],
    ...(uNon ? [[uNon, "#111", "rgba(0,0,0,0.10)"]] : []),
  ];
  const g = el("g", {}, svg);
  for (const e of edges.filter((e) => e.pair && e.P(0.5)[1] > 0)) drawEdge(g, proj, e.P, { stroke: "#bbb", width: 4 });
  for (const e of edges) if (!(e.pair && e.P(0.5)[1] > 0)) drawEdge(g, proj, e.P, { stroke: "#444", width: 4 });
  for (const [uf, col] of fronts) for (const e of edges) drawRibbon(g, proj, e.P, e.xa, e.xb, uf, { stroke: col, fill: null, width: 3 });
  // drop lines at the vertices, so that the heights read against the graph
  for (const e of edges.filter((e) => !e.pair)) for (const t of [0, 1]) { const [X, Y] = e.P(t), [x0, y0] = proj(X, Y, 0), [, y1] = proj(X, Y, 1); el("line", { x1: x0, y1: y0, x2: x0, y2: y1, stroke: "#ddd", "stroke-width": 1 }, g); }
  heightScale(g, proj, -20, a);
  if (state.labels === "legend") {
    const lg = [["#2b8a3e", "u", "P", " (stable)"], ["#8e3fae", "u", "Q", " (unstable)"], ["#111", "nonmonotone", "", ""]];
    lg.forEach(([col, s, sp, tail], i) => { el("line", { x1: 70, y1: 120 + 34 * i, x2: 110, y2: 120 + 34 * i, stroke: col, "stroke-width": 4 }, svg);
      const t = el("text", { x: 120, y: 128 + 34 * i, class: "lbl", fill: col }, svg); t.textContent = s; if (sp) { const q = el("tspan", { "baseline-shift": "super", "font-size": "75%" }, t); q.textContent = sp; } if (tail) { const r = el("tspan", {}, t); r.textContent = tail; } });
  }
  items.push({ name: `necklace with u^P, u^Q (exact) and a nonmonotone front (computed), a = ${a}`, color: "#111", tag: "computed" });
}

// ---------- step 3: the same front on a line and at a junction, with a adjustable (cubic, computed) ----------
// junction.js (specialist) simulates u_t = u_xx + u(1 − u)(u − a) on the line and on one edge into two.
// Every change of a recomputes both runs and replays the animation from the start (about 2.5 s).
let junctionMod = null;
import("./junction.js").then((m) => { junctionMod = m; }).catch(() => {});
const runCache = new Map();
let animId = 0;
export function drawJunction3d({ stage, state, items, exportMode, onChange }) {
  if (!junctionMod) { svgRoot(stage, 1000, 810); import("./junction.js").then((m) => { junctionMod = m; onChange && onChange({}); }); return; }
  const svg = svgRoot(stage, 1000, 810);
  // the range validated for the automatic run length of junction.js (fails from about 0.485)
  const a = Math.min(0.48, Math.max(0.1, +state.a || 0.42)); state.a = a; state._a = a; state._amin = 0.1; state._amax = 0.48;
  state._ctl = { a: [0.1, 0.48, 0.002] };
  const setA = onChange && ((v) => onChange({ a: Math.round(Math.min(0.48, Math.max(0.1, v)) * 500) / 500 }));
  const run = (geometry) => { const k = `${geometry}:${a.toFixed(3)}`; if (!runCache.has(k)) runCache.set(k, junctionMod.simulate({ a, geometry })); return runCache.get(k); };
  const line = run("line"), junc = run("junction");
  const sx = 12.5, panels = [[line, 330, "a homogeneous line"], [junc, 660, "one edge meets two edges"]];
  const draws = [];
  for (const [res, oy, title] of panels) {
    const proj = projector({ ox: 470, oy, sx: 1, depth: 1.1, height: 190 });
    const g = el("g", {}, svg);
    const isJ = res === junc;
    const inc = (t) => [-32 * sx * (1 - t), 0];
    const outs = isJ ? [1, -1].map((sg) => (t) => [32 * sx * t * 0.92, sg * 32 * sx * t * 0.3]) : [(t) => [32 * sx * t, 0]];
    drawEdge(g, proj, inc, { stroke: "#444", width: 4 });
    for (const P of outs) drawEdge(g, proj, P, { stroke: isJ ? "#444" : "#444", width: 4 });
    if (isJ) { const [vx, vy] = proj(0, 0, 0); el("circle", { cx: vx, cy: vy, r: 6, fill: "#222" }, g); }
    heightScale(g, proj, -32 * sx - 14, a);
    { // the tick a on the height scale is the object to drag
      const [hx, hy0] = proj(-32 * sx - 14, 0, 0), [, hy1] = proj(-32 * sx - 14, 0, 1), [, ya] = proj(-32 * sx - 14, 0, a);
      el("path", { d: `M${hx + 6},${ya} l12,-8 l0,16 Z`, fill: "#777" }, g);
      dragHandle(svg, pseudoFrame([hx - 24, hy1, 48, hy0 - hy1], [0, 1, 0, 1]), { q: "a", axis: "y", at: a, set: setA, range: [0.1, 0.48] });
    }
    text(svg, 40, oy - 230, title, "lbl", { fill: "#444" });
    const xs = res.x, fg = el("g", {}, g);
    const drawFrame = (fr) => {
      fg.innerHTML = "";
      const uIn = (x) => interp(xs, fr.u, x);
      drawRibbon(fg, proj, inc, -32, 0, uIn, { stroke: "#111", fill: "#9ecae1", opacity: 0.35, width: 3 });
      for (const P of outs) drawRibbon(fg, proj, P, 0, 32, uIn, { stroke: "#111", fill: "#9ecae1", opacity: 0.35, width: 3 });
    };
    draws.push([res.frames, drawFrame]);
  }
  const verdict = junc.stopped ? "stops at the vertex" : "passes";
  text(svg, 40, 40, `a = ${a.toFixed(3)}: on the line the front moves; at the junction it ${verdict}`, "lbl", { fill: "#333" });
  // play both runs together; any redraw (key, build, step) starts a new animation
  // one physical clock for both runs: at playback fraction u, time u·T_max; a run that has ended holds its last frame
  const id = ++animId, Tmax = Math.max(...draws.map(([f]) => f.at(-1).t)), dur = 2500;
  const at = (frames, t) => { let k = 0; while (k + 1 < frames.length && frames[k + 1].t <= t) k++; return frames[k]; };
  const show = (u) => draws.forEach(([frames, fn]) => fn(at(frames, u * Tmax)));
  if (exportMode) { show(window.__frame ?? (+state.exportframe || 1)); }
  else { const t0 = performance.now(); const step = (now) => { if (id !== animId) return; const u = Math.min(1, (now - t0) / dur); show(u); if (u < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  items.push({ name: `cubic, a = ${a}: line and junction runs (junction.js, computed); criterion F(1)+3F(a) = ${junc.criterion.toFixed(4)}`, color: "#111", tag: "computed" });
}
function interp(xs, us, x) {
  if (x <= xs[0]) return us[0]; if (x >= xs[xs.length - 1]) return us[us.length - 1];
  let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]); return us[lo] + t * (us[hi] - us[lo]);
}
