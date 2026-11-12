// ---------- Autonomous Black Belt: SVG charts (theme-aware via CSS classes) ----------
const Charts = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nice = (lo, hi, n = 5) => {
    const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = []; for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10)); return ticks;
  };
  const fmt = v => Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : +v.toFixed(1);
  const wrap = (w, h, body, label) => `<div class="chart-box"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="chart">${body}</svg></div>`;

  function histogram(y, { usl, lsl, mean, sd, overlay, labels = ["Current", "After"] } = {}) {
    const W = 640, H = 260, L = 44, R = 16, T = 18, B = 34;
    const all = overlay ? y.concat(overlay) : y;
    let lo = Math.min(...all), hi = Math.max(...all);
    if (Number.isFinite(usl)) hi = Math.max(hi, usl); if (Number.isFinite(lsl)) lo = Math.min(lo, lsl);
    const bins = Math.min(32, Math.max(10, Math.round(Math.sqrt(y.length)))), bw = (hi - lo) / bins || 1;
    const count = a => { const c = new Array(bins).fill(0); a.forEach(v => c[Math.min(bins - 1, Math.floor((v - lo) / bw))]++); return c; };
    const c1 = count(y), c2 = overlay ? count(overlay) : null, maxC = Math.max(...c1, ...(c2 || [0]));
    const xs = v => L + (v - lo) / (hi - lo) * (W - L - R), ys = c => H - B - c / maxC * (H - T - B);
    let s = "";
    nice(0, maxC, 4).filter(t => t <= maxC).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${L - 6}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`; });
    nice(lo, hi, 6).filter(t => t >= lo && t <= hi).forEach(t => { s += `<text class="tick" x="${xs(t)}" y="${H - B + 16}" text-anchor="middle">${fmt(t)}</text>`; });
    const bar = (c, cls) => c.map((v, i) => v ? `<rect class="${cls}" x="${xs(lo + i * bw) + 1}" y="${ys(v)}" width="${Math.max(1, xs(lo + bw) - xs(lo) - 2)}" height="${H - B - ys(v)}" rx="1.5"/>` : "").join("");
    s += bar(c1, overlay ? "bar-muted" : "bar") + (c2 ? bar(c2, "bar") : "");
    if (!overlay && Number.isFinite(sd) && sd > 0) {
      let d = ""; for (let i = 0; i <= 80; i++) { const v = lo + (hi - lo) * i / 80, pdf = Math.exp(-0.5 * ((v - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)); d += (i ? "L" : "M") + xs(v).toFixed(1) + " " + ys(pdf * y.length * bw).toFixed(1); }
      s += `<path class="curve" d="${d}"/>`;
    }
    [[usl, "USL"], [lsl, "LSL"]].forEach(([v, n]) => { if (Number.isFinite(v)) s += `<line class="limit" x1="${xs(v)}" x2="${xs(v)}" y1="${T - 6}" y2="${H - B}"/><text class="limit-label" x="${xs(v) - 4}" y="${T + 4}" text-anchor="end">${n} ${fmt(v)}</text>`; });
    s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
    if (overlay) { const lx = W - R - 230; s += `<rect class="bar-muted" x="${lx}" y="${T}" width="10" height="10"/><text class="tick" x="${lx + 14}" y="${T + 9}">${labels[0]}</text><rect class="bar" x="${lx + 90}" y="${T}" width="10" height="10"/><text class="tick" x="${lx + 104}" y="${T + 9}">${labels[1]}</text>`; }
    return wrap(W, H, s, "Histogram");
  }

  function control(series, { cl, ucl, lcl }, title) {
    const W = 640, H = 250, L = 44, R = 58, T = 14, B = 34, v = series.map(p => p.v);
    let lo = Math.min(...v, lcl), hi = Math.max(...v, ucl); const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const xs = i => L + i / Math.max(1, series.length - 1) * (W - L - R), ys = y => T + (hi - y) / (hi - lo) * (H - T - B);
    let s = "";
    nice(lo, hi, 4).filter(t => t >= lo && t <= hi).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${L - 6}" y="${ys(t) + 4}" text-anchor="end">${fmt(t)}</text>`; });
    [[ucl, "UCL", "limit"], [cl, "CL", "centre"], [lcl, "LCL", "limit"]].forEach(([y, n, c]) => { if (y > lo && y < hi) s += `<line class="${c}" x1="${L}" x2="${W - R}" y1="${ys(y)}" y2="${ys(y)}"/><text class="${c}-label" x="${W - R + 4}" y="${ys(y) + 4}">${n} ${fmt(y)}</text>`; });
    s += `<path class="series" d="${series.map((p, i) => (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1)).join("")}"/>`;
    series.forEach((p, i) => { const bad = p.flags && p.flags.length; s += `<circle class="${bad ? "pt-bad" : "pt"}" cx="${xs(i)}" cy="${ys(p.v)}" r="${bad ? 4.5 : 2.4}"><title>${esc(p.label)}: ${fmt(p.v)}${bad ? " (rule " + p.flags.join(", ") + ")" : ""}</title></circle>`; });
    const lab = [0, Math.floor(series.length / 2), series.length - 1];
    lab.forEach(i => s += `<text class="tick" x="${xs(i)}" y="${H - B + 16}" text-anchor="${i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}">${esc(series[i].label)}</text>`);
    return wrap(W, H, s, title || "Control chart");
  }

  function interval(levels, { overall, best, worst, usl, lsl } = {}) {
    const W = 640, rowH = 34, L = 150, R = 104, T = 24, B = 30, H = T + B + levels.length * rowH;
    let lo = Math.min(...levels.map(l => l.lo)), hi = Math.max(...levels.map(l => l.hi));
    const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad;
    const xs = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let s = "";
    nice(lo, hi, 5).filter(t => t >= lo && t <= hi).forEach(t => { s += `<line class="grid" x1="${xs(t)}" x2="${xs(t)}" y1="${T - 8}" y2="${H - B}"/><text class="tick" x="${xs(t)}" y="${H - B + 16}" text-anchor="middle">${fmt(t)}</text>`; });
    if (Number.isFinite(overall)) s += `<line class="centre" x1="${xs(overall)}" x2="${xs(overall)}" y1="${T - 12}" y2="${H - B}"/><text class="centre-label" x="${xs(overall)}" y="${T - 14}" text-anchor="middle">overall ${fmt(overall)}</text>`;
    levels.forEach((l, i) => {
      const y = T + i * rowH + rowH / 2, cls = l.name === worst ? "pt-bad" : l.name === best ? "pt-good" : "pt";
      s += `<text class="cat" x="${L - 10}" y="${y + 4}" text-anchor="end">${esc(String(l.name).slice(0, 22))}</text>`;
      s += `<line class="ci" x1="${xs(l.lo)}" x2="${xs(l.hi)}" y1="${y}" y2="${y}"/><line class="ci" x1="${xs(l.lo)}" x2="${xs(l.lo)}" y1="${y - 5}" y2="${y + 5}"/><line class="ci" x1="${xs(l.hi)}" x2="${xs(l.hi)}" y1="${y - 5}" y2="${y + 5}"/>`;
      s += `<circle class="${cls}" cx="${xs(l.mean)}" cy="${y}" r="5.5"><title>${esc(l.name)}: mean ${fmt(l.mean)}, 95% CI ${fmt(l.lo)}–${fmt(l.hi)}, n=${l.n}</title></circle>`;
      s += `<text class="tick" x="${W - R + 8}" y="${y + 4}">${fmt(l.mean)} · n ${l.n}</text>`;
    });
    return wrap(W, H, s, "Interval plot of group means");
  }

  function scatter(pts, { slope, intercept, xLabel }) {
    const W = 640, H = 260, L = 44, R = 16, T = 14, B = 38;
    const xv = pts.map(p => p[0]), yv = pts.map(p => p[1]);
    const lx = Math.min(...xv), hx = Math.max(...xv), ly = Math.min(...yv), hy = Math.max(...yv);
    const xs = v => L + (v - lx) / (hx - lx || 1) * (W - L - R), ys = v => T + (hy - v) / (hy - ly || 1) * (H - T - B);
    let s = "";
    nice(ly, hy, 4).filter(t => t >= ly && t <= hy).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${L - 6}" y="${ys(t) + 4}" text-anchor="end">${fmt(t)}</text>`; });
    nice(lx, hx, 5).filter(t => t >= lx && t <= hx).forEach(t => { s += `<text class="tick" x="${xs(t)}" y="${H - B + 16}" text-anchor="middle">${fmt(t)}</text>`; });
    const step = Math.max(1, Math.floor(pts.length / 900));
    pts.forEach((p, i) => { if (i % step === 0) s += `<circle class="dot" cx="${xs(p[0]).toFixed(1)}" cy="${ys(p[1]).toFixed(1)}" r="2.2"/>`; });
    const yA = intercept + slope * lx, yB = intercept + slope * hx;
    s += `<line class="fit" x1="${xs(lx)}" y1="${ys(yA)}" x2="${xs(hx)}" y2="${ys(yB)}"/>`;
    s += `<text class="tick" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(xLabel)}</text>`;
    return wrap(W, H, s, "Scatter plot");
  }

  function pareto(items, title) {
    items = items.slice(0, 10);
    const W = 640, H = 270, L = 44, R = 44, T = 14, B = 66, max = Math.max(...items.map(i => i.count), 1);
    const bw = (W - L - R) / items.length, ys = c => T + (1 - c / max) * (H - T - B), yp = p => T + (1 - p) * (H - T - B);
    let s = "";
    nice(0, max, 4).filter(t => t <= max).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${L - 6}" y="${ys(t) + 4}" text-anchor="end">${t}</text>`; });
    [0, 0.5, 0.8, 1].forEach(p => s += `<text class="tick" x="${W - R + 6}" y="${yp(p) + 4}">${p * 100}%</text>`);
    s += `<line class="centre" x1="${L}" x2="${W - R}" y1="${yp(0.8)}" y2="${yp(0.8)}"/>`;
    items.forEach((it, i) => {
      const x = L + i * bw;
      s += `<rect class="${it.cum - it.count / (items.reduce((a, b) => a + b.count, 0) || 1) < 0.8 ? "bar" : "bar-muted"}" x="${x + 4}" y="${ys(it.count)}" width="${bw - 8}" height="${H - B - ys(it.count)}" rx="2"><title>${esc(it.name)}: ${it.count}</title></rect>`;
      s += `<text class="tick" x="${x + bw / 2}" y="${ys(it.count) - 5}" text-anchor="middle">${it.count}</text>`;
      const words = String(it.name).split(" "), l1 = [], l2 = []; words.forEach(w => (l1.join(" ").length + w.length < 13 && !l2.length ? l1 : l2).push(w));
      s += `<text class="cat" x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle">${esc(l1.join(" "))}</text>`;
      if (l2.length) s += `<text class="cat" x="${x + bw / 2}" y="${H - B + 30}" text-anchor="middle">${esc(l2.join(" ").slice(0, 14))}</text>`;
    });
    s += `<path class="cum" d="${items.map((it, i) => (i ? "L" : "M") + (L + i * bw + bw / 2).toFixed(1) + " " + yp(it.cum).toFixed(1)).join("")}"/>`;
    items.forEach((it, i) => s += `<circle class="cum-pt" cx="${L + i * bw + bw / 2}" cy="${yp(it.cum)}" r="3"/>`);
    s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
    return wrap(W, H, s, title || "Pareto chart");
  }

  // live control chart: fixed x-range for the whole feed, shaded baseline, incident markers
  function live(seen, { cl, ucl, lcl }, total, baseN, incidents = [], spec = {}) {
    const W = 760, H = 260, L = 44, R = 64, T = 22, B = 30, v = seen.map(p => p.v);
    let lo = Math.min(...v, lcl), hi = Math.max(...v, ucl);
    if (Number.isFinite(spec.usl) && spec.usl < hi * 1.4) hi = Math.max(hi, spec.usl);
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const xs = i => L + i / Math.max(1, total - 1) * (W - L - R), ys = y => T + (hi - y) / (hi - lo) * (H - T - B);
    let s = `<rect class="base-zone" x="${L}" y="${T}" width="${xs(baseN - 1) - L}" height="${H - T - B}"/><text class="tick" x="${L + 6}" y="${T + 12}">baseline</text>`;
    nice(lo, hi, 4).filter(t => t >= lo && t <= hi).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${L - 6}" y="${ys(t) + 4}" text-anchor="end">${fmt(t)}</text>`; });
    incidents.forEach(inc => { const i = seen.findIndex(p => p.date === inc.opened); if (i >= 0) s += `<line class="inc-line" x1="${xs(i)}" x2="${xs(i)}" y1="${T}" y2="${H - B}"/><text class="inc-label" x="${xs(i) + 4}" y="${T + 12}">#${inc.id}</text>`; });
    [[ucl, "UCL", "limit"], [cl, "CL", "centre"], [lcl, "LCL", "limit"]].forEach(([y, n, c]) => { if (y > lo && y < hi) s += `<line class="${c}" x1="${L}" x2="${W - R}" y1="${ys(y)}" y2="${ys(y)}"/><text class="${c}-label" x="${W - R + 4}" y="${ys(y) + 4}">${n} ${fmt(y)}</text>`; });
    if (Number.isFinite(spec.usl) && spec.usl > lo && spec.usl < hi) s += `<line class="spec" x1="${L}" x2="${W - R}" y1="${ys(spec.usl)}" y2="${ys(spec.usl)}"/><text class="spec-label" x="${W - R + 4}" y="${ys(spec.usl) + 4}">USL ${fmt(spec.usl)}</text>`;
    s += `<path class="series" d="${seen.map((p, i) => (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1)).join("")}"/>`;
    seen.forEach((p, i) => { const bad = p.flags && p.flags.length; if (bad || i === seen.length - 1) s += `<circle class="${bad ? "pt-bad" : "pt-now"}" cx="${xs(i)}" cy="${ys(p.v)}" r="${bad ? 4.5 : 4}"><title>${esc(p.date)}: ${fmt(p.v)}</title></circle>`; });
    s += `<text class="tick" x="${L}" y="${H - 8}">${esc(seen[0].date)}</text><text class="tick" x="${xs(seen.length - 1)}" y="${H - 8}" text-anchor="middle">${esc(seen[seen.length - 1].date)}</text>`;
    return wrap(W, H, s, "Live control chart");
  }

  function spark(points, base, status) {
    const W = 260, H = 64, L = 4, R = 4, T = 8, B = 8, vals = points.map(p => p.v).concat(base);
    const lo = Math.min(...vals, 0), hi = Math.max(...vals) * 1.15 || 1;
    const xs = i => L + i / Math.max(1, points.length - 1) * (W - L - R), ys = y => T + (hi - y) / (hi - lo) * (H - T - B);
    let s = `<line class="centre" x1="${L}" x2="${W - R}" y1="${ys(base)}" y2="${ys(base)}"/>`;
    if (points.length > 1) s += `<path class="spark-area ${status}" d="M${xs(0)} ${ys(lo)}${points.map((p, i) => "L" + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1)).join("")}L${xs(points.length - 1)} ${ys(lo)}Z"/><path class="spark ${status}" d="${points.map((p, i) => (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1)).join("")}"/>`;
    if (points.length) s += `<circle class="spark-end ${status}" cx="${xs(points.length - 1)}" cy="${ys(points[points.length - 1].v)}" r="3.5"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart spark-svg" role="img" aria-label="Trend">${s}</svg>`;
  }

  return { histogram, control, interval, scatter, pareto, live, spark, esc };
})();
