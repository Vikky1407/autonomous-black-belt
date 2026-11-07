// ---------- Autonomous Black Belt: user interface ----------
(() => {
  const $ = id => document.getElementById(id), esc = Charts.esc, f = BB.f, fp = BB.fp;
  const st = { rows: null, prof: null, source: "", res: null, xs: new Set(), demo: false, biz: { volume: 60000, cost: 35 } };

  // ---------- data loading ----------
  function loadRows(rows, source, demo) {
    st.rows = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])));
    st.prof = BB.profile(st.rows); st.source = source; st.demo = demo;
    const y = BB.suggestY(st.prof);
    if (!y) return showErr("No numeric column found to use as the output (Y). Add a measured value such as cycle time, cost or defects per unit.");
    const ySel = $("ySel"); ySel.innerHTML = st.prof.filter(c => c.type === "continuous").map(c => `<option${c.name === y ? " selected" : ""}>${esc(c.name)}</option>`).join("");
    const dates = st.prof.filter(c => c.type === "date");
    $("dSel").innerHTML = `<option value="">None (use row order)</option>` + dates.map((c, i) => `<option${i === 0 ? " selected" : ""}>${esc(c.name)}</option>`).join("");
    $("usl").value = demo ? 48 : ""; $("lsl").value = ""; $("unit").value = demo ? "hours" : /hr|hour/i.test(y) ? "hours" : /min/i.test(y) ? "minutes" : /day/i.test(y) ? "days" : "";
    resetXs(); renderSource(); run();
  }
  function resetXs() {
    const y = $("ySel").value; st.xs = new Set(st.prof.filter(c => c.name !== y && (c.type === "categorical" || c.type === "continuous")).map(c => c.name));
    renderChips();
  }
  function renderChips() {
    const y = $("ySel").value;
    $("xChips").innerHTML = st.prof.filter(c => c.name !== y && (c.type === "categorical" || c.type === "continuous")).map(c =>
      `<button type="button" class="chip-t" data-x="${esc(c.name)}" aria-pressed="${st.xs.has(c.name)}">${esc(c.name)}<small>${c.type === "continuous" ? "num" : c.unique + " lv"}</small></button>`).join("");
  }
  function renderSource() {
    const n = st.rows.length, c = st.prof.length, skipped = st.prof.filter(p => p.type === "identifier").map(p => p.name);
    $("source").innerHTML = `<b>${esc(st.source)}</b> · ${n.toLocaleString("en-US")} rows · ${c} columns` + (skipped.length ? ` · ID columns ignored: ${esc(skipped.join(", "))}` : "");
  }
  function showErr(m) { const e = $("err"); e.textContent = m; e.hidden = !m; }

  $("demoBtn").onclick = () => loadRows(makeDemoData(S), "Sample: accounts-payable invoices (synthetic)", true);
  $("fileIn").onchange = e => readFile(e.target.files[0]);
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => { e.preventDefault(); const fl = e.dataTransfer.files[0]; if (fl) readFile(fl); });
  function readFile(file) {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { try { showErr(""); loadRows(BB.parseCSV(rd.result), file.name, false); } catch (err) { showErr("Couldn't read that file: " + err.message); } };
    rd.readAsText(file);
  }
  $("ySel").onchange = () => { resetXs(); run(); };
  $("xChips").onclick = e => { const b = e.target.closest("[data-x]"); if (!b) return; const x = b.dataset.x; st.xs.has(x) ? st.xs.delete(x) : st.xs.add(x); b.setAttribute("aria-pressed", st.xs.has(x)); };
  $("runBtn").onclick = run;

  // ---------- run ----------
  function run() {
    if (!st.rows) return;
    showErr("");
    const num = id => { const v = $(id).value.trim(); return v === "" ? NaN : +v; };
    const spec = { usl: num("usl"), lsl: num("lsl") };
    if (Number.isFinite(spec.usl) && Number.isFinite(spec.lsl) && spec.lsl >= spec.usl) return showErr("The lower spec must be smaller than the upper spec.");
    const types = Object.fromEntries(st.prof.map(c => [c.name, c.type]));
    try {
      st.res = BB.run(st.rows, { y: $("ySel").value, xs: [...st.xs], spec, dateCol: $("dSel").value || null, types });
    } catch (err) { return showErr(err.message); }
    st.unit = $("unit").value.trim();
    render();
  }

  // ---------- rendering ----------
  const U = () => st.unit ? " " + st.unit : "";
  const pct = v => (v * 100).toFixed(1) + "%", d2 = v => Number.isFinite(v) ? v.toFixed(2) : "–";
  const pillFor = v => `<span class="pill ${v === "Vital X" ? "vital" : v === "Contributing" ? "contrib" : "none"}">${esc(v)}</span>`;
  const trailHTML = t => `<ol class="trail">${t.map(([k, v]) => `<li class="${k === "Verdict" ? "verdict" : ""}"><span class="step">${esc(k)}</span><span>${esc(v)}</span></li>`).join("")}</ol>`;
  const phase = (id, letter, name, sub, body) => `<section class="phase" id="${id}"><div class="phase-head"><span class="eyebrow">${letter} · ${name}</span><h2>${sub}</h2></div>${body}</section>`;

  function render() {
    const R = st.res;
    $("badge").innerHTML = R.cap ? `<b class="num">${f(R.cap.sigmaLevel, 2)}σ</b><span>baseline<br>sigma level</span>` : "";
    $("out").innerHTML = define(R) + measure(R) + analyse(R) + improve(R) + control(R) + story(R);
    wireBusiness(); wireAI(); spy();
  }

  function define(R) {
    const c = R.cap, y = esc(R.y), dr = R.dates ? ` between ${R.dates.from} and ${R.dates.to}` : "";
    const specTxt = Number.isFinite(R.spec.usl) && Number.isFinite(R.spec.lsl) ? `between ${f(R.spec.lsl)} and ${f(R.spec.usl)}${U()}` : Number.isFinite(R.spec.usl) ? `at or below ${f(R.spec.usl)}${U()}` : Number.isFinite(R.spec.lsl) ? `at or above ${f(R.spec.lsl)}${U()}` : null;
    const best = R.scenarios.find(s => s.kind === "realistic");
    const prob = c
      ? `Across <b>${R.n.toLocaleString("en-US")}</b> records${dr}, <b>${y}</b> averaged <b>${f(R.desc.mean, 1)}${U()}</b>. The customer requirement is ${specTxt}, and <b>${pct(c.observedPct)}</b> of records missed it (${Math.round(c.dpmo).toLocaleString("en-US")} defects per million). The process runs at <b>${d2(c.sigmaLevel)} sigma</b>.`
      : `Across <b>${R.n.toLocaleString("en-US")}</b> records${dr}, <b>${y}</b> averaged <b>${f(R.desc.mean, 1)}${U()}</b> with a standard deviation of ${f(R.desc.sd, 1)}. Add a specification limit (the customer requirement) to compute defect rate and sigma level.`;
    const goal = best && best.cap ? `Reduce ${R.goal === "higher" ? "shortfalls" : "breaches"} from <b>${pct(c.observedPct)}</b> to <b>${pct(best.cap.observedPct)}</b> within 90 days (${d2(c.sigmaLevel)}σ → ${d2(best.cap.sigmaLevel)}σ), set from the realistic scenario in Improve.` : "The goal is set once the analysis finds proven levers.";
    const tiles = c ? `<div class="tiles">
      <div class="tile ${c.sigmaLevel < 3 ? "bad" : c.sigmaLevel < 4 ? "warn" : "good"}"><span class="l">Sigma level</span><span class="v">${d2(c.sigmaLevel)}σ</span><span class="s">short-term, 1.5σ shift</span></div>
      <div class="tile ${c.observedPct > 0.05 ? "bad" : "warn"}"><span class="l">Out of spec</span><span class="v">${pct(c.observedPct)}</span><span class="s">${Math.round(c.dpmo).toLocaleString("en-US")} DPMO</span></div>
      <div class="tile ${c.Ppk < 1 ? "bad" : c.Ppk < 1.33 ? "warn" : "good"}"><span class="l">Ppk</span><span class="v">${d2(c.Ppk)}</span><span class="s">target ≥ 1.33</span></div>
      <div class="tile"><span class="l">Average ${y}</span><span class="v">${f(R.desc.mean, 1)}</span><span class="s">${esc(st.unit || "")} · median ${f(R.desc.median, 1)}</span></div></div>` : "";
    return phase("define", "D", "Define", "The problem, in numbers", `${tiles}
      <div class="card"><span class="lbl">Problem statement</span><p class="statement">${prob}</p>
      <span class="lbl">Goal statement</span><p class="statement">${goal}</p>
      <span class="lbl">Scope</span><p class="muted">Output (Y): ${y}. Inputs tested: ${R.results.length} (${esc(R.results.map(r => r.x).join(", "))}). Source: ${esc(st.source)}.</p></div>
      ${R.warnings.length ? `<div class="callout warn">${R.warnings.map(w => `<span>${esc(w)}</span>`).join("")}</div>` : ""}`);
  }

  function measure(R) {
    const c = R.cap, d = R.desc, ad = R.ad, ch = R.chart;
    const quality = st.prof.filter(p => p.type !== "identifier").map(p => `<tr><td>${esc(p.name)}</td><td>${p.type}${p.name === R.y ? " · Y" : ""}${p.symptom ? " · symptom" : ""}</td><td class="num">${p.missing}</td><td class="num">${p.unique}</td></tr>`).join("");
    const capRows = c ? [["Ppk (overall)", d2(c.Ppk)], ["Cpk (within)", d2(c.Cpk)], ...(c.Pp ? [["Pp", d2(c.Pp)], ["Cp", d2(c.Cp)]] : []), ["Observed out of spec", pct(c.observedPct)], ["Expected if normal", pct(c.expectedPct)], ["DPMO", Math.round(c.dpmo).toLocaleString("en-US")], ["Z.bench", d2(c.zBench)], ["Sigma level", d2(c.sigmaLevel) + "σ"]] : [];
    const normalTrail = [
      ["Normality", `Anderson-Darling: A² = ${f(ad.A2star, 2)}, p ${fp(ad.p)}. ` + (ad.p >= 0.05 ? "Data is consistent with a normal distribution." : `Not normal (skewness ${f(d.skew, 2)}), which is typical for time-based data.`)],
      ...(c ? [["Capability method", ad.p >= 0.05 ? "Normal-theory capability is valid." : `Because the data is not normal, defect rate and sigma come from the observed count of misses (${pct(c.observedPct)}), not the normal curve (${pct(c.expectedPct)}). Ppk/Cpk are shown for reference only.`],
        ["Within vs overall", `Cpk ${d2(c.Cpk)} vs Ppk ${d2(c.Ppk)}: ` + (c.Cpk - c.Ppk > 0.15 ? "the gap points to shifts between periods. Fixing stability alone would help." : "similar, so variation is common-cause and built into the process design.")]] : [])
    ];
    const spc = R.special.length ? `${R.special.length} point${R.special.length > 1 ? "s" : ""} beyond the control limits (${esc(R.special.map(s => s.label).join(", "))}). These are special causes: investigate what happened on those ${R.dates ? "days" : "records"} before changing the process.` : "No points beyond the control limits.";
    const shiftTxt = R.shifts ? ` ${R.shifts} points complete a run of 9 on one side of the centre line, a sign the average has shifted.` : "";
    return phase("measure", "M", "Measure", "Baseline, capability and stability", `
      <div class="grid2">
        <div class="card"><h3>Distribution of ${esc(R.y)}</h3>${Charts.histogram(st.res.yv, { usl: R.spec.usl, lsl: R.spec.lsl, mean: d.mean, sd: d.sd })}
          <p class="chart-cap">n ${d.n} · mean ${f(d.mean, 1)} · median ${f(d.median, 1)} · SD ${f(d.sd, 1)} · 10th–90th percentile ${f(d.p10, 1)}–${f(d.p90, 1)}</p></div>
        <div class="card"><h3>Capability</h3>${c ? `<div class="tbl-wrap"><table><tbody>${capRows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Add a USL or LSL above to compute capability and sigma level.</p>`}</div>
      </div>
      <div class="card"><h3>How the baseline was measured</h3>${trailHTML(normalTrail)}</div>
      <div class="card"><h3>Stability: ${R.dates ? "daily average" : "individuals"} control chart (I-MR)</h3>
        ${Charts.control(R.series, ch, "I-MR chart")}
        <p class="chart-cap">Centre ${f(ch.cl, 1)} · limits ${f(ch.lcl, 1)} to ${f(ch.ucl, 1)} (±3σ from the moving range) · tested against Nelson rules 1, 2, 3 and 5.</p>
        <div class="callout ${R.special.length || R.shifts ? "warn" : ""}"><span>${spc}${shiftTxt}</span></div></div>
      <details class="x"><summary><h3>Data quality check</h3><span class="meta">${st.prof.length} columns</span></summary><div class="body"><div class="tbl-wrap"><table><thead><tr><th>Column</th><th>Treated as</th><th class="num">Missing</th><th class="num">Distinct</th></tr></thead><tbody>${quality}</tbody></table></div></div></details>`);
  }

  function analyse(R) {
    const rows = R.results.map(r => `<tr${r.verdict === "Vital X" ? ' class="hl"' : ""}><td><b>${esc(r.x)}</b>${r.symptom ? ' <span class="pill sym">symptom</span>' : ""}</td><td>${esc(r.method)}</td><td class="num">${fp(r.pAdj).replace("= ", "")}</td><td class="num">${r.effName} ${f(r.effect, 3)}</td><td>${pillFor(r.verdict)}</td></tr>`).join("");
    const vital = R.results.filter(r => r.verdict === "Vital X" && !r.symptom), notP = R.results.filter(r => r.verdict === "Not proven");
    const headline = vital.length ? `${vital.length} vital X${vital.length > 1 ? "s" : ""} proven: <b>${esc(vital.map(r => r.x).join(", "))}</b>.` : "No single input has a large proven effect.";
    const model = R.model ? ` Together, the proven levers (${esc(R.model.inputs.join(", "))}) explain <b>${f(R.model.adjR2 * 100, 0)}%</b> of the variation in ${esc(R.y)} (adjusted R², multiple regression).` : "";
    const ruled = notP.length ? ` Ruled out with evidence: ${esc(notP.map(r => r.x).join(", "))}. Don't spend effort there.` : "";
    const details = R.results.map((r, i) => {
      const chart = r.kind === "categorical" ? Charts.interval(r.levels, { overall: R.desc.mean, best: r.best.name, worst: r.worst.name }) : Charts.scatter(r.pts, { slope: r.slope, intercept: r.intercept, xLabel: r.x });
      const cap = r.kind === "categorical" ? `Group means with 95% confidence intervals. Green is the best performer, red the worst. Non-overlapping intervals indicate a real difference.` : `Each dot is one record; the line is the least-squares fit.`;
      return `<details class="x"${i < 2 && r.verdict !== "Not proven" ? " open" : ""}><summary><h3>${esc(r.x)}</h3><span class="meta">${esc(r.method)} · p ${fp(r.pAdj).replace("= ", "")}</span>${pillFor(r.verdict)}</summary><div class="body">${chart}<p class="chart-cap">${cap}</p><div><span class="lbl">Logic trail</span>${trailHTML(r.trail)}</div></div></details>`;
    }).join("");
    let par = "";
    if (R.pareto && R.pareto.items.length) {
      const P = R.pareto, top = P.items.filter((it, i) => i === 0 || P.items[i - 1].cum < 0.8);
      par += `<div class="card"><h3>Pareto: ${esc(P.col)}</h3>${Charts.pareto(P.items, "Pareto")}<p class="chart-cap">${P.total} records (${pct(P.share)}) carry an ${esc(P.col.replace(/_/g, " ").toLowerCase())}. The top ${top.length} (${esc(top.map(t => t.name).join(", "))}) make up ${pct(top[top.length - 1].cum)} of them.</p></div>`;
    }
    if (R.breachPareto && R.breachPareto.total) {
      const B = R.breachPareto;
      par += `<div class="card"><h3>Where the misses come from: by ${esc(B.col)}</h3>${Charts.pareto(B.items, "Pareto of misses")}<p class="chart-cap">${B.total} out-of-spec records, split by the strongest lever.</p></div>`;
    }
    return phase("analyse", "A", "Analyse", "Which inputs really drive the outcome", `
      <div class="callout"><span>${headline}${model}${ruled}</span></div>
      <div class="card"><h3>Hypothesis tests, ranked</h3><div class="tbl-wrap"><table><thead><tr><th>Input (X)</th><th>Test chosen</th><th class="num">Adj. p</th><th class="num">Effect</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="chart-cap">Test choice follows the data: normality and equal-variance checks decide between ANOVA, Welch and Kruskal-Wallis. Every p-value is Holm-adjusted for testing many inputs at once. Vital X = significant and at least a medium effect.</p></div>
      <div style="display:grid;gap:10px">${details}</div>
      ${par ? `<div class="grid2">${par}</div>` : ""}`);
  }

  function recs(R) {
    const out = [];
    R.levers.forEach(r => {
      if (r.spreadDriver && Math.abs(r.gap) < r.spread.widest.sd) { out.push(`<b>Reduce variation in ${esc(r.spread.widest.name)}.</b> It varies ${f(r.spread.ratio, 1)}× more than ${esc(r.spread.tightest.name)}. Check equipment condition, settings drift and changeover practice, then add an in-process check.`); return; }
      if (r.kind === "continuous" && R.goal === "target") { out.push(`<b>Hold ${esc(r.x)} steady.</b> Each unit change moves the output by ${f(r.slope, 3)}${U()}. Tighten the incoming spec or adjust the process automatically when ${esc(r.x)} moves.`); return; }
      if (r.kind === "categorical") {
        const gap = `${f(Math.abs(r.gap), 1)}${U()}`;
        if (/channel|source|mode|medium|intake|route/i.test(r.x)) out.push(`<b>Shift volume to ${esc(r.best.name)}.</b> ${esc(r.worst.name)} runs ${gap} slower on average. Set a channel migration target and remove the reasons suppliers or users still pick ${esc(r.worst.name)}.`);
        else if (/team|agent|operator|analyst|shift|site|location|group|desk/i.test(r.x)) out.push(`<b>Make ${esc(r.best.name)}'s way of working the standard.</b> ${esc(r.worst.name)} averages ${gap} more. Observe both, document the differences as standard work, and coach ${esc(r.worst.name)} first.`);
        else out.push(`<b>Close the ${esc(r.x)} gap.</b> ${esc(r.worst.name)} averages ${gap} more than ${esc(r.best.name)}. Find what makes ${esc(r.best.name)} faster and build it into the process for ${esc(r.worst.name)}.`);
      } else out.push(`<b>Reduce ${esc(r.x)}.</b> Each extra unit adds ${f(Math.abs(r.slope), 2)}${U()}. Look for ways to split or simplify high-${esc(r.x)} cases.`);
    });
    if (R.scDays.length) out.push(`<b>Fix the special cause first.</b> ${R.dates ? "Days" : "Records"} ${esc(R.scDays.join(", "))} were out of control. Find the event (system outage, backlog, staffing gap) and put an early-warning alert in place.`);
    if (R.pareto && R.pareto.items.length) { const t = R.pareto.items.slice(0, 2).map(i => i.name); out.push(`<b>Attack the top ${R.pareto.col.replace(/_/g, " ").toLowerCase()}s.</b> ${esc(t.join(" and "))} lead the Pareto. Error-proof them at source (validation rules, mandatory fields, auto-matching).`); }
    return out;
  }

  function improve(R) {
    const rows = R.scenarios.map(s => `<tr${s.kind === "realistic" ? ' class="hl"' : ""}><td><b>${esc(s.name)}</b><br><span class="muted" style="font-size:13px">${esc(s.detail)}</span></td><td class="num">${f(s.mean, 1)}</td>${R.hasSpec ? `<td class="num">${pct(s.cap.observedPct)}<br><span class="muted" style="font-size:12px">${pct(s.band[0])}–${pct(s.band[1])}</span></td><td class="num">${d2(s.cap.sigmaLevel)}σ</td><td class="num">${d2(s.cap.Ppk)}</td>` : ""}</tr>`).join("");
    const real = R.scenarios.find(s => s.kind === "realistic");
    let after = "";
    if (real) { const ny = real.ys; after = ny ? `<div class="card"><h3>Before and after: realistic target</h3>${Charts.histogram(R.yv, { usl: R.spec.usl, lsl: R.spec.lsl, overlay: ny, labels: ["Current", "Realistic target"] })}<p class="chart-cap">Simulated by applying half of each proven gap to every record, using the regression model from Analyse.</p></div>` : ""; }
    const biz = R.hasSpec && real ? `<div class="card" id="bizCard"><h3>Business case</h3>
      <div class="setup-row"><div class="field f-s"><label for="vol">Annual volume</label><input type="number" id="vol" value="${st.biz.volume}" min="0"></div><div class="field f-s"><label for="cost">Cost per miss ($)</label><input type="number" id="cost" value="${st.biz.cost}" min="0" step="any"></div></div>
      <div id="bizOut"></div></div>` : "";
    return phase("improve", "I", "Improve", "What happens if we fix the vital Xs", `
      <div class="card"><h3>Improvement scenarios</h3><div class="tbl-wrap"><table><thead><tr><th>Scenario</th><th class="num">Mean</th>${R.hasSpec ? `<th class="num">Out of spec<br>90% range</th><th class="num">Sigma</th><th class="num">Ppk</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="chart-cap">Each scenario adjusts every record by the effect the regression model attributes to that input. The 90% range comes from 300 bootstrap resamples, so it shows how certain the projection is.</p></div>
      <div class="grid2">${after}${biz}</div>
      <div class="card"><h3>Recommended countermeasures</h3><ul class="recs">${recs(R).map(r => `<li>${r}</li>`).join("") || "<li>No proven levers yet. Collect more inputs (Xs) and rerun.</li>"}</ul></div>`);
  }
  function wireBusiness() {
    const R = st.res, real = R.scenarios.find(s => s.kind === "realistic"); if (!$("bizOut") || !real) return;
    const calc = () => {
      st.biz.volume = +$("vol").value || 0; st.biz.cost = +$("cost").value || 0;
      const before = R.cap.observedPct, after = real.cap.observedPct, avoided = (before - after) * st.biz.volume, save = avoided * st.biz.cost;
      const lo = (before - real.band[1]) * st.biz.volume * st.biz.cost, hi = (before - real.band[0]) * st.biz.volume * st.biz.cost;
      $("bizOut").innerHTML = `<div class="tiles"><div class="tile good"><span class="l">Misses avoided / yr</span><span class="v">${Math.round(avoided).toLocaleString("en-US")}</span><span class="s">${pct(before)} → ${pct(after)}</span></div>
        <div class="tile good"><span class="l">Annual savings</span><span class="v">$${Math.round(save).toLocaleString("en-US")}</span><span class="s">range $${Math.round(Math.max(0, lo)).toLocaleString("en-US")}–$${Math.round(hi).toLocaleString("en-US")}</span></div>
        <div class="tile"><span class="l">Avg ${esc(R.y)}</span><span class="v">${f(R.desc.mean - real.mean, 1)}</span><span class="s">${esc(st.unit || "units")} faster per record</span></div></div>
        <p class="chart-cap">Savings = misses avoided × cost per miss. Replace the cost with your own figure (penalty, rework, late-payment fee).</p>`;
    };
    $("vol").oninput = calc; $("cost").oninput = calc; calc();
  }

  function control(R) {
    const real = R.scenarios.find(s => s.kind === "realistic"), ch = R.chart, ratio = real ? real.sd / R.desc.sd : 1;
    const ncl = real ? real.mean : ch.cl, nucl = ncl + (ch.ucl - ch.cl) * ratio, nlcl = ncl - (ch.cl - ch.lcl) * ratio;
    const plan = [
      [`${R.dates ? "Daily average" : "Individual"} ${esc(R.y)}`, "I-MR chart", `CL ${f(ncl, 1)} · UCL ${f(nucl, 1)}${nlcl > 0 ? " · LCL " + f(nlcl, 1) : ""}`, R.dates ? "Daily" : "Each record", "Any point beyond a limit, or 9 in a row on one side: stop and investigate within 24 hours."],
      ...(R.hasSpec ? [[`% out of spec`, "p-chart, weekly", `Target ≤ ${pct(real ? real.cap.observedPct : R.cap.observedPct)}`, "Weekly", "Two weeks above target: run the Analyse step again on the latest data."]] : []),
      ...R.levers.map(l => l.kind === "categorical" ? [`Gap between ${esc(l.worst.name)} and ${esc(l.best.name)} (${esc(l.x)})`, "Run chart", `Gap ≤ ${f(Math.abs(l.gap) / 2, 1)}${U()}`, "Weekly", `Gap widens again: review standard work for ${esc(l.x)}.`] : [`Average ${esc(l.x)}`, "Run chart", "Trend down", "Weekly", "Rising trend: check the upstream cause."]),
      ...(R.scDays.length ? [["Recurrence of special-cause events", "Event log + alert", "Zero repeats", "Real time", "Alert the process owner the same day; contain the backlog."]] : [])
    ];
    return phase("control", "C", "Control", "Keep the gains", `
      <div class="card"><h3>Control plan</h3><div class="tbl-wrap"><table><thead><tr><th>What to monitor</th><th>Method</th><th>Limit or target</th><th>Frequency</th><th>Reaction plan</th></tr></thead><tbody>${plan.map(r => `<tr>${r.map((c, i) => `<td${i === 2 ? ' class="num" style="text-align:left"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="chart-cap">New control limits are projected from the realistic target. Recalculate them from real data after 20–25 days on the improved process.</p></div>`);
  }

  // ---------- storyboard + AI ----------
  function summaryForAI(R) {
    const c = R.cap, real = R.scenarios.find(s => s.kind === "realistic");
    return JSON.stringify({
      output_Y: R.y, unit: st.unit || null, records: R.n, period: R.dates, spec: { usl: R.spec.usl, lsl: R.spec.lsl },
      baseline: { mean: +f(R.desc.mean, 2), median: +f(R.desc.median, 2), sd: +f(R.desc.sd, 2), pct_out_of_spec: c ? +(c.observedPct * 100).toFixed(1) : null, sigma_level: c ? +c.sigmaLevel.toFixed(2) : null, ppk: c ? +c.Ppk.toFixed(2) : null },
      stability: { special_cause_points: R.special.map(s => s.label), sustained_shift_signals: R.shifts },
      inputs_tested: R.results.map(r => ({ x: r.x, test: r.method, adjusted_p: +r.pAdj.toPrecision(2), effect: `${r.effName}=${r.effect.toFixed(3)}`, verdict: r.verdict, symptom: r.symptom, best: r.best ? `${r.best.name} (${f(r.best.mean, 1)})` : undefined, worst: r.worst ? `${r.worst.name} (${f(r.worst.mean, 1)})` : undefined, slope: r.slope ? +r.slope.toFixed(3) : undefined })),
      model_adj_r2: R.model ? +R.model.adjR2.toFixed(3) : null,
      pareto: R.pareto ? R.pareto.items.slice(0, 6).map(i => `${i.name}: ${i.count}`) : null,
      scenarios: R.scenarios.map(s => ({ name: s.name, mean: +f(s.mean, 1), pct_out: s.cap ? +(s.cap.observedPct * 100).toFixed(1) : null, sigma: s.cap ? +s.cap.sigmaLevel.toFixed(2) : null })),
      business_case: R.hasSpec && real ? { annual_volume: st.biz.volume, cost_per_miss_usd: st.biz.cost, annual_savings_usd: Math.round((R.cap.observedPct - real.cap.observedPct) * st.biz.volume * st.biz.cost) } : null
    });
  }
  function story(R) {
    const c = R.cap, real = R.scenarios.find(s => s.kind === "realistic"), vital = R.levers;
    const auto = `<div class="story">
      <h4>Situation</h4><p>${esc(R.y)} averages ${f(R.desc.mean, 1)}${esc(U())}${c ? `, and ${pct(c.observedPct)} of records miss the requirement (${d2(c.sigmaLevel)}σ)` : ""}.</p>
      <h4>Proven root causes</h4><ul>${vital.map(v => `<li>${esc(v.x)}: ${v.kind === "categorical" ? `${esc(v.worst.name)} is ${f(Math.abs(v.gap), 1)}${esc(U())} worse than ${esc(v.best.name)}` : `each unit adds ${f(Math.abs(v.slope), 2)}${esc(U())}`} (${esc(v.method)}, adj. p ${fp(v.pAdj).replace("= ", "")}).</li>`).join("") || "<li>None proven yet.</li>"}</ul>
      ${real && real.cap ? `<h4>Expected impact</h4><p>Closing half of each gap moves the process from ${pct(c.observedPct)} to ${pct(real.cap.observedPct)} out of spec (${d2(c.sigmaLevel)}σ → ${d2(real.cap.sigmaLevel)}σ).</p>` : ""}
    </div>`;
    return phase("story", "★", "Storyboard", "The one-page story for leadership", `
      <div class="card"><h3>Auto summary</h3>${auto}</div>
      <div class="card" id="aiCard"><h3>Executive storyboard by AI</h3>
        <p class="muted">AI turns the proven results into a leadership-ready narrative and 30-60-90 day plan. Only the summary statistics are sent, never your raw data.</p>
        <div class="ai-row"><button class="btn primary" id="aiBtn" type="button">Write storyboard</button><button class="btn" id="aiStop" type="button" hidden>Stop</button><span class="muted" id="aiNote"></span></div>
        <div class="story" id="aiOut"></div>
      </div>
      <div class="card" id="askCard"><h3>Ask the Black Belt</h3>
        <form class="ask" id="askForm"><input id="askIn" type="text" placeholder="e.g. Why Welch ANOVA for PO_Type? What should I fix first?" autocomplete="off"><button class="btn" type="submit">Ask</button></form>
        <div class="qa" id="qa"></div></div>`);
  }
  function md(t) { // tiny markdown → HTML (headings, bullets, bold)
    const lines = esc(t).split(/\n/), out = []; let inList = false;
    lines.forEach(l => {
      const b = s => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      if (/^\s*[-*•]\s+/.test(l)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + b(l.replace(/^\s*[-*•]\s+/, "")) + "</li>"); return; }
      if (inList) { out.push("</ul>"); inList = false; }
      if (/^#{1,4}\s/.test(l)) out.push("<h4>" + b(l.replace(/^#+\s*/, "")) + "</h4>");
      else if (l.trim()) out.push("<p>" + b(l) + "</p>");
    });
    if (inList) out.push("</ul>");
    return out.join("");
  }
  const errCopy = e => ({ not_granted: "AI access wasn't allowed for this page.", rate_limited: "Too many requests right now. Try again in a minute.", refused: "Claude declined this request.", session_expired: "Please sign in to Claude again." }[e.code] || "Something went wrong. Try again.");
  let sampleFn = null, ctl = null;
  async function wireAI() {
    if (sampleFn === null && window.claude) { try { sampleFn = await window.claude.use("sample"); } catch { sampleFn = undefined; } }
    if (!sampleFn) { $("aiCard").hidden = true; $("askCard").hidden = true; return; }
    $("aiBtn").onclick = async () => {
      const R = st.res; ctl = new AbortController();
      $("aiBtn").disabled = true; $("aiStop").hidden = false; $("aiNote").textContent = "Thinking…"; $("aiOut").innerHTML = "";
      const prompt = `You are a Lean Six Sigma Master Black Belt writing for senior operations leaders. Using ONLY the statistical results below (computed by a validated engine), write an executive DMAIC storyboard. Do not invent numbers; quote figures from the data. Use markdown with these headings: "## Situation", "## Proven root causes", "## What we ruled out", "## Recommended countermeasures" (specific, practical actions per vital X, each with effort level and owner role), "## Expected impact", "## Risks and controls", "## 30-60-90 day plan". Keep it under 450 words, plain language, no jargon without explanation. Treat inputs marked symptom:true as symptoms to error-proof, not levers.\n\nRESULTS:\n${summaryForAI(R)}`;
      try {
        await sampleFn(prompt, { signal: ctl.signal, onText: ({ text }) => { $("aiNote").textContent = ""; $("aiOut").innerHTML = md(text); } });
      } catch (e) { if (e.text) $("aiOut").innerHTML = md(e.text); if (e.code === "not_granted" || e.code === "sampling_disabled") $("aiCard").hidden = true; else if (e.code !== "cancelled") $("aiNote").textContent = errCopy(e); }
      finally { $("aiBtn").disabled = false; $("aiStop").hidden = true; if ($("aiNote").textContent === "Thinking…") $("aiNote").textContent = ""; }
    };
    $("aiStop").onclick = () => ctl && ctl.abort();
    $("askForm").onsubmit = async ev => {
      ev.preventDefault(); const q = $("askIn").value.trim(); if (!q) return;
      const box = document.createElement("div"); box.innerHTML = `<div class="q"></div><div class="a">Thinking…</div>`; box.firstChild.textContent = q; $("qa").prepend(box); $("askIn").value = "";
      try {
        await sampleFn(`You are a Lean Six Sigma Master Black Belt. Answer the question below about this analysis in under 150 words, plain language, citing the numbers from the results. If the results can't answer it, say what extra data is needed. Explain statistical choices (test selection, assumptions, Holm adjustment, effect size) when asked.\n\nRESULTS:\n${summaryForAI(st.res)}\n\nQUESTION: ${q}`, { cache: false, onText: ({ text }) => { box.lastChild.textContent = text; } });
      } catch (e) { box.lastChild.textContent = e.text || errCopy(e); }
    };
  }

  // ---------- phase rail highlight ----------
  let obs;
  function spy() {
    obs && obs.disconnect();
    const links = [...document.querySelectorAll(".rail a")];
    obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.dataset.p === e.target.id)); }), { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll("section.phase").forEach(s => obs.observe(s));
  }

  loadRows(makeDemoData(S), "Sample: accounts-payable invoices (synthetic)", true);
})();
