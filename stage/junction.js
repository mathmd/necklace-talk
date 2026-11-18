// Computed cubic fronts, in physical arclength. No DOM or dependencies.
// The x > 0 profile is used on BOTH outputs for geometry: 'junction'.
const SHOWN = 32;
const CENTER = -24;
const RESIDUAL_TOLERANCE = 1e-7;
const HOLD = 40;
const MAX_WORK = 240_000_000; // node updates, counting both SSPRK2 stages

function checkA(a, endpoints = false) {
  if (!Number.isFinite(a) || (endpoints ? a < 0 || a > 0.5 : a <= 0 || a >= 0.5))
    throw new RangeError(endpoints ? 'Require 0 <= a <= 0.5' : 'Require 0 < a < 0.5');
}

function checkN(n) {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new RangeError('n must be a positive integer');
}

/** Exact cubic criterion, up to roundoff; n is the number of outgoing edges. */
export function criterion(a, n = 2) {
  checkA(a, true);
  checkN(n);
  return (1 - 2 * a + (n * n - 1) * a ** 3 * (a - 2)) / 12;
}

/** Unique root in [0, 1/2], with aStar(1) = 1/2. */
export function aStar(n = 2) {
  checkN(n);
  if (n === 1) return 0.5;
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (criterion(mid, n) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * SSPRK2 method of lines, with the same initial data and vertex control volume
 * as tools/junction-sim.py. Default mesh h=0.2; endpoints are fixed at 1 and 0.
 * X is the computational half-length, not the displayed half-length (always 32).
 * h must divide X and 32. x includes the common vertex at x=0.
 *
 * Omit T to evolve until u(32)>=0.99, or until a predicted blocking solution has
 * a full-grid residual <=1e-7 for 40 time units. Automatic frames use computed
 * snapshots, with linear interpolation if more frames than observations are
 * requested. Use their t values, which need not be equispaced.
 * With explicit T, return exactly equispaced times on [0,T], even if unfinished.
 * stopped means numerically settled blocking, never merely criterion(a)<=0.
 * The returned criterion always concerns the TWO-output junction, even for a line.
 *
 * Near aStar() or 1/2, automatic completion can be very slow. A deterministic
 * work limit throws instead of returning an unfinished movie labelled settled.
 * Explicit T also has a work limit. No analytical front replaces the PDE.
 */
export function simulate({a, geometry = 'junction', h = 0.2, X = 80,
  T, frames: frameCount = 60} = {}) {
  checkA(a);
  if (geometry !== 'line' && geometry !== 'junction')
    throw new RangeError('geometry must be line or junction');
  if (!Number.isFinite(h) || h <= 0 || h > 1 || !Number.isFinite(X) || X < 48)
    throw new RangeError('Require 0 < h <= 1 and computational half-length X >= 48');
  if (!Number.isSafeInteger(frameCount) || frameCount < 2 || frameCount > 600)
    throw new RangeError('frames must be an integer from 2 to 600');
  const j = Math.round(X / h), shown = Math.round(SHOWN / h);
  if (!Number.isSafeInteger(j) || j > 100_000 ||
      Math.abs(j * h - X) > 1e-9 || Math.abs(shown * h - SHOWN) > 1e-9)
    throw new RangeError('h must divide X and 32, with at most 100000 intervals per half-line');
  const automatic = T === undefined;
  if (!automatic && (!Number.isFinite(T) || T <= 0))
    throw new RangeError('T must be finite and positive, or omitted');
  const size = 2 * j + 1, last = size - 1;
  const multiplicity = geometry === 'junction' ? 2 : 1;
  const ih2 = 1 / (h * h), vertexFactor = 2 * ih2 / (1 + multiplicity);
  const maximumStep = 0.8 / (2 * ih2 + 1);
  // Keep the same physical-time allowance when refining for validation.
  const workLimit = MAX_WORK * Math.max(1, (0.2 / h) ** 3);
  if (!automatic && 2 * (size - 2) * Math.ceil(T / maximumStep) > workLimit)
    throw new RangeError('Requested T exceeds the PDE work limit; use a coarser mesh or shorter T');
  const u = new Float64Array(size), stage = new Float64Array(size);
  for (let i = 0; i < size; i++)
    u[i] = 1 / (1 + Math.exp(((i - j) * h - CENTER) / Math.SQRT2));
  u[0] = stage[0] = 1;
  u[last] = stage[last] = 0;
  const x = Array.from({length: 2 * shown + 1}, (_, k) => (k - shown) * h);
  const snapshot = t => ({t, u: Array.from(u.subarray(j - shown, j + shown + 1))});
  const saved = [snapshot(0)];
  let t = 0, steps = 0, quietSince = null;
  let residual = Infinity, stopped = false, exited = false;
  const junctionCriterion = criterion(a);
  const mayBlock = geometry === 'junction' && junctionCriterion < 0;
  const c = Math.SQRT2 * (0.5 - a);
  // At least about frameCount snapshots before a line front leaves the window.
  const cadence = automatic ? Math.min(5, (SHOWN - CENTER) / c / (frameCount - 1))
    : T / (frameCount - 1);

  function advance(duration) {
    const count = Math.max(1, Math.ceil(duration / maximumStep));
    if (2 * (size - 2) * (steps + count) > workLimit)
      throw new RangeError('Automatic completion exceeds the PDE work limit; '
        + 'near-critical/slow fronts need an explicit shorter T or coarser mesh');
    const s = duration / count;
    for (let k = 0; k < count; k++) {
      const oldVertex = u[j];
      for (let i = 1; i < last; i++) {
        const v = u[i];
        stage[i] = v + s * ((u[i - 1] - 2 * v + u[i + 1]) * ih2
          + v * (1 - v) * (v - a));
      }
      stage[j] = oldVertex + s * (vertexFactor
        * (u[j - 1] + multiplicity * u[j + 1] - (1 + multiplicity) * oldVertex)
        + oldVertex * (1 - oldVertex) * (oldVertex - a));
      for (let i = 1; i < last; i++) {
        const v = stage[i];
        u[i] = 0.5 * (u[i] + v + s * ((stage[i - 1] - 2 * v + stage[i + 1]) * ih2
          + v * (1 - v) * (v - a)));
      }
      const v = stage[j];
      u[j] = 0.5 * (oldVertex + v + s * (vertexFactor
        * (stage[j - 1] + multiplicity * stage[j + 1] - (1 + multiplicity) * v)
        + v * (1 - v) * (v - a)));
    }
    steps += count;
  }

  function measure() {
    residual = 0;
    for (let i = 1; i < last; i++) {
      const v = u[i];
      const diffusion = i === j ? vertexFactor
        * (u[i - 1] + multiplicity * u[i + 1] - (1 + multiplicity) * v)
        : (u[i - 1] - 2 * v + u[i + 1]) * ih2;
      residual = Math.max(residual, Math.abs(diffusion + v * (1 - v) * (v - a)));
    }
    // Require an appreciable interaction with the junction before testing rest.
    if (mayBlock && t >= 12 / c && residual <= RESIDUAL_TOLERANCE) {
      if (quietSince === null) quietSince = t;
    } else quietSince = null;
    stopped = quietSince !== null && t - quietSince >= HOLD - 1e-9;
    exited = u[j + shown] >= 0.99;
  }

  for (let k = 1; ; k++) {
    const target = automatic ? k * cadence : T * k / (frameCount - 1);
    // Check at least every five time units, even for sparse explicit output.
    while (t < target) {
      const next = Math.min(target, t + 5);
      advance(next - t);
      t = next;
      measure();
    }
    saved.push(snapshot(t));
    if (automatic ? (exited || stopped) : k === frameCount - 1)
      break;
  }
  // Stop at physical completion, even if fewer than frameCount observations exist.
  // A denser movie then uses linear interpolation of the computed history only.
  const resultFrames = automatic ? Array.from({length: frameCount}, (_, k) => {
    const position = k * (saved.length - 1) / (frameCount - 1);
    if (saved.length >= frameCount) return saved[Math.round(position)];
    const left = saved[Math.floor(position)], right = saved[Math.ceil(position)];
    const weight = position - Math.floor(position);
    return {t: left.t + weight * (right.t - left.t),
      u: left.u.map((v, i) => v + weight * (right.u[i] - v))};
  }) : saved;
  return {a, x, frames: resultFrames, stopped, criterion: junctionCriterion,
    diagnostics: {geometry, h, X, automatic, endTime: t, steps, maximumStep,
      residual, exited, residualTolerance: RESIDUAL_TOLERANCE, holdTime: HOLD}};
}
