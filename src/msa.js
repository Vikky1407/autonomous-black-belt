// ---------- Autonomous Black Belt: measurement system checks (MSA gate) ----------
// "The analysis is only as good as the gage." Before trusting a result, check the measurement itself:
// completeness, resolution, valid range and stuck/default values. For system-generated data these are
// the practical equivalents of a gage study; Gage R&R and known-standard checks need controlled test data.
const MSA = (() => {
  const S = typeof module !== "undefined" ? require("./stats.js") : window.S;

  const decimals = s => { const t = String(s).trim(); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };
  const valid = v => v !== "" && v != null && Number.isFinite(+v);

  // Features of one batch of raw values (blanks included)
  function features(raw) {
    const n = raw.length, ok = raw.filter(valid), vals = ok.map(Number);
    const counts = new Map(); vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const top = [...counts.values()].sort((a, b) => b - a)[0] || 0;
    return {
      n, nValid: ok.length,
      complete: n ? ok.length / n : 1,
      fractional: ok.length ? ok.filter(s => decimals(s) > 0 && +s % 1 !== 0).length / ok.length : 0,
      invalidRange: vals.length ? vals.filter(v => v < 0).length / vals.length : 0,
      stuck: vals.length >= 5 ? top / vals.length : 0
    };
  }

  // Analyse mode: one-off measurement system check on a whole dataset
  function check(rows, y, opts = {}) {
    const raw = rows.map(r => r[y]), ft = features(raw), vals = raw.filter(valid).map(Number);
    const sd = vals.length > 1 ? S.sd(vals) : 0;
    const uniq = [...new Set(vals)].sort((a, b) => a - b);
    let inc = Infinity; for (let i = 1; i < uniq.length; i++) inc = Math.min(inc, uniq[i] - uniq[i - 1]);
    if (!Number.isFinite(inc) || inc <= 0) inc = Math.pow(10, -Math.max(0, ...raw.filter(valid).map(decimals)));
    const decs = raw.filter(valid).map(decimals), modeDec = decs.sort((a, b) => decs.filter(d => d === b).length - decs.filter(d => d === a).length)[0] || 0;
    const step = Math.pow(10, -modeDec);
    const tol = Number.isFinite(opts.usl) && Number.isFinite(opts.lsl) ? opts.usl - opts.lsl : 6 * sd;
    const ratio = step > 0 ? tol / step : Infinity;   // how many measurement steps fit across the variation (10:1 rule)
    const items = [];
    const add = (name, status, value, detail) => items.push({ name, status, value, detail });
    add("Operational definition", opts.definition ? "ok" : "warn", opts.definition ? "Defined" : "Not defined",
      opts.definition ? opts.definition : "Write down exactly what starts and stops the measurement, so every record means the same thing.");
    add("Resolution (10:1 rule)", ratio >= 10 ? "ok" : "bad", ratio >= 1000 ? "1000+ steps" : `${Math.round(ratio)} steps`,
      `Values are recorded to ${modeDec === 0 ? "whole units" : modeDec + " decimal place" + (modeDec > 1 ? "s" : "")}. The ${Number.isFinite(opts.usl) && Number.isFinite(opts.lsl) ? "tolerance" : "process spread (6σ)"} covers ${ratio >= 1000 ? "more than 1000" : Math.round(ratio)} measurement steps; at least 10 are needed to see real differences.`);
    add("Completeness", ft.complete >= 0.98 ? "ok" : ft.complete >= 0.9 ? "warn" : "bad", (ft.complete * 100).toFixed(1) + "%",
      `${ft.n - ft.nValid} of ${ft.n} records have no usable value.`);
    add("Valid range", ft.invalidRange === 0 ? "ok" : "bad", ft.invalidRange === 0 ? "No impossible values" : (ft.invalidRange * 100).toFixed(1) + "% negative",
      ft.invalidRange === 0 ? "No negative values found." : "Negative values are impossible for this kind of measure: check the timestamps or formula.");
    add("Stuck or default values", ft.stuck <= 0.1 || ratio < 30 ? "ok" : "warn", (ft.stuck * 100).toFixed(1) + "% at one value",
      ft.stuck <= 0.1 ? "No single value dominates." : "One value appears unusually often, a sign of a default or copied value.");
    const worst = items.some(i => i.status === "bad") ? "bad" : items.some(i => i.status === "warn") ? "warn" : "ok";
    return { items, verdict: worst, step, ratio };
  }

  // Live Monitor: learn the measurement baseline, then check each new day against it
  function baseline(days, y) {
    const fs = days.map(d => features(d.raw.map(r => r[y])));
    const avg = k => S.mean(fs.map(f => f[k]));
    const vol = fs.map(f => f.n);
    return { complete: avg("complete"), fractional: avg("fractional"), invalidRange: avg("invalidRange"), stuck: avg("stuck"), volMean: S.mean(vol), volSd: Math.max(S.sd(vol), Math.sqrt(S.mean(vol))) };
  }
  function dayCheck(raw, y, b) {
    const f = features(raw.map(r => r[y])), n = Math.max(1, f.n), alerts = [];
    const pLim = (p, k) => Math.max(0.12, 3 * Math.sqrt(Math.max(p * (1 - p), 0.01) / n));   // binomial limit, with a floor against tiny days
    if (b.complete - f.complete > pLim(b.complete)) alerts.push({ k: "Completeness", text: `only ${(f.complete * 100).toFixed(0)}% of records have a value (baseline ${(b.complete * 100).toFixed(0)}%)` });
    if (Math.abs(f.fractional - b.fractional) > pLim(b.fractional)) alerts.push({ k: "Resolution", text: `${(f.fractional * 100).toFixed(0)}% of values have decimals (baseline ${(b.fractional * 100).toFixed(0)}%): the recording precision changed` });
    if (f.invalidRange - b.invalidRange > pLim(b.invalidRange)) alerts.push({ k: "Valid range", text: `${(f.invalidRange * 100).toFixed(0)}% impossible (negative) values` });
    if (f.stuck - b.stuck > Math.max(0.25, pLim(b.stuck))) alerts.push({ k: "Stuck values", text: `${(f.stuck * 100).toFixed(0)}% of records share one value (baseline ${(b.stuck * 100).toFixed(0)}%)` });
    if (Math.abs(f.n - b.volMean) > 4 * b.volSd) alerts.push({ k: "Volume", text: `${f.n} records today against about ${Math.round(b.volMean)} normally: records may be missing or duplicated` });
    return { f, alerts };
  }

  // Change log: "YYYY-MM-DD description", one per line
  function parseChanges(text) {
    return String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*[-:,]?\s*(.*)$/); return m ? { date: m[1], text: m[2] || "Unnamed change" } : null; }).filter(Boolean);
  }

  return { features, check, baseline, dayCheck, parseChanges };
})();
if (typeof module !== "undefined") module.exports = MSA; else window.MSA = MSA;
