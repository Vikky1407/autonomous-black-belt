// ---------- Autonomous Black Belt: Live Monitor engine ----------
// Watches a process day by day against a fixed customer spec. Learns a baseline, detects deviations
// (total and per critical X), diagnoses where they come from, re-runs the analysis, writes an action plan,
// and tracks whether each critical X is improving. Pure logic: the interface lives in monitor-ui.js.
const Mon = (() => {
  const S = typeof module !== "undefined" ? require("./stats.js") : window.S;
  const BB = typeof module !== "undefined" ? require("./engine.js") : window.BB;
  const f = BB.f, mean = S.mean, sd = a => a.length > 1 ? S.sd(a) : 0;

  function create(rowsIn, cfg) {
    const { y, dateCol, spec } = cfg, baselineDays = cfg.baselineDays || 30;
    const rows = rowsIn.filter(r => r[y] !== "" && Number.isFinite(+r[y]) && r[dateCol]);
    const byDay = new Map();
    rows.forEach(r => { const d = String(r[dateCol]).slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); });
    const days = [...byDay.keys()].sort().map(d => ({ date: d, rows: byDay.get(d) }));
    if (days.length < baselineDays + 10) throw new Error(`The feed needs at least ${baselineDays + 10} days of data (found ${days.length}).`);
    const goal = Number.isFinite(spec.usl) && Number.isFinite(spec.lsl) ? "target" : Number.isFinite(spec.lsl) ? "higher" : "lower";
    const isDefect = v => (Number.isFinite(spec.usl) && v > spec.usl) || (Number.isFinite(spec.lsl) && v < spec.lsl);
    const bad = d => goal === "higher" ? -d : goal === "lower" ? d : Math.abs(d); // positive = worse

    // baseline
    const base = days.slice(0, baselineDays), baseRows = base.flatMap(d => d.rows), baseVals = baseRows.map(r => +r[y]);
    const series = base.map(d => mean(d.rows.map(r => +r[y])));
    const limits = S.imr(series);
    const types = cfg.types;
    const xs = (cfg.xs || []).filter(x => types[x] === "categorical");
    const levelBase = {};
    xs.forEach(x => {
      levelBase[x] = {};
      const g = new Map(); baseRows.forEach(r => { if (!g.has(r[x])) g.set(r[x], []); g.get(r[x]).push(+r[y]); });
      g.forEach((a, k) => { if (a.length >= 30) levelBase[x][k] = { mean: mean(a), sd: sd(a), n: a.length }; });
    });
    const baseRun = BB.run(baseRows, { y, xs: cfg.xs, spec, dateCol, types });
    const critical = baseRun.levers.filter(l => l.kind === "categorical" && !l.symptom);
    const baseCap = S.capability(baseVals, spec);
    const st = {
      cfg: { ...cfg, baselineDays }, y, dateCol, spec, goal, isDefect, bad, days, idx: baselineDays, limits, xs, levelBase, baseRun, critical, baseRows,
      baseMean: mean(baseVals), basePct: baseCap.observedPct, baseSigma: baseCap.sigmaLevel,
      seen: base.map((d, i) => ({ date: d.date, v: series[i], n: d.rows.length, pOut: d.rows.filter(r => isDefect(+r[y])).length / d.rows.length, flags: [], base: true })),
      incidents: [], open: null, quiet: 0, tracker: [], log: [], explained: new Set()
    };
    st.tracker = critical.map((c, i) => { const b = impact(baseRows, c.x, y, goal); return { x: c.x, base: b.v, best: b.best, baseSE: impactSE(baseRows, c.x, y, goal, b.best, 11 + i), points: [], status: "Watching" }; });
    return st;
  }

  // Average extra time (or shortfall) per case caused by an X: how far each level sits from the baseline's best level,
  // weighted by volume. It falls when the gap closes or when work moves to better levels.
  function impact(rows, x, y, goal, bestLevel) {
    const g = new Map(); rows.forEach(r => { if (!g.has(r[x])) g.set(r[x], []); g.get(r[x]).push(+r[y]); });
    const lv = [...g].filter(([, a]) => a.length >= 3).map(([k, a]) => ({ k, m: mean(a), n: a.length }));
    if (lv.length < 2) return null;
    if (!bestLevel) bestLevel = [...lv].sort((a, b) => goal === "higher" ? b.m - a.m : a.m - b.m)[0].k;
    const best = lv.find(l => l.k === bestLevel); if (!best) return null;
    const N = lv.reduce((s, l) => s + l.n, 0);
    return { v: lv.reduce((s, l) => s + l.n / N * Math.max(0, goal === "higher" ? best.m - l.m : l.m - best.m), 0), best: bestLevel };
  }

  // bootstrap standard error of the impact, so the tracker only calls a change when it is bigger than the noise
  function impactSE(rows, x, y, goal, best, seed) {
    const R = S.rng(seed), vals = [];
    for (let b = 0; b < 60; b++) { const smp = rows.map(() => rows[Math.floor(R() * rows.length)]); const i = impact(smp, x, y, goal, best); if (i) vals.push(i.v); }
    return vals.length > 10 ? sd(vals) : Infinity;
  }

  function step(st) {
    if (st.idx >= st.days.length) return null;
    const day = st.days[st.idx++], y = st.y, vals = day.rows.map(r => +r[y]);
    const point = { date: day.date, v: mean(vals), n: vals.length, pOut: vals.filter(st.isDefect).length / vals.length, flags: [] };
    st.seen.push(point);
    const L = st.limits, signals = [];
    if (point.v > L.ucl || point.v < L.lcl) { point.flags.push(1); if (st.bad(point.v - L.cl) > 0) signals.push({ kind: "total", text: `Daily average ${f(point.v, 1)}${st.cfg.unit || ""} is beyond the control limit (${f(point.v > L.ucl ? L.ucl : L.lcl, 1)}).` }); }
    const last9 = st.seen.slice(-9);
    if (last9.length === 9 && !last9.some(p => p.base) && (last9.every(p => p.v > L.cl) || last9.every(p => p.v < L.cl)) && st.bad(point.v - L.cl) > 0) { point.flags.push(2); signals.push({ kind: "shift", text: `Nine days in a row on the bad side of the centre line: the average has shifted.` }); }
    // stratified check: every level of every critical input against its own baseline (last 5 days)
    if (point.flags.includes(1)) st.explained.add(day.date);   // days already explained by a total special cause
    const recent = st.days.slice(Math.max(st.cfg.baselineDays, st.idx - 5), st.idx).filter(d => !st.explained.has(d.date)).flatMap(d => d.rows);
    let local = null;
    st.xs.forEach(x => {
      const lv = Object.entries(st.levelBase[x]).map(([lvl, b]) => { const a = recent.filter(r => r[x] === lvl).map(r => +r[y]); return a.length >= 8 && b.sd ? { lvl, b, a, shift: st.bad(mean(a) - b.mean) } : null; }).filter(Boolean);
      if (lv.length < 2) return;
      lv.forEach(l => {
        const peers = lv.filter(o => o !== l).map(o => o.shift).sort((p, q) => p - q), med = peers[Math.floor(peers.length / 2)];
        const rel = l.shift - Math.max(0, med), z = rel / (l.b.sd / Math.sqrt(l.a.length));   // must stand out from its peers, not just from its past
        if (z > 4 && rel > 0 && (!local || z > local.z)) local = { x, lvl: l.lvl, z, m: mean(l.a), base: l.b.mean, n: l.a.length, rel };
      });
    });
    if (local) signals.push({ kind: "local", x: local.x, lvl: local.lvl, text: `${String(local.lvl).toLowerCase().startsWith(local.x.toLowerCase()) ? local.lvl : local.x + " " + local.lvl} has averaged ${f(local.m, 1)}${st.cfg.unit || ""} over the last 5 days against ${f(local.base, 1)}${st.cfg.unit || ""} in its baseline (${f(local.rel, 1)} worse than its peers moved, z = ${f(local.z, 1)}).` });

    const events = [];
    if (signals.length && !st.open) { st.open = openIncident(st, day, signals, local); st.quiet = 0; events.push({ type: "incident", incident: st.open }); }
    else if (signals.length && st.open) { st.open.days.push(day.date); st.quiet = 0; }
    else if (st.open && ++st.quiet >= 3) { st.open.closed = day.date; st.open.daysOpen = st.open.days.length; events.push({ type: "recovered", incident: st.open }); st.open = null; }

    // tracker: rolling 10-day impact of each critical X
    if ((st.idx - st.cfg.baselineDays) % 5 === 0) {
      const win = st.days.slice(Math.max(st.cfg.baselineDays, st.idx - 20), st.idx).filter(d => !st.explained.has(d.date)).flatMap(d => d.rows);
      st.tracker.forEach(t => {
        const imp = impact(win, t.x, y, st.goal, t.best); if (imp == null) return;
        t.points.push({ date: day.date, v: imp.v });
        const daysIn = st.idx - st.cfg.baselineDays, se = Math.hypot(t.baseSE, impactSE(win, t.x, y, st.goal, t.best, st.idx)), diff = imp.v - t.base;
        t.status = daysIn < 15 ? "Watching" : diff < -2 * se ? "Improving" : diff > 2 * se ? "Worse" : "Stable";
      });
    }
    return { point, signals, events };
  }

  function openIncident(st, day, signals, local) {
    const y = st.y, win = signals.some(s => s.kind === "total") ? day.rows : st.days.slice(Math.max(st.cfg.baselineDays, st.idx - 5), st.idx).flatMap(d => d.rows);
    // where did it come from? compare every input's levels in the deviation window with the baseline
    const diag = st.xs.map(x => {
      const lv = Object.entries(st.levelBase[x]).map(([k, b]) => { const a = win.filter(r => r[x] === k).map(r => +r[y]); return a.length ? { k, shift: st.bad(mean(a) - b.mean), share: a.length / win.length, n: a.length } : null; }).filter(Boolean);
      if (lv.length < 2) return null;
      const contrib = lv.map(l => ({ ...l, c: l.share * Math.max(0, l.shift) })), tot = contrib.reduce((s, l) => s + l.c, 0) || 1e-9;
      const top = [...contrib].sort((a, b) => b.c - a.c)[0], others = contrib.filter(l => l !== top).map(l => l.shift).sort((a, b) => a - b);
      const med = others[Math.floor(others.length / 2)];
      return { x, top, concentration: top.c / tot, ratio: top.shift / Math.max(1, med), levels: contrib };
    }).filter(Boolean);
    const name = (x, lvl) => String(lvl).toLowerCase().startsWith(String(x).toLowerCase()) ? lvl : `${x} ${lvl}`;
    let where;
    const loc = local ? diag.find(d => d.x === local.x) : [...diag].sort((a, b) => b.concentration - a.concentration).find(d => d.concentration > 0.5 && d.ratio > 2.5);
    if (local || loc) {
      const x = local ? local.x : loc.x, lvl = local ? local.lvl : loc.top.k, d = diag.find(q => q.x === x), lvlInfo = d && d.levels.find(l => l.k === lvl);
      where = { type: "local", x, lvl, text: `Localised to <b>${name(x, lvl)}</b>: it is running ${f(lvlInfo ? lvlInfo.shift : local.m - local.base, 1)}${st.cfg.unit || ""} worse than its own baseline, while the other ${x === "Team" ? "teams" : "groups"} are close to normal.` };
    } else {
      const spread = diag.map(d => `${d.x}`).slice(0, 3).join(", ");
      where = { type: "system", text: `<b>System-wide</b>: every group (${spread}) slowed by a similar amount, so the cause is something they all share, such as a system, an upstream feed or staffing across the whole operation.` };
    }
    // re-run the full analysis on the most recent 30 days
    const recentRows = st.days.slice(Math.max(0, st.idx - 30), st.idx).flatMap(d => d.rows);
    let rerun = null; try { rerun = BB.run(recentRows, { y, xs: st.cfg.xs, spec: st.spec, dateCol: st.dateCol, types: st.cfg.types }); } catch (e) { }
    const vital = rerun ? rerun.levers.filter(l => l.verdict === "Vital X").map(l => l.x) : [];
    const newX = vital.filter(x => !st.critical.some(c => c.x === x));
    const owners = st.cfg.owners || ["Process owner", "Tower lead", "Operations head"];
    const plan = where.type === "local" ? [
      ["Contain", `Move new work from ${where.lvl} to the best-performing ${where.x.toLowerCase()} until it recovers.`, owners[0], "Today"],
      ["Find the cause", `Go to ${where.lvl}: what changed since ${day.date}? People, method, system or volume mix.`, owners[1], "24 hours"],
      ["Fix and standardise", `Coach ${where.lvl} to the standard work of the best performer; close any training gap.`, owners[1], "1 week"],
      ["Verify", `The monitor confirms recovery when ${where.lvl} is back within its own baseline for 3 days.`, "Autonomous Black Belt", "Automatic"]
    ] : [
      ["Contain", `Prioritise the backlog from ${day.date} and protect cases closest to the ${Number.isFinite(st.spec.usl) ? "limit" : "spec"}.`, owners[0], "Today"],
      ["Find the cause", `Check shared systems and inputs (ERP and workflow logs, upstream feeds, attendance) for ${day.date}.`, "IT application owner", "24 hours"],
      ["Communicate", `Tell affected customers or suppliers about delays and expected recovery.`, owners[1], "48 hours"],
      ["Prevent", `Add a health alert on the failing system so the next event is caught before cases age.`, owners[2] || owners[0], "1 week"]
    ];
    const inc = {
      id: st.incidents.length + 1, opened: day.date, days: [day.date], signals, where, plan, vital, newX,
      recentPct: rerun && rerun.cap ? rerun.cap.observedPct : null, owners,
      sent: owners.map((o, i) => ({ to: o, channel: i === 0 ? "Teams" : "Email", at: day.date }))
    };
    st.incidents.push(inc);
    return inc;
  }

  function kpis(st) {
    const after = st.days.slice(Math.max(0, st.idx - 20), st.idx).flatMap(d => d.rows).map(r => +r[st.y]);
    const cap = after.length > 20 ? S.capability(after, st.spec) : null;
    const last = st.seen[st.seen.length - 1];
    return { date: last.date, today: last.v, todayPct: last.pOut, pct20: cap ? cap.observedPct : null, sigma20: cap ? cap.sigmaLevel : null, done: st.idx - st.cfg.baselineDays, total: st.days.length - st.cfg.baselineDays };
  }

  return { create, step, kpis, impact };
})();
if (typeof module !== "undefined") module.exports = Mon; else window.Mon = Mon;
