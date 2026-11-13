// ---------- Autonomous Black Belt: Live Monitor interface ----------
(() => {
  const $ = id => document.getElementById(id), esc = Charts.esc, f = BB.f;
  const pct = v => v == null ? "–" : (v * 100).toFixed(1) + "%";
  const m = { rows: null, prof: null, st: null, timer: null, running: false, unit: "" };

  function load(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        m.rows = BB.parseCSV(rd.result); m.prof = BB.profile(m.rows); m.source = file.name;
        const y = BB.suggestY(m.prof), dates = m.prof.filter(c => c.type === "date");
        if (!y || !dates.length) throw new Error("The feed needs a numeric output column and a date column.");
        $("mY").innerHTML = m.prof.filter(c => c.type === "continuous").map(c => `<option${c.name === y ? " selected" : ""}>${esc(c.name)}</option>`).join("");
        $("mDate").innerHTML = dates.map(c => `<option>${esc(c.name)}</option>`).join("");
        $("mSource").innerHTML = `<b>${esc(file.name)}</b> · ${m.rows.length.toLocaleString("en-US")} rows`;
        $("mUsl").value = ""; $("mLsl").value = "";
        stop(); $("mDrop").hidden = true; $("mSetup").hidden = false; $("mLive").hidden = true; err("");
        $("mUsl").focus();
      } catch (e) { err("Couldn't read that feed: " + e.message); $("mSetup").hidden = false; }
    };
    rd.readAsText(file);
    $("mFile").value = "";
  }
  const err = t => { $("mErr").textContent = t; $("mErr").hidden = !t; };

  function start() {
    if (!m.rows) return;
    const num = id => { const v = $(id).value.trim(); return v === "" ? NaN : +v; };
    const spec = { usl: num("mUsl"), lsl: num("mLsl") };
    if (!Number.isFinite(spec.usl) && !Number.isFinite(spec.lsl)) return err("Enter the fixed customer spec (USL and/or LSL) before you start.");
    const y = $("mY").value, types = Object.fromEntries(m.prof.map(c => [c.name, c.type]));
    const xs = m.prof.filter(c => c.name !== y && (c.type === "categorical" || c.type === "continuous")).map(c => c.name);
    const owners = $("mNotify").value.split(",").map(s => s.trim()).filter(Boolean);
    m.unit = /hr|hour/i.test(y) ? " h" : /min/i.test(y) ? " min" : /_g$/i.test(y) ? " g" : "";
    try { m.st = Mon.create(m.rows, { y, dateCol: $("mDate").value, spec, xs, types, baselineDays: Math.max(15, +$("mBase").value || 30), owners, unit: m.unit, changes: $("mChanges").value, definition: $("mDef").value.trim() }); }
    catch (e) { return err(e.message); }
    err(""); ["mY", "mDate", "mLsl", "mUsl", "mBase", "mDef", "mChanges"].forEach(id => $(id).disabled = true);
    $("mLive").hidden = false; $("mIncidents").innerHTML = `<p class="muted">No deviations yet. The monitor checks the total and every group within each critical input, every day.</p>`;
    $("mStart").textContent = "Restart"; $("mPause").hidden = false; $("mPause").textContent = "Pause";
    renderAll(); resume();
  }
  function resume() { stop(); m.running = true; m.timer = setInterval(tick, +$("mSpeed").value); }
  function stop() { clearInterval(m.timer); m.running = false; }
  function tick() {
    const r = Mon.step(m.st);
    if (!r) { stop(); $("mPause").hidden = true; renderAll(true); return; }
    let hold = false;
    r.events.forEach(e => { if (e.type === "incident") { hold = true; addIncident(e.incident); } else markRecovered(e.incident); });
    renderAll();
    if (hold) { stop(); m.held = true; setTimeout(() => { if (m.held && m.st) { m.held = false; resume(); } }, 4500); }   // pause so the alert can be read
  }

  function renderAll(finished) {
    const st = m.st, k = Mon.kpis(st), open = st.open;
    const day = `Day ${k.done} of ${k.total} · ${k.date}`;
    $("mStatus").className = "status " + (finished ? "done" : open ? "alert" : "ok");
    $("mStatus").innerHTML = finished
      ? `<b>Feed complete.</b> ${st.incidents.length} deviation${st.incidents.length === 1 ? "" : "s"} caught and diagnosed; ${st.tracker.filter(t => t.status === "Improving").length} critical X${st.tracker.filter(t => t.status === "Improving").length === 1 ? "" : "s"} improving. <span class="muted">${day}</span>`
      : open ? `<b>Deviation #${open.id} detected.</b> Analysis re-run, action plan sent to ${esc(open.owners.join(", "))}. <span class="muted">${day}</span>`
      : `<b>Monitoring.</b> Process within limits. <span class="muted">${day} · simulated feed</span>`;
    const tile = (l, v, s, cls = "") => `<div class="tile ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    $("mTiles").innerHTML =
      tile("Today's average", f(k.today, 1) + esc(m.unit), `baseline ${f(st.baseMean, 1)}`, k.today > st.limits.ucl ? "bad" : "") +
      tile("Today out of spec", pct(k.todayPct), `baseline ${pct(st.basePct)}`, k.todayPct > st.basePct * 2 ? "bad" : "") +
      tile("Out of spec, last 20 days", pct(k.pct20), `baseline ${pct(st.basePct)}`, k.pct20 < st.basePct * 0.8 ? "good" : k.pct20 > st.basePct * 1.3 ? "bad" : "") +
      tile("Sigma, last 20 days", k.sigma20 ? k.sigma20.toFixed(2) + "σ" : "–", `baseline ${st.baseSigma.toFixed(2)}σ`, k.sigma20 > st.baseSigma + 0.2 ? "good" : k.sigma20 < st.baseSigma - 0.2 ? "bad" : "");
    const mh = st.msaLast ? st.msaLast.f : null, mb = st.msaBase, al = st.msaLast ? st.msaLast.alerts.map(a => a.k) : [];
    const mrow = (k, now, base) => `<div class="mh ${al.includes(k) ? "bad" : "ok"}"><span class="l">${k}</span><span class="v">${now}</span><span class="s">baseline ${base}</span></div>`;
    $("mHealth").innerHTML = mh ? `<div class="mh-head"><b>Measurement check</b><span class="pill ${al.length ? "vital" : "good"}">${al.length ? "Alert today" : "Data looks consistent"}</span>${st.cfg.definition ? `<span class="muted small">Measured as: ${esc(st.cfg.definition)}</span>` : ""}</div><div class="mh-grid">` +
      mrow("Completeness", pct(mh.complete), pct(mb.complete)) + mrow("Resolution", pct(mh.fractional) + " with decimals", pct(mb.fractional)) +
      mrow("Volume", mh.n + " records", Math.round(mb.volMean) + "/day") + mrow("Stuck values", pct(mh.stuck), pct(mb.stuck)) + mrow("Valid range", pct(1 - mh.invalidRange), pct(1 - mb.invalidRange)) + `</div>` +
      (st.changes.length ? `<p class="muted small">Change log: ${st.changes.map(c => esc(c.date + " " + c.text)).join(" · ")}</p>` : "") : "";
    $("mChart").innerHTML = Charts.live(st.seen, st.limits, st.days.length, st.cfg.baselineDays, st.incidents, st.spec);
    $("mTracker").innerHTML = st.tracker.length ? st.tracker.map(t => {
      const now = t.points.length ? t.points[t.points.length - 1].v : t.base, cls = t.status === "Improving" ? "good" : t.status === "Worse" ? "bad" : "flat";
      return `<div class="trk"><div class="trk-h"><b>${esc(t.x)}</b><span class="pill ${t.status === "Improving" ? "good" : t.status === "Worse" ? "vital" : "none"}">${t.status}</span></div>${Charts.spark(t.points, t.base, cls)}<span class="muted small">Baseline ${f(t.base, 1)}${esc(m.unit)} per case → now ${f(now, 1)}${esc(m.unit)}</span></div>`;
    }).join("") : `<p class="muted">No critical inputs were proven in the baseline.</p>`;
  }

  function addIncident(inc) {
    const box = $("mIncidents"); if (box.querySelector("p.muted")) box.innerHTML = "";
    const el = document.createElement("article"); el.className = "incident open" + (inc.where.type === "measurement" ? " msa-inc" : ""); el.id = "inc" + inc.id;
    el.innerHTML = `<div class="inc-h"><b>${inc.where.type === "measurement" ? "Measurement alert" : "Deviation"} #${inc.id}</b><span class="muted">${esc(inc.opened)}</span><span class="pill vital inc-state">Open</span></div>
      <ul class="sig">${inc.signals.map(s => `<li>${esc(s.text)}</li>`).join("")}</ul>
      <div class="inc-sec"><span class="lbl">Where it comes from</span><p>${inc.where.text}</p></div>
      <div class="inc-sec"><span class="lbl">Full analysis re-run (last 30 days)</span><p>Vital Xs: <b>${esc(inc.vital.join(", ") || "none")}</b>${inc.newX.length ? `. New since baseline: <b>${esc(inc.newX.join(", "))}</b>` : ". Same critical inputs as the baseline"}${inc.recentPct != null ? `; ${pct(inc.recentPct)} out of spec in that window` : ""}.</p></div>
      <div class="inc-sec"><span class="lbl">Action plan</span><div class="tbl-wrap"><table><thead><tr><th>Step</th><th>Action</th><th>Owner</th><th>Due</th></tr></thead><tbody>${inc.plan.map(p => `<tr><td><b>${esc(p[0])}</b></td><td>${esc(p[1])}</td><td>${esc(p[2])}</td><td class="num" style="text-align:left">${esc(p[3])}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="sent">${inc.sent.map(s => `<span class="chip-sent">${esc(s.channel)} → ${esc(s.to)}</span>`).join("")}<span class="muted small">notifications simulated in this prototype</span></div>`;
    box.prepend(el);
  }
  function markRecovered(inc) {
    const el = $("inc" + inc.id); if (!el) return;
    el.classList.remove("open"); const p = el.querySelector(".inc-state"); p.className = "pill good inc-state"; p.textContent = `Recovered ${inc.closed}`;
  }

  $("mFile").onchange = e => e.target.files[0] && load(e.target.files[0]);
  $("mStart").onclick = () => { m.held = false; if (m.st) { ["mY", "mDate", "mLsl", "mUsl", "mBase", "mDef", "mChanges"].forEach(id => $(id).disabled = false); m.st = null; } start(); };
  $("mPause").onclick = () => { if (m.running || m.held) { m.held = false; stop(); $("mPause").textContent = "Resume"; } else { $("mPause").textContent = "Pause"; resume(); } };
  $("mSpeed").onchange = () => { if (m.running) resume(); };
  ["mUsl", "mLsl"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") start(); }));
  window.MonitorUI = { load };
})();
