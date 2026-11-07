// ---------- Autonomous Black Belt: DMAIC analysis engine ----------
// Pure functions: rows in, results out. The statistics live in stats.js;
// this file encodes the Master Black Belt decision logic (which test, why, and what it means).
const BB = (() => {
  const S = typeof module !== "undefined" ? require("./stats.js") : window.S;
  const SYMPTOM_RE = /reason|defect|error|exception|cause|failure|issue/i;
  const Y_RE = /cycle|time|tat|duration|lead|days|hrs|hours|minutes|mins|aht|wait|delay/i;
  const NO_DEFECT_RE = /^(none|n\/a|na|no|ok|nil|-|)$/i;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

  // ---------- CSV ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const delim = [",", ";", "\t"].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.filter(r => r.some(c => c.trim() !== ""));
    if (clean.length < 2) throw new Error("The file needs a header row and at least one data row.");
    const head = clean[0].map((h, i) => h.trim() || "Column_" + (i + 1));
    return clean.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  }

  // ---------- profiling ----------
  function profile(rows) {
    const n = rows.length, cols = Object.keys(rows[0]);
    return cols.map(name => {
      const vals = rows.map(r => r[name]), present = vals.filter(v => v !== "" && v != null);
      const missing = n - present.length, uniq = new Set(present).size;
      const numShare = present.filter(v => v !== "" && Number.isFinite(+v)).length / (present.length || 1);
      const dateShare = present.filter(v => DATE_RE.test(String(v))).length / (present.length || 1);
      let type = "categorical";
      if (dateShare > 0.9) type = "date";
      else if (numShare > 0.95) type = uniq <= 6 && present.every(v => Number.isInteger(+v)) ? "categorical" : "continuous";
      if (type === "categorical" && (uniq > 25 || (uniq > 0.9 * present.length && present.length > 20))) type = "identifier";
      return { name, type, missing, unique: uniq, symptom: type === "categorical" && SYMPTOM_RE.test(name) };
    });
  }
  function suggestY(prof) {
    const cont = prof.filter(c => c.type === "continuous");
    return (cont.find(c => Y_RE.test(c.name)) || cont[cont.length - 1] || {}).name;
  }

  // ---------- helpers ----------
  const goalOf = spec => Number.isFinite(spec.usl) && Number.isFinite(spec.lsl) ? "target" : Number.isFinite(spec.lsl) ? "higher" : "lower";
  const target = spec => (spec.usl + spec.lsl) / 2;
  function bestLevel(levels, goal, spec) {
    const key = goal === "lower" ? l => l.mean : goal === "higher" ? l => -l.mean : l => Math.abs(l.mean - target(spec));
    return [...levels].sort((a, b) => key(a) - key(b))[0];
  }
  function groupBy(rows, x, y) {
    const m = new Map(); rows.forEach(r => { const k = r[x]; if (k === "" || k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(+r[y]); }); return m;
  }
  function levelStats(arr, name) {
    const n = arr.length, mean = S.mean(arr), sd = n > 1 ? S.sd(arr) : 0, h = n > 1 ? S.tInv975(n - 1) * sd / Math.sqrt(n) : 0;
    return { name, n, mean, sd, lo: mean - h, hi: mean + h, median: S.median(arr) };
  }
  const effectLabel = e => e >= 0.14 ? "large" : e >= 0.06 ? "medium" : e >= 0.01 ? "small" : "negligible";

  // ---------- categorical X vs continuous Y ----------
  function analyseCategorical(rows, x, y, spec) {
    const g = groupBy(rows, x, y), dropped = [];
    let levels = [];
    for (const [k, arr] of g) (arr.length >= 5 ? levels.push(levelStats(arr, k)) : dropped.push(k));
    if (levels.length < 2) return null;
    levels.sort((a, b) => a.name < b.name ? -1 : 1);
    const groups = levels.map(l => g.get(l.name)), k = groups.length, minN = Math.min(...levels.map(l => l.n));
    const resid = groups.flatMap((arr, i) => arr.map(v => v - levels[i].mean));
    const ad = S.andersonDarling(resid), lev = S.levene(groups);
    const an = S.anova(groups), wel = S.welchAnova(groups), kw = S.kruskal(groups);
    const normalOK = ad.p >= 0.05, cltOK = minN >= 30, equalVar = lev.p >= 0.05;
    const two = k === 2, trail = [];
    trail.push(["Data type", `Y is continuous; ${x} is categorical with ${k} levels → compare group averages.` + (dropped.length ? ` Levels with fewer than 5 records left out: ${dropped.join(", ")}.` : "")]);
    trail.push(["Normality", `Anderson-Darling on residuals: A² = ${f(ad.A2star, 2)}, p ${fp(ad.p)}. ` + (normalOK ? "Residuals are consistent with normal ✓" : cltOK ? `Not normal, but every group has n ≥ 30 (smallest ${minN}), so the means are close to normal (central limit theorem) ✓` : `Not normal and smallest group has only ${minN} records ✗`)]);
    let primary, method, effect, effName;
    if (normalOK || cltOK) {
      trail.push(["Equal variance", `Levene (Brown-Forsythe): p ${fp(lev.p)}. ` + (equalVar ? "Spreads are similar ✓" : "Spreads differ ✗, so use the Welch version, which does not assume equal variance")]);
      if (equalVar) { primary = an.p; method = two ? "2-sample t-test" : "One-way ANOVA"; trail.push(["Test", `${method}: F(${an.df1}, ${an.df2}) = ${f(an.F, 2)}, p ${fp(an.p)}`]); }
      else { primary = wel.p; method = two ? "Welch t-test" : "Welch ANOVA"; trail.push(["Test", `${method}: F(${wel.df1}, ${f(wel.df2, 1)}) = ${f(wel.F, 2)}, p ${fp(wel.p)}`]); }
      effect = an.eta2; effName = "η²";
      trail.push(["Cross-check", `${two ? "Mann-Whitney" : "Kruskal-Wallis"} (no normality assumption): H = ${f(kw.H, 1)}, p ${fp(kw.p)}. ` + ((kw.p < 0.05) === (primary < 0.05) ? "Agrees with the main test ✓" : "Disagrees with the main test, so treat this X with caution ⚠")]);
    } else {
      primary = kw.p; method = two ? "Mann-Whitney" : "Kruskal-Wallis"; effect = kw.eps2; effName = "ε²";
      trail.push(["Test", `${method} on medians (robust to non-normal data): H = ${f(kw.H, 2)}, df = ${kw.df}, p ${fp(kw.p)}`]);
    }
    const disagree = (normalOK || cltOK) && (kw.p < 0.05) !== (primary < 0.05);
    const goal = goalOf(spec), best = bestLevel(levels, goal, spec), worst = [...levels].sort((a, b) => goal === "higher" ? a.mean - b.mean : goal === "lower" ? b.mean - a.mean : Math.abs(b.mean - target(spec)) - Math.abs(a.mean - target(spec)))[0];
    const bySd = [...levels].sort((a, b) => a.sd - b.sd), spread = { p: lev.p, ratio: bySd[bySd.length - 1].sd / (bySd[0].sd || 1e-9), widest: bySd[bySd.length - 1], tightest: bySd[0] };
    return { x, kind: "categorical", method, p: primary, effect, effName, levels, best, worst, gap: worst.mean - best.mean, trail, disagree, symptom: SYMPTOM_RE.test(x), spread };
  }

  // ---------- continuous X vs continuous Y ----------
  function analyseContinuous(rows, x, y, yNormal) {
    const pts = rows.filter(r => r[x] !== "" && Number.isFinite(+r[x])).map(r => [+r[x], +r[y]]);
    if (pts.length < 10) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pe = S.pearson(xs, ys), sp = S.spearman(xs, ys);
    const useP = yNormal && Math.abs(S.skewness(xs)) < 1, trail = [];
    trail.push(["Data type", `Y and ${x} are both continuous → test for a relationship (correlation and regression).`]);
    trail.push(["Method choice", useP ? "Y is near-normal and X is not skewed → Pearson correlation." : `Y is not normal${Math.abs(S.skewness(xs)) >= 1 ? " and X is skewed" : ""} → Spearman rank correlation, which needs no normality.`]);
    const r = useP ? pe.r : sp.rho, p = useP ? pe.p : sp.p;
    trail.push(["Test", `${useP ? "Pearson r" : "Spearman ρ"} = ${f(r, 3)}, p ${fp(p)}. Slope: each extra unit of ${x} adds ${f(pe.slope, 3)} to Y.`]);
    trail.push(["Cross-check", `${useP ? "Spearman ρ" : "Pearson r"} = ${f(useP ? sp.rho : pe.r, 3)}, p ${fp(useP ? sp.p : pe.p)}. ` + (((useP ? sp.p : pe.p) < 0.05) === (p < 0.05) ? "Agrees ✓" : "Disagrees ⚠")]);
    return { x, kind: "continuous", method: useP ? "Pearson correlation" : "Spearman correlation", p, effect: r * r, effName: "r²", r, slope: pe.slope, intercept: pe.intercept, pts, trail, disagree: ((useP ? sp.p : pe.p) < 0.05) !== (p < 0.05), symptom: false };
  }

  // ---------- main ----------
  function run(rowsIn, cfg) {
    const { y, xs, spec, dateCol } = cfg, warnings = [];
    const rows = rowsIn.filter(r => r[y] !== "" && Number.isFinite(+r[y]));
    if (rows.length < 20) throw new Error(`Only ${rows.length} usable values in ${y}. The analysis needs at least 20.`);
    if (rows.length < rowsIn.length) warnings.push(`${rowsIn.length - rows.length} rows had no value for ${y} and were left out.`);
    const yv = rows.map(r => +r[y]), goal = goalOf(spec);
    const hasSpec = Number.isFinite(spec.usl) || Number.isFinite(spec.lsl);
    const isDefect = v => (Number.isFinite(spec.usl) && v > spec.usl) || (Number.isFinite(spec.lsl) && v < spec.lsl);

    // MEASURE
    let order = rows.map((r, i) => i), dates = null;
    if (dateCol) order.sort((a, b) => rows[a][dateCol] < rows[b][dateCol] ? -1 : rows[a][dateCol] > rows[b][dateCol] ? 1 : a - b);
    let series;
    if (dateCol) {
      const byDay = new Map(); order.forEach(i => { const d = String(rows[i][dateCol]).slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(yv[i]); });
      series = [...byDay].map(([d, a]) => ({ label: d, v: S.mean(a), n: a.length }));
      dates = { from: series[0].label, to: series[series.length - 1].label };
    } else series = order.map(i => ({ label: "#" + (i + 1), v: yv[i], n: 1 }));
    const chart = S.imr(series.map(s => s.v));
    series.forEach((s, i) => s.flags = chart.flags[i]);
    const sdWithin = dateCol ? S.imr(order.map(i => yv[i])).sigma : chart.sigma;
    const cap = hasSpec ? S.capability(yv, spec, sdWithin) : null;
    const ad = S.andersonDarling(yv);
    const desc = { n: yv.length, mean: S.mean(yv), sd: S.sd(yv), median: S.median(yv), p10: S.quantile(yv, 0.1), p90: S.quantile(yv, 0.9), min: Math.min(...yv), max: Math.max(...yv), skew: S.skewness(yv) };
    const special = series.map((s, i) => ({ ...s, i })).filter(s => s.flags.includes(1));
    const shifts = series.filter(s => s.flags.includes(2)).length;

    // ANALYSE
    const results = [];
    for (const x of xs) {
      const t = cfg.types[x];
      const r = t === "continuous" ? analyseContinuous(rows, x, y, ad.p >= 0.05) : analyseCategorical(rows, x, y, spec);
      if (r) results.push(r); else warnings.push(`${x} was skipped: not enough data in at least two groups.`);
    }
    const adj = S.holm(results.map(r => r.p));
    results.forEach((r, i) => {
      r.pAdj = adj[i];
      r.trail.push(["Multiple testing", `${results.length} inputs tested at once, so p-values are Holm-adjusted to avoid false alarms: adjusted p ${fp(r.pAdj)}.`]);
      r.trail.push(["Practical size", `${r.effName} = ${f(r.effect, 3)} → ${effectLabel(r.effect)} effect; ${r.x} explains about ${f(r.effect * 100, 1)}% of the variation in ${y}.` + (r.kind === "categorical" ? ` ${r.worst.name} averages ${f(Math.abs(r.gap), 1)} ${r.gap >= 0 ? "more" : "less"} than ${r.best.name}.` : "")]);
      r.verdict = r.pAdj >= 0.05 ? "Not proven" : r.effect >= 0.06 ? "Vital X" : r.effect >= 0.01 ? "Contributing" : "Significant but small";
      if (r.disagree && r.verdict === "Vital X") r.verdict = "Contributing";
      r.trail.push(["Verdict", r.verdict + (r.symptom ? `. ${r.x} describes what went wrong rather than a process setting, so treat it as a symptom to stratify (Pareto) rather than a lever.` : r.verdict === "Not proven" ? ". No evidence this input drives the outcome; don't spend improvement effort here." : ".")]);
    });
    const rankV = { "Vital X": 0, "Contributing": 1, "Significant but small": 2, "Not proven": 3 };
    results.sort((a, b) => rankV[a.verdict] - rankV[b.verdict] || b.effect - a.effect);
    const levers = results.filter(r => !r.symptom && (r.verdict === "Vital X" || r.verdict === "Contributing"));

    // joint model of the levers
    let model = null;
    if (levers.length) {
      const enc = levers.map(r => r.kind === "categorical" ? { x: r.x, kind: "cat", levels: r.levels.map(l => l.name) } : { x: r.x, kind: "num" });
      const usable = rows.map((row, i) => [row, i]).filter(([row]) => enc.every(e => e.kind === "num" ? Number.isFinite(+row[e.x]) && row[e.x] !== "" : e.levels.includes(row[e.x])));
      const design = row => enc.flatMap(e => e.kind === "num" ? [+row[e.x]] : e.levels.slice(1).map(l => row[e.x] === l ? 1 : 0));
      const fit = usable.length > 10 ? S.ols(usable.map(([r]) => design(r)), usable.map(([, i]) => yv[i])) : null;
      if (fit) {
        let k = 1; const coef = {};
        enc.forEach(e => { if (e.kind === "num") coef[e.x] = { slope: fit.beta[k++] }; else { const m = { [e.levels[0]]: 0 }; e.levels.slice(1).forEach(l => m[l] = fit.beta[k++]); coef[e.x] = { levels: m }; } });
        model = { r2: fit.r2, adjR2: fit.adjR2, p: fit.p, n: usable.length, coef, inputs: levers.map(r => r.x) };
        model.res = new Array(rows.length).fill(NaN); usable.forEach(([, i], k2) => model.res[i] = fit.res[k2]);
      }
    }

    // two-sided spec: variation matters as much as the average. Test spread on model residuals,
    // so known mean effects (other Xs) don't mask a source of extra variation.
    let resid = model ? model.res : yv.map(v => v - desc.mean);
    if (goal === "target") {
      const cats = results.filter(r => r.kind === "categorical" && !r.symptom);
      cats.forEach(r => {
        const g = r.levels.map(l => ({ name: l.name, v: rows.map((row, i) => row[r.x] === l.name ? resid[i] : NaN).filter(Number.isFinite) })).filter(g2 => g2.v.length >= 5);
        if (g.length < 2) { r.spread.p = 1; return; }
        const lv = S.levene(g.map(g2 => g2.v)), sds = g.map(g2 => ({ name: g2.name, sd: S.sd(g2.v) })).sort((a, b) => a.sd - b.sd);
        r.spread = { p: lv.p, ratio: sds[sds.length - 1].sd / (sds[0].sd || 1e-9), widest: sds[sds.length - 1], tightest: sds[0], sds: Object.fromEntries(sds.map(d => [d.name, d.sd])) };
      });
      const la = S.holm(cats.map(r => r.spread.p));
      cats.forEach((r, i) => {
        r.spread.pAdj = la[i];
        if (la[i] < 0.05 && r.spread.ratio >= 1.3) {
          r.spreadDriver = true;
          r.trail.splice(r.trail.length - 1, 0, ["Spread", `Two-sided spec, so spread was tested too, after removing the effect of the other proven inputs. Levene adjusted p ${fp(la[i])}: ${r.spread.widest.name} varies ${f(r.spread.ratio, 1)}× more than ${r.spread.tightest.name} (residual SD ${f(r.spread.widest.sd, 2)} vs ${f(r.spread.tightest.sd, 2)}). Extra spread pushes output past both limits even when the average is on target.`]);
          if (r.verdict !== "Vital X") { r.verdict = "Vital X"; r.method += " + Levene"; r.trail[r.trail.length - 1] = ["Verdict", `Vital X, driven by spread rather than the average. Find the source of extra variation in ${r.spread.widest.name}.`]; }
        }
      });
      results.sort((a, b) => rankV[a.verdict] - rankV[b.verdict] || b.effect - a.effect);
    }

    // pareto of symptoms
    const symCol = results.find(r => r.symptom) ? results.find(r => r.symptom).x : (cfg.symptomCol || null);
    let pareto = null;
    if (symCol) {
      const c = new Map(); rows.forEach(r => { const v = r[symCol]; if (!NO_DEFECT_RE.test(String(v ?? "").trim())) c.set(v, (c.get(v) || 0) + 1); });
      const items = [...c].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      const tot = S.sum(items.map(i => i.count)); let cum = 0; items.forEach(i => { cum += i.count; i.cum = cum / tot; });
      const withSym = rows.map((r, i) => [r, i]).filter(([r]) => !NO_DEFECT_RE.test(String(r[symCol] ?? "").trim()));
      const impact = items.map(it => { const a = withSym.filter(([r]) => r[symCol] === it.name).map(([, i]) => yv[i]); return { name: it.name, mean: S.mean(a), defects: hasSpec ? a.filter(isDefect).length : null }; });
      pareto = { col: symCol, items, total: tot, share: tot / rows.length, impact };
    }
    let breachPareto = null;
    const topCat = levers.find(r => r.kind === "categorical");
    if (hasSpec && topCat) {
      const items = topCat.levels.map(l => ({ name: l.name, count: rows.filter((r, i) => r[topCat.x] === l.name && isDefect(yv[i])).length })).sort((a, b) => b.count - a.count);
      const tot = S.sum(items.map(i => i.count)); let cum = 0; items.forEach(i => { cum += i.count; i.cum = tot ? cum / tot : 0; });
      breachPareto = { col: topCat.x, items, total: tot };
    }

    // IMPROVE: scenarios
    const scenarios = [];
    const summarise = (name, detail, ny, kind) => {
      const c = hasSpec ? S.capability(ny, spec, sdWithin * S.sd(ny) / desc.sd) : null;
      let band = null;
      if (hasSpec) { // bootstrap 90% interval on defect rate
        const R = S.rng(7 + scenarios.length), B = 300, rates = [];
        for (let b = 0; b < B; b++) { let d = 0; for (let i = 0; i < ny.length; i++) if (isDefect(ny[Math.floor(R() * ny.length)])) d++; rates.push(d / ny.length); }
        band = [S.quantile(rates, 0.05), S.quantile(rates, 0.95)];
      }
      scenarios.push({ name, detail, kind, mean: S.mean(ny), sd: S.sd(ny), cap: c, band });
    };
    summarise("Current process", "Baseline as measured.", yv, "baseline");
    const adjFor = (r, share) => {
      if (!model || !model.coef[r.x]) return null;
      const co = model.coef[r.x];
      if (r.kind === "categorical") {
        const lv = co.levels;
        const best = goal === "target" ? r.best.name : Object.keys(lv).sort((a, b) => goal === "lower" ? lv[a] - lv[b] : lv[b] - lv[a])[0];
        return { best, delta: rows.map(row => lv[row[r.x]] === undefined ? 0 : (lv[row[r.x]] - lv[best]) * share) };
      }
      const s = co.slope, xm = S.mean(rows.filter(row => row[r.x] !== "" && Number.isFinite(+row[r.x])).map(row => +row[r.x]));
      if (goal === "target") return { best: null, hold: true, delta: rows.map(row => Number.isFinite(+row[r.x]) && row[r.x] !== "" ? s * (+row[r.x] - xm) * share : 0) };
      if ((goal === "lower" && s <= 0) || (goal === "higher" && s >= 0)) return null;
      return { best: null, delta: rows.map(row => Number.isFinite(+row[r.x]) && row[r.x] !== "" ? s * 0.25 * (+row[r.x]) * share : 0) };
    };
    const applied = [];
    levers.forEach(r => {
      const a = adjFor(r, 1); if (!a) return;
      const ny2 = yv.map((v, i) => v - a.delta[i]);
      summarise(r.kind === "categorical" ? `Bring every ${r.x} up to ${a.best}` : a.hold ? `Hold ${r.x} steady at its average` : `Reduce ${r.x} by 25%`, r.kind === "categorical" ? `Close the gap between each ${r.x} and the best performer, ${a.best}.` : a.hold ? `Remove the variation ${r.x} passes on to the output (tighter incoming spec or in-process adjustment).` : `Lower ${r.x} by a quarter through a process change.`, ny2, "lever");
      applied.push(r);
    });
    const spreadFix = (ny, r, share) => ny.map((v, i) => { // shrink the unexplained (residual) part for wide-spread levels
      const sdl = r.spread.sds[rows[i][r.x]]; if (!sdl || !Number.isFinite(resid[i])) return v;
      const k = 1 - share * (1 - Math.min(1, r.spread.tightest.sd / sdl)); return v - resid[i] * (1 - k);
    });
    const spreadLevers = results.filter(r => r.spreadDriver && !r.symptom);
    spreadLevers.forEach(r => summarise(`Cut ${r.spread.widest.name}'s spread to ${r.spread.tightest.name}'s level`, `Reduce variation within each ${r.x} to match the most consistent one.`, spreadFix(yv, r, 1), "lever"));
    // special cause removal
    let scDays = [];
    if (dateCol && special.length) {
      scDays = special.filter(s => goal === "lower" ? s.v > chart.cl : goal === "higher" ? s.v < chart.cl : true).map(s => s.label);
      if (scDays.length) {
        const ny = yv.map((v, i) => scDays.includes(String(rows[i][dateCol]).slice(0, 10)) ? v - (series.find(s => s.label === String(rows[i][dateCol]).slice(0, 10)).v - chart.cl) : v);
        summarise("Prevent the special-cause event", `Remove the out-of-control spike on ${scDays.join(", ")}.`, ny, "special");
      }
    }
    const combine = share => {
      let ny = [...yv];
      applied.forEach(r => { const a = adjFor(r, share); if (a) ny = ny.map((v, i) => v - a.delta[i]); });
      if (scDays.length) ny = ny.map((v, i) => { const d = String(rows[i][dateCol]).slice(0, 10); return scDays.includes(d) ? v - (series.find(s => s.label === d).v - chart.cl) * share : v; });
      spreadLevers.forEach(r => { ny = spreadFix(ny, r, share); });
      return ny;
    };
    if (applied.length + spreadLevers.length + (scDays.length ? 1 : 0) > 1) summarise("Combined, full potential", "All levers above fully closed.", combine(1), "combined");
    if (applied.length || spreadLevers.length || scDays.length) { summarise("Combined, realistic target", "Half of each gap closed; a sensible 90-day goal.", combine(0.5), "realistic"); scenarios[scenarios.length - 1].ys = combine(0.5); }

    return { y, spec, goal, hasSpec, desc, ad, cap, chart, series, special, shifts, dates, results, levers: levers.concat(spreadLevers.filter(r => !levers.includes(r))), model, pareto, breachPareto, scenarios, warnings, n: rows.length, yv, scDays };
  }

  function f(v, d = 2) { if (v == null || !Number.isFinite(v)) return "–"; return Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString("en-US") : (+v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }); }
  function fp(p) { return p < 0.0001 ? "< 0.0001" : "= " + (p < 0.01 ? p.toFixed(4) : p.toFixed(3)); }
  return { parseCSV, profile, suggestY, run, f, fp, effectLabel, NO_DEFECT_RE };
})();
if (typeof module !== "undefined") module.exports = BB;
