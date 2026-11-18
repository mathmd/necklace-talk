// Round-3 stage views. Drawing only: the mathematics comes from core.js (McKean, exact or computed
// by the specialist's core), smooth.js (cubic reaction, computed) or closed forms stated in comments.
// Each view registers what it draws, with its status, in `items` (development panel only).
import {
  el, text, svgRoot, frame, line, dot, label, pts, ticks, subText, memo, num, layerSet,
  liveControls, dragX, dragHandle, plate, clickTip, C, sub, pathD,
} from "./stage.js";

const P_COL = "#2b8a3e", Q_COL = "#8e3fae", SHADE = "#f6ecd0"; // gold: the pairs

// ---------- animation: one at a time; a redraw cancels the previous one ----------
let animToken = 0;
export function cancelAnimations() { animToken++; }
// Every redraw cancels running animations (renderStage calls cancelAnimations), so leaving and re-entering
// a step, or changing a parameter, always replays from the start. Export renders the frame window.__frame.
function animate(duration, frameFn, exportMode) {
  if (exportMode) { frameFn(window.__frame ?? 1); return; }
  const token = animToken, t0 = performance.now();
  const step = (now) => {
    if (token !== animToken) return;
    const u = Math.min(1, (now - t0) / duration);
    frameFn(u);
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const build = (state) => +state.build || 0;

// Shade the p = 4 intervals of a profile frame over [x0, x1].
function shadePairs(F, model, x0, x1) {
  const L = model.L;
  for (let k = Math.floor(x0 / L) - 1; k * L < x1; k++)
    el("rect", { x: F.fx(k * L + model.P.L1), y: F.rect[1], width: F.fx(model.P.L2) - F.fx(0), height: F.rect[3], fill: SHADE }, F.plot);
}
function val(z) { return Array.isArray(z) ? z[0] : z; }

// ---------- 02: figures from the experimental papers ----------
export function drawImages({ stage, items }) {
  const svg = svgRoot(stage, 1000, 810);
  el("image", { href: "build/papers/li2025-fig2DEF.png", x: 0, y: 20, width: 1000, height: 232 }, svg);
  text(svg, 10, 290, "Apoptotic wave in Xenopus egg extract: a 5 µm channel opens into a 2 × 2 mm chamber;", "small");
  text(svg, 10, 316, "the wave stalls at the junction (position 0) for hours, then spreads.", "small");
  text(svg, 10, 342, "Z. Li, K. S. Zhang, Y. Chen, S. K. Y. Tang, J. E. Ferrell Jr., PNAS 122 (2025), Fig. 2D–F", "small", { fill: "#666" });
  el("image", { href: "build/papers/kucera1998-fig1AB.png", x: 20, y: 380, width: 350, height: 400 }, svg);
  text(svg, 420, 520, "Strands of cardiac cells with side branches:", "lbl");
  text(svg, 420, 552, "conduction slows when the branches are longer or closer.", "lbl");
  text(svg, 420, 600, "J. P. Kucera, A. G. Kléber, S. Rohr,", "small", { fill: "#666" });
  text(svg, 420, 626, "Circ. Res. 83 (1998), Fig. 1", "small", { fill: "#666" });
  items.push({ name: "figures from the cited papers (with citations)", color: "#444", tag: "schematic" });
}

// ---------- 03: a front at a junction (specialist's simulation data) ----------
const junctionData = new Map();
async function loadJunction(name) {
  if (!junctionData.has(name)) junctionData.set(name, fetch(`content/data/junction-${name}.json`, { cache: "no-store" }).then((r) => r.json()));
  return junctionData.get(name);
}
export function drawJunction({ stage, state, items, exportMode }) {
  const svg = svgRoot(stage, 1000, 810);
  const runs = String(state.runs || "pass,block").split(",").map((s) => s.trim());
  const shown = runs.slice(0, build(state) + 1);
  shown.forEach((name, i) => {
    const y0 = 20 + i * 395;
    loadJunction(name).then((d) => drawJunctionRun(svg, d, y0, exportMode, i === shown.length - 1, name)).catch((e) => {
      text(svg, 40, y0 + 100, `junction data missing: ${name} (${e.message})`, "small", { fill: "#a00" });
    });
  });
  items.push({ name: "simulation of a front reaching a junction (specialist's data)", color: "#000", tag: "computed" });
}
function drawJunctionRun(svg, d, y0, exportMode, play, name) {
  const xin = d.x_incoming, xout = d.x_outgoing, frames = d.frames;
  const X0 = Math.min(...xin), X1 = Math.max(...xout);
  const F = frame(svg, [X0, X1, -0.05, 1.08], [70, y0 + 20, 900, 250], { xticks: [], yticks: [0, 1], ylabel: "u" });
  line(F, [[0, -0.05], [0, 1.08]], { stroke: "#bbb", "stroke-dasharray": "4 5" });
  text(svg, 80, y0 + 12, `a = ${(+d.a).toFixed(2)}${name === "pass" ? ": the front passes" : ": the front stops"}`, "lbl");
  // The graph, fixed below the profile: one edge on the left, two edges on the right.
  const gy = y0 + 330, gx = F.fx(0);
  el("line", { x1: F.fx(X0), y1: gy, x2: gx, y2: gy, stroke: "#222", "stroke-width": 5 }, svg);
  el("path", { d: `M${gx},${gy} C${gx + 60},${gy - 30} ${gx + 120},${gy - 34} ${F.fx(X1)},${gy - 34}`, fill: "none", stroke: "#222", "stroke-width": 5 }, svg);
  el("path", { d: `M${gx},${gy} C${gx + 60},${gy + 30} ${gx + 120},${gy + 34} ${F.fx(X1)},${gy + 34}`, fill: "none", stroke: "#222", "stroke-width": 5 }, svg);
  el("circle", { cx: gx, cy: gy, r: 8, fill: "#222" }, svg);
  const curveOf = (fr) => [...xin.map((x, k) => [x, fr.u_incoming[k]]), [0, fr.u_vertex], ...xout.map((x, k) => [x, fr.u_outgoing[k]])];
  if (exportMode || !play) {
    const n = frames.length;
    for (const k of [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1])
      line(F, curveOf(frames[k]), { stroke: "#111", "stroke-width": k === n - 1 ? 3 : 1.5, opacity: k === n - 1 ? 1 : 0.35 });
    return;
  }
  const path = line(F, curveOf(frames[0]), { stroke: "#111", "stroke-width": 3 });
  animate(+d.duration_ms || 6000, (u) => {
    const fr = frames[Math.min(frames.length - 1, Math.floor(u * (frames.length - 1)))];
    path.setAttribute("d", pathD(F, curveOf(fr)));
  }, false);
}

// ---------- 05: bistable cubic and its travelling front ----------
const cubic = (u, a) => u * (1 - u) * (u - a);
export function drawCubic({ stage, state, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = +state.a || 0.3;
  const F = frame(svg, [-0.08, 1.08, -0.11, 0.11], [110, 30, 850, 330], { xticks: [0, a, 1].map((v) => +v.toFixed(2)), yticks: [0], xlabel: "u", ylabel: "f(u)" });
  const U = Array.from({ length: 241 }, (_, i) => -0.08 + (1.16 * i) / 240);
  const pos = [[a, 0], ...U.filter((u) => u >= a && u <= 1).map((u) => [u, cubic(u, a)]), [1, 0]];
  const neg = [[0, 0], ...U.filter((u) => u >= 0 && u <= a).map((u) => [u, cubic(u, a)]), [a, 0]];
  el("path", { d: pathD(F, pos) + "Z", fill: "#cfe3f7" }, F.plot);
  el("path", { d: pathD(F, neg) + "Z", fill: "#f7dccf" }, F.plot);
  line(F, [[-0.08, 0], [1.08, 0]], { stroke: "#999" });
  line(F, U.map((u) => [u, cubic(u, a)]), { stroke: "#111", "stroke-width": 3 });
  for (const u of [0, 1]) dot(F, [u, 0], 7, { fill: "#111" });
  dot(F, [a, 0], 7, { fill: "#fff", stroke: "#111", "stroke-width": 2.5 });
  // Front profile U(x - ct), U(z) = 1/(1 + e^{z/√2}), c = √2(1/2 - a) (closed form for the cubic).
  const c = Math.SQRT2 * (0.5 - a);
  const G = frame(svg, [-10, 10, -0.05, 1.08], [110, 470, 850, 260], { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  const X = Array.from({ length: 201 }, (_, i) => -10 + i / 10);
  line(G, X.map((x) => [x, 1 / (1 + Math.exp(x / Math.SQRT2))]), { stroke: "#111", "stroke-width": 3 });
  if (Math.abs(c) > 1e-3) {
    const len = 6 * c, y = 0.5;
    line(G, [[0, y], [len, y]], { stroke: "#c00", "stroke-width": 4 });
    const s = Math.sign(c);
    el("path", { d: `M${G.fx(len)},${G.fy(y)} l${-s * 16},-9 l0,18 Z`, fill: "#c00" }, G.plot);
  } else text(G.plot, G.fx(0.6), G.fy(0.55), "stationary", "lbl", { fill: "#c00" });
  items.push({ name: `cubic f, a = ${a}; areas: sign of ∫f`, color: "#111", tag: "exact" });
  items.push({ name: "travelling front 1/(1+e^{z/√2}), speed √2(1/2 − a)", color: "#c00", tag: "exact" });
}

// ---------- 06: level sets of H for the cubic ----------
export function drawCubicPortrait({ stage, state, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = +state.a || 0.4;
  const Fp = (u) => -(u ** 4) / 4 + ((1 + a) * u ** 3) / 3 - (a * u * u) / 2; // F' = f
  const box = [-0.12, 1.12, -0.32, 0.32];
  const F = frame(svg, box, [110, 40, 850, 680], { xticks: [0, 0.5, 1], yticks: [-0.2, 0, 0.2], xlabel: "u", ylabel: "v = u′" });
  const U = Array.from({ length: 601 }, (_, i) => box[0] + ((box[1] - box[0]) * i) / 600);
  // Level curves of H as closed polylines: v = ±sqrt(2(h − F)), joined through their turning points (v = 0).
  const level = (h) => {
    const out = []; let run = [];
    const turn = (u0, u1) => { let lo = u0, hi = u1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if ((h - Fp(m) >= 0) === (h - Fp(lo) >= 0)) lo = m; else hi = m; } return (lo + hi) / 2; };
    for (let i = 0; i < U.length; i++) {
      const u = U[i], q = 2 * (h - Fp(u));
      if (q >= 0) { if (!run.length && i > 0) run.push(turn(U[i - 1], u)); run.push(u); }
      else if (run.length) { run.push(turn(U[i - 1], u)); out.push(run); run = []; }
    }
    if (run.length) out.push(run);
    return out.map((us) => [...us.map((u) => [u, Math.sqrt(Math.max(0, 2 * (h - Fp(u))))]), null, ...us.map((u) => [u, -Math.sqrt(Math.max(0, 2 * (h - Fp(u))))])]);
  };
  for (let k = -6; k <= 10; k++) for (const pl of level(Fp(a) + k * 0.006)) line(F, pl, { stroke: "#b5b5b5", "stroke-width": 1.4 });
  // Separatrices on v < 0: from (1,0) at level F(1), into (0,0) at level F(0) = 0.
  const sepU = U.filter((u) => u <= 1).map((u) => { const q = 2 * (Fp(1) - Fp(u)); return q >= 0 ? [u, -Math.sqrt(q)] : null; });
  const sepS = U.filter((u) => u >= 0).map((u) => { const q = -2 * Fp(u); return q >= 0 ? [u, -Math.sqrt(q)] : null; });
  line(F, sepU, { stroke: C.unstable, "stroke-width": 4 });
  line(F, sepS, { stroke: C.stable, "stroke-width": 4 });
  text(F.plot, F.fx(0.88), F.fy(-0.05), "from (1,0)", "direct", { fill: C.unstable, "text-anchor": "end" });
  text(F.plot, F.fx(0.02), F.fy(0.05), "into (0,0)", "direct", { fill: C.stable });
  line(F, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  label(F, [a, box[3]], "u = a", 6, 26);
  for (const u of [0, 1]) dot(F, [u, 0], 7, { fill: "#000" });
  label(F, [0, 0], "(0,0)", 8, -12, "lbl"); label(F, [1, 0], "(1,0)", -70, -12, "lbl");
  text(F.plot, F.fx(0.62), F.fy(-0.27), a === 0.5 ? "the separatrices coincide" : Math.abs(a - 0.5) < 2e-3 ? "nearly balanced; they coincide only at a = 1/2" : "the separatrices miss", "lbl");
  items.push({ name: `level sets of H = v²/2 + F(u), cubic, a = ${a.toFixed(3)}`, color: "#ccc", tag: "exact" });
  // drag the line u = a; snaps to the balanced value
  state._ctl = { a: [0.4, 0.6, 0.001] };
  if (liveControls(state).has("a") && onChange) dragHandle(svg, F, { q: "a", axis: "x", at: a, range: [0.4, 0.6], set: (v) => onChange({ a: Math.abs(v - 0.5) < 4e-3 ? 0.5 : v }) });
}

// ---------- McKean: helpers ----------
// Dragging near a root of b = a snaps exactly onto it, so that "a front" is shown only at an exact match.
function snapRoot(model, a, s) {
  if (!(a >= model.aMinus && a <= model.aPlus)) return s;
  const { rhoP, rhoQ } = model.roots(a);
  for (const r of [rhoP, rhoQ]) if (Math.abs(s - r) < 0.012) return r;
  return s;
}
function straightWithContinuation(F, model, s, a, box) {
  const sp = model.straightParts(s, a), full = model.straightParts(s, a, [box[0] - 1, box[1] + 1, box[2] - 1, box[3] + 1]);
  line(F, pts(full.unstableLine), { stroke: C.unstable, "stroke-width": 2, "stroke-dasharray": "9 8", opacity: 0.7 });
  line(F, pts(full.stableLine), { stroke: C.stable, "stroke-width": 2, "stroke-dasharray": "9 8", opacity: 0.7 });
  line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 5 });
  line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 5 });
  return sp;
}
function equilibria(F) {
  dot(F, [0, 0], 7, { fill: "#000" }); dot(F, [1, 0], 7, { fill: "#000" });
  label(F, [0, 0], "(0,0)", 8, -12, "lbl"); label(F, [1, 0], "(1,0)", -70, -12, "lbl");
}
function thresholdLine(F, a, box, labelIt = true) {
  line(F, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  if (labelIt) label(F, [a, box[3]], "u = a", 6, 26);
}
function bPlot(svg, rect, model, opts = {}) {
  const L = model.L, lo = model.aMinus - 0.02, hi = model.aPlus + 0.02;
  const F = frame(svg, [0, L, lo, hi], rect, { xticks: [0, model.P.L1, +L.toFixed(3)], yticks: [], xlabel: "s", ylabel: "b(s)" });
  for (const [v, nm] of [[model.aMinus, "−"], [model.aPlus, "+"]]) { el("line", { x1: rect[0] - 6, x2: rect[0], y1: F.fy(v), y2: F.fy(v), stroke: "#333" }, svg); subText(svg, rect[0] - 10, F.fy(v) + 7, ["a", [nm]], "lbl-i", { "text-anchor": "end" }); }
  el("rect", { x: F.fx(model.P.L1), y: F.rect[1], width: F.fx(L) - F.fx(model.P.L1), height: F.rect[3], fill: SHADE }, F.plot);
  const curve = Array.from({ length: 301 }, (_, i) => { const x = (i / 300) * L; return [x, model.b(x)]; });
  line(F, curve, { stroke: "#000", "stroke-width": 3 });
  text(svg, F.fx(model.P.L1 / 2), rect[1] + 24, "single edge", "small", { "text-anchor": "middle", fill: "#666" });
  text(svg, F.fx((model.P.L1 + L) / 2), rect[1] + 24, "pair (p = 4)", "small", { "text-anchor": "middle", fill: "#666" });
  return F;
}

// ---------- 11: the point cloud and the straight parts ----------
export function drawCloud({ stage, state, model, items, exportMode }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), s = num(state, "s", model);
  const box = [-0.05, 1.05, -0.88, 0.12];
  const F = frame(svg, box, [330, 40, 640, 680], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "" });
  thresholdLine(F, a, box);
  const b = build(state);
  // A disc of states; each iterate is kept only while the whole trajectory over the period stays on one side of u = a.
  const cloud = (center, dir, side) => memo(model, `cloud:${a}:${s}:${center}:${dir}`, () => {
    const n = 260, r = 0.035, out = [];
    let Z = Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n, q = Math.sqrt((i % 13) / 12); return [center[0] + r * q * Math.cos(t), center[1] + r * q * Math.sin(t)]; });
    Z = Z.filter((z) => (side < 0 ? z[0] < a : z[0] > a));
    out.push(Z);
    for (let k = 1; k <= 4; k++) {
      Z = Z.map((z) => {
        const tr = model.trajectory(z, s, s + dir * model.L, a, { maxStep: model.L / 40 });
        const ok = tr.us.every((u) => (side < 0 ? u < a : u > a));
        return ok ? [tr.us.at(-1), tr.vs.at(-1)] : null;
      }).filter(Boolean);
      out.push(Z);
    }
    return out;
  });
  const showCloud = (iters, color) => {
    const groups = iters.map((Z, k) => { const g = el("g", { opacity: 0 }, F.plot); for (const z of Z) dot({ ...F, plot: g }, z, 3.2, { fill: color, opacity: 0.25 + 0.15 * k }); return g; });
    animate(4000, (u) => { const k = Math.min(iters.length - 1, Math.floor(u * iters.length)); groups.forEach((g, i) => g.setAttribute("opacity", i <= k ? (i === k ? 1 : 0.25) : 0)); }, exportMode);
  };
  if (b >= 2) {
    const sp = model.straightParts(s, a);
    line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 5 });
    line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 5 });
    dot(F, pts(sp.unstable).filter(Boolean).find((q) => Math.abs(q[0] - a) < 1e-9) || [a, -(1 - a) * model.rPlus(s)], 7, { fill: C.unstable });
    dot(F, [a, -a * model.rMinus(s)], 7, { fill: C.stable });
    items.push({ name: "straight parts to u = a", color: C.unstable, tag: "exact" });
  }
  if (b === 0 || b >= 2) showCloud(cloud([0, 0], -1, -1), C.stable);
  if (b >= 1) showCloud(cloud([1, 0], 1, 1), C.unstable);
  equilibria(F);
  items.push({ name: "cloud iterated while each trajectory stays on one side of u = a", color: "#888", tag: "computed" });
  // Inset: the cubic's curved manifolds, from smooth.js if available (computed), for contrast.
  drawCubicInset(svg, [40, 60, 250, 300], state, items);
  text(svg, 40, 400, "the cubic: curved", "lbl", { fill: "#555" });
}
let smoothModule = null;
import("./smooth.js").then((m) => { smoothModule = m; }).catch(() => {});
function drawCubicInset(svg, rect, state, items) {
  const box = [-0.05, 1.05, -0.72, 0.18];
  const F = frame(svg, box, rect, { xticks: [], yticks: [] });
  if (!smoothModule || !state.smoothA) { text(svg, rect[0] + 10, rect[1] + 30, "(cubic picture pending)", "small", { fill: "#a00" }); return; }
  const m = memo({ cache: smoothCache }, `sm:${state.smoothA}`, () => smoothModule.makeSmoothModel({ alpha: +state.alpha, L1: +state.smoothL1 || 2, L2: +state.smoothL2 || 4, a: +state.smoothA }));
  const sS = +state.smoothS || 0;
  const wu = memo({ cache: smoothCache }, `wu:${state.smoothA}:${sS}`, () => m.unstableManifold(sS, {}));
  const ws = memo({ cache: smoothCache }, `ws:${state.smoothA}:${sS}`, () => m.stableManifold(sS, {}));
  line(F, smoothPts(wu), { stroke: C.unstable, "stroke-width": 3 });
  line(F, smoothPts(ws), { stroke: C.stable, "stroke-width": 3 });
  line(F, [[+state.smoothA, box[2]], [+state.smoothA, box[3]]], { stroke: C.threshold, "stroke-dasharray": "6 5" });
  items.push({ name: "cubic: computed manifolds (smooth.js)", color: C.unstable, tag: "computed" });
}
const smoothCache = new Map();
export function smoothPts(c) {
  if (!c) return [];
  if (Array.isArray(c)) return c.flatMap((q) => (Array.isArray(q) && Array.isArray(q[0]) ? [...q, null] : [q]));
  if (c.points) return pts(c);
  if (c.polylines) return c.polylines.flatMap((pl) => [...pl.map((q) => (Array.isArray(q) ? q : [q.u, q.v])), null]);
  if (c.pieces) return c.pieces.flatMap((pc) => [...smoothPts(pc), null]);
  return pts(c);
}

// ---------- 12: a monotone front at its crossing; linked profile V_s ----------
export function drawCrossing({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), s = num(state, "s", model), L = model.L;
  state._a = a; state._s = s;
  const box = [-0.05, 1.05, -0.88, 0.12];
  const F = frame(svg, box, [110, 20, 860, 430], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  thresholdLine(F, a, box);
  straightWithContinuation(F, model, s, a, box);
  const bs = model.b(s), vb = -model.rMinus(s) * bs, hit = Math.abs(bs - a) < 1e-9;
  dot(F, [bs, vb], 9, { fill: hit ? "#c00" : "#fff", stroke: "#c00", "stroke-width": 3 });
  line(F, [[bs, vb], [bs, box[2]]], { stroke: "#c00", "stroke-dasharray": "3 5" });
  label(F, [bs, box[2]], "b(s)", 6, -10, "lbl-i", { fill: "#c00" });
  equilibria(F);
  // Profile V_s: down the unstable line for x < s, in along the stable line for x > s.
  const x0 = -0.5 * L, x1 = 1.5 * L;
  const G = frame(svg, [x0, x1, -0.05, 1.05], [110, 545, 860, 200], { xticks: [], yticks: [0, +a.toFixed(3), 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, model, x0, x1);
  const V = model.stepProfile(s), X = Array.from({ length: 401 }, (_, i) => x0 + ((x1 - x0) * i) / 400);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  line(G, X.map((x) => [x, val(V(x))]), { stroke: hit ? "#111" : "#777", "stroke-width": 3 });
  line(G, [[s, -0.05], [s, 1.05]], { stroke: "#c00", "stroke-width": 1.5 });
  dot(G, [s, bs], 7, { fill: "#c00" });
  text(G.plot, G.fx(s) + 8, G.fy(1.05) + 22, "x = s", "lbl-i", { fill: "#c00" });
  text(G.plot, G.fx(s) + 10, G.fy(bs) + (bs > a ? -10 : 26), "b(s)", "lbl-i", { fill: "#c00" });
  if (hit) text(G.plot, G.fx(x1) - 10, G.fy(0.85), "a front", "lbl", { "text-anchor": "end" });
  if (onChange && liveControls(state).has("s")) dragX(G, svg, (x) => onChange({ s: snapRoot(model, a, ((x % L) + L) % L) }));
  items.push({ name: "straight parts (solid) and their continuation past u = a (dashed)", color: C.unstable, tag: "exact" });
  items.push({ name: "profile V_s (exact); grey: p = 4", color: "#111", tag: "exact" });
}

// ---------- 13: a = b(s); both monotone fronts ----------
export function drawInterval({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const L = model.L;
  const s = num(state, "s", model), a = model.b(s);
  state._s = s; state._a = a;
  const box = [-0.05, 1.05, -0.88, 0.12];
  const F = frame(svg, box, [110, 20, 860, 440], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  thresholdLine(F, a, box);
  straightWithContinuation(F, model, s, a, box);
  const { rhoP, rhoQ } = model.roots(Math.min(model.aPlus, Math.max(model.aMinus, a)));
  const fronts = [[rhoP, P_COL, "u^P"], [rhoQ, Q_COL, "u^Q"]];
  for (const [rho, col, nm] of fronts) {
    const Z = [a, -(1 - a) * model.rPlus(rho)];
    const back = memo(model, `orb:${a.toFixed(6)}:${rho}:b`, () => model.trajectory(Z, rho, rho - 4 * L, a, {}));
    const fwd = memo(model, `orb:${a.toFixed(6)}:${rho}:f`, () => model.trajectory(Z, rho, rho + 4 * L, a, {}));
    line(F, [...pts(back).reverse(), null, ...pts(fwd)], { stroke: col, "stroke-width": 2.2, opacity: 0.9 });
    // its sample at phase s (nearest copy of s to the crossing)
    const sk = s + Math.round((rho - s) / L) * L;
    const Zs = memo(model, `smp:${a.toFixed(6)}:${rho}:${sk}`, () => model.flow(Z, rho, sk, a));
    dot(F, Zs, 8, { fill: col, stroke: "#fff", "stroke-width": 2 });
  }
  subText(F.plot, F.fx(0.78), F.fy(-0.52), ["u", ["^P"]], "direct", { fill: P_COL });
  subText(F.plot, F.fx(0.78), F.fy(-0.6), ["u", ["^Q"]], "direct", { fill: Q_COL });
  equilibria(F);
  const B = bPlot(svg, [110, 560, 860, 170], model);
  line(B, [[0, a], [L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  text(svg, B.rect[0] + B.rect[2] + 8, B.fy(a) + 7, "a", "lbl-i");
  for (const [rho, col, nm] of fronts) { dot(B, [rho, a], 8, { fill: col }); subText(B.plot, B.fx(rho) + (nm === "u^P" ? -34 : 10), B.fy(a) - 12, ["ρ", [nm === "u^P" ? "P" : "Q"]], "lbl-i", { fill: col }); }
  line(B, [[s, B.box[2]], [s, B.box[3]]], { stroke: "#c00", "stroke-width": 2 });
  if (onChange && liveControls(state).has("s")) dragX(B, svg, (x) => onChange({ s: Math.min(L - 1e-6, Math.max(0, x)) }));
  items.push({ name: "a = b(s); straight parts; orbits of u^P (green) and u^Q (purple)", color: P_COL, tag: "computed" });
  items.push({ name: "b(s) with roots", color: "#000", tag: "exact" });
}

// ---------- 14: existence interval over the two lengths (manuscript figure) ----------
export function drawLengths({ stage, items }) {
  const svg = svgRoot(stage, 1000, 810);
  el("image", { href: "build/fig/dorayaki.png", x: 230, y: 0, width: 700, height: 602 }, svg);
  // the necklace, to recall the lengths
  const y = 700; let x = 60;
  for (let k = 0; k < 3; k++) {
    el("line", { x1: x, y1: y, x2: x + 150, y2: y, stroke: "#222", "stroke-width": 4 }, svg);
    if (k === 1) text(svg, x + 75, y - 16, "L₁", "lbl-i", { "text-anchor": "middle" });
    x += 150;
    for (const sw of [1, 0]) el("path", { d: `M${x},${y} A55,40 0 0 ${sw} ${x + 110},${y}`, fill: "none", stroke: "#d4a017", "stroke-width": 4 }, svg);
    if (k === 1) text(svg, x + 55, y - 52, "L₂/2 each", "lbl-i", { "text-anchor": "middle" });
    x += 110;
  }
  items.push({ name: "manuscript Fig. (summary, panel e): a± over tanh L₁, tanh(L₂/2), α = 1/4", color: "#444", tag: "exact" });
}

// ---------- 15: orientation at the two crossings ----------
export function drawOrientation({ stage, state, model, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model);
  const { rhoP, rhoQ } = model.roots(a);
  [[rhoP, "P", P_COL, 40], [rhoQ, "Q", Q_COL, 520]].forEach(([s0, z, col, X]) => {
    const vstar = -(1 - a) * model.rPlus(s0), h = 0.02;
    const arcs = memo(model, `arcs:${a}:${s0}`, () => model.localArcs(s0, a, h));
    const dv = h * Math.max(model.rPlus(s0), model.rMinus(s0)) * 1.4;
    const F = frame(svg, [a - h, a + h, vstar - dv, vstar + dv], [X + 20, 70, 420, 400], { xticks: [], yticks: [], xlabel: "u" });
    el("rect", { x: F.fx(a), y: F.rect[1], width: F.fx(a + h) - F.fx(a), height: F.rect[3], fill: "#f4f4f4" }, F.plot);
    text(F.plot, F.fx(a) + 10, F.rect[1] + F.rect[3] - 12, "u > a", "lbl-i", { fill: "#777" });
    line(F, [[a, vstar - dv], [a, vstar + dv]], { stroke: C.threshold, "stroke-dasharray": "6 5" });
    line(F, pts(arcs.unstable), { stroke: C.unstable, "stroke-width": 5 });
    line(F, pts(arcs.stable), { stroke: C.stable, "stroke-width": 5 });
    dot(F, [a, vstar], 8, { fill: col });
    subText(svg, X + 20, 50, ["u", [`^${z}`], z === "P" ? ", sampled at ρ" : ", sampled at ρ", [z]], "lbl", { fill: col });
    subText(F.plot, F.rect[0] + 12, F.rect[1] + F.rect[3] - 50, ["from (1,0)"], "direct", { fill: C.unstable });
    subText(F.plot, F.rect[0] + 12, F.rect[1] + F.rect[3] - 20, ["into (0,0)"], "direct", { fill: C.stable });
    text(svg, F.rect[0] + F.rect[2], F.rect[1] + F.rect[3] + 34, z === "P" ? "on u > a: blue above orange" : "on u > a: blue below orange", "lbl", { "text-anchor": "end" });
  });
  const B = bPlot(svg, [110, 580, 860, 150], model);
  line(B, [[0, a], [model.L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  for (const [rho, col, z] of [[rhoP, P_COL, "P"], [rhoQ, Q_COL, "Q"]]) {
    dot(B, [rho, a], 8, { fill: col });
    text(B.plot, B.fx(rho) + 10, B.fy(a) + (z === "P" ? 30 : -14), z === "P" ? "b′ < 0" : "b′ > 0", "lbl-i", { fill: col });
  }
  items.push({ name: "local arcs at ρ_P and ρ_Q", color: C.unstable, tag: "computed" }, { name: "b(s)", color: "#000", tag: "exact" });
}

// ---------- 16: V_rho with a draggable interface ----------
export function drawPrescribed({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const amin = model.aMinus, amax = model.aPlus, L = model.L, rho = num(state, "s", model);
  const a = Math.min(amax, Math.max(amin, num(state, "a", model)));
  state.a = a; state._a = a; state._amin = amin; state._amax = amax; state._s = rho;
  state._ctl = { a: [amin, amax, 0.001], s: [0, 2 * L, 0.001] };
  const rmod = ((rho % L) + L) % L;
  // drags: rho as the red line (front plot and b panel), a as the dashed line (both); a snaps onto b(rho) when close
  const setA = onChange && ((v) => { let w = Math.min(amax, Math.max(amin, v)); if (Math.abs(w - model.b(rmod)) < 0.0025) w = model.b(rmod); onChange({ a: w }); });
  const setRho = onChange && ((x) => { const k = Math.floor(x / L); onChange({ s: k * L + snapRoot(model, a, x - k * L) }); });
  // the window moves with rho, so that dragging past 0 or L continues into the next period
  const x0 = rho - L, x1 = rho + L;
  const G = frame(svg, [x0, x1, -0.05, 1.08], [110, 40, 860, 400], { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  text(svg, G.rect[0] - 10, G.fy(a) + 7, "a", "lbl-i", { "text-anchor": "end" });
  shadePairs(G, model, x0, x1);
  el("rect", { x: G.fx(x0), y: G.rect[1], width: G.fx(rho) - G.fx(x0), height: 14, fill: "#f2c94c" }, G.plot);
  text(G.plot, G.fx(x0) + 8, G.rect[1] + 34, "source 1 for x < ρ", "small", { fill: "#8a6d00" });
  const V = model.stepProfile(rho), X = Array.from({ length: 401 }, (_, i) => x0 + ((x1 - x0) * i) / 400);
  const bv = model.b(rho), hit = Math.abs(bv - a) < 1e-9;
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  line(G, X.map((x) => [x, val(V(x))]), { stroke: hit ? "#111" : "#666", "stroke-width": 3 });
  line(G, [[rho, -0.05], [rho, 1.08]], { stroke: "#c00", "stroke-width": 1.5 });
  dot(G, [rho, bv], 8, { fill: "#c00" });
  subText(G.plot, G.fx(rho) + 10, G.fy(bv) + (bv > a ? -12 : 28), ["V", ["ρ"], "(ρ) = b(ρ)"], "lbl-i", { fill: "#c00" });
  text(G.plot, G.fx(rho) + 6, G.rect[1] + G.rect[3] - 10, "ρ", "lbl-i", { fill: "#c00" });
  if (hit) text(G.plot, G.fx(x1) - 10, G.fy(0.85), "a front", "lbl", { "text-anchor": "end" });
  dragHandle(svg, G, { q: "s", name: "ρ", axis: "x", at: rho, set: setRho });
  dragHandle(svg, G, { q: "a", axis: "y", at: a, set: setA, range: [amin, amax] });
  const B = bPlot(svg, [110, 560, 860, 170], model);
  line(B, [[0, a], [L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  text(svg, B.rect[0] + B.rect[2] + 8, B.fy(a) + 7, "a", "lbl-i");
  const { rhoP, rhoQ } = model.roots(a);
  dot(B, [rhoP, a], 7, { fill: P_COL }); dot(B, [rhoQ, a], 7, { fill: Q_COL });
  subText(B.plot, B.fx(rhoP) + 10, B.fy(a) + 28, ["ρ", ["P"]], "lbl-i", { fill: P_COL });
  subText(B.plot, B.fx(rhoQ) + 10, B.fy(a) + 28, ["ρ", ["Q"]], "lbl-i", { fill: Q_COL });
  const r = rmod;
  line(B, [[r, B.box[2]], [r, B.box[3]]], { stroke: "#c00", "stroke-width": 1.5 });
  dot(B, [r, model.b(r)], 7, { fill: "#c00" });
  dragHandle(svg, B, { q: "s", name: "ρ", axis: "x", at: r, set: setRho && ((x) => setRho(rho - r + Math.min(L - 1e-6, Math.max(0, x)))) });
  dragHandle(svg, B, { q: "a", axis: "y", at: a, set: setA, range: [amin, amax] });
  items.push({ name: "V_ρ (exact); yellow: the source 1 on x < ρ", color: "#111", tag: "exact" });
}

// ---------- 18: the alternating sum at the first crossing; the phase plane there ----------
export function drawOnlyWay({ stage, state, model, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), L = model.L, j = +state.j || 1;
  const s = model.roots(a).rhoP;
  const bc = memo(model, `bc:${a}:${j}`, () => model.baseCrossings(j, a, {}));
  const list = (bc.crossings || bc || []).slice().sort((p, q) => p.point[0] - q.point[0]);
  const pick = list[Math.min(list.length - 1, +state.select ? +state.select - 1 : Math.floor(list.length / 2))];
  if (!pick) { text(svg, 40, 100, "no base crossing at these values", "lbl", { fill: "#a00" }); return; }
  const fr = memo(model, `front:${a}:${s}:${pick.point[0].toFixed(12)}:${pick.point[1].toFixed(12)}`, () => model.reconstructFront(pick.point, s, a, {}));
  const rhos = (fr.crossings || []).map((c) => c.x);
  if (rhos.length < 3) { text(svg, 40, 100, "selected front has fewer than three crossings", "lbl", { fill: "#a00" }); return; }
  const x0 = rhos[0] - 0.6 * L, x1 = rhos.at(-1) + 0.6 * L;
  const G = frame(svg, [x0, x1, -0.05, 1.08], [110, 40, 520, 420], { xticks: [], yticks: [0, +a.toFixed(3), 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, model, x0, x1);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  const V1 = model.stepProfile(rhos[0]), X = Array.from({ length: 501 }, (_, i) => x0 + ((x1 - x0) * i) / 500);
  line(G, X.map((x) => [x, val(V1(x))]), { stroke: "#999", "stroke-width": 2.5, "stroke-dasharray": "8 6" });
  line(G, fr.xs.map((x, i) => [x, fr.us[i]]), { stroke: "#111", "stroke-width": 3 });
  rhos.forEach((r, i) => { dot(G, [r, a], 6, { fill: "#c00" }); subText(G.plot, G.fx(r) - 8, G.rect[1] + G.rect[3] - 10, ["ρ", [String(i + 1)]], "small", { fill: "#c00" }); });
  subText(G.plot, G.fx(rhos[0]) + 40, G.fy(val(V1(rhos[0] + 0.4 * L))) + 30, ["V", ["ρ₁"]], "direct", { fill: "#777" });
  text(G.plot, G.fx(x0) + 10, G.fy(0.95), "W", "direct");
  // Stacked bar at rho_1: b(rho_1) plus the pairs V_{rho_{2k+1}} - V_{rho_{2k}} at rho_1.
  const at = (r, x) => val(model.stepProfile(r)(x));
  const base = model.b(rhos[0]), pairs = [];
  for (let k = 1; 2 * k < rhos.length; k++) pairs.push(at(rhos[2 * k], rhos[0]) - at(rhos[2 * k - 1], rhos[0]));
  const Bx = 700, By0 = 470, scale = 380 / 0.7; // u in [0.0, 0.7] over 380 px
  const yv = (u) => By0 - u * scale;
  const lo = 0.3; // axis from 0.3
  const yb = (u) => By0 - (u - lo) * scale * 1.6;
  el("line", { x1: Bx - 20, y1: yb(lo), x2: Bx + 120, y2: yb(lo), stroke: "#999" }, svg);
  text(svg, Bx - 24, yb(lo) + 6, "0.3", "tick", { "text-anchor": "end" });
  el("rect", { x: Bx, y: yb(base), width: 80, height: yb(lo) - yb(base), fill: "#bbb" }, svg);
  text(svg, Bx + 90, yb(base) + 20, `b(ρ₁)`, "lbl-i");
  let top = base;
  pairs.forEach((d, k) => {
    el("rect", { x: Bx, y: yb(top + d), width: 80, height: Math.max(1.5, yb(top) - yb(top + d)), fill: "#c00", opacity: 0.8 - 0.25 * k }, svg);
    top += d;
  });
  el("line", { x1: Bx - 20, y1: yb(a), x2: Bx + 120, y2: yb(a), stroke: C.threshold, "stroke-dasharray": "6 5", "stroke-width": 2 }, svg);
  text(svg, Bx + 128, yb(a) + 7, "a", "lbl-i");
  text(svg, Bx - 20, yb(top) - 12, "+ pairs > 0", "lbl", { fill: "#c00" });
  text(svg, Bx - 20, 40, "value at ρ₁", "lbl");
  // Phase plane at the phase of rho_1: the end of the unstable segment lies above the stable line.
  const s1 = ((rhos[0] % L) + L) % L, box = [-0.05, 1.05, -1.0, 0.12];
  const P = frame(svg, box, [110, 590, 860, 160], { xticks: [0, 0.5, 1], yticks: [0], xlabel: "u", ylabel: "" });
  thresholdLine(P, a, box, false);
  const full = model.straightParts(s1, a, [-2, 2, -3, 3]);
  line(P, pts(full.stableLine), { stroke: C.stable, "stroke-width": 2, "stroke-dasharray": "9 8" });
  const sp = model.straightParts(s1, a);
  line(P, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 4 });
  line(P, pts(sp.stable), { stroke: C.stable, "stroke-width": 4 });
  dot(P, [a, -(1 - a) * model.rPlus(s1)], 7, { fill: C.unstable });
  line(P, [[a, -(1 - a) * model.rPlus(s1)], [a, -a * model.rMinus(s1)]], { stroke: "#000", "stroke-width": 3 });
  text(svg, P.rect[0], P.rect[1] - 12, "at the phase of ρ₁: the end of the unstable segment lies above the stable line ⇔ a > b(ρ₁)", "small");
  dot(P, [0, 0], 7, { fill: "#000" }); dot(P, [1, 0], 7, { fill: "#000" });
  items.push({ name: `front with crossings ${rhos.map((r) => r.toFixed(3)).join(", ")} (computed); V_ρ₁ (exact)`, color: "#111", tag: "computed" });
  items.push({ name: `bar: b(ρ₁) = ${base.toFixed(4)}, pairs ${pairs.map((d) => d.toExponential(2)).join(", ")}, sum = ${top.toFixed(4)} vs a = ${a}: computed crossing data; exact alternating-sum identity`, color: "#c00", tag: "computed" });
}

// ---------- 19: spargels with a clamped threshold and a zoom on the closest pair ----------
export function drawPairZoom(svg, model, state, a, s, j, items) {
  const bc = memo(model, `bc:${a}:${j}`, () => model.baseCrossings(j, a, {}));
  const list = (bc.crossings || bc || []).slice().sort((p, q) => p.point[0] - q.point[0]);
  if (list.length < 2) return;
  // Follow the pair that meets at a computed collision (state.pairtarget = u,v of the meeting point, state.paircollide = a*):
  // the two crossings nearest that point. Without a target, the closest adjacent pair.
  const tgt = state.pairtarget ? String(state.pairtarget).split(",").map(Number) : null;
  let A, Bq;
  if (tgt) {
    // The pair is followed by its spargel parameter c, which drifts linearly in a near the collision
    // (state.pairc = "c0, a0, slope": c ≈ c0 + slope (a0 − a); fitted to computed crossings at a = 0.504 … 0.5101).
    const [c0, a0, sl] = String(state.pairc).split(",").map(Number), ct = c0 + sl * (a0 - a);
    const near = list.slice().sort((p, q) => Math.abs(p.c - ct) - Math.abs(q.c - ct));
    const gone = a > +state.paircollide;
    if (gone || !near[1] || Math.abs(near[1].c - ct) > 0.002) {
      const rect = [700, 150, 280, 280];
      el("rect", { x: rect[0], y: rect[1], width: rect[2], height: rect[3], fill: "#fff", stroke: "#bbb" }, svg);
      if (gone) { text(svg, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2 - 12, "the two fronts", "small", { "text-anchor": "middle" }); text(svg, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2 + 16, "have met and vanished", "small", { "text-anchor": "middle" }); }
      text(svg, rect[0], rect[1] - 12, "two fronts meet and vanish", "lbl");
      return [tgt[0], tgt[1], 0.004];
    }
    [A, Bq] = near;
  } else {
    let best = 0;
    for (let i = 1; i + 1 < list.length; i++) if (dist2(list[i], list[i + 1]) < dist2(list[best], list[best + 1])) best = i;
    [A, Bq] = [list[best], list[best + 1]];
  }
  const cx = (A.point[0] + Bq.point[0]) / 2, cy = (A.point[1] + Bq.point[1]) / 2;
  const h = Math.max(4 * Math.hypot(A.point[0] - Bq.point[0], A.point[1] - Bq.point[1]), 4e-4);
  const rect = [700, 150, 280, 280];
  const F = frame(svg, [cx - h, cx + h, cy - h * 0.94, cy + h * 0.94], rect, { xticks: [], yticks: [] });
  el("rect", { x: rect[0], y: rect[1], width: rect[2], height: rect[3], fill: "#fff" }, F.plot);
  const pk = memo(model, `pocket:${a}`, () => model.pocketObjects(a));
  line(F, [pk.Q0, pk.P0], { stroke: C.stable, "stroke-width": 5 });
  // Map only a short interval of the spargel parameter around the pair, finely, so the inset shows the curve itself.
  const I = model.segmentI(s, a), cl = Math.min(A.c, Bq.c), ch = Math.max(A.c, Bq.c), dc = 3 * (ch - cl) + 2e-5;
  const piece = memo(model, `pzc:${a}:${j}:${cl}:${ch}`, () => model.imageCurve(I.point, [cl - dc, ch + dc], s, a, j + 1, { maxChord: h / 200 }));
  line(F, pts(piece), { stroke: C.spargel, "stroke-width": 2.5 });
  const word = (c) => {
    const fr = memo(model, `front:${a}:${s}:${c.point[0].toFixed(12)}:${c.point[1].toFixed(12)}`, () => model.reconstructFront(c.point, s, a, {}));
    const w = model.crossingWord(fr.crossings || [], a, parseFloat(state.cut || "0"));
    return w.letters ? w.letters.map((l, i) => `${l ?? "?"}${sub(w.slots[i])}`).join("") : String(w.word);
  };
  [[A, -1], [Bq, 1]].forEach(([c, sd]) => {
    dot(F, c.point, 7, { fill: "#c00" });
    text(F.plot, F.fx(c.point[0]) + sd * 14, F.fy(c.point[1]) + 8, word(c), "lbl", { fill: "#c00", "text-anchor": sd < 0 ? "end" : "start" });
  });
  text(svg, rect[0], rect[1] - 12, tgt ? "two fronts meet and vanish" : "two nearby fronts", "lbl");
  // mark the zoom window in the main picture is left to the caller
  items.push({ name: tgt ? "zoom on a tracked pair of base crossings (computed collision), with their words" : "zoom on the closest pair of base crossings, with their words", color: "#c00", tag: "computed" });
  return [cx, cy, h];
}
function dist2(p, q) { return (p.point[0] - q.point[0]) ** 2 + (p.point[1] - q.point[1]) ** 2; }

// ---------- 20: summary: b graph and the folded manifold ----------
export function drawAnswers({ stage, state, model, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), j = +state.j || 3;
  const B = bPlot(svg, [90, 60, 380, 300], model);
  line(B, [[0, a], [model.L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  const { rhoP, rhoQ } = model.roots(a);
  dot(B, [rhoP, a], 8, { fill: P_COL }); dot(B, [rhoQ, a], 8, { fill: Q_COL });
  const box = [0.3, 0.55, -0.72, -0.4];
  const F = frame(svg, box, [560, 60, 420, 650], { xticks: [], yticks: [] });
  thresholdLine(F, a, box, false);
  const pk = memo(model, `pocket:${a}`, () => model.pocketObjects(a));
  for (let k = 0; k <= j; k++) {
    const sp = memo(model, `sp:${a}:${k}:0.01`, () => model.spargel(k, a, { maxChord: 0.01 }));
    line(F, pts(sp), { stroke: C.spargel, "stroke-width": 2, opacity: 0.4 + 0.15 * k });
  }
  line(F, [pk.Q0, pk.P0], { stroke: C.stable, "stroke-width": 6 });
  const bc = memo(model, `bc:${a}:${j}`, () => model.baseCrossings(j, a, {}));
  for (const c of bc.crossings || bc || []) dot(F, c.point, 5, { fill: "#000" });
  text(svg, 90, 470, "existence interval, two monotone fronts,", "lbl");
  text(svg, 90, 502, "stability from the sign of b′", "lbl");
  text(svg, 560, 750, "folding: the nonmonotone fronts", "lbl");
  items.push({ name: "b(s) (exact); spargels and base crossings (computed)", color: "#000", tag: "computed" });
}

// ---------- Act III, cubic reaction (smooth.js, computed by the specialist's core) ----------
const SYS1 = "#2a9d8f", SYS4 = "#d4a017"; // teal: p = 1, gold: p = 4
function smoothModel(state) {
  if (!smoothModule) return null;
  return memo({ cache: smoothCache }, `sm:${state.alpha}:${state.L1}:${state.L2}:${state.a}`,
    () => smoothModule.makeSmoothModel({ alpha: +state.alpha, L1: +state.L1, L2: +state.L2, a: +state.a }));
}
function waitSmooth(stage, redraw) {
  svgRoot(stage, 1000, 810);
  import("./smooth.js").then((m) => { smoothModule = m; redraw(); }).catch((e) => { text(stage.firstChild, 40, 80, `smooth core unavailable: ${e.message}`, "lbl", { fill: "#a00" }); });
}
const SBOX = [-0.1, 1.1, -0.45, 0.16];
function smoothFront(m, state) {
  const s = +state.s || 0, k = +state.front || 0;
  const hits = memo({ cache: smoothCache }, `ints:${state.a}:${s}`, () => m.intersections(s, {}));
  const all = (hits.points || []).filter((h) => !h.primary === false || Array.isArray(h));
  const prim = (hits.points || []).filter((h) => h.primary);
  const list = (prim.length ? prim : hits.points || []).map((h) => (Array.isArray(h) ? h : h.point)).filter(Boolean).sort((p, q) => p[0] - q[0]);
  const z = list[Math.min(k, list.length - 1)];
  if (!z) return { hits, list };
  const w = String(state.window || "-27,29").split(",").map(Number);
  const fr = memo({ cache: smoothCache }, `fr:${state.a}:${s}:${z}`, () => m.front(z, s, w[0], w[1], {}));
  return { hits, list, z, fr };
}
function profilePanel(svg, m, fr, rect, crop) {
  const L = m.L, x0 = crop ? crop[0] : fr.xs[0], x1 = crop ? crop[1] : fr.xs.at(-1);
  const G = frame(svg, [x0, x1, -0.05, 1.05], rect, { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  for (let k = Math.floor(x0 / L) - 1; k * L < x1; k++)
    el("rect", { x: G.fx(k * L + m.L1), y: G.rect[1], width: G.fx(m.L2) - G.fx(0), height: G.rect[3], fill: "#f6ecd0" }, G.plot);
  return G;
}
function colouredTrajectory(F, m, fr, width = 3) {
  const segs = [];
  let cur = null;
  fr.xs.forEach((x, i) => {
    const typ = m.p(x + 1e-12) === 1 ? 1 : 2, pt = [fr.us[i], fr.vs[i]];
    if (!cur || cur.typ !== typ) { if (cur) cur.pts.push(pt); cur = { typ, pts: [pt], x0: x }; segs.push(cur); } else cur.pts.push(pt);
  });
  return segs.map((sg) => line(F, sg.pts, { stroke: sg.typ === 1 ? SYS1 : SYS4, "stroke-width": width }));
}
function drawLevelFamilies(F, m, a) {
  for (const [pp, col] of [[1, SYS1], [1 / +m.alpha, SYS4]]) {
    for (let k = -5; k <= 7; k++) {
      const h = m.F(a) + k * 0.006;
      try { line(F, pts(m.levelCurve(pp, h, { box: SBOX })), { stroke: col, "stroke-width": 1.3, opacity: 0.6 }); } catch (e) { /* level outside the box */ }
    }
  }
}
function saddles(F) { equilibria(F); }

export function drawSmoothHop({ stage, state, items, exportMode, onChange }) {
  const m = smoothModel(state);
  if (!m) return waitSmooth(stage, () => onChange && onChange({}));
  const svg = svgRoot(stage, 1000, 810);
  const a = +state.a, F = frame(svg, SBOX, [110, 20, 860, 470], { xticks: [0, 0.5, 1], yticks: [-0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  drawLevelFamilies(F, m, a);
  text(F.plot, F.rect[0] + 14, F.rect[1] + 30, "p = 1", "lbl", { fill: SYS1 });
  text(F.plot, F.rect[0] + 14, F.rect[1] + 60, "p = 4", "lbl", { fill: SYS4 });
  saddles(F);
  const { fr } = smoothFront(m, state);
  if (!fr) { text(svg, 120, 300, "no front found by this computation", "lbl", { fill: "#a00" }); return; }
  const crop = String(state.crop || "-5,13").split(",").map(Number);
  const G = profilePanel(svg, m, fr, [110, 600, 860, 150], crop);
  const paths = colouredTrajectory(F, m, fr, 6.5);
  const prof = line(G, fr.xs.map((x, i) => (x >= crop[0] && x <= crop[1] ? [x, fr.us[i]] : null)), { stroke: "#111", "stroke-width": 3 });
  const lens = paths.map((p) => p.getTotalLength?.() || 0), total = lens.reduce((s, l) => s + l, 0);
  const plen = prof.getTotalLength?.() || 0;
  if (!exportMode && total) {
    paths.forEach((p, i) => { p.style.strokeDasharray = `${lens[i]}`; p.style.strokeDashoffset = `${lens[i]}`; });
    prof.style.strokeDasharray = `${plen}`; prof.style.strokeDashoffset = `${plen}`;
    animate(9000, (u) => {
      let left = u * total;
      paths.forEach((p, i) => { const d = Math.max(0, Math.min(lens[i], left)); p.style.strokeDashoffset = `${lens[i] - d}`; left -= lens[i]; });
      prof.style.strokeDashoffset = `${plen * (1 - u)}`;
    }, false);
  }
  items.push({ name: `cubic, a = ${a}: level curves of H_1, H_4 and one front, coloured by the active system`, color: SYS1, tag: "computed" });
}

export function drawSmoothMap({ stage, state, items, exportMode, onChange }) {
  const m = smoothModel(state);
  if (!m) return waitSmooth(stage, () => onChange && onChange({}));
  const svg = svgRoot(stage, 1000, 810);
  const a = +state.a, s = +state.s || 0, L = m.L, b = build(state);
  const F = frame(svg, SBOX, [110, 30, 860, 680], { xticks: [0, 0.5, 1], yticks: [-0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  const { fr } = smoothFront(m, state);
  if (!fr) return;
  if (b === 0) colouredTrajectory(F, m, fr, 2.5);
  else colouredTrajectory(F, m, fr, 2).forEach((p) => p.setAttribute("opacity", 0.5));
  const samples = [];
  for (let k = -6; k <= 6; k++) { const x = s + k * L; if (x >= fr.xs[0] && x <= fr.xs.at(-1)) samples.push(fr.evaluate ? fr.evaluate(x) : m.flow(smoothFront(m, state).z, s, x - s)); }
  const dots = samples.map((z) => dot(F, z, 7, { fill: "#fff", stroke: "#111", "stroke-width": 2.5, opacity: 0 }));
  animate(3000, (u) => dots.forEach((d, i) => d.setAttribute("opacity", i <= u * dots.length ? 1 : 0)), exportMode);
  if (b >= 2) {
    for (const [c, col] of [[[0, 0], "#888"], [[1, 0], "#888"]]) {
      const iters = [0, 1, 2].map((k) => memo({ cache: smoothCache }, `cl:${a}:${s}:${c}:${k}`, () => m.cloud(c, s, 0.02, 160, k)));
      const groups = iters.map((cl) => { const g = el("g", { opacity: 0 }, F.plot); for (const z of cl.points) if (z) dot({ ...F, plot: g }, z, 2.6, { fill: "#555" }); return g; });
      animate(4000, (u) => { const k = Math.min(2, Math.floor(u * 3)); groups.forEach((g, i) => g.setAttribute("opacity", i === k ? 1 : i < k ? 0.25 : 0)); }, exportMode);
    }
  }
  saddles(F);
  items.push({ name: `samples of the front at x = s + kL (s = ${s})${b >= 2 ? "; clouds under Ψ^s, k = 0..3" : ""}`, color: "#111", tag: "computed" });
}

export function drawSmoothManifolds({ stage, state, items, exportMode, onChange }) {
  const m = smoothModel(state);
  if (!m) return waitSmooth(stage, () => onChange && onChange({}));
  const svg = svgRoot(stage, 1000, 810);
  const a = +state.a, s = +state.s || 0, b = build(state);
  const F = frame(svg, SBOX, [110, 20, 860, b >= 2 ? 470 : 680], { xticks: [0, 0.5, 1], yticks: [-0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  const wu = memo({ cache: smoothCache }, `wu:${a}:${s}`, () => m.unstableManifold(s, {}));
  const ws = memo({ cache: smoothCache }, `ws:${a}:${s}`, () => m.stableManifold(s, {}));
  const grow = (man, col, on) => {
    if (!on) return;
    const n = Math.max(...man.pieces.map((p) => p.iterate)) + 1;
    const gs = Array.from({ length: n }, () => el("g", { opacity: 0 }, F.plot));
    for (const pc of man.pieces) line({ ...F, plot: gs[pc.iterate] }, pc.points, { stroke: col, "stroke-width": 3 });
    animate(3500, (u) => gs.forEach((g, i) => g.setAttribute("opacity", i <= u * n ? 1 : 0)), exportMode);
  };
  grow(wu, C.unstable, true);
  grow(ws, C.stable, b >= 1);
  text(F.plot, F.fx(0.9), F.fy(-0.33), "from (1,0)", "direct", { fill: C.unstable, "text-anchor": "end" });
  if (b >= 1) text(F.plot, F.fx(0.1), F.fy(-0.33), "into (0,0)", "direct", { fill: C.stable });
  saddles(F);
  if (b >= 2) {
    const { list, z, fr } = smoothFront(m, state);
    list.forEach((p, k) => {
      const d = dot(F, p, k === (+state.front || 0) ? 10 : 8, { fill: k === (+state.front || 0) ? "#c00" : "#000", style: "cursor:pointer" });
      if (onChange) d.addEventListener("click", () => onChange({ front: k }));
    });
    if (fr) {
      const crop = String(state.crop || "-5,13").split(",").map(Number);
      const G = profilePanel(svg, m, fr, [110, 600, 860, 150], crop);
      line(G, fr.xs.map((x, i) => (x >= crop[0] && x <= crop[1] ? [x, fr.us[i]] : null)), { stroke: "#111", "stroke-width": 3 });
    }
    items.push({ name: `${list.length} intersections (fronts); profile of the selected one`, color: "#c00", tag: "computed" });
  }
  items.push({ name: `cubic, a = ${a}, s = ${s}: manifolds grown by iteration`, color: C.unstable, tag: "computed" });
}

// ---------- 17: alternating-sum builder (three crossings, a P/Q choice each) ----------
// W = V_{rho1} - V_{rho2} + V_{rho3}; start from the isolated roots (b = a down, b = 1 - a up) in the chosen
// periods, show the mismatches W(rho_i) - a, then solve W(rho_i) = a by Newton's method (computed) and check
// that W crosses a only at the three points.
export function solveWord(model, a, slots, word) {
  const L = model.L, down = model.roots(a), up = model.roots(1 - a);
  const start = slots.map((N, i) => N * L + ((i % 2 ? up : down)[word[i] === "P" ? "rhoP" : "rhoQ"]));
  const W = (r, x) => r.reduce((s, rj, j) => s + (j % 2 ? -1 : 1) * val(model.stepProfile(rj)(x)), 0);
  const Fv = (r) => r.map((ri) => W(r, ri) - a);
  let r = start.slice(), ok = false;
  for (let it = 0; it < 40; it++) {
    const f0 = Fv(r);
    if (Math.max(...f0.map(Math.abs)) < 1e-12) { ok = true; break; }
    const h = 1e-7, J = r.map((_, j) => { const q = r.slice(); q[j] += h; const f1 = Fv(q); return f1.map((v, i) => (v - f0[i]) / h); });
    // J[j][i] = dF_i/drho_j; solve sum_j J[j][i] d_j = -f0_i (3x3, Cramer)
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i]));
    const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det(M); if (!Number.isFinite(D) || Math.abs(D) < 1e-14) break;
    const d = [0, 1, 2].map((k) => det(M.map((row, i) => row.map((v, j) => (j === k ? -f0[i] : v)))) / D);
    r = r.map((v, i) => v + d[i]);
  }
  // exactly three threshold crossings, at r, in the right directions
  const x0 = r[0] - 2 * L, x1 = r[2] + 2 * L, N = 3000;
  let crossings = 0;
  for (let k = 0; k < N; k++) { const xa = x0 + ((x1 - x0) * k) / N, xb = x0 + ((x1 - x0) * (k + 1)) / N; if ((W(r, xa) - a) * (W(r, xb) - a) < 0) crossings++; }
  // the solution must have the requested coding: each crossing in its own period, in the requested interval
  const coded = r.every((ri, i) => {
    const N = Math.floor(ri / L), ph = ri - N * L;
    return N === slots[i] && (word[i] === "P" ? ph > 0 && ph < model.P.L1 : ph > model.P.L1);
  }) && r[0] < r[1] && r[1] < r[2];
  // directions: down, up, down
  const dirs = r.map((ri, i) => Math.sign(W(r, ri + 1e-6) - W(r, ri - 1e-6)));
  const directed = dirs[0] < 0 && dirs[1] > 0 && dirs[2] < 0;
  return { start, r, ok: ok && crossings === 3 && coded && directed, W, mismatch: Fv(start) };
}
export function drawBuilder({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), L = model.L;
  const slots = String(state.slots || "0,2,4").split(",").map(Number);
  const word = String(state.word || "PPP").toUpperCase().padEnd(3, "P").slice(0, 3);
  const sol = memo(model, `word:${a}:${slots}:${word}`, () => solveWord(model, a, slots, word));
  const solved = build(state) >= 1;
  const r = solved ? sol.r : sol.start;
  const x0 = (slots[0] - 1) * L, x1 = (slots[2] + 1.6) * L;
  const G = frame(svg, [x0, x1, -0.05, 1.08], [110, 120, 860, 470], { xticks: [], yticks: [0, +a.toFixed(2), 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, model, x0, x1);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  const X = Array.from({ length: 700 }, (_, i) => x0 + ((x1 - x0) * i) / 699);
  line(G, X.map((x) => [x, sol.W(r, x)]), { stroke: solved ? (sol.ok ? "#111" : "#a00") : "#777", "stroke-width": 3 });
  r.forEach((ri, i) => {
    const wv = sol.W(r, ri);
    line(G, [[ri, a], [ri, wv]], { stroke: "#c00", "stroke-width": 4 });
    dot(G, [ri, wv], 6, { fill: "#c00" });
  });
  // word selector: one letter per crossing, clickable; keys 1, 2, 3 toggle
  slots.forEach((N, i) => {
    const x = G.fx(r[i]);
    const t = text(svg, x, 80, `${word[i]}${sub(N)}`, "lbl", { "text-anchor": "middle", style: "cursor:pointer;font-size:34px", fill: word[i] === "P" ? P_COL : Q_COL });
    text(svg, x, 106, i % 2 ? "up" : "down", "small", { "text-anchor": "middle", fill: "#777" });
    if (onChange) t.addEventListener("click", () => onChange({ word: word.slice(0, i) + (word[i] === "P" ? "Q" : "P") + word.slice(i + 1) }));
  });
  text(svg, 110, 680, solved ? (sol.ok ? "solved: a front with exactly these three crossings" : "no front found for this word at this separation")
    : "before solving: each crossing at its own root; red bars show W(ρᵢ) − a", "lbl", { fill: solved && !sol.ok ? "#a00" : "#333" });
  items.push({ name: `word ${word} in periods ${slots}; mismatch ${sol.mismatch.map((m) => m.toExponential(1)).join(", ")}; solved ${sol.ok}`, color: "#111", tag: "computed" });
}

// ---------- 04, 07: the necklace with a monotone front drawn on it, coloured by u (McKean, exact) ----------
const ucol = (u) => { const t = Math.max(0, Math.min(1, u)); return `rgb(${Math.round(235 - 205 * t)},${Math.round(240 - 150 * t)},${Math.round(250 - 90 * t)})`; };
export function drawNecklaceFront({ stage, state, model, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const a = num(state, "a", model), L = model.L, { rhoP } = model.roots(a), V = model.stepProfile(rhoP);
  const periods = 5, x0 = rhoP - 2.5 * L, W1 = 105, W2 = 85, y = +state.necky || 330;
  let X = 30;
  const seg = (xa, xb, path) => { const n = 24; for (let i = 0; i < n; i++) { const u = val(V(xa + ((xb - xa) * (i + 0.5)) / n)); path(i / n, (i + 1) / n, ucol(u)); } };
  for (let k = 0; k < periods; k++) {
    const xs = Math.floor(x0 / L) * L + k * L;
    const Xs = X;
    seg(xs, xs + model.P.L1, (t0, t1, c) => el("line", { x1: Xs + W1 * t0, y1: y, x2: Xs + W1 * t1, y2: y, stroke: c, "stroke-width": 14, "stroke-linecap": "butt" }, svg));
    X += W1;
    const Xp = X, r = W2 / 2;
    for (const sg of [1, -1]) seg(xs + model.P.L1, xs + L, (t0, t1, c) => {
      const ang = (t) => Math.PI * (1 - t), px = (t) => Xp + r + r * Math.cos(ang(t)), py = (t) => y - sg * 0.8 * r * Math.sin(ang(t));
      el("line", { x1: px(t0), y1: py(t0), x2: px(t1), y2: py(t1), stroke: c, "stroke-width": 14, "stroke-linecap": "round" }, svg);
    });
    X += W2;
  }
  for (let k = 0; k <= 2 * periods; k++) { /* vertices */ }
  let XX = 30; for (let k = 0; k < periods; k++) { XX += W1; el("circle", { cx: XX, cy: y, r: 7, fill: "#222" }, svg); XX += W2; el("circle", { cx: XX, cy: y, r: 7, fill: "#222" }, svg); }
  // colour bar
  for (let i = 0; i < 50; i++) el("rect", { x: 300 + i * 8, y: y + 130, width: 8, height: 16, fill: ucol(i / 49) }, svg);
  text(svg, 290, y + 144, "u = 0", "small", { "text-anchor": "end" }); text(svg, 712, y + 144, "u = 1", "small");
  text(svg, 30, y - 80, "a stationary front on the necklace", "lbl", { fill: "#444" });
  items.push({ name: `u^P at a = ${a} drawn on the necklace (colour = u)`, color: "#1a5aa0", tag: "exact" });
}

// ---------- 07: the reduction, drawn aligned: each parallel edge (length L2/2) stretched to L2 ----------
export function drawReduction({ stage, items }) {
  const svg = svgRoot(stage, 1000, 810);
  const W1 = 130, W2h = 80, y1 = 250, y2 = 560, periods = 3, x0 = 40;
  let X = x0, Y = x0;
  const pItalic = (x, y, val) => { const t = el("text", { x, y, class: "lbl", "text-anchor": "middle" }, svg); const i = el("tspan", { "font-style": "italic" }, t); i.textContent = "p"; const r = el("tspan", {}, t); r.textContent = ` = ${val}`; };
  for (let k = 0; k < periods; k++) {
    // necklace
    el("line", { x1: X, y1, x2: X + W1, y2: y1, stroke: "#222", "stroke-width": 5 }, svg);
    for (const sw of [1, 0]) el("path", { d: `M${X + W1},${y1} A${W2h / 2},${W2h * 0.42} 0 0 ${sw} ${X + W1 + W2h},${y1}`, fill: "none", stroke: "#222", "stroke-width": 5 }, svg);
    // line: single edge as is, the pair stretched to twice its length
    el("rect", { x: Y, y: y2 - 26, width: W1, height: 52, fill: "#fff", stroke: "#222", "stroke-width": 2 }, svg);
    el("rect", { x: Y + W1, y: y2 - 26, width: 2 * W2h, height: 52, fill: "#e8e8e8", stroke: "#222", "stroke-width": 2 }, svg);
    pItalic(Y + W1 / 2, y2 + 9, 1); pItalic(Y + W1 + W2h, y2 + 9, 4);
    // vertices and their images
    for (const [xa, xb] of [[X, Y], [X + W1, Y + W1], [X + W1 + W2h, Y + W1 + 2 * W2h]]) {
      el("line", { x1: xa, y1: y1 + 50, x2: xb, y2: y2 - 40, stroke: "#aaa", "stroke-dasharray": "5 6" }, svg);
    }
    for (const xv of [X + W1, X + W1 + W2h]) el("circle", { cx: xv, cy: y1, r: 7, fill: "#222" }, svg);
    if (k === 0) {
      text(svg, X + W1 / 2, y1 - 18, "L₁", "lbl-i", { "text-anchor": "middle" });
      text(svg, X + W1 + W2h / 2, y1 - 54, "L₂/2 each", "lbl-i", { "text-anchor": "middle" });
      text(svg, Y + W1 / 2, y2 + 66, "L₁", "lbl-i", { "text-anchor": "middle" });
      text(svg, Y + W1 + W2h, y2 + 66, "L₂", "lbl-i", { "text-anchor": "middle" });
    }
    X += W1 + W2h; Y += W1 + 2 * W2h;
  }
  text(svg, x0, 120, "the necklace", "lbl", { fill: "#555" });
  text(svg, x0, y2 + 130, "a line with periodic diffusion", "lbl", { fill: "#555" });
  items.push({ name: "reduction: parallel edges (L₂/2 each) stretched to one interval of length L₂ with p = 4", color: "#222", tag: "schematic" });
}

// ---------- 17 (round 4): W = V1 − V2 + V3 with adjustable crossings, and the two phase-plane insets ----------
// The solved crossings rho_j* (solveWord, validated) are marked; rho_j = rho_j* + d_j moves within ±0.12 L.
// W, each V_{rho_j} and the mismatches W(rho_j) − a are exact for the given rho_j.
// Insets: the straight lines of Psi^rho at rho = rho_1 and rho = rho_3, and the flux gap on u = a (exact).
export function drawBuilder4({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const L = model.L, amin = model.aMinus + 0.002, amax = model.aPlus - 0.002;
  const a = Math.min(amax, Math.max(amin, num(state, "a", model)));
  state.a = a; state._a = a; state._amin = amin; state._amax = amax;
  state._ctl = { a: [amin, amax, 0.001] };
  const slots = String(state.slots || "0,2,4").split(",").map(Number);
  const word = String(state.word || "QPP").toUpperCase().padEnd(3, "P").slice(0, 3);
  const sol = memo(model, `word:${a}:${slots}:${word}`, () => solveWord(model, a, slots, word));
  const act = Math.min(3, Math.max(1, +state.active || 1));
  const d = [1, 2, 3].map((k) => Math.max(-0.12 * L, Math.min(0.12 * L, +state["d" + k] || 0)));
  const r = sol.r.map((x, i) => x + d[i]);
  const x0 = (slots[0] - 1) * L, x1 = (slots[2] + 1.6) * L;
  const G = frame(svg, [x0, x1, -0.1, 1.08], [110, 70, 860, 360], { xticks: [], yticks: [0, +a.toFixed(2), 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, model, x0, x1);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  const X = Array.from({ length: 700 }, (_, i) => x0 + ((x1 - x0) * i) / 699);
  const VC = ["#555", "#555", "#555"], VD = [null, "8 6", "2 5"];
  r.forEach((rj, j) => {
    const V = model.stepProfile(rj);
    line(G, X.map((x) => [x, val(V(x))]), { stroke: VC[j], "stroke-width": 1.8, "stroke-dasharray": VD[j], opacity: 0.8 });
    plate(subText(G.plot, G.fx(rj) + 6, G.fy(val(V(rj + 0.4 * L))) - 6, ["V", [`ρ${"123"[j]}`]], "lbl-i", { fill: VC[j] }));
  });
  const W = (x) => sol.W(r, x);
  const isFront = d.every((v) => Math.abs(v) < 1e-12) && sol.ok;
  line(G, X.map((x) => [x, W(x)]), { stroke: "#111", "stroke-width": 3.5 });
  if (sol.ok) sol.r.forEach((rs, j) => { // marks for rho_j*, only for a successful solve
    el("path", { d: `M${G.fx(rs)},${G.rect[1] + G.rect[3] - 14} l-8,14 l16,0 Z`, fill: "#555" }, G.plot);
    subText(svg, G.fx(rs) + 10, G.rect[1] + G.rect[3] + 16, ["ρ", [`${"123"[j]}`], "*"], "small", { fill: "#555" });
  });
  r.forEach((rj, j) => {
    const wv = W(rj);
    if (Math.abs(wv - a) > 1e-6) { line(G, [[rj + 0.03 * L, a], [rj + 0.03 * L, wv]], { stroke: "#c00", "stroke-width": 6 }); line(G, [[rj, a], [rj + 0.06 * L, a]], { stroke: "#c00", "stroke-width": 1.5 });
      text(G.plot, G.fx(rj + 0.05 * L), G.fy(Math.max(wv, a)) - 10, `${wv - a > 0 ? "+" : "−"}${Math.abs(wv - a).toFixed(3)}`, "small", { fill: "#c00" }); }
    dot(G, [rj, wv], j + 1 === act ? 8 : 6, { fill: j + 1 === act ? "#c00" : "#fff", stroke: "#c00", "stroke-width": 2 });
  });
  slots.forEach((N, i) => {
    const t = text(svg, G.fx(sol.r[i]), 50, `${word[i]}${sub(N)}`, "lbl", { "text-anchor": "middle", style: "cursor:pointer;font-size:30px", fill: word[i] === "P" ? P_COL : Q_COL });
    if (onChange) { t.addEventListener("click", () => onChange({ word: word.slice(0, i) + (word[i] === "P" ? "Q" : "P") + word.slice(i + 1), d1: 0, d2: 0, d3: 0 })); clickTip(t, "click to switch between P and Q", "a letter P or Q to switch it"); }
  });
  if (!sol.ok) text(svg, 990, 505, `${word} not found: W is an unmatched candidate`, "lbl", { "text-anchor": "end", fill: "#777" });
  else if (build(state) < 1) text(svg, 990, 500, isFront ? "W(ρᵢ) = a at every crossing: W is a front" : "red: W(ρᵢ) − a", "lbl", { "text-anchor": "end", fill: isFront ? "#111" : "#c00" });
  // drags: each crossing rho_j by its vertical line through the red dot (near its mark rho_j*), a by the dashed line
  if (onChange) {
    r.forEach((rj, k) => dragHandle(svg, G, { name: "ρ" + "₁₂₃"[k], axis: "x", at: rj, minPx: 200, range: [sol.r[k] - 0.12 * L, sol.r[k] + 0.12 * L],
      set: (x) => { let v = x - sol.r[k]; if (Math.abs(v) < 0.01 * L) v = 0; onChange({ active: k + 1, ["d" + (k + 1)]: v }); } }));
    dragHandle(svg, G, { q: "a", axis: "y", at: a, range: [amin, amax], set: (v) => onChange({ a: v, d1: 0, d2: 0, d3: 0 }) });
  }
  // insets at rho_1 and rho_3 (build 1): the whole phase plane at that interface phase (round 5), with the samples
  // (W, pW') at x = rho_i + kL (exact, linear in the V's; before matching they sample a prescribed-forcing profile,
  // not an orbit of the return map); the flux gap on u = a in black.
  if (build(state) >= 1) {
    const Wz = (x) => r.reduce((acc, rj, j) => { const z = model.stepProfile(rj)(x), sg = j % 2 ? -1 : 1; return [acc[0] + sg * z[0], acc[1] + sg * z[1]]; }, [0, 0]);
    const BOX = [-0.05, 1.05, -1.0, 0.12];
    [[0, "first interface ρ₁"], [2, "last interface ρ₃"]].forEach(([j, title], q) => {
      const s = ((r[j] % L) + L) % L;
      const F = frame(svg, BOX, [110 + q * 450, 545, 400, 200], { xticks: [], yticks: [], xlabel: "u" });
      const drawLines = (Fr, w) => {
        line(Fr, [[a, Fr.box[2]], [a, Fr.box[3]]], { stroke: C.threshold, "stroke-dasharray": "6 5", "stroke-width": 1.5 });
        const full = model.straightParts(s, a, [-2, 2, -3, 3]);
        line(Fr, pts(full.unstableLine), { stroke: C.unstable, "stroke-width": 1.5, "stroke-dasharray": "8 6", opacity: 0.7 });
        line(Fr, pts(full.stableLine), { stroke: C.stable, "stroke-width": 1.5, "stroke-dasharray": "8 6", opacity: 0.7 });
        const sp = model.straightParts(s, a);
        line(Fr, pts(sp.unstable), { stroke: C.unstable, "stroke-width": w });
        line(Fr, pts(sp.stable), { stroke: C.stable, "stroke-width": w });
      };
      drawLines(F, 3);
      const vu = -(1 - a) * model.rPlus(s), vs = -a * model.rMinus(s), bs = model.b(s);
      line(F, [[a, vu], [a, vs]], { stroke: "#000", "stroke-width": 3 });
      dot(F, [bs, -model.rMinus(s) * bs], 4.5, { fill: "#fff", stroke: "#000", "stroke-width": 1.5 });

      // samples of W at this phase (the one at the interface as a ring), then the two line ends on u = a on top,
      // large, so that their order (the sign of the gap) reads from a distance
      for (let k = -5; k <= 5; k++) if (k) dot(F, Wz(r[j] + k * L), 4, { fill: "#111", stroke: "#fff", "stroke-width": 1 });
      dot(F, [a, vu], 6.5, { fill: C.unstable, stroke: "#fff", "stroke-width": 1.5 }); dot(F, [a, vs], 6.5, { fill: C.stable, stroke: "#fff", "stroke-width": 1.5 });
      dot(F, Wz(r[j]), 10, { fill: "none", stroke: "#111", "stroke-width": 2 });
      dot(F, [0, 0], 4, { fill: "#000" }); dot(F, [1, 0], 4, { fill: "#000" });
      subText(F.plot, F.rect[0] + 10, F.rect[1] + F.rect[3] - 10, ["Ψ", ["^s"], ",  s = ρ", [j ? "3" : "1"]], "small", { fill: "#333" });
      const ix = "₁₂₃"[j]; // the inset index, not the sign of the gap
      subText(svg, 110 + q * 450, 535, [j ? "last interface: " : "first interface: ", vu > vs + 1e-12 ? "blue end above, a > b(ρ" : vu < vs - 1e-12 ? "orange end above, a < b(ρ" : "ends coincide, a = b(ρ", [j ? "3" : "1"], ")"], "lbl");
    });
  }
  items.push({ name: `word ${word}, slots ${slots}; rho* = ${sol.r.map((x) => x.toFixed(3)).join(", ")}; offsets ${d.map((v) => v.toFixed(3)).join(", ")}`, color: "#111", tag: "computed" });
}
