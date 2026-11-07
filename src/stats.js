// ---------- Autonomous Black Belt: statistics engine (no dependencies) ----------
const S = (() => {
  const sum = a => a.reduce((s, x) => s + x, 0);
  const mean = a => sum(a) / a.length;
  const variance = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
  const sd = a => Math.sqrt(variance(a));
  const sorted = a => [...a].sort((x, y) => x - y);
  const quantile = (a, p) => { const s = sorted(a); const h = (s.length - 1) * p; const lo = Math.floor(h); return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]); };
  const median = a => quantile(a, 0.5);

  // --- special functions ---
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function gammp(a, x) { // regularized lower incomplete gamma
    if (x <= 0) return 0;
    if (x < a + 1) { let ap = a, s = 1 / a, del = s; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 3e-15) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-15) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function erfc(x) { // Numerical Recipes erfcc, rel err < 1.2e-7
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const normCdf = x => 0.5 * erfc(-x / Math.SQRT2);
  const normSf = x => 0.5 * erfc(x / Math.SQRT2);
  function normInv(p) { // Acklam
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const tSf2 = (t, df) => betai(df / 2, 0.5, df / (df + t * t)); // two-sided p
  const tInv975 = df => { // two-sided 95% critical value via bisection
    let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; tSf2(m, df) > 0.05 ? lo = m : hi = m; } return (lo + hi) / 2;
  };
  const fSf = (f, d1, d2) => f <= 0 ? 1 : betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
  const chi2Sf = (x, k) => x <= 0 ? 1 : 1 - gammp(k / 2, x / 2);

  // --- normality: Anderson-Darling (Stephens-adjusted, same as Minitab) ---
  function andersonDarling(a) {
    const n = a.length, m = mean(a), s = sd(a), x = sorted(a);
    let A = 0;
    for (let i = 0; i < n; i++) {
      const F1 = Math.min(Math.max(normCdf((x[i] - m) / s), 1e-300), 1 - 1e-16);
      const F2 = Math.min(Math.max(normCdf((x[n - 1 - i] - m) / s), 1e-300), 1 - 1e-16);
      A += (2 * i + 1) * (Math.log(F1) + Math.log(1 - F2));
    }
    const A2 = -n - A / n, As = A2 * (1 + 0.75 / n + 2.25 / (n * n));
    let p;
    if (As >= 0.6) p = Math.exp(1.2937 - 5.709 * As + 0.0186 * As * As);
    else if (As >= 0.34) p = Math.exp(0.9177 - 4.279 * As - 1.38 * As * As);
    else if (As >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * As - 59.938 * As * As);
    else p = 1 - Math.exp(-13.436 + 101.14 * As - 223.73 * As * As);
    return { A2, A2star: As, p: Math.min(Math.max(p, 0), 1) };
  }
  function skewness(a) { const n = a.length, m = mean(a); const m2 = a.reduce((s, x) => s + (x - m) ** 2, 0) / n, m3 = a.reduce((s, x) => s + (x - m) ** 3, 0) / n; return m3 / m2 ** 1.5; }

  // --- group comparisons ---
  function levene(groups) { // Brown-Forsythe (median-centred), = scipy.stats.levene default
    const z = groups.map(g => { const md = median(g); return g.map(x => Math.abs(x - md)); });
    const r = anova(z); return { W: r.F, df1: r.df1, df2: r.df2, p: r.p };
  }
  function anova(groups) {
    const all = groups.flat(), N = all.length, k = groups.length, gm = mean(all);
    let ssb = 0, ssw = 0;
    groups.forEach(g => { const m = mean(g); ssb += g.length * (m - gm) ** 2; ssw += g.reduce((s, x) => s + (x - m) ** 2, 0); });
    const df1 = k - 1, df2 = N - k, F = (ssb / df1) / (ssw / df2);
    return { F, df1, df2, p: fSf(F, df1, df2), eta2: ssb / (ssb + ssw), ssb, ssw, mse: ssw / df2 };
  }
  function welchAnova(groups) {
    const k = groups.length, ns = groups.map(g => g.length), ms = groups.map(mean), vs = groups.map(variance);
    const w = ns.map((n, i) => n / vs[i]), W = sum(w), mw = sum(w.map((wi, i) => wi * ms[i])) / W;
    const A = sum(w.map((wi, i) => wi * (ms[i] - mw) ** 2)) / (k - 1);
    const lam = sum(w.map((wi, i) => (1 - wi / W) ** 2 / (ns[i] - 1)));
    const B = 1 + 2 * (k - 2) / (k * k - 1) * lam;
    const F = A / B, df1 = k - 1, df2 = (k * k - 1) / (3 * lam);
    return { F, df1, df2, p: fSf(F, df1, df2) };
  }
  function rank(a) { // average ranks for ties
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); const ties = [];
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const av = (i + j) / 2 + 1; for (let t = i; t <= j; t++) r[idx[t][1]] = av; if (j > i) ties.push(j - i + 1); i = j + 1; }
    return { r, ties };
  }
  function kruskal(groups) {
    const all = groups.flat(), N = all.length, k = groups.length, { r, ties } = rank(all);
    let off = 0, H = 0;
    groups.forEach(g => { const rs = sum(r.slice(off, off + g.length)); H += rs * rs / g.length; off += g.length; });
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    const C = 1 - sum(ties.map(t => t ** 3 - t)) / (N ** 3 - N); H = H / C;
    return { H, df: k - 1, p: chi2Sf(H, k - 1), eps2: H / ((N * N - 1) / (N + 1)) };
  }
  function chiSquare(table) { // table: rows x cols counts
    const R = table.length, C = table[0].length, rt = table.map(sum), ct = table[0].map((_, j) => sum(table.map(r => r[j]))), N = sum(rt);
    let X2 = 0, low = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const e = rt[i] * ct[j] / N; if (e < 5) low++; X2 += e > 0 ? (table[i][j] - e) ** 2 / e : 0; }
    const df = (R - 1) * (C - 1);
    return { X2, df, p: chi2Sf(X2, df), cramersV: Math.sqrt(X2 / (N * Math.min(R - 1, C - 1))), lowExpectedShare: low / (R * C) };
  }
  function pearson(x, y) {
    const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy), n = x.length, t = r * Math.sqrt((n - 2) / (1 - r * r));
    return { r, p: tSf2(t, n - 2), slope: sxy / sxx, intercept: my - sxy / sxx * mx };
  }
  const spearman = (x, y) => { const r = pearson(rank(x).r, rank(y).r); return { rho: r.r, p: r.p }; };

  // --- OLS via normal equations (Gauss-Jordan) ---
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c]; if (Math.abs(d) < 1e-12) return null;
      for (let j = c; j <= n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(r => r[n]);
  }
  function ols(X, y) { // X rows without intercept
    const n = y.length, Z = X.map(r => [1, ...r]), p = Z[0].length;
    const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (let k = 0; k < n; k++) s += Z[k][i] * Z[k][j]; return s; }));
    const Xty = Array.from({ length: p }, (_, i) => { let s = 0; for (let k = 0; k < n; k++) s += Z[k][i] * y[k]; return s; });
    const beta = solve(XtX, Xty); if (!beta) return null;
    const fit = Z.map(r => r.reduce((s, v, i) => s + v * beta[i], 0)), res = y.map((v, i) => v - fit[i]);
    const my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = res.reduce((s, v) => s + v * v, 0);
    const r2 = 1 - sse / sst, adj = 1 - (1 - r2) * (n - 1) / (n - p);
    const F = ((sst - sse) / (p - 1)) / (sse / (n - p));
    return { beta, fit, res, r2, adjR2: adj, F, p: fSf(F, p - 1, n - p), predict: row => [1, ...row].reduce((s, v, i) => s + v * beta[i], 0) };
  }

  // --- capability & sigma ---
  function capability(y, { usl, lsl }, sdWithin) {
    const m = mean(y), so = sd(y), sw = sdWithin || so, n = y.length;
    const hasU = Number.isFinite(usl), hasL = Number.isFinite(lsl);
    const r = { mean: m, sdOverall: so, sdWithin: sw, n };
    const zu = hasU ? (usl - m) / so : Infinity, zl = hasL ? (m - lsl) / so : Infinity;
    const zuw = hasU ? (usl - m) / sw : Infinity, zlw = hasL ? (m - lsl) / sw : Infinity;
    r.Ppk = Math.min(zu, zl) / 3; r.Cpk = Math.min(zuw, zlw) / 3;
    if (hasU && hasL) { r.Pp = (usl - lsl) / (6 * so); r.Cp = (usl - lsl) / (6 * sw); }
    const obsOut = y.filter(v => (hasU && v > usl) || (hasL && v < lsl)).length;
    r.observedPct = obsOut / n;
    r.expectedPct = (hasU ? normSf(zu) : 0) + (hasL ? normSf(zl) : 0);
    // non-parametric (empirical) defect rate drives DPMO; normal-theory shown for comparison
    const pDef = Math.max(r.observedPct, 0.5 / n);
    r.dpmo = r.observedPct * 1e6;
    r.zBench = -normInv(pDef);
    r.sigmaLevel = r.zBench + 1.5;
    return r;
  }

  // --- I-MR control chart with Nelson rules 1,2,3,5 ---
  function imr(x) {
    const n = x.length, mr = x.slice(1).map((v, i) => Math.abs(v - x[i])), mrBar = mean(mr), cl = mean(x), s = mrBar / 1.128;
    const ucl = cl + 3 * s, lcl = cl - 3 * s, flags = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      if (x[i] > ucl || x[i] < lcl) flags[i].push(1);
      if (i >= 8) { const w = x.slice(i - 8, i + 1); if (w.every(v => v > cl) || w.every(v => v < cl)) flags[i].push(2); }
      if (i >= 5) { const w = x.slice(i - 5, i + 1); let up = true, dn = true; for (let j = 1; j < 6; j++) { if (!(w[j] > w[j - 1])) up = false; if (!(w[j] < w[j - 1])) dn = false; } if (up || dn) flags[i].push(3); }
      if (i >= 2) { const w = x.slice(i - 2, i + 1); if (w.filter(v => v > cl + 2 * s).length >= 2 && x[i] > cl + 2 * s || w.filter(v => v < cl - 2 * s).length >= 2 && x[i] < cl - 2 * s) flags[i].push(5); }
    }
    return { cl, ucl, lcl: lcl, sigma: s, mrBar, mrUcl: 3.267 * mrBar, flags, mr };
  }

  function holm(ps) { // returns adjusted p-values
    const o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length, adj = new Array(m); let run = 0;
    o.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); adj[i] = run; });
    return adj;
  }

  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  return { sum, mean, variance, sd, quantile, median, sorted, normCdf, normSf, normInv, tSf2, tInv975, fSf, chi2Sf, andersonDarling, skewness, levene, anova, welchAnova, kruskal, chiSquare, pearson, spearman, ols, capability, imr, holm, rank, rng };
})();
if (typeof module !== "undefined") module.exports = S; else window.S = S;
