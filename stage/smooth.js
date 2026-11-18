// Computed cubic-reaction media. No DOM, dependencies, or stored large meshes.
const norm = z => Math.hypot(...z);
const dist = (z, w) => Math.hypot(z[0] - w[0], z[1] - w[1]);
const cross = (z, w) => z[0] * w[1] - z[1] * w[0];
const sub = (z, w) => [z[0] - w[0], z[1] - w[1]];
const mul = (A, B) => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
const inverse = A => [[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]];
const finite = z => Array.isArray(z) && z.length === 2 && z.every(Number.isFinite);
const RK = [[], [1/5], [3/40, 9/40], [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]];
const ERR = [35/384-5179/57600, 0, 500/1113-7571/16695,
  125/192-393/640, -2187/6784+92097/339200, 11/84-187/2100, -1/40];

function integrate(y0, dt, derivative, options = {}, emit) {
  if (!(options.rtol === undefined || options.rtol > 0 && Number.isFinite(options.rtol)) ||
      !(options.atol === undefined || options.atol > 0 && Number.isFinite(options.atol)) ||
      !(options.maxStep === undefined || options.maxStep > 0 && Number.isFinite(options.maxStep)))
    throw new RangeError('Integration tolerances and maxStep must be finite and positive');
  let y = y0.slice(), time = 0, h = Math.sign(dt) * Math.min(Math.abs(dt), options.maxStep ?? .08);
  const rtol = options.rtol ?? 8e-13, atol = options.atol ?? 2e-14;
  const n = y.length, stages = Array.from({length: 7}, () => Array(n).fill(0)), w = Array(n);
  for (let tries = 0; Math.abs(dt - time) > 2e-15 * Math.max(1, Math.abs(dt)); tries++) {
    if (tries > 20000) throw new RangeError('Smooth flow step budget exhausted');
    if (Math.abs(h) > Math.abs(dt - time)) h = dt - time;
    derivative(y, stages[0]);
    for (let k = 1; k < 7; k++) {
      for (let i = 0; i < n; i++) {
        let q = 0; for (let l = 0; l < k; l++) q += RK[k][l] * stages[l][i];
        w[i] = y[i] + h * q;
      }
      derivative(w, stages[k]);
    }
    let error = 0;
    for (let i = 0; i < n; i++) {
      let e = 0; for (let k = 0; k < 7; k++) e += ERR[k] * stages[k][i];
      error = Math.max(error, Math.abs(h * e) / (atol + rtol * Math.max(Math.abs(y[i]), Math.abs(w[i]))));
    }
    if (!Number.isFinite(error) || Math.max(Math.abs(w[0]), Math.abs(w[1])) > (options.limit ?? 1e6))
      throw new RangeError('Smooth flow escaped the numerical safety box');
    if (error <= 1) {
      time += h; y = w.slice(); if (emit) emit(time, y);
    }
    h *= Math.min(4, Math.max(.15, .9 * Math.pow(Math.max(error, 1e-12), -.2)));
    h = Math.sign(dt) * Math.min(Math.abs(h), options.maxStep ?? .2);
    if (time + h === time) throw new RangeError('Smooth flow step underflow');
  }
  return y;
}

function bisect(f, lo, hi) {
  let fl = f(lo);
  if (Math.abs(fl) < 1e-16) return lo;
  if (Math.abs(f(hi)) < 1e-16) return hi;
  for (let i = 0; i < 55; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (fl * fm <= 0) hi = mid; else { lo = mid; fl = fm; }
  }
  return (lo + hi) / 2;
}

// Constructs a cubic model; potentials and saddle linearizations are exact, nonlinear dynamics computed.
export function makeSmoothModel({alpha, L1, L2, a}) {
  if (![alpha, L1, L2, a].every(Number.isFinite) || alpha <= 0 || L1 <= 0 || L2 <= 0 || a <= 0 || a >= 1)
    throw new RangeError('Require alpha,L1,L2>0 and 0<a<1');
  const L = L1 + L2;
  if (!Number.isFinite(L)) throw new RangeError('Period overflow');
  function phase(x) {
    if (!Number.isFinite(x)) throw new RangeError('Phase must be finite');
    let q = ((x % L) + L) % L;
    if (q < 1e-13 * L || L - q < 1e-13 * L) q = 0;
    if (Math.abs(q - L1) < 1e-13 * L) q = L1;
    return q;
  }
  // Evaluates the cubic reaction, exact up to floating point.
  const f = u => u * (1 - u) * (u - a);
  const fp = u => -3 * u * u + 2 * (1 + a) * u - a;
  // Evaluates the primitive with F(0)=0, exact up to floating point.
  const F = u => u * u * (-u * u / 4 + (1 + a) * u / 3 - a / 2);
  // Evaluates H_p in value/flux coordinates, exact up to floating point.
  const H = (z, p) => z[1] * z[1] / (2 * p) + F(z[0]);
  // Evaluates the right-continuous periodic diffusion coefficient, exact up to phase rounding.
  const p = x => phase(x) < L1 ? 1 : 1 / alpha;
  function schedule(s, t) {
    if (!Number.isFinite(s + t) || !Number.isFinite(t) || Math.abs(t) > 2000 * L)
      throw new RangeError('Invalid or excessive smooth-flow interval');
    const lo = Math.min(s, s + t), hi = Math.max(s, s + t), ends = [];
    const first = Math.floor(lo / L) - 1, last = Math.ceil(hi / L);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw new RangeError('Unsafe period index');
    for (let k = first; k <= last; k++) for (const x of [k * L, k * L + L1])
      if (x > lo + 1e-13 * L && x < hi - 1e-13 * L) ends.push(x);
    ends.sort((x, y) => Math.sign(t) * (x - y)); ends.push(s + t);
    let x = s;
    return ends.map(end => { const type = phase((x + end) / 2) < L1 ? 1 : 2;
      const seg = {x0: x, x1: end, type, p: type === 1 ? 1 : 1 / alpha}; x = end; return seg; });
  }
  function evolve(z, s, t, opts = {}, callback, tangent = false) {
    if (!finite(z)) throw new RangeError('Expected a finite [u,v] state');
    const origin = opts.origin ?? (z[0] > .5 ? 1 : 0);
    const initial = [opts.initialOffset ?? (z[0] - origin), z[1]];
    const physical = w => [w[0] + origin, w[1]];
    let y = tangent ? [...initial, 1, 0, 0, 1] : initial;
    for (const seg of schedule(s, t)) {
      const start = y.slice(), k = 1 / seg.p;
      const rhs = (w, d) => {
        const beta = origin === 1 ? 1 - a : a, gamma = 3 * origin - (1 + a);
        d[0] = k * w[1]; d[1] = w[0] * (beta + w[0] * (gamma + w[0]));
        const b = beta + w[0] * (2 * gamma + 3 * w[0]);
        if (tangent) { d[2] = k * w[4]; d[3] = k * w[5]; d[4] = b * w[2]; d[5] = b * w[3]; }
      };
      const samples = callback ? [{x: seg.x0, point: physical(y)}] : null;
      y = integrate(y, seg.x1 - seg.x0, rhs, opts,
        callback && ((time, w) => samples.push({x: seg.x0 + time, point: physical(w)})));
      if (callback) {
        samples.at(-1).x = seg.x1;
        callback({...seg, start: physical(start), end: physical(y), samples});
      }
    }
    return tangent ? {point: physical(y), J: [[y[2], y[3]], [y[4], y[5]]]} : physical(y);
  }
  // Computes the state after distance t, with adaptive integration ending at every coefficient interface.
  const flow = (z, s, t, opts = {}) => evolve(z, s, t, opts);
  // Computes a dense, interface-resolved trajectory; each piece records x, p and interval type 1 or 2.
  function trajectory(z, s, t, opts = {}) {
    const pieces = []; evolve(z, s, t, {...opts, maxStep: opts.maxStep ?? .06}, q => pieces.push(q));
    const samples = pieces.flatMap((q, i) => i ? q.samples.slice(1) : q.samples);
    return {pieces, samples, xs: samples.map(q => q.x), us: samples.map(q => q.point[0]),
      vs: samples.map(q => q.point[1]), points: samples.map(q => q.point),
      interfaces: pieces.slice(0, -1).map(q => ({x: q.x1, point: q.end.slice()}))};
  }
  // Computes the one-period return map.
  const Psi = (z, s = 0) => flow(z, s, L);
  // Computes the inverse return map.
  const PsiInv = (z, s = 0) => flow(z, s, -L);
  function linear(beta, s) {
    let A = [[1, 0], [0, 1]];
    for (const seg of schedule(s, L)) {
      const w = Math.sqrt(beta / seg.p), t = seg.x1 - seg.x0, c = Math.cosh(w * t), sh = Math.sinh(w * t);
      A = mul([[c, sh / (seg.p * w)], [beta * sh / w, c]], A);
    }
    const tr = A[0][0] + A[1][1], lambda = (tr + Math.sqrt(tr * tr - 4)) / 2;
    if (!Number.isFinite(lambda) || lambda <= 1) throw new RangeError('Saddle matrix overflow');
    const ru = (lambda - A[0][0]) / A[0][1], rs = (1 / lambda - A[0][0]) / A[0][1];
    return {matrix: A, lambda, multipliers: [lambda, 1 / lambda],
      unstable: [1, ru], stable: [1, rs]};
  }
  // Computes both saddle monodromies, multipliers and u-normalized eigenvectors by exact linear flows.
  function saddles(s = 0) { return {zero: linear(a, s), one: linear(1 - a, s)}; }
  function local(eq, s, dir, epsilon) {
    const data = linear(eq === 0 ? a : 1 - a, s), r = (dir > 0 ? data.unstable : data.stable)[1];
    const beta = eq === 0 ? a : 1 - a, gamma = 3 * eq - (1 + a), J = dir > 0 ? data.matrix : inverse(data.matrix);
    let y = [1, r, 0, 0];
    for (const seg of schedule(s, dir * L)) y = integrate(y, seg.x1 - seg.x0, (w, d) => {
      d[0] = w[1] / seg.p; d[1] = beta * w[0];
      d[2] = w[3] / seg.p; d[3] = beta * w[2] + gamma * w[0] * w[0];
    });
    const mu = data.lambda, q = (y[3] - r * y[2]) / (mu * mu - J[1][1] + r * J[0][1]);
    const sign = eq === 1 ? -1 : 1;
    const seed = c => [eq + sign * c, r * sign * c + q * c * c];
    if (!Number.isFinite(q)) throw new RangeError('Unresolved local manifold curvature');
    const contracted = evolve(seed(epsilon), s, -dir * L, {origin: eq, initialOffset: sign * epsilon});
    const w = contracted[0] - eq;
    const invarianceDefect = Math.abs(contracted[1] - r * w - q * w * w);
    return {eq, r, q, lambda: mu, epsilon, range: [epsilon / mu, epsilon], seed,
      order: 2, invarianceDefect, eigenSegmentError: Math.abs(q) * epsilon * epsilon};
  }
  // Computes polylines of H_p=h from the exact square-root branches, with computed boundary roots.
  function levelCurve(coefficient, h, opts = {}) {
    if (!(coefficient > 0 && Number.isFinite(coefficient + h))) throw new RangeError('Invalid Hamiltonian level');
    const box = opts.box ?? [-.15, 1.15, -.7, .7], count = opts.samples ?? 200;
    const [umin, umax, vmin, vmax] = box;
    if (!(umin < umax && vmin < vmax && Number.isInteger(count) && count >= 2 && count <= 5000 && box.length === 4 && box.every(Number.isFinite))) throw new RangeError('Invalid level-curve mesh');
    const monotone = [umin, ...[0, a, 1].filter(u => u > umin && u < umax), umax];
    const knots = new Set(monotone);
    for (const target of [h, h-vmin*vmin/(2*coefficient), h-vmax*vmax/(2*coefficient)])
      for (let i = 1; i < monotone.length; i++) {
        const lo = monotone[i-1], hi = monotone[i];
        if ((F(lo)-target)*(F(hi)-target) <= 0) knots.add(bisect(u => F(u)-target, lo, hi));
      }
    const cuts = [...knots].sort((x,y) => x-y), pieces = [];
    for (const sign of [-1, 1]) for (let j = 1; j < cuts.length; j++) {
      const lo = cuts[j-1], hi = cuts[j], d = 2*coefficient*(h-F((lo+hi)/2));
      const v = sign*Math.sqrt(Math.max(0,d));
      if (d < 0 || v < vmin || v > vmax) continue;
      const n = Math.max(2, Math.ceil(count*(hi-lo)/(umax-umin)));
      const points = Array.from({length:n+1}, (_,i) => {
        const u = lo+(hi-lo)*i/n; return [u, sign*Math.sqrt(Math.max(0,2*coefficient*(h-F(u))))]; });
      pieces.push({points, sign});
    }
    if (vmin <= 0 && vmax >= 0) for (const u of cuts)
      if (Math.abs(h-F(u)) < 1e-16 && !pieces.some(q=>q.points.some(z=>Math.abs(z[0]-u)<1e-14)))
        pieces.push({points:[[u,0]], sign:0});
    return {pieces, points: pieces.flatMap((q,i) => [...(i?[null]:[]), ...q.points]), p: coefficient, h};
  }
  function manifold(eq, s, dir, opts = {}) {
    const epsilon = opts.epsilon ?? 1e-5, maxChord = opts.maxChord ?? .015;
    const seed = local(eq, s, dir, epsilon), n = opts.iterates ?? Math.ceil(Math.log(2/epsilon)/Math.log(seed.lambda));
    const maxPoints = opts.maxPoints ?? 2500, box = opts.box ?? [-.1, 1.1, -.8, .3];
    if (!(epsilon > 0 && epsilon < .01 && maxChord > 0 && Number.isInteger(n) && n >= 0 && n <= 80 && Number.isFinite(maxChord) && Number.isInteger(maxPoints) && maxPoints >= 20 &&
      box.length === 4 && box.every(Number.isFinite) && box[0] < box[1] && box[2] < box[3]))
      throw new RangeError('Invalid manifold options');
    if (seed.eigenSegmentError > (opts.seedTolerance ?? 1e-9)) throw new RangeError('Local eigen-segment error exceeds seedTolerance');
    const pieces = [], breaks = []; let evaluations = 0;
    const inside = z => finite(z) && z[0]>=box[0] && z[0]<=box[1] && z[1]>=box[2] && z[1]<=box[3];
    for (let j = 0; j <= n && evaluations + 1 < maxPoints; j++) {
      const samples = new Map();
      const sample = c => {
        if (samples.has(c)) return samples.get(c);
        let point, error;
        try { point = flow(seed.seed(c), s, dir*j*L, {limit: 4, origin: eq, initialOffset: (eq === 1 ? -c : c)}); }
        catch (e) { if (!(e instanceof RangeError)) throw e; point = null; error = e.message; }
        const v = {c, point, ...(error ? {error} : {})}; samples.set(c,v); evaluations++; return v;
      };
      let pending = [];
      const count = Math.min(16, maxPoints - evaluations - 1);
      for (let i = 0; i < count; i++) pending.push([sample(seed.range[0]+(seed.range[1]-seed.range[0])*i/count),
        sample(seed.range[0]+(seed.range[1]-seed.range[0])*(i+1)/count),0]);
      while (pending.length && evaluations < maxPoints) {
        const next = [];
        for (const [v,w,depth] of pending) {
          if (evaluations >= maxPoints || depth >= 20) break;
          if (!inside(v.point) && !inside(w.point)) continue;
          const mid = sample((v.c+w.c)/2);
          if (!v.point || !w.point || !mid.point || dist(v.point,w.point)>maxChord ||
            dist(mid.point,[(v.point[0]+w.point[0])/2,(v.point[1]+w.point[1])/2])>maxChord/5)
            next.push([v,mid,depth+1],[mid,w,depth+1]);
        }
        pending=next;
      }
      const vertices=[...samples.values()].sort((v,w)=>v.c-w.c); let part=[];
      for (const v of vertices) {
        const prev=part.at(-1);
        if (!inside(v.point) || (prev && dist(prev.point,v.point)>maxChord)) {
          if (part.length) pieces.push({iterate:j, dir, vertices:part, points:part.map(q=>q.point)});
          if (prev) breaks.push({iterate:j,c0:prev.c,c1:v.c,reason:inside(v.point)?'maxChord':'outside-or-failed'});
          part=[];
        }
        if (inside(v.point)) part.push(v);
      }
      if(part.length) pieces.push({iterate:j,dir,vertices:part,points:part.map(q=>q.point)});
    }
    return {pieces, points:pieces.flatMap((q,i)=>[...(i?[null]:[]),...q.points]), breaks, seed,
      evaluations, budgetExhausted:evaluations+1>=maxPoints, s, eq, dir, maxChord};
  }
  // Computes the inward unstable branch of (1,0), using checked local seeds and refined iterates.
  const unstableManifold = (s=0, opts={}) => manifold(1,s,1,opts);
  // Computes the inward stable branch of (0,0), using checked local seeds and refined inverse iterates.
  const stableManifold = (s=0, opts={}) => manifold(0,s,-1,opts);
  function imageWithTangent(curve, j, c) {
    const {seed, s, dir} = curve, w = (seed.eq===1 ? -1 : 1);
    const out = evolve(seed.seed(c),s,dir*j*L,{origin: seed.eq, initialOffset: w*c},null,true), v=[w,seed.r*w+2*seed.q*c];
    return {point:out.point, tangent:[out.J[0][0]*v[0]+out.J[0][1]*v[1],out.J[1][0]*v[0]+out.J[1][1]*v[1]]};
  }
  // Computes mesh-detected manifold intersections, refined in both seed parameters; not exhaustive.
  function intersections(s=0, opts={}) {
    const unstable=opts.unstable ?? unstableManifold(s,opts), stable=opts.stable ?? stableManifold(s,opts);
    if (alpha===1 && a===.5) return {points:[], unstable,stable,coincident:true,unresolved:0,
      refinements:0,skippedCandidates:0,refinementBudgetExhausted:false};
    const maxRefinements=opts.maxRefinements ?? 12, minAngle=opts.minAngle ?? 1e-6;
    if (!Number.isInteger(maxRefinements) || maxRefinements<1 || maxRefinements>1000 ||
      !Number.isFinite(minAngle) || minAngle<0 || minAngle>1) throw new RangeError('Invalid intersection options');
    const hits=[]; let unresolved=0, refinements=0, skippedCandidates=0;
    for (const U of unstable.pieces) for (const S of stable.pieces)
      for (let i=1;i<U.vertices.length;i++) for(let j=1;j<S.vertices.length;j++) {
        const u0=U.vertices[i-1],u1=U.vertices[i],v0=S.vertices[j-1],v1=S.vertices[j];
        if(Math.max(u0.point[0],u1.point[0])<Math.min(v0.point[0],v1.point[0]) ||
          Math.max(v0.point[0],v1.point[0])<Math.min(u0.point[0],u1.point[0])) continue;
        const du=sub(u1.point,u0.point),dv=sub(v1.point,v0.point),gap=sub(v0.point,u0.point),D=cross(du,dv);
        if(Math.abs(D)<1e-18) continue;
        const t=cross(gap,dv)/D, r=cross(gap,du)/D;
        if(t<0||t>1||r<0||r>1) continue;
        if(refinements>=maxRefinements) { skippedCandidates++; continue; }
        refinements++;
        let cu=u0.c+t*(u1.c-u0.c),cs=v0.c+r*(v1.c-v0.c), pu,ps, residual=Infinity, angle=0;
        for(let step=0;step<12;step++) {
          pu=imageWithTangent(unstable,U.iterate,cu); ps=imageWithTangent(stable,S.iterate,cs);
          const g=sub(pu.point,ps.point); residual=norm(g); const det=cross(pu.tangent,ps.tangent);
          angle=Math.abs(det)/(norm(pu.tangent)*norm(ps.tangent));
          if(residual<2e-12 || Math.abs(det)<1e-14 || step === 11) break;
          cu-=cross(g,ps.tangent)/det; cs-=cross(g,pu.tangent)/det;
          if(cu<unstable.seed.range[0] || cu>unstable.seed.range[1] || cs<stable.seed.range[0] || cs>stable.seed.range[1]) break;
        }
        if (angle < minAngle) { unresolved++; continue; }
        if(residual<1e-10 && cu>=unstable.seed.range[0] && cu<=unstable.seed.range[1] &&
          cs>=stable.seed.range[0] && cs<=stable.seed.range[1] && pu.point[0]>1e-5 && pu.point[0]<1-1e-5 && !hits.some(q=>dist(q.point,pu.point)<1e-6)) {
          const point=pu.point.map((v,i)=>(v+ps.point[i])/2);
          hits.push({point,residual,angle,unstable:{iterate:U.iterate,c:cu},stable:{iterate:S.iterate,c:cs},
            primary:point[0]>=a && Psi(point,s)[0]<a});
        }
      }
    hits.sort((x,y)=>x.point[0]-y.point[0]);
    return {points:hits, unstable,stable,coincident:false, unresolved, refinements, skippedCandidates,
      refinementBudgetExhausted:skippedCandidates>0};
  }
  // Computes a finite-range front candidate and reports endpoint/ODE checks; does not prove asymptotic limits.
  function front(z,s,xmin,xmax,opts={}) {
    if(!(xmin<=s && s<=xmax)) throw new RangeError('Front interval must contain its supplied phase s');
    const left=trajectory(z,s,xmin-s,opts),right=trajectory(z,s,xmax-s,opts);
    const samples=[...left.samples].reverse().concat(right.samples.slice(1));
    const pieces=[...left.pieces].reverse().map(q=>({...q,x0:q.x1,x1:q.x0,start:q.end,end:q.start,
      samples:[...q.samples].reverse()})).concat(right.pieces);
    const errors={left:dist(samples[0].point,[1,0]),right:dist(samples.at(-1).point,[0,0])};
    const rangeOK=samples.every(q=>q.point[0]>=-1e-6&&q.point[0]<=1+1e-6);
    let stationaryResidual=0, hamiltonianDrift=0, interfaceResidual=0;
    for (const piece of pieces) {
      const energy=H(piece.start,piece.p);
      for (const q of piece.samples) hamiltonianDrift=Math.max(hamiltonianDrift,Math.abs(H(q.point,piece.p)-energy));
      const mid=piece.samples[Math.floor(piece.samples.length/2)], h=Math.min(1e-4,(piece.x1-piece.x0)/10);
      if (h>0 && mid.x>piece.x0+h && mid.x<piece.x1-h) {
        const zp=flow(mid.point,mid.x,h),zm=flow(mid.point,mid.x,-h);
        stationaryResidual=Math.max(stationaryResidual,Math.abs((zp[0]-zm[0])/(2*h)-mid.point[1]/piece.p),
          Math.abs((zp[1]-zm[1])/(2*h)+f(mid.point[0])));
      }
    }
    for(let i=1;i<pieces.length;i++) interfaceResidual=Math.max(interfaceResidual,dist(pieces[i-1].end,pieces[i].start));
    return {samples,xs:samples.map(q=>q.x),us:samples.map(q=>q.point[0]),vs:samples.map(q=>q.point[1]),pieces,
      endpointErrors:errors,approaches:rangeOK&&Math.max(errors.left,errors.right)<(opts.limitTolerance??1e-4),
      stationaryResidual,hamiltonianDrift,interfaceResidual,evaluate:x=>flow(z,s,x-s,opts),
      monotone:samples.every((q,i)=>!i||q.point[0]<=samples[i-1].point[0]+1e-9), status:'computed finite-range candidate'};
  }
  // Computes deterministic disc samples and their k forward/backward return-map iterates.
  function cloud(center,s,radius,n,k) {
    if(!finite(center)||!(radius>=0 && Number.isFinite(radius))||!Number.isInteger(n)||n<1||n>2000||!Number.isInteger(k)||Math.abs(k)>80)
      throw new RangeError('Invalid point cloud');
    const initial=Array.from({length:n},(_,i)=>{
      const r=radius*Math.sqrt((i+.5)/n),theta=i*Math.PI*(3-Math.sqrt(5));
      return [center[0]+r*Math.cos(theta),center[1]+r*Math.sin(theta)]; });
    const points=initial.map(z=>{try{return flow(z,s,k*L);}catch(e){if(e instanceof RangeError)return null;throw e;}});
    return {initial,points,k,failed:points.filter(q=>!q).length};
  }
  return {alpha,L1,L2,L,a,f,F,H,p,levelCurve,flow,trajectory,Psi,PsiInv,saddles,
    unstableManifold,stableManifold,intersections,front,cloud};
}
