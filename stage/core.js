/* Numerical core for the necklace talk. No DOM, dependencies, or global model.
 * States are [u,v], v=p*u'. Distances/chords use the unscaled (u,v) plane.
 * 'Exact' below means closed form evaluated in binary64, not certified arithmetic.
 * See ../pi/reports/r1-talk-numerics.md for schemas, tolerances and limitations.
 */
const EPS = 2e-14;
const finiteState = z => Array.isArray(z) && z.length === 2 && z.every(Number.isFinite);
const distance = (z, w) => Math.hypot(z[0] - w[0], z[1] - w[1]);
const mod = (x, L) => ((x % L) + L) % L;
function requireState(z) {
  if (!finiteState(z)) throw new RangeError('Expected a finite state [u,v]');
}
function threshold(a) {
  if (!(a > 0 && a < 1)) throw new RangeError('Threshold must lie in (0,1)');
}
function integer(n, name) {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${name} must be an integer`);
}
function matrix(t, k) {
  const r = Math.sqrt(k), ch = Math.cosh(r * t), sh = Math.sinh(r * t);
  return [[ch, r * sh], [sh / r, ch]];
}
function mul(A, B) {
  return A.map(row => B[0].map((_, j) => row[0] * B[0][j] + row[1] * B[1][j]));
}
function affine(z, t, k, branch) {
  const r = Math.sqrt(k), ch = Math.cosh(r * t), sh = Math.sinh(r * t), d = z[0] - branch;
  return [branch + d * ch + r * z[1] * sh, d * sh / r + z[1] * ch];
}
// Earliest strictly positive root of u(t)=a, using a cancellation-safe quadratic.
function hitTime(z, k, a, branch) {
  const r = Math.sqrt(k), d = z[0] - branch;
  const A = d + r * z[1], B = -2 * (a - branch), C = d - r * z[1];
  let best = Infinity;
  const take = q => {
    if (q > 1 + EPS && Number.isFinite(q)) best = Math.min(best, Math.log(q) / r);
  };
  if (A === 0) take(-C / B);
  else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const q = -0.5 * (B + (B >= 0 ? 1 : -1) * Math.sqrt(disc));
      take(q / A);
      if (q !== 0) take(C / q);
    }
  }
  return best;
}
// emit receives each exact affine piece; v is reversed only inside this routine.
function advance(input, T, k, a, emit) {
  const dir = Math.sign(T);
  if (!dir) return input.slice();
  let z = [input[0], dir * input[1]], left = Math.abs(T), elapsed = 0;
  let branch = z[0] > a ? 1 : 0;
  if (Math.abs(z[0] - a) <= EPS) {
    if (Math.abs(z[1]) < 1e-13) throw new RangeError('Degenerate threshold event (u=a, v=0)');
    // Use the same snapped state for branch choice and the crossing quadratic.
    z[0] = a;
    branch = z[1] > 0 ? 1 : 0;
  }
  for (let count = 0; left > 0; count++) {
    if (count >= 1000) throw new RangeError('Threshold event cap exceeded');
    const next = hitTime(z, k, a, branch);
    const hit = next <= left + EPS * Math.max(1, left);
    const dt = hit ? Math.min(next, left) : left;
    const end = affine(z, dt, k, branch);
    if (!finiteState(end)) throw new RangeError('Flow overflow');
    if (hit) {
      end[0] = a;
      if (Math.abs(end[1]) < 1e-13) throw new RangeError('Degenerate threshold event (u=a, v=0)');
    }
    if (emit) emit({t0: dir * elapsed, t1: dir * (elapsed + dt),
      z0: [z[0], dir * z[1]], z1: [end[0], dir * end[1]], k, branch, hit});
    z = end;
    elapsed += dt;
    left -= dt;
    if (hit) branch = 1 - branch;
  }
  return [z[0], dir * z[1]];
}
function bisect(f, lo, hi, xtol = 2e-15) {
  let fl = f(lo), fh = f(hi);
  if (fl === 0) return lo;
  if (fh === 0) return hi;
  if (!Number.isFinite(fl + fh) || fl * fh > 0) throw new RangeError('Root is not bracketed');
  let best = Math.abs(fl) < Math.abs(fh) ? lo : hi, fb = Math.min(Math.abs(fl), Math.abs(fh));
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const fm = f(mid);
    if (!Number.isFinite(fm)) throw new RangeError('Nonfinite root residual');
    if (Math.abs(fm) < fb) { best = mid; fb = Math.abs(fm); }
    if (fm === 0) return mid;
    if (fl * fm <= 0) { hi = mid; fh = fm; } else { lo = mid; fl = fm; }
    if (hi - lo <= xtol) break;
  }
  return best;
}

// Computes the reflection R(u,v)=(1-u,v), exact; dynamical symmetry needs a=1/2 and s=L1/2.
export function mirror(Z) {
  requireState(Z);
  return [1 - Z[0], Z[1]];
}

// Computes model constants exactly and binds exact-flow and computed-mesh methods to P.
export function makeModel({alpha, L1, L2}) {
  if (!(alpha > 0 && alpha < 1 && L1 > 0 && L2 > 0) || ![alpha, L1, L2].every(Number.isFinite))
    throw new RangeError('Require 0<alpha<1 and finite positive L1,L2');
  const L = L1 + L2, A0 = mul(matrix(L2, alpha), matrix(L1, 1));
  const tau = A0[0][0] + A0[1][1], d = A0[1][1] - A0[0][0];
  const D = Math.hypot(d, 2 * Math.sqrt(A0[0][1] * A0[1][0]));
  const lambda = (tau + D) / 2, logLambda = Math.log(lambda);
  const aMinus = 0.5 - d / (2 * D), aPlus = 0.5 + d / (2 * D);
  const rp0 = (d + D) / (2 * A0[0][1]);
  if (![lambda, rp0, aMinus, aPlus].every(Number.isFinite) || !(lambda > 1) || !(aMinus < aPlus))
    throw new RangeError('Model exceeds floating-point resolution or range');
  const phase = x => {
    if (!Number.isFinite(x)) throw new RangeError('Phase must be finite');
    const t = mod(x, L);
    return Math.min(t, L - t) < EPS * L ? 0 : Math.abs(t - L1) < EPS * L ? L1 : t;
  };
  function plusAt(t) {
    const z = affine([1, rp0], Math.min(t, L1), 1, 0);
    return t <= L1 ? z : affine(z, t - L1, alpha, 0);
  }
  function logPlus(x) {
    const n = Math.floor(x / L), t = x - n * L;
    return n * logLambda + Math.log(plusAt(t)[0]);
  }
  const logPlusL1 = logPlus(L1);
  const logMinus = x => logPlus(L1 - x) - logPlusL1;

  // Computes the right-continuous periodic diffusion coefficient p(x), exact.
  function p(x) { return phase(x) < L1 ? 1 : 1 / alpha; }
  // Computes the positive unstable Floquet slope z_+/y_+, exact.
  function rPlus(s) { const z = plusAt(phase(s)); return z[1] / z[0]; }
  // Computes the positive stable slope -z_-/y_- by reflection, exact.
  function rMinus(s) { return rPlus(L1 - s); }
  // Computes the matching function b(s), exact.
  function b(s) { const rp = rPlus(s); return rp / (rp + rMinus(s)); }
  // Computes the two matching phases by bisection; coincident endpoints are returned once in values.
  function roots(theta) {
    if (!Number.isFinite(theta) || theta < aMinus - EPS || theta > aPlus + EPS)
      throw new RangeError('No matching phases outside [aMinus,aPlus]');
    if (Math.abs(theta - aMinus) <= EPS) return {rhoP: L1, rhoQ: L1, values: [L1]};
    if (Math.abs(theta - aPlus) <= EPS) return {rhoP: 0, rhoQ: 0, values: [0]};
    const rhoP = bisect(s => b(s) - theta, 0, L1);
    const rhoQ = bisect(s => b(s) - theta, L1, L);
    return {rhoP, rhoQ, values: [rhoP, rhoQ]};
  }
  function interfaces(x0, x1) {
    if (!Number.isFinite(x0 + x1)) throw new RangeError('Flow endpoints must be finite');
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1), result = [];
    if ((hi - lo) / L > 100000) throw new RangeError('Interface cap exceeded');
    const first = Math.floor(lo / L) - 1, last = Math.ceil(hi / L);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last))
      throw new RangeError('Flow endpoints exceed safe period-index resolution');
    for (let n = first; n <= last; n++)
      for (const x of [n * L, n * L + L1])
        if (x > lo + EPS * L && x < hi - EPS * L) result.push(x);
    return result.sort((a, b) => (x1 > x0 ? a - b : b - a));
  }
  function schedule(x0, x1) {
    const ends = [...interfaces(x0, x1), x1];
    let x = x0;
    return ends.map(end => { const seg = {x, end, k: 1 / p((x + end) / 2)}; x = end; return seg; });
  }
  function execute(Z, path, a, emit) {
    let z = Z.slice();
    for (const seg of path)
      z = advance(z, seg.end - seg.x, seg.k, a, emit && (piece => emit({...piece,
        x0: seg.x + piece.t0, x1: seg.x + piece.t1})));
    return z;
  }
  // Computes forward/backward McKean flow using exact affine pieces and closed-form crossing times.
  function flow(Z, x0, x1, a) {
    requireState(Z); threshold(a);
    return execute(Z, schedule(x0, x1), a);
  }
  // Computes a dense trajectory mesh, retaining exact interface and threshold-event vertices.
  function trajectory(Z, x0, x1, a, opts = {}) {
    requireState(Z); threshold(a);
    const maxStep = opts.maxStep ?? L / 80;
    if (!(maxStep > 0 && Number.isFinite(maxStep))) throw new RangeError('maxStep must be positive');
    const xs = [x0], us = [Z[0]], vs = [Z[1]], events = [], pieces = [];
    const isInterface = x => phase(x) === 0 || phase(x) === L1;
    const event = (x, z, type) => events.push({type, x, point: z.slice(),
      ...(type === 'crossing' ? {dir: Math.sign(z[1]), direction: Math.sign(z[1])} : {})});
    if (Math.abs(Z[0] - a) <= EPS && Z[1] !== 0) event(x0, Z, 'crossing');
    if (isInterface(x0)) event(x0, Z, 'interface');
    execute(Z, schedule(x0, x1), a, piece => {
      pieces.push(piece);
      const n = Math.max(1, Math.ceil(Math.abs(piece.x1 - piece.x0) / maxStep));
      if (xs.length + n > (opts.maxPoints ?? 200000)) throw new RangeError('Trajectory point budget exceeded');
      for (let i = 1; i <= n; i++) {
        const x = i === n ? piece.x1 : piece.x0 + (piece.x1 - piece.x0) * i / n;
        const z = i === n ? piece.z1 : affine(piece.z0, x - piece.x0, piece.k, piece.branch);
        xs.push(x); us.push(z[0]); vs.push(z[1]);
      }
      if (piece.hit) event(piece.x1, piece.z1, 'crossing');
      if (isInterface(piece.x1)) event(piece.x1, piece.z1, 'interface');
    });
    return {xs, us, vs, events, pieces};
  }
  // Computes the period map sampled at s using exact event-resolved flow.
  function Psi(Z, s, a) { return flow(Z, s, s + L, a); }
  // Computes the inverse period map sampled at s using exact backward flow.
  function PsiInv(Z, s, a) { return flow(Z, s, s - L, a); }
  function iterator(s, a, j) {
    integer(j, 'iterate'); threshold(a);
    const path = schedule(s, s + Math.sign(j) * L);
    return z => {
      requireState(z);
      for (let i = 0; i < Math.abs(j); i++) z = execute(z, path, a);
      return z.slice();
    };
  }
  // Computes exact straight segments and supporting lines clipped to [umin,umax,vmin,vmax].
  function straightParts(s, a, box = [-0.25, 1.25, -2, 2]) {
    threshold(a);
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || !(box[0] < box[1] && box[2] < box[3]))
      throw new RangeError('Invalid line clipping box');
    const rp = rPlus(s), rm = rMinus(s);
    const stableAt = u => [u, -rm * u], unstableAt = u => [u, rp * (u - 1)];
    const clip = (at, slope, intercept) => {
      const vEnds = [(box[2] - intercept) / slope, (box[3] - intercept) / slope].sort((x, y) => x - y);
      const lo = Math.max(box[0], vEnds[0]), hi = Math.min(box[1], vEnds[1]);
      return lo <= hi ? [at(lo), at(hi)] : [];
    };
    return {stable: [stableAt(0), stableAt(a)], unstable: [unstableAt(1), unstableAt(a)],
      stableLine: clip(stableAt, -rm, 0), unstableLine: clip(unstableAt, rp, -rp),
      stableAt, unstableAt, stableDirection: [1, -rm], unstableDirection: [1, rp]};
  }
  // Computes the exact parametrization and c-range of segment I in (5.12).
  function segmentI(s, a) {
    threshold(a);
    const rp = rPlus(s), cRange = [(1 - a) / lambda, 1 - a];
    const seedFn = c => [1 - c, -rp * c];
    return {seedFn, point: seedFn, cRange, range: cRange.slice()};
  }
  // Computes an adaptively meshed image curve; unresolved chords are breaks, not drawable segments.
  function imageCurve(seedFn, cRange, s, a, j, opts = {}) {
    const maxChord = opts.maxChord ?? 0.004, maxPoints = opts.maxPoints ?? 25000;
    const initial = opts.initialSamples ?? 256, maxDepth = opts.maxDepth ?? 28;
    const [lo, hi] = cRange;
    if (!(Number.isFinite(lo + hi) && lo <= hi && maxChord > 0 && Number.isFinite(maxChord)))
      throw new RangeError('Invalid curve range or maxChord');
    integer(maxPoints, 'maxPoints'); integer(initial, 'initialSamples'); integer(maxDepth, 'maxDepth');
    if (initial < 1 || maxPoints < 2 || maxDepth < 0) throw new RangeError('Invalid curve budget');
    const apply = iterator(s, a, j), samples = new Map();
    function sample(c) {
      if (samples.has(c)) return samples.get(c);
      let point, error;
      try { point = apply(seedFn(c)); } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        point = [NaN, NaN]; error = e.message;
      }
      const vertex = {c, point, u: point[0], v: point[1], ...(error ? {error} : {})};
      samples.set(c, vertex); return vertex;
    }
    if (lo === hi) {
      const v = sample(lo), valid = finiteState(v.point);
      return {vertices: [v], points: [valid ? v.point.slice() : null],
        segments: valid ? [[v]] : [],
        breaks: valid ? [] : [{c0: lo, c1: hi, chord: NaN, reason: 'invalid-flow'}],
        evaluations: 1, budgetExhausted: false, maxChord, cRange: [lo, hi]};
    }
    const count = Math.min(initial, maxPoints - 1);
    const cs = new Set(Array.from({length: count + 1}, (_, i) => lo + (hi - lo) * i / count));
    for (const c of opts.knots ?? []) if (c >= lo && c <= hi) cs.add(c);
    if (cs.size > maxPoints) throw new RangeError('Too many required curve knots');
    const first = [...cs].sort((a, b) => a - b).map(sample);
    let queue = first.slice(1).map((v, i) => [first[i], v, 0]);
    while (queue.length && samples.size < maxPoints) {
      const next = [];
      for (const [v, w, depth] of queue) {
        if (samples.size >= maxPoints || depth >= maxDepth) break;
        const c = (v.c + w.c) / 2;
        if (c === v.c || c === w.c) continue;
        const mid = sample(c);
        const chord = distance(v.point, w.point);
        const bend = distance(mid.point, [(v.u + w.u) / 2, (v.v + w.v) / 2]);
        if (chord > maxChord || bend > maxChord / 4 || !Number.isFinite(chord + bend)) {
          // Breadth-first refinement avoids consuming the entire budget at the first steep fold.
          next.push([v, mid, depth + 1], [mid, w, depth + 1]);
        }
      }
      queue = next;
    }
    const vertices = [...samples.values()].sort((v, w) => v.c - w.c);
    const breaks = [], segments = [];
    let part = [];
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i], prev = vertices[i - 1];
      if (prev && (!finiteState(prev.point) || !finiteState(v.point) || distance(prev.point, v.point) > maxChord)) {
        breaks.push({c0: prev.c, c1: v.c, chord: distance(prev.point, v.point),
          reason: !finiteState(prev.point) || !finiteState(v.point) ? 'invalid-flow' : 'maxChord'});
        if (part.length) segments.push(part);
        part = [];
      }
      if (finiteState(v.point)) part.push(v);
    }
    if (part.length) segments.push(part);
    const points = segments.flatMap((part, i) => [...(i ? [null] : []), ...part.map(v => v.point.slice())]);
    return {vertices, points, segments, breaks, evaluations: samples.size, maxChord,
      budgetExhausted: samples.size >= maxPoints, cRange: [lo, hi]};
  }
  // Computes V_rho and its flux from the exact bounded-tail formula (3.19).
  function stepProfile(rho) {
    const value = b(rho), lp = logPlus(rho), lm = logMinus(rho);
    return x => {
      if (!Number.isFinite(x)) throw new RangeError('Profile coordinate must be finite');
      if (x <= rho) {
        const q = (1 - value) * Math.exp(logPlus(x) - lp);
        return [1 - q, -q * rPlus(x)];
      }
      const q = value * Math.exp(logMinus(x) - lm);
      return [q, -q * rMinus(x)];
    };
  }
  // Computes B_rho=V_rho-(b(rho)-a), with unchanged flux, exactly.
  function shiftedProfile(rho, a) {
    threshold(a);
    const V = stepProfile(rho), g = b(rho) - a;
    return x => { const z = V(x); return [z[0] - g, z[1]]; };
  }
  function pocketData(a) {
    const {rhoP: s, rhoQ} = roots(a), seed = segmentI(s, a);
    const sigmaQ = Math.abs(a - aPlus) <= EPS ? s + L : rhoQ;
    const cQ = Math.max(seed.cRange[0], Math.min(seed.cRange[1],
      (1 - a) * Math.exp(logPlus(s) - logPlus(sigmaQ))));
    const P0 = [a, -a * rMinus(s)], P1 = P0.map(t => t / lambda);
    const Q0 = Math.abs(a - aPlus) <= EPS ? P0.slice() :
      Math.abs(a - aMinus) <= EPS ? P1.slice() : stepProfile(sigmaQ)(s + L);
    return {s, P0, Q0, P1, cQ, sigmaQ, seed, base: [Q0, P0],
      eRange: [seed.cRange[0], cQ], sigmaRange: [cQ, seed.cRange[1]]};
  }
  // Computes pocket markers and meshes E and Sigma0, split by the exact crossing-phase criterion.
  function pocketObjects(a, opts = {}) {
    const data = pocketData(a), {s, seed} = data;
    return {...data, E: imageCurve(seed.seedFn, data.eRange, s, a, 1, opts),
      Sigma0: imageCurve(seed.seedFn, data.sigmaRange, s, a, 1, opts)};
  }
  // Computes a mesh of Sigma_j=Psi^(j+1)(I restricted to the returning crossing phases).
  function spargel(j, a, opts = {}) {
    integer(j, 'spargel index'); if (j < 0) throw new RangeError('spargel index must be nonnegative');
    const data = pocketData(a);
    return {...imageCurve(data.seed.seedFn, data.sigmaRange, data.s, a, j + 1, opts), s: data.s, j};
  }
  // Computes a mesh of the unstable-zero arc C_r of Proposition 5.8(f).
  function arcC(r, a, opts = {}) {
    integer(r, 'arc index'); if (r < 0) throw new RangeError('arc index must be nonnegative');
    const s = roots(a).rhoP, rp = rPlus(s);
    return imageCurve(c => [c, c * rp], [0, a], s, a, r, opts);
  }
  // Computes sampled-and-bracketed intersections with the open base; not an exhaustive intersection count.
  function baseCrossings(j, a, opts = {}) {
    const data = pocketData(a), curve = spargel(j, a, opts), rm = rMinus(data.s);
    const apply = iterator(data.s, a, j + 1), point = c => apply(data.seed.seedFn(c));
    const f = c => { const z = point(c); return z[1] + rm * z[0]; };
    const found = [], residualTolerance = opts.residualTolerance ?? 1e-9;
    function accept(c) {
      const z = point(c), residual = Math.abs(z[1] + rm * z[0]);
      if (z[0] <= data.Q0[0] + 1e-10 || z[0] >= data.P0[0] - 1e-10 || residual > residualTolerance) return;
      if (found.some(r => Math.abs(c - r.c) < 1e-12)) return;
      found.push({point: z, c, residual, s: data.s, j});
    }
    for (const part of curve.segments) for (let i = 1; i < part.length; i++) {
      const v = part[i - 1], w = part[i], fv = v.v + rm * v.u, fw = w.v + rm * w.u;
      if (fv === 0) accept(v.c);
      if (fw === 0) accept(w.c);
      if (fv * fw < 0) accept(bisect(f, v.c, w.c, opts.rootTolerance ?? 2e-16));
    }
    return found.sort((v, w) => v.c - w.c);
  }
  // Computes local invariant arcs by imaging straight pieces through the pre/post-threshold states.
  function localArcs(s0, a, halfWidth = 0.025) {
    threshold(a);
    if (!(halfWidth > 0 && Number.isFinite(halfWidth))) throw new RangeError('halfWidth must be positive');
    if (Math.abs(b(s0) - a) > 1e-10) throw new RangeError('Local contact requires b(s0)=a');
    const Z = [a, -a * rMinus(s0)], pre = PsiInv(Z, s0, a), post = Psi(Z, s0, a);
    const cu = 1 - pre[0], cs = post[0], rp = rPlus(s0), rm = rMinus(s0);
    const ur = [Math.max(0, cu - halfWidth), Math.min(1 - a, cu + halfWidth)];
    const sr = [Math.max(0, cs - halfWidth), Math.min(a, cs + halfWidth)];
    return {point: Z, pre, post,
      unstable: imageCurve(c => [1 - c, -rp * c], ur, s0, a, 1, {knots: [cu]}),
      stable: imageCurve(c => [c, -rm * c], sr, s0, a, -1, {knots: [cs]})};
  }
  // Computes a front by finite tail search and dense meshing, closing with exact Floquet tails.
  function reconstructFront(Z, s, a, opts = {}) {
    requireState(Z); threshold(a);
    const tol = opts.tailTolerance ?? 2e-8, periods = opts.maxPeriods ?? 32, margin = opts.margin ?? 6 * L;
    if (!(tol > 0 && Number.isFinite(tol) && margin > 0 && Number.isFinite(margin)))
      throw new RangeError('Invalid reconstruction tolerance or margin');
    integer(periods, 'maxPeriods');
    const pieces = [], events = [];
    function seek(dir) {
      let x = s, z = Z.slice();
      for (let i = 0; i <= periods; i++) {
        const expected = dir < 0 ? rPlus(x) * (z[0] - 1) : -rMinus(x) * z[0];
        const residual = Math.abs(z[1] - expected);
        const inside = dir < 0 ? z[0] >= a - EPS && z[0] < 1 : z[0] <= a + EPS && z[0] > 0;
        if (inside && z[1] < 0 && residual <= tol) return {x, point: z, residual, periods: i};
        if (i === periods) break;
        const t = trajectory(z, x, x + dir * L, a, opts);
        pieces.push(...t.pieces); events.push(...t.events);
        x = t.xs.at(-1); z = [t.us.at(-1), t.vs.at(-1)];
        if (z[0] < -1 || z[0] > 2 || Math.abs(z[1]) > 10) break;
      }
      throw new RangeError(`Could not reach the ${dir < 0 ? 'unstable' : 'stable'} straight tail within tolerance`);
    }
    const left = seek(-1), right = seek(1);
    const leftTail = x => {
      const q = (1 - left.point[0]) * Math.exp(logPlus(x) - logPlus(left.x));
      return [1 - q, -q * rPlus(x)];
    };
    const rightTail = x => {
      const q = right.point[0] * Math.exp(logMinus(x) - logMinus(right.x));
      return [q, -q * rMinus(x)];
    };
    const ordered = pieces.map(q => ({...q, lo: Math.min(q.x0, q.x1), hi: Math.max(q.x0, q.x1)}))
      .sort((q, r) => q.lo - r.lo);
    const evalPiece = (q, x) => affine(q.z0, x - q.x0, q.k, q.branch);
    function evaluate(x) {
      if (x <= left.x) return leftTail(x);
      if (x >= right.x) return rightTail(x);
      let lo = 0, hi = ordered.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ordered[m].hi < x) lo = m + 1; else hi = m; }
      return evalPiece(ordered[lo], x);
    }
    if (Math.abs(Z[0] - a) <= EPS) events.push({type: 'crossing', x: s, dir: Math.sign(Z[1])});
    const crossings = events.filter(e => e.type === 'crossing').sort((v, w) => v.x - w.x)
      .filter((e, i, es) => !i || Math.abs(e.x - es[i - 1].x) > 1e-10)
      .map(e => ({x: e.x, dir: e.dir}));
    if (!crossings.length || crossings.length % 2 !== 1 || crossings.some((q, i) => q.dir !== (i % 2 ? 1 : -1)))
      throw new RangeError('Reconstruction did not produce alternating downward/upward/downward crossings');
    const xmin = Math.min(left.x, crossings[0].x) - margin;
    const xmax = Math.max(right.x, crossings.at(-1).x) + margin;
    const knots = [xmin, xmax, s, left.x, right.x, ...interfaces(xmin, xmax), ...crossings.map(q => q.x),
      ...ordered.flatMap(q => [q.lo, q.hi])].sort((x, y) => x - y)
      .filter((x, i, xs) => !i || x - xs[i - 1] > EPS);
    const xs = [knots[0]], h = opts.maxStep ?? L / 80;
    if (!(h > 0 && Number.isFinite(h))) throw new RangeError('maxStep must be positive');
    for (let i = 1; i < knots.length; i++) {
      const n = Math.ceil((knots[i] - knots[i - 1]) / h);
      if (xs.length + n > (opts.maxPoints ?? 200000)) throw new RangeError('Profile point budget exceeded');
      for (let j = 1; j <= n; j++) xs.push(j === n ? knots[i] : knots[i - 1] + (knots[i] - knots[i - 1]) * j / n);
    }
    const zs = xs.map(evaluate), fluxContinuityResiduals = [];
    // Independently continue each one-sided piece to every join, including tail interfaces.
    for (let i = 1; i < knots.length - 1; i++) {
      const x = knots[i], h = Math.min(x - knots[i - 1], knots[i + 1] - x) / 4;
      const lz = evaluate(x - h), rz = evaluate(x + h);
      const l = affine(lz, h, 1 / p(x - h), Number(lz[0] > a))[1];
      const r = affine(rz, -h, 1 / p(x + h), Number(rz[0] > a))[1];
      fluxContinuityResiduals.push({x, left: l, right: r, residual: Math.abs(l - r),
        kind: phase(x) === 0 || phase(x) === L1 ? 'interface' : 'affine-join'});
    }
    for (const [tail, dir] of [[left, -1], [right, 1]]) fluxContinuityResiduals.push({x: tail.x,
      residual: tail.residual, kind: dir < 0 ? 'unstable-tail-join' : 'stable-tail-join'});
    return {xs, us: zs.map(z => z[0]), vs: zs.map(z => z[1]), crossings,
      fluxContinuityResiduals, tailResiduals: {left: left.residual, right: right.residual},
      tails: {left, right}, evaluate, pieces: ordered, tolerance: tol};
  }
  // Computes P/Q phase labels and cut-dependent slots; interface labels are explicitly ambiguous.
  function crossingWord(crossings, a, cut = 0) {
    threshold(a);
    if (!Number.isFinite(cut)) throw new RangeError('Cut must be finite');
    const list = [...crossings].sort((v, w) => v.x - w.x);
    const entries = list.map(({x, dir, direction}) => {
      if (!Number.isFinite(x)) throw new RangeError('Crossing location must be finite');
      dir ??= direction;
      if (dir !== -1 && dir !== 1) throw new RangeError('Crossing direction must be -1 or 1');
      const q = phase(x), nearInterface = Math.min(q, Math.abs(q - L1), L - q) < 1e-8;
      const theta = dir < 0 ? a : 1 - a;
      const target = roots(theta), letter = nearInterface ? null : q < L1 ? 'P' : 'Q';
      const slot = Math.floor((x - cut) / L + 1e-12);
      const isolated = letter === 'P' ? target.rhoP : letter === 'Q' ? target.rhoQ : null;
      const isolatedInSlot = isolated === null ? null : cut + mod(isolated - cut, L);
      return {x, dir, phase: q, slot, letter, theta, isolatedPhase: isolatedInSlot,
        phaseOffset: isolatedInSlot === null ? null : x - slot * L - isolatedInSlot};
    });
    const shift = entries[0]?.slot ?? 0;
    for (const e of entries) e.slot -= shift;
    return {word: entries.map(e => `${e.letter ?? '?'}_${e.slot}`).join(''),
      letters: entries.map(e => e.letter), slots: entries.map(e => e.slot), entries, cut,
      slotShift: shift, ambiguous: entries.some(e => e.letter === null)};
  }
  // Computes the threshold orbit until first return, fixed-box exit, or absolute horizon xMax.
  function escapeOrReturn(s, a, xMax = s + 20 * L) {
    threshold(a);
    if (!(Number.isFinite(xMax) && xMax > s)) throw new RangeError('xMax must exceed s');
    const Z = [a, -(1 - a) * rPlus(s)], box = [-0.25, 1.25, -2, 2];
    const outside = z => z[0] < box[0] || z[0] > box[1] || z[1] < box[2] || z[1] > box[3];
    let x = s, z = Z, outcome = 'xMax', stop = xMax;
    // Avoid amplifying a roundoff-sized growing mode on an exactly matched stable tail.
    if (Math.abs(b(s) - a) <= EPS) {
      const V = stepProfile(s), xs = [s, ...interfaces(s, xMax), xMax];
      const dense = [];
      for (let i = 1; i < xs.length; i++) {
        const n = Math.ceil((xs[i] - xs[i - 1]) / (L / 80));
        for (let j = 0; j < n; j++) dense.push(xs[i - 1] + (xs[i] - xs[i - 1]) * j / n);
      }
      dense.push(xMax);
      const zs = dense.map(V);
      return {xs: dense, us: zs.map(z => z[0]), vs: zs.map(z => z[1]),
        events: [{type: 'crossing', x: s, dir: -1}, ...interfaces(s, xMax).map(x => ({type: 'interface', x}))],
        outcome: 'stable-tail', box};
    }
    while (x < xMax) {
      const t = trajectory(z, x, Math.min(xMax, x + L / 8), a);
      for (const piece of t.pieces) {
        if (outside(piece.z1)) {
          let lo = piece.x0, hi = piece.x1;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if (outside(affine(piece.z0, mid - piece.x0, piece.k, piece.branch))) hi = mid; else lo = mid;
          }
          stop = (lo + hi) / 2; outcome = 'escape'; break;
        }
        if (piece.hit && piece.x1 > s + EPS) { stop = piece.x1; outcome = 'return'; break; }
      }
      if (outcome !== 'xMax') break;
      x = t.xs.at(-1); z = [t.us.at(-1), t.vs.at(-1)];
    }
    return {...trajectory(Z, s, stop, a), outcome, box};
  }
  return {alpha, L1, L2, L, lambda, aMinus, aPlus, A0,
    p, rPlus, rMinus, b, roots, flow, trajectory, Psi, PsiInv, straightParts, segmentI,
    imageCurve, pocketObjects, spargel, arcC, mirror, baseCrossings, reconstructFront,
    crossingWord, stepProfile, shiftedProfile, localArcs, escapeOrReturn};
}
