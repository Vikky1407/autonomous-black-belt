// ---------- Demo dataset: accounts-payable invoice processing (synthetic) ----------
function makeDemoData(Sx) {
  const R = Sx.rng(20261107), pick = (arr, w) => { let u = R() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { u -= w[i]; if (u <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const rows = [], start = new Date(Date.UTC(2026, 6, 1)); // 1 Jul 2026
  const days = []; for (let d = new Date(start); days.length < 66; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) days.push(new Date(d)); }
  let id = 100000;
  days.forEach((day, di) => {
    const nToday = 10 + Math.floor(R() * 5);
    for (let k = 0; k < nToday; k++) {
      const channel = pick(["EDI", "Supplier Portal", "Email", "Paper"], [34, 26, 30, 10]);
      const po = pick(["PO", "Non-PO"], [70, 30]);
      const team = pick(["Team A", "Team B", "Team C", "Team D"], [27, 25, 24, 24]);
      const shift = pick(["Day", "Night"], [62, 38]);
      const region = pick(["North America", "Europe", "LATAM", "APAC"], [35, 30, 20, 15]);
      const lines = Math.max(1, Math.round(Math.exp(1.7 + 0.7 * gauss())));
      const value = Math.round(Math.exp(7.6 + 1.1 * gauss()) * 100) / 100;
      const excP = 0.12 + (channel === "Email" ? 0.10 : 0) + (channel === "Paper" ? 0.16 : 0) + (po === "Non-PO" ? 0.12 : 0);
      let exc = "None";
      if (R() < excP) exc = pick(["Price mismatch", "Missing PO reference", "Approval delay", "Vendor master error", "Tax code error", "Duplicate suspected"], [34, 24, 18, 11, 8, 5]);
      let ct = 14 + { "EDI": 0, "Supplier Portal": 3, "Email": 11, "Paper": 19 }[channel] + (po === "Non-PO" ? 9 : 0) + { "Team A": 0, "Team B": 1.5, "Team C": 8, "Team D": 0.5 }[team] + 0.32 * lines;
      ct += { "None": 0, "Price mismatch": 13, "Missing PO reference": 15, "Approval delay": 26, "Vendor master error": 11, "Tax code error": 8, "Duplicate suspected": 6 }[exc];
      if (di >= 46 && di <= 49) ct += 16; // ERP slowdown, special cause
      ct = Math.max(2, ct * Math.exp(0.22 * gauss()));
      rows.push({ Invoice_ID: "INV-" + (id++), Received_Date: day.toISOString().slice(0, 10), Region: region, Channel: channel, PO_Type: po, Team: team, Shift: shift, Line_Items: lines, Invoice_Value_USD: value, Exception_Reason: exc, Cycle_Time_Hrs: Math.round(ct * 10) / 10 });
    }
  });
  return rows;
}
if (typeof module !== "undefined") module.exports = makeDemoData;
