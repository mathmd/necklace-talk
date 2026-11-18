// Round 4: one frame for steps 8–12 (and 15). The phase plane on top, the fronts against x below,
// and from step 12 the matching function b(s) beside the phase plane. The threshold a is adjustable
// wherever the step's point depends on it; the phase s moves only the sampled points x = s + kL.
// Mathematics: core.js (McKean, exact or computed) and smooth.js (cubic, computed by the specialist).
import { el, text, svgRoot, frame, line, dot, label, pts, subText, memo, dragHandle, plate, C } from "./stage.js";

const P_COL = "#2b8a3e", Q_COL = "#8e3fae", SYS1 = "#2a9d8f", SYS4 = "#d4a017", SHADE = "#f6ecd0"; // gold: the pairs (p = 4)
const mod = (x, L) => ((x % L) + L) % L;

function saddles(F) {
  dot(F, [0, 0], 7, { fill: "#000" }); dot(F, [1, 0], 7, { fill: "#000" });
  label(F, [0, 0], "(0,0)", 14, -14, "lbl"); label(F, [1, 0], "(1,0)", -14, -14, "lbl", { "text-anchor": "end" });
}
function thresholdLine(F, a, box) {
  line(F, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  label(F, [a, box[3]], "u = a", 6, 26);
}
function shadePairs(F, L, L1, x0, x1, fill = SHADE) {
  for (let k = Math.floor(x0 / L) - 1; k * L < x1; k++)
    el("rect", { x: F.fx(k * L + L1), y: F.rect[1], width: F.fx(L - L1) - F.fx(0), height: F.rect[3], fill }, F.plot);
}

// ---------- the cubic (steps 8–10) ----------
let smooth = null;
const smoothCache = new Map();
import("./smooth.js").then((m) => { smooth = m; }).catch(() => {});
const SBOX = [-0.1, 1.1, -0.45, 0.16];
// The two monotone fronts at this a, each followed continuously as a moves (round 5).
// Each is translated so that its crossing of u = a lies in the window [0.1 L1, 0.1 L1 + L). Over a in [0.46, 0.54] the
// crossings found are, for the first front, in about [0.416, 1.584] (always on the single edge [0, L1)), and for the second
// in about [1.927, 6.073] (on the pair for 0.464 <= a <= 0.536, on a single edge near the ends): neither reaches the window
// edges, so ordering by crossing position in the window follows each front without a jump or a change of translate.
// The first (green) is the front of step 7.
function cubicFronts(state) {
  const a = +state.a, key = `cf3:${state.L1}:${state.L2}:${a}`;
  return memo({ cache: smoothCache }, key, () => {
    const m = smooth.makeSmoothModel({ alpha: +state.alpha, L1: +state.L1, L2: +state.L2, a });
    const s0 = 1, hits = m.intersections(s0, {}), L = m.L, lo = 0.1 * m.L1;
    const found = [];
    for (const h of (hits.points || []).filter((q) => q.primary)) {
      const fr = m.front(h.point, s0, -27, 29, {});
      if (!fr.monotone) continue;
      let xc = NaN;
      for (let i = 1; i < fr.xs.length; i++) if (fr.us[i - 1] >= a && fr.us[i] < a) { const t = (fr.us[i - 1] - a) / (fr.us[i - 1] - fr.us[i]); xc = fr.xs[i - 1] + t * (fr.xs[i] - fr.xs[i - 1]); break; }
      if (!Number.isFinite(xc)) continue;
      const d = Math.floor((xc - lo) / L) * L;
      if (found.some((f) => Math.abs(f.xc - (xc - d)) < 1e-6)) continue;
      found.push({ ...fr, xs: fr.xs.map((x) => x - d), evaluate: (x) => fr.evaluate(x + d), xc: xc - d });
    }
    found.sort((p, q) => p.xc - q.xc);
    return { m, fronts: found.slice(0, 2).map((f, i) => ({ ...f, type: i ? "Q" : "P" })) };
  });
}
const LEVEL = { "stroke-width": 1.3, opacity: 0.55 }; // level sets: thinner and fainter than the front
function cubicLevelSets(F, m) {
  // the level sets of each energy through the two saddles
  for (const [p, col] of [[1, SYS1], [1 / m.alpha, SYS4]])
    for (const h of [m.F(0), m.F(1)])
      line(F, pts(m.levelCurve(p, h, { box: SBOX })), { stroke: col, ...LEVEL });
}
function colouredOrbit(F, m, fr, width, opacity = 1, mono) {
  let cur = null; const segs = [];
  fr.xs.forEach((x, i) => {
    const typ = m.p(x + 1e-12) === 1 ? 1 : 2, pt = [fr.us[i], fr.vs[i]];
    if (!cur || cur.typ !== typ) { if (cur) cur.pts.push(pt); cur = { typ, pts: [pt] }; segs.push(cur); } else cur.pts.push(pt);
  });
  for (const sg of segs) line(F, sg.pts, { stroke: mono || (sg.typ === 1 ? SYS1 : SYS4), "stroke-width": width, opacity });
}
// The phase of a return-map phase plane, stated on the plot (round 5): bottom left in the McKean frames,
// top left in the cubic frame, where those corners are empty.
function phaseLabel(F, parts, top = false) {
  return plate(subText(F.plot, F.rect[0] + 14, top ? F.rect[1] + 32 : F.rect[1] + F.rect[3] - 16, parts, "lbl-i", { fill: "#333" }));
}

export function drawGeoCubic({ stage, state, items, onChange }) {
  if (!smooth) { svgRoot(stage, 1000, 810); import("./smooth.js").then((m) => { smooth = m; onChange && onChange({}); }); return; }
  const svg = svgRoot(stage, 1000, 810);
  const amin = +state.amin || 0.46, amax = +state.amax || 0.54;
  const a = Math.min(amax, Math.max(amin, +state.a)); state.a = a; state._a = a; state._amin = amin; state._amax = amax;
  const mode = state.mode || "hop";
  const { m, fronts } = cubicFronts(state);
  const L = m.L, s = mod(+state.s || 0, L); state._s = s;
  state._ctl = { a: [amin, amax, 0.001], s: [0, L - 1e-6, 0.01] };
  const setA = onChange ? (v) => onChange({ a: Math.min(amax, Math.max(amin, v)) }) : null;
  const setS = onChange ? (v) => onChange({ s: mod(v, L) }) : null;
  const F = frame(svg, SBOX, [110, 20, 860, 440], { xticks: [0, 0.5, 1], yticks: [-0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  const x0 = -5, x1 = 13;
  const G = frame(svg, [x0, x1, -0.05, 1.05], [110, 560, 860, 170], { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, L, m.L1, x0, x1, "#f6ecd0");
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 1.5 });
  text(G.plot, G.fx(x1) - 8, G.fy(a) - 8, "u = a", "lbl-i", { "text-anchor": "end", fill: "#666" });
  line(F, [[a, SBOX[2]], [a, SBOX[3]]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 1.5 });
  plate(text(F.plot, F.fx(a) + 6, F.rect[1] + F.rect[3] - 10, "u = a", "lbl-i", { fill: "#666" }));
  const hopFront = fronts.find((f) => f.type === "P");
  if (mode === "hop") {
    cubicLevelSets(F, m);
    // the level curve each arc of the front lies on (its energy changes at every vertex); same style as the others
    const fr0 = hopFront, seen = new Set();
    if (fr0) fr0.xs.forEach((x, i) => {
      const p = m.p(x + 1e-12), h = m.H([fr0.us[i], fr0.vs[i]], p), key = `${p}:${h.toFixed(5)}`;
      if (seen.has(key) || Math.hypot(fr0.us[i] - 0.5, fr0.vs[i]) > 0.75) return; seen.add(key);
      try { line(F, pts(m.levelCurve(p, h, { box: SBOX })), { stroke: p === 1 ? SYS1 : SYS4, ...LEVEL }); } catch (e) { /* outside */ }
    });
  }
  if (mode === "manifolds") {
    const wu = memo({ cache: smoothCache }, `wu4:${a}:${s}`, () => m.unstableManifold(s, { iterates: 6, box: [-0.1, 1.1, -0.6, 0.3] }));
    const ws = memo({ cache: smoothCache }, `ws4:${a}:${s}`, () => m.stableManifold(s, { iterates: 6, box: [-0.1, 1.1, -0.6, 0.3] }));
    for (const pc of wu.pieces) line(F, pc.points, { stroke: C.unstable, "stroke-width": 3 });
    for (const pc of ws.pieces) line(F, pc.points, { stroke: C.stable, "stroke-width": 3 });
    text(F.plot, F.fx(0.93), F.fy(-0.36), "unstable manifold of (1,0)", "direct", { fill: C.unstable, "text-anchor": "end" });
    text(F.plot, F.fx(0.06), F.fy(-0.42), "stable manifold of (0,0)", "direct", { fill: C.stable });
    items.push({ name: `manifolds of Ψ^s at s = ${s.toFixed(3)}`, color: C.unstable, tag: "computed" });
  }
  const shown = mode === "hop" ? (hopFront ? [hopFront] : []) : fronts;
  shown.forEach((fr) => {
    const col = fr.type === "P" ? P_COL : Q_COL;
    if (mode === "hop") colouredOrbit(F, m, fr, 5);
    else colouredOrbit(F, m, fr, 2, mode === "manifolds" ? 0.15 : 0.35, col);
    line(G, fr.xs.map((x, i) => (x >= x0 && x <= x1 ? [x, fr.us[i]] : null)), { stroke: mode === "hop" ? "#111" : col, "stroke-width": 3 });
    if (mode !== "hop") {
      for (let j = Math.ceil((x0 - s) / L); s + j * L <= x1; j++) {
        const x = s + j * L, z = fr.evaluate(x);
        dot(F, z, 7, { fill: col, stroke: "#fff", "stroke-width": 1.5 });
        dot(G, [x, z[0]], 5, { fill: col });
      }
    }
  });
  const green = fronts.find((f) => f.type === "P");
  if (mode === "orbits" && green) {
    const j0 = Math.round((1 - s) / L), za = green.evaluate(s + j0 * L), zb = green.evaluate(s + (j0 + 1) * L);
    const X1 = F.fx(za[0]), Y1 = F.fy(za[1]), X2 = F.fx(zb[0]), Y2 = F.fy(zb[1]), d = Math.hypot(X2 - X1, Y2 - Y1) || 1;
    const ux = (X2 - X1) / d, uy = (Y2 - Y1) / d, mx = (X1 + X2) / 2 - 40 * uy, my = (Y1 + Y2) / 2 + 40 * ux;
    el("path", { d: `M${X1 + 10 * ux},${Y1 + 10 * uy} Q${mx},${my} ${X2 - 12 * ux},${Y2 - 12 * uy}`, fill: "none", stroke: "#111", "stroke-width": 2.5 }, F.plot);
    { const ex = X2 - 12 * ux, ey = Y2 - 12 * uy, tx = ex - mx, ty = ey - my, tn = Math.hypot(tx, ty) || 1, dx = tx / tn, dy = ty / tn;
      el("path", { d: `M${ex + 6 * dx},${ey + 6 * dy} L${ex - 10 * dx - 6 * dy},${ey - 10 * dy + 6 * dx} L${ex - 10 * dx + 6 * dy},${ey - 10 * dy - 6 * dx} Z`, fill: "#111" }, F.plot); }
    subText(F.plot, mx - 30 * uy, my + 30 * ux, ["Ψ", ["^s"]], "direct");
  }
  if (mode !== "hop") {
    for (let j = Math.ceil((x0 - s) / L); s + j * L <= x1; j++) {
      line(G, [[s + j * L, -0.05], [s + j * L, 1.05]], { stroke: "#c00", "stroke-width": 1.2, opacity: 0.6 });
      dragHandle(svg, G, { q: "s", axis: "x", at: s + j * L, set: setS && ((v) => setS(v - j * L)) });
    }
    text(svg, G.rect[0], G.rect[1] - 10, "red: x = s + kL", "small", { fill: "#c00" });
    phaseLabel(F, ["Ψ", ["^s"], `,  s = ${s.toFixed(2)}`], true);
  }
  if (!fronts.length) text(G.plot, G.fx((x0 + x1) / 2), G.fy(0.75), "no front found at this a", "lbl", { "text-anchor": "middle", fill: "#777" });
  saddles(F);
  dragHandle(svg, F, { q: "a", axis: "x", at: a, set: setA, range: [amin, amax] });
  dragHandle(svg, G, { q: "a", axis: "y", at: a, set: setA, range: [amin, amax] });
  text(svg, 990, 800, mode === "hop" ? `a = ${a.toFixed(3)}` : `a = ${a.toFixed(3)},  s = ${s.toFixed(2)}`, "lbl", { "text-anchor": "end", fill: "#555" });
  items.push({ name: `cubic, a = ${a.toFixed(3)} (adjustable ${amin}–${amax}), α = ${state.alpha}, L₁ = ${state.L1}, L₂ = ${state.L2}; fronts by type ${fronts.map((f) => `${f.type} crossing at x = ${f.xc.toFixed(3)}`).join(", ")}`, color: "#111", tag: "computed" });
}

// ---------- McKean (steps 11, 12, 15) ----------
const MBOX = [-0.05, 1.05, -0.95, 0.12];
export function drawGeoMcKean({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const mode = state.mode || "straight", L = model.L, L1 = model.P.L1;
  const inner = mode !== "straight";
  const amin = inner ? model.aMinus : +state.amin || 0.3, amax = inner ? model.aPlus : +state.amax || 0.7;
  let a = Math.min(amax, Math.max(amin, +state.a || 0.5)); state.a = a; state._a = a; state._amin = amin; state._amax = amax;
  let s = mod(Number.isFinite(+state.s) ? +state.s : 0.1, L);
  const { rhoP, rhoQ } = inner ? model.roots(a) : { rhoP: NaN, rhoQ: NaN };
  for (const r of [rhoP, rhoQ]) if (Number.isFinite(r) && Math.abs(s - r) < 0.006) s = r; // snap onto a root
  state.s = s; state._s = s; state._rhoP = rhoP; state._rhoQ = rhoQ; // keys p, q send s to a root
  state._ctl = { a: [amin, amax, 0.001], s: [0, L - 1e-6, 0.001] };
  const setA = onChange ? (v) => onChange({ a: Math.min(amax, Math.max(amin, v)) }) : null;
  // from step 11 on: phase plane, b panel and fronts together (the first build was dropped in round 5)
  const PP = inner ? [110, 20, 540, 450] : [110, 20, 860, 700];
  const F = frame(svg, MBOX, PP, { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  thresholdLine(F, a, MBOX);
  // straight parts of the two manifolds, up to u = a (exact); from step 12 their continuations (dashed)
  const sp = model.straightParts(s, a);
  if (inner) {
    const full = model.straightParts(s, a, [MBOX[0] - 1, MBOX[1] + 1, MBOX[2] - 1, MBOX[3] + 1]);
    line(F, pts(full.unstableLine), { stroke: C.unstable, "stroke-width": 2, "stroke-dasharray": "9 8", opacity: 0.7 });
    line(F, pts(full.stableLine), { stroke: C.stable, "stroke-width": 2, "stroke-dasharray": "9 8", opacity: 0.7 });
  }
  line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 5 });
  line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 5 });
  const vu = -(1 - a) * model.rPlus(s), vs = -a * model.rMinus(s);
  dot(F, [a, vu], 7, { fill: C.unstable }); dot(F, [a, vs], 7, { fill: C.stable });
  if (!inner) {
    text(F.plot, F.fx(0.86), F.fy(-0.12), "from (1,0)", "direct", { fill: C.unstable, "text-anchor": "end" });
    text(F.plot, F.fx(0.1), F.fy(-0.42), "into (0,0)", "direct", { fill: C.stable });
  }
  saddles(F);
  phaseLabel(F, ["Ψ", ["^s"], `,  s = ${s.toFixed(3)}`]);
  dragHandle(svg, F, { q: "a", axis: "x", at: a, set: setA, range: [amin, amax] });
  if (inner) {
    // b(s): where the continuations meet; the flux gap on u = a
    const bs = model.b(s), vb = -model.rMinus(s) * bs;
    dot(F, [bs, vb], 6, { fill: "#fff", stroke: "#000", "stroke-width": 2 });
    line(F, [[bs, vb], [bs, MBOX[2]]], { stroke: "#000", "stroke-dasharray": "3 5" });
    label(F, [bs, MBOX[2]], "b(s)", 6, -10);
    if (Math.abs(vu - vs) > 1e-9) {
      line(F, [[a, vu], [a, vs]], { stroke: "#000", "stroke-width": 3 });
      text(F.plot, F.fx(a) + (bs > a ? -10 : 10), F.fy((vu + vs) / 2) + 6, "flux gap", "small", { "text-anchor": bs > a ? "end" : "start" });
    }
    frontsPanels(svg, F, model, a, s, monotoneFronts(model, a), onChange, amin, amax, { orbits: true });
    items.push({ name: `b(s), roots ρ_P = ${rhoP.toFixed(4)}, ρ_Q = ${rhoQ.toFixed(4)}; a = ${a.toFixed(4)} in [a₋, a₊]; s = ${s.toFixed(4)}`, color: "#000", tag: "exact" });
    items.push({ name: "u^P, u^Q (exact); samples at x = s + kL; flux gap (r₊ + r₋)(a − b(s))", color: P_COL, tag: "exact" });
  } else {
    text(svg, 990, 800, `a = ${a.toFixed(3)}`, "lbl", { "text-anchor": "end", fill: "#555" });
    items.push({ name: `straight parts up to u = a at s = ${s}; a = ${a.toFixed(3)}`, color: C.unstable, tag: "exact" });
  }
}


function monotoneFronts(model, a) {
  const { rhoP, rhoQ } = model.roots(a);
  return rhoP === rhoQ ? [[rhoP, P_COL, "P"]] : [[rhoP, P_COL, "P"], [rhoQ, Q_COL, "Q"]];
}
// The fronts u^P, u^Q against x (with the samples x = s + kL) and the b(s) panel, shared by steps 12 and 15.
// Every drawn line that carries a quantity can be dragged: u = a (front plot, b panel), the red lines x = s + kL,
// the red line s in the b panel.
function frontsPanels(svg, F, model, a, s, fronts, onChange, amin, amax, opts = {}) {
  const L = model.L, L1 = model.P.L1;
  const setA = onChange ? (v) => onChange({ a: Math.min(amax, Math.max(amin, v)) }) : null;
  // the two monotone fronts: faint orbits, samples at phase s, and their profiles
  const x0 = -1.5 * L, x1 = 2.5 * L;
  if (!opts.noFront) {
  const G = frame(svg, [x0, x1, -0.05, 1.05], [110, 575, 860, 165], { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  shadePairs(G, L, L1, x0, x1);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 1.5 });
  const X = Array.from({ length: 500 }, (_, i) => x0 + ((x1 - x0) * i) / 499);
  text(G.plot, G.fx(x0) + 8, G.fy(a) - 8, "u = a", "lbl-i", { fill: "#666" });
  for (const [rho, col, nm] of fronts) {
    const V = model.stepProfile(rho); // at b(rho) = a this is the monotone front crossing at rho (exact)
    const orbit = memo(model, `orb4:${a}:${rho}`, () => Array.from({ length: 900 }, (_, i) => V(rho - 6 * L + (12 * L * i) / 899)));
    if (opts.orbits) line(F, orbit, { stroke: col, "stroke-width": 2, opacity: 0.35 });
    line(G, X.map((x) => [x, V(x)[0]]), { stroke: col, "stroke-width": 3 });
    dot(G, [rho, a], 6, { fill: col, stroke: "#000", "stroke-width": 1 });
    if (opts.orbits) for (let j = -8; j <= 8; j++) dot(F, V(s + j * L), 7, { fill: col, stroke: "#fff", "stroke-width": 1.5 });
    for (let j = Math.ceil((x0 - s) / L); s + j * L <= x1; j++) dot(G, [s + j * L, V(s + j * L)[0]], 5, { fill: col });
  }
  for (let j = Math.ceil((x0 - s) / L); s + j * L <= x1; j++) {
    line(G, [[s + j * L, -0.05], [s + j * L, 1.05]], { stroke: "#c00", "stroke-width": 1.2, opacity: 0.6 });
    dragHandle(svg, G, { q: "s", axis: "x", at: s + j * L, set: onChange && ((v) => onChange({ s: mod(v - j * L, L) })) });
  }
  subText(svg, G.rect[0] + 8, G.rect[1] - 10, ["u", ["^P"]], "direct", { fill: P_COL });
  subText(svg, G.rect[0] + 50, G.rect[1] - 10, ["u", ["^Q"]], "direct", { fill: Q_COL });
  text(svg, G.rect[0] + 100, G.rect[1] - 10, "red: x = s + kL", "small", { fill: "#c00" });
  dragHandle(svg, G, { q: "a", axis: "y", at: a, set: setA, range: [amin, amax] });
  } else for (const [rho, col] of fronts) {
    const V = model.stepProfile(rho);
    if (opts.orbits) for (let j = -8; j <= 8; j++) dot(F, V(s + j * L), 7, { fill: col, stroke: "#fff", "stroke-width": 1.5 });
  }
  // b panel: s horizontal, a vertical, roots and a_± marked
  const lo = model.aMinus - 0.015, hi = model.aPlus + 0.015;
  const B = frame(svg, [0, L, lo, hi], [720, 40, 260, 400], { xticks: [0, L1, +L.toFixed(2)], yticks: [], xlabel: "s", ylabel: "" });
  el("rect", { x: B.fx(L1), y: B.rect[1], width: B.fx(L) - B.fx(L1), height: B.rect[3], fill: SHADE }, B.plot);
  line(B, Array.from({ length: 201 }, (_, i) => [(i / 200) * L, model.b((i / 200) * L)]), { stroke: "#000", "stroke-width": 3 });
  for (const [v, nm] of [[model.aPlus, "+"], [model.aMinus, "−"]]) {
    line(B, [[0, v], [L, v]], { stroke: "#bbb", "stroke-width": 1 });
    subText(svg, B.rect[0] - 30, B.fy(v) + 7, ["a", [nm]], "lbl-i");
  }
  line(B, [[0, a], [L, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 2 });
  text(svg, B.rect[0] + B.rect[2] + 6, B.fy(a) + 7, "a", "lbl-i");
  for (const [rho, col, nm] of fronts) {
    if (opts.slopes) { const h = 0.05, sl = (model.b(rho + h) - model.b(rho - h)) / (2 * h); line(B, [[rho - 0.12, a - 0.12 * sl], [rho + 0.12, a + 0.12 * sl]], { stroke: col, "stroke-width": 5, opacity: 0.6 });  }
    dot(B, [rho, a], 7, { fill: col }); subText(B.plot, B.fx(rho) + (nm === "P" ? -10 : 10), B.fy(a) + 30, ["ρ", [nm]], "lbl-i", { fill: col, "text-anchor": nm === "P" ? "end" : "start" }); }
  line(B, [[s, lo], [s, hi]], { stroke: "#c00", "stroke-width": 2 });
  dot(B, [s, model.b(s)], 6, { fill: "#fff", stroke: "#000", "stroke-width": 2 });
  text(svg, B.rect[0] + B.rect[2] / 2, B.rect[1] - 10, "b(s)", "lbl-i", { "text-anchor": "middle" });
  // the a line is created last, so where it crosses the s line the pointer grabs a
  dragHandle(svg, B, { q: "s", axis: "x", at: s, set: onChange && ((v) => onChange({ s: Math.min(L - 1e-6, Math.max(0, v)) })) });
  dragHandle(svg, B, { q: "a", axis: "y", at: a, set: setA, range: [amin, amax] });
}

// ---------- step 15: the manifolds beyond their straight parts; orientation along each orbit ----------
// W^u(1,0): forward images Psi^j of a fundamental domain of the straight unstable segment;
// W^s(0,0): backward images of a fundamental domain of the straight stable segment (core.imageCurve, computed).
// At each sample of u^P and u^Q, the tangents of W^u and W^s: on a straight segment the line direction (exact);
// elsewhere carried along the orbit by finite differences of Psi^k (computed).
export function drawGeoOrientation({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const L = model.L, lam = model.lambda;
  let a = Math.min(model.aPlus - 0.004, Math.max(model.aMinus + 0.004, +state.a || 0.5));
  state.a = a; state._a = a; state._amin = model.aMinus + 0.004; state._amax = model.aPlus - 0.004;
  const s = mod(Number.isFinite(+state.s) ? +state.s : 0.1, L); state._s = s;
  const J = +state.j || 2;
  state._ctl = { a: [state._amin, state._amax, 0.001], s: [0, L - 1e-6, 0.001], j: [1, 6, 1] };
  const box = (state.box ? String(state.box).split(",").map(Number) : MBOX);
  const F = frame(svg, box, [110, 20, 540, 450], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "v = p u′" });
  thresholdLine(F, a, box);
  const rp = model.rPlus(s), rm = model.rMinus(s);
  const useed = (c) => [1 - c, -rp * c], sseed = (c) => [c, -rm * c];
  const wu = [], ws = [];
  for (let j = 1; j <= J; j++) {
    wu.push(memo(model, `wuJ:${a}:${s}:${j}`, () => model.imageCurve(useed, [(1 - a) / lam, 1 - a], s, a, j, { maxChord: 0.006 })));
    ws.push(memo(model, `wsJ:${a}:${s}:${j}`, () => model.imageCurve(sseed, [a / lam, a], s, a, -j, { maxChord: 0.006 })));
  }
  for (const c of wu) line(F, pts(c), { stroke: C.unstable, "stroke-width": 2.2 });
  for (const c of ws) line(F, pts(c), { stroke: C.stable, "stroke-width": 2.2 });
  const sp = model.straightParts(s, a);
  line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 4 });
  line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 4 });
  saddles(F);
  phaseLabel(F, ["Ψ", ["^s"], `,  s = ${s.toFixed(3)}`]);
  dragHandle(svg, F, { q: "a", axis: "x", at: a, set: onChange && ((v) => onChange({ a: v })), range: [state._amin, state._amax] });
  // orientation glyphs
  const { rhoP, rhoQ } = model.roots(a);
  state._rhoP = rhoP; state._rhoQ = rhoQ;
  const tu0 = [-1, -rp], ts0 = [-1, rm]; // away from (1,0) along W^u; towards (0,0) along W^s
  const norm = (t) => { const n = Math.hypot(t[0], t[1]); return [t[0] / n, t[1] / n]; };
  const carry = (z, t, k) => { // D Psi^k z . t by finite differences
    const e = 1e-7, f = (w) => model.flow(w, s, s + k * L, a);
    const A = f(z), B = f([z[0] + e * t[0], z[1] + e * t[1]]);
    return norm([(B[0] - A[0]) / e, (B[1] - A[1]) / e]);
  };
  const px = (t) => norm([t[0] * F.rect[2] / (box[1] - box[0]), -t[1] * F.rect[3] / (box[3] - box[2])]);
  const arrow = (z, t, col) => {
    const d = px(t), X = F.fx(z[0]), Y = F.fy(z[1]), len = 34;
    el("line", { x1: X, y1: Y, x2: X + len * d[0], y2: Y + len * d[1], stroke: col, "stroke-width": 4 }, F.plot);
    el("circle", { cx: X + len * d[0], cy: Y + len * d[1], r: 4.5, fill: col }, F.plot);
  };
  const signs = { P: new Set(), Q: new Set() };
  for (const [rho, col, nm] of [[rhoP, P_COL, "P"], [rhoQ, Q_COL, "Q"]]) {
    const V = model.stepProfile(rho);
    const ks = [];
    for (let j = -6; j <= 6; j++) { const x = s + j * L; if (Math.abs(x - rho) > 1e-9) ks.push(x); }
    const before = ks.filter((x) => x < rho), after = ks.filter((x) => x > rho);
    const lastU = before.at(-1), firstS = after[0];
    for (const x of ks) {
      const z = V(x);
      if (z[0] < box[0] || z[0] > box[1] || z[1] < box[2] || z[1] > box[3]) continue;
      let tu, ts;
      if (x < rho) { tu = norm(tu0); ts = carry(V(firstS), ts0, -Math.round((firstS - x) / L)); }
      else { ts = norm(ts0); tu = carry(V(lastU), tu0, Math.round((x - lastU) / L)); }
      // skip points too close to the saddles to read
      if (Math.hypot(z[0] - 1, z[1]) < 0.12 || Math.hypot(z[0], z[1]) < 0.12) continue;
      const pu = px(tu), ps = px(ts);
      signs[nm].add(Math.sign(pu[0] * ps[1] - pu[1] * ps[0]));
      // arc from the unstable tangent to the stable tangent, the shorter way, with an arrowhead: its sense is the orientation
      const X = F.fx(z[0]), Y = F.fy(z[1]), r = 26;
      const t1 = Math.atan2(pu[1], pu[0]); let d = Math.atan2(ps[1], ps[0]) - t1;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const P = (t) => [X + r * Math.cos(t), Y + r * Math.sin(t)], [ax, ay] = P(t1), [bx, by] = P(t1 + d);
      el("line", { x1: X, y1: Y, x2: X + 40 * pu[0], y2: Y + 40 * pu[1], stroke: C.unstable, "stroke-width": 1.6, opacity: 0.6 }, F.plot);
      el("line", { x1: X, y1: Y, x2: X + 40 * ps[0], y2: Y + 40 * ps[1], stroke: C.stable, "stroke-width": 1.6, opacity: 0.6 }, F.plot);
      el("path", { d: `M${ax},${ay} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${bx},${by}`, fill: "none", stroke: col, "stroke-width": 3 }, F.plot);
      const ta = t1 + d, tx = -Math.sin(ta) * Math.sign(d), ty = Math.cos(ta) * Math.sign(d);
      el("path", { d: `M${bx + 9 * tx},${by + 9 * ty} L${bx - 6 * Math.cos(ta) - 2 * tx},${by - 6 * Math.sin(ta) - 2 * ty} L${bx + 6 * Math.cos(ta) - 2 * tx},${by + 6 * Math.sin(ta) - 2 * ty} Z`, fill: col }, F.plot);
      dot(F, z, 6, { fill: col, stroke: "#fff", "stroke-width": 1.5 });
    }
  }
  const zoom = (+state.build || 0) >= 1;
  frontsPanels(svg, F, model, a, s, monotoneFronts(model, a), onChange, state._amin, state._amax, { slopes: true, noFront: zoom });
  // build 1: the local branches through the crossing state, at s = rho_P and at s = rho_Q (lem:local_branch_ordering)
  if (zoom) [[rhoP, P_COL, "P"], [rhoQ, Q_COL, "Q"]].forEach(([s0, col, nm], q) => {
    const arcs = memo(model, `arcsZ:${a}:${s0}`, () => model.localArcs(s0, a, 0.06));
    const vstar = -(1 - a) * model.rPlus(s0), hw = 0.045;
    const near = (c) => pts(c).filter((z) => z && Math.abs(z[0] - a) <= hw);
    const vs = [...near(arcs.unstable), ...near(arcs.stable)].map((z) => z[1]);
    const v0 = Math.min(vstar, ...vs), v1 = Math.max(vstar, ...vs), pad = 0.12 * (v1 - v0 + 1e-3);
    const box = [a - hw, a + hw, v0 - pad, v1 + pad];
    const Z = frame(svg, box, [110 + q * 450, 572, 400, 170], { xticks: [], yticks: [], xlabel: "u" });
    line(Z, [[a, box[2]], [a, box[3]]], { stroke: C.threshold, "stroke-dasharray": "6 5", "stroke-width": 1.5 });
    line(Z, near(arcs.unstable), { stroke: C.unstable, "stroke-width": 3.5 });
    line(Z, near(arcs.stable), { stroke: C.stable, "stroke-width": 3.5 });
    dot(Z, [a, vstar], 7, { fill: col, stroke: "#fff", "stroke-width": 1.5 });
    phaseLabel(Z, ["Ψ", ["^s"], ",  s = ρ", [nm]]);
    subText(svg, 110 + q * 450, 562, nm === "P" ? ["at ρ", ["P"], ": orange crosses blue downward"] : ["at ρ", ["Q"], ": orange crosses blue upward"], "small", { fill: col });
  });
  items.push({ name: `W^u forward images j ≤ ${J}, W^s backward images (computed); a = ${a.toFixed(4)}, s = ${s.toFixed(3)}; screen orientation signs P: ${[...signs.P]}, Q: ${[...signs.Q]}`, color: C.unstable, tag: "computed" });
}

// ---------- step 14: the comparison constructions behind the stability results (round 5) ----------
// Whole phase planes, each at its stated phase.
// Builds 0–1, u^P: at rho_- < rho_P and rho_+ > rho_P (both adjustable on the decreasing branch 0 < rho < L1), the
// prescribed-interface profile V_rho (exact): its continuous state curve, its samples x = rho + kL on the two supporting
// lines, and their dashed continuations meeting at u = b(rho), the state at x = rho. Build 1 shifts it by −(b(rho) − a):
// B_rho (exact), meeting point on u = a, flux unchanged; the original lines stay fixed.
// Build 2, u^Q: joined at x = rho_Q at a ± sigma (sigma adjustable, cap 0.04 checked numerically at a = 0.47):
// the flux jumps J_± = (h^s − h^u)(a ± sigma) between the local branches (core.localArcs, computed).
const DSUB = "10 6", DSUP = "2 5", INK = "#333";
export function drawStability({ stage, state, model, items, onChange }) {
  const svg = svgRoot(stage, 1000, 810);
  const L = model.L, L1 = model.P.L1, a = Math.min(model.aPlus - 0.01, Math.max(model.aMinus + 0.01, +state.a || 0.47));
  const { rhoP, rhoQ } = model.roots(a), B = +state.build || 0, Q = B >= 2;
  const x0 = (Q ? rhoQ : rhoP) - 1.2 * L, x1 = (Q ? rhoQ : rhoP) + 1.2 * L;
  const G = frame(svg, [x0, x1, -0.12, 1.12], [110, 70, 860, 250], { xticks: [], yticks: [0, 1], xlabel: "x", ylabel: "u" });
  text(svg, G.rect[0] - 10, G.fy(a) + 7, "a", "lbl-i", { "text-anchor": "end" });
  shadePairs(G, L, L1, x0, x1);
  line(G, [[x0, a], [x1, a]], { stroke: C.threshold, "stroke-dasharray": "8 6", "stroke-width": 1.5 });
  const X = Array.from({ length: 500 }, (_, i) => x0 + ((x1 - x0) * i) / 499);
  const legend = (q, str, dash) => {
    el("line", { x1: G.rect[0] + 10, y1: G.rect[1] - 52 + 28 * q, x2: G.rect[0] + 50, y2: G.rect[1] - 52 + 28 * q, stroke: INK, "stroke-width": 2.8, "stroke-dasharray": dash }, svg);
    subText(svg, G.rect[0] + 60, G.rect[1] - 45 + 28 * q, str, "small");
  };
  const curve = (P, xa, xb, n = 900) => Array.from({ length: n }, (_, i) => P(xa + ((xb - xa) * i) / (n - 1)));
  const lineStyle = (col, w, dash, op = 1) => ({ stroke: col, "stroke-width": w, "stroke-dasharray": dash, opacity: op });
  if (!Q) {
    const lo = 0.005, hi = L1 - 0.005;
    const rm = Math.min(rhoP - 0.005, Math.max(lo, Number.isFinite(+state.rhom) ? +state.rhom : 0.1));
    const rp = Math.max(rhoP + 0.005, Math.min(hi, Number.isFinite(+state.rhop) ? +state.rhop : 0.39));
    state.rhom = rm; state.rhop = rp; state._rhom = rm; state._rhop = rp;
    state._ctl = { rhom: [lo, rhoP - 0.005, 0.001], rhop: [rhoP + 0.005, hi, 0.001] };
    const uP = model.stepProfile(rhoP);
    line(G, X.map((x) => [x, uP(x)[0]]), { stroke: P_COL, "stroke-width": 3.5 });
    dot(G, [rhoP, a], 6, { fill: P_COL });
    subText(G.plot, G.fx(rhoP) + 6, G.rect[1] + G.rect[3] - 22, ["ρ", ["P"]], "lbl-i", { fill: P_COL });
    [[rm, DSUB, "−"], [rp, DSUP, "+"]].forEach(([rho, dash, sg], q) => {
      const V = model.stepProfile(rho), Bp = model.shiftedProfile(rho, a), g = model.b(rho) - a;
      line(G, X.map((x) => [x, V(x)[0]]), lineStyle(INK, 2.4, dash, B >= 1 ? 0.3 : 1));
      if (B >= 1) line(G, X.map((x) => [x, Bp(x)[0]]), lineStyle(INK, 2.8, dash));
      line(G, [[rho, -0.12], [rho, 1.12]], { stroke: "#555", "stroke-width": 1.2 });
      subText(G.plot, G.fx(rho) + (q ? 6 : -6), G.rect[1] + 24, ["ρ", [sg]], "lbl-i", { "text-anchor": q ? "start" : "end" });
      if (B >= 1) legend(q, ["B", [`ρ${sg}`], q ? ": supersolution above u" : ": subsolution below u", ["^P"]], dash);
      else legend(q, ["V", [`ρ${sg}`], q ? ": interface later than ρ" : ": interface earlier than ρ", ["P"]], dash);
      // the whole phase plane at phase rho
      const F = frame(svg, MBOX, [110 + q * 460, 420, 400, 300], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: q ? "" : "v = p u′" });
      thresholdLine(F, a, MBOX);
      const sp = model.straightParts(rho, a), full = model.straightParts(rho, a, [MBOX[0] - 1, MBOX[1] + 1, MBOX[2] - 1, MBOX[3] + 1]);
      line(F, pts(full.unstableLine), { stroke: C.unstable, "stroke-width": 1.8, "stroke-dasharray": "9 8", opacity: 0.7 });
      line(F, pts(full.stableLine), { stroke: C.stable, "stroke-width": 1.8, "stroke-dasharray": "9 8", opacity: 0.7 });
      line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 4 });
      line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 4 });
      line(F, curve(uP, rhoP - 6 * L, rhoP + 6 * L), { stroke: P_COL, "stroke-width": 2, opacity: 0.4 });
      const drawProfile = (P, op) => {
        line(F, curve(P, rho - 6 * L, rho + 6 * L), lineStyle(INK, 2, dash, op));
        for (let k = -6; k <= 6; k++) if (k) dot(F, P(rho + k * L), 4.5, { fill: INK, opacity: op });
      };
      drawProfile(V, B >= 1 ? 0.3 : 1);
      const bs = model.b(rho), vb = -model.rMinus(rho) * bs;
      dot(F, [bs, vb], 6, { fill: "#fff", stroke: "#000", "stroke-width": 2 });
      plate(subText(F.plot, F.fx(bs) + (q ? 22 : -22), F.fy(vb) + 8, ["b(ρ", [sg], ")"], "lbl-i", { "text-anchor": q ? "start" : "end" }));
      if (B >= 1) {
        drawProfile(Bp, 1);
        dot(F, [a, vb], 6, { fill: INK });
        const ya = F.fy(vb) + 24, xa = F.fx(bs), xb = F.fx(a);
        el("line", { x1: xa, y1: ya, x2: xb + (xb > xa ? -10 : 10), y2: ya, stroke: "#000", "stroke-width": 3 }, F.plot);
        el("path", { d: `M${xb},${ya} l${xb > xa ? -13 : 13},-7 l0,14 Z`, fill: "#000" }, F.plot);
      }
      saddles(F);
      phaseLabel(F, ["Ψ", ["^s"], ",  s = ρ", [sg], ` = ${rho.toFixed(3)}`]);
      items.push({ name: `V and B at ρ${sg} = ${rho.toFixed(4)}: b − a = ${g.toFixed(4)} (exact)`, color: INK, tag: "exact" });
      dragHandle(svg, G, { q: q ? "rhop" : "rhom", name: q ? "ρ₊" : "ρ₋", axis: "x", at: rho, minPx: 200, range: q ? [rhoP + 0.005, hi] : [lo, rhoP - 0.005], set: onChange && ((v) => onChange(q ? { rhop: v } : { rhom: v })) });
    });
  } else {
    const cap = 0.04, sig = Math.min(cap, Math.max(0.005, Number.isFinite(+state.sigma) ? +state.sigma : 0.03));
    state.sigma = sig; state._sigma = sig; state._ctl = { sigma: [0.005, cap, 0.001] };
    const setSig = onChange && ((v) => onChange({ sigma: Math.min(cap, Math.max(0.005, v)) }));
    const uQ = model.stepProfile(rhoQ);
    line(G, X.map((x) => [x, uQ(x)[0]]), { stroke: Q_COL, "stroke-width": 3.5 });
    line(G, [[rhoQ, -0.12], [rhoQ, 1.12]], { stroke: Q_COL, "stroke-width": 1, opacity: 0.6 });
    subText(G.plot, G.fx(rhoQ) + 6, G.rect[1] + G.rect[3] - 22, ["ρ", ["Q"]], "lbl-i", { fill: Q_COL });
    const arcs = memo(model, `arcsQ:${a}:0.08`, () => model.localArcs(rhoQ, a, 0.08));
    const at = (c, u) => { const q = pts(c).filter(Boolean).sort((p, r) => p[0] - r[0]); for (let i = 1; i < q.length; i++) if (q[i][0] >= u && q[i - 1][0] <= u) { const t = (u - q[i - 1][0]) / (q[i][0] - q[i - 1][0]); return q[i - 1][1] + t * (q[i][1] - q[i - 1][1]); } return NaN; };
    const vstar = -(1 - a) * model.rPlus(rhoQ);
    const F = frame(svg, MBOX, [250, 420, 480, 300], { xticks: [0, 0.5, 1], yticks: [-0.6, -0.3, 0], xlabel: "u", ylabel: "v = p u′" });
    thresholdLine(F, a, MBOX);
    const sp = model.straightParts(rhoQ, a);
    line(F, pts(sp.unstable), { stroke: C.unstable, "stroke-width": 4 });
    line(F, pts(sp.stable), { stroke: C.stable, "stroke-width": 4 });
    // the local branches beyond u = a (continuations of the two manifolds through the crossing state)
    const near = (c) => pts(c).map((z) => (z && Math.abs(z[0] - a) <= cap + 0.012 ? z : null));
    line(F, near(arcs.unstable), { stroke: C.unstable, "stroke-width": 2.5 });
    line(F, near(arcs.stable), { stroke: C.stable, "stroke-width": 2.5 });
    line(F, curve(uQ, rhoQ - 6 * L, rhoQ + 6 * L), { stroke: Q_COL, "stroke-width": 2, opacity: 0.4 });
    dot(F, [a, vstar], 6, { fill: Q_COL });
    [[a + sig, DSUB, "+"], [a - sig, DSUP, "−"]].forEach(([beta, dash, sg], q) => {
      const hu = at(arcs.unstable, beta), hs = at(arcs.stable, beta);
      const left = model.trajectory([beta, hu], rhoQ, rhoQ - 6 * L, a, {}), right = model.trajectory([beta, hs], rhoQ, rhoQ + 6 * L, a, {});
      const prof = [...left.xs.map((x, i) => [x, left.us[i]]).reverse(), ...right.xs.map((x, i) => [x, right.us[i]])];
      line(G, prof.filter(([x]) => x >= x0 && x <= x1), lineStyle(INK, 2.8, dash));
      // the joining values a ± sigma at x = rho_Q, draggable
      line(G, [[rhoQ - 0.06 * L, beta], [rhoQ + 0.06 * L, beta]], { stroke: INK, "stroke-width": 2.5 });
      // the two ticks are close: the upper one is grabbed on the left half, the lower one on the right half
      dragHandle(svg, G, { q: "sigma", name: "σ", axis: "y", at: beta, lo: q ? rhoQ : rhoQ - 0.12 * L, hi: q ? rhoQ + 0.12 * L : rhoQ, minPx: 200, range: q ? [a - cap, a - 0.005] : [a + 0.005, a + cap], set: setSig && ((v) => setSig(q ? a - v : v - a)) });
      // state curves of the joined profile, and its flux jump at u = beta
      line(F, left.us.map((u, i) => [u, left.vs[i]]), lineStyle(INK, 2, dash));
      line(F, right.us.map((u, i) => [u, right.vs[i]]), lineStyle(INK, 2, dash));
      line(F, [[beta, hu], [beta, hs]], { stroke: "#000", "stroke-width": 4 });
      el("path", { d: `M${F.fx(beta)},${F.fy(hs)} l-8,${hs > hu ? 16 : -16} l16,0 Z`, fill: "#000" }, F.plot);
      plate(subText(F.plot, F.fx(beta) + (q ? -40 : 40), F.fy((hu + hs) / 2) + 8, ["J", [sg]], "lbl-i", { "text-anchor": q ? "end" : "start" }));
      plate(subText(G.plot, G.fx(rhoQ + 0.14 * L), G.fy(beta) + (q ? 20 : -6), ["a ", sg === "+" ? "+ σ" : "− σ"], "small"));
      dragHandle(svg, F, { q: "sigma", name: "σ", axis: "x", at: beta, minPx: 200, range: q ? [a - cap, a - 0.005] : [a + 0.005, a + cap], set: setSig && ((v) => setSig(q ? a - v : v - a)) });
      legend(q, q ? ["joined at a − σ: supersolution below u", ["^Q"]] : ["joined at a + σ: subsolution above u", ["^Q"]], dash);
      items.push({ name: `joined at a ${sg} σ (σ = ${sig.toFixed(3)}): J = ${(hs - hu).toFixed(4)} (computed)`, color: INK, tag: "computed" });
    });
    saddles(F);
    phaseLabel(F, ["Ψ", ["^s"], ",  s = ρ", ["Q"], ` = ${rhoQ.toFixed(3)}`]);
    text(svg, 990, 800, `σ = ${sig.toFixed(3)}`, "lbl", { "text-anchor": "end", fill: "#555" });
  }
}
