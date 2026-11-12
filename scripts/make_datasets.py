"""Generate synthetic test datasets with known (planted) root causes.

Run:  python3 scripts/make_datasets.py
Each dataset's true drivers are listed in data/ANSWER_KEY.md so you can check
that the Autonomous Black Belt finds them and ignores the noise columns.
"""
import csv, math, random, datetime as dt, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)


def workdays(start, n):
    d, out = start, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def pick(r, options):
    names, weights = zip(*options.items())
    return r.choices(names, weights)[0]


def write(name, rows):
    with open(OUT / name, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"{name}: {len(rows)} rows")


# 1) Contact centre handle time  (USL 8 minutes, lower is better)
def call_centre():
    r = random.Random(11); rows = []
    for day in workdays(dt.date(2026, 8, 3), 45):
        for _ in range(r.randint(18, 26)):
            ctype = pick(r, {"Order status": 30, "Billing dispute": 18, "Technical issue": 22, "Address change": 15, "Cancellation": 15})
            tenure = pick(r, {"Under 6 months": 28, "6-24 months": 40, "Over 24 months": 32})
            kb = pick(r, {"Yes": 62, "No": 38})
            transfers = r.choices([0, 1, 2, 3], [60, 25, 11, 4])[0]
            t = 4.2 + {"Order status": 0, "Billing dispute": 2.8, "Technical issue": 1.6, "Address change": -0.4, "Cancellation": 1.0}[ctype]
            t += {"Under 6 months": 2.2, "6-24 months": 0.6, "Over 24 months": 0}[tenure]
            t += 1.7 if kb == "No" else 0
            t += 1.4 * transfers
            t *= math.exp(r.gauss(0, 0.18))
            rows.append({"Call_ID": f"C{len(rows)+50001}", "Call_Date": day.isoformat(), "Call_Type": ctype, "Agent_Tenure": tenure,
                         "Shift": pick(r, {"Morning": 40, "Afternoon": 38, "Evening": 22}), "Language": pick(r, {"English": 70, "Spanish": 20, "Hindi": 10}),
                         "Knowledge_Base_Used": kb, "Transfers": transfers, "Customer_Tier": pick(r, {"Gold": 20, "Silver": 35, "Standard": 45}),
                         "Handle_Time_Min": round(t, 2)})
    write("call_centre_handle_time.csv", rows)


# 2) Filling line weight  (LSL 495 g, USL 505 g, target 500 g: two-sided spec)
def fill_line():
    r = random.Random(22); rows = []
    for day in workdays(dt.date(2026, 9, 1), 30):
        for hour in range(6, 22):
            line = pick(r, {"Line 1": 34, "Line 2": 33, "Line 3": 33})
            nozzle = pick(r, {"Nozzle N1": 25, "Nozzle N2": 25, "Nozzle N3": 25, "Nozzle N4": 25})
            visc = r.gauss(1200, 60)
            temp = r.gauss(24, 2.5)
            w = 500.2 + (1.9 if nozzle == "Nozzle N3" else 0) - 0.018 * (visc - 1200)
            w += r.gauss(0, 1.9 if line == "Line 2" else 1.1)
            if day == dt.date(2026, 9, 22) and hour < 12:
                w -= 4.5  # calibration drift after maintenance
            rows.append({"Batch_ID": f"B{day:%m%d}-{hour:02d}", "Production_Date": day.isoformat(), "Line": line, "Nozzle": nozzle,
                         "Operator": pick(r, {"Op Asha": 20, "Op Ben": 20, "Op Carla": 20, "Op Dev": 20, "Op Eli": 20}),
                         "Shift": "Day" if hour < 14 else "Evening", "Ambient_Temp_C": round(temp, 1), "Viscosity_cP": round(visc),
                         "Fill_Weight_g": round(w, 2)})
    write("filling_line_weight.csv", rows)


# 3) IT service desk resolution time  (USL 24 hours), with some messy blanks
def it_tickets():
    r = random.Random(33); rows = []
    for day in workdays(dt.date(2026, 7, 6), 60):
        for _ in range(r.randint(8, 14)):
            cat = pick(r, {"Password reset": 25, "Access request": 22, "Hardware": 15, "Software install": 18, "Network": 12, "ERP issue": 8})
            reassign = r.choices([0, 1, 2, 3, 4], [50, 26, 14, 7, 3])[0]
            prio = pick(r, {"P1": 5, "P2": 20, "P3": 50, "P4": 25})
            h = 6 + {"Password reset": -3.5, "Access request": 6, "Hardware": 9, "Software install": 4, "Network": 5, "ERP issue": 11}[cat]
            h += 5.5 * reassign
            h += {"P1": -4, "P2": -2, "P3": 0, "P4": 2}[prio]
            h = max(0.5, h * math.exp(r.gauss(0, 0.35)))
            reason = "None"
            if reassign >= 2 or r.random() < 0.08:
                reason = pick(r, {"Wrong assignment group": 45, "Waiting for user": 25, "Missing approval": 20, "Vendor dependency": 10})
            row = {"Ticket_ID": f"INC{len(rows)+700001}", "Opened_Date": day.isoformat(), "Priority": prio, "Category": cat,
                   "Reassignments": reassign, "Logged_Via": pick(r, {"Portal": 50, "Email": 30, "Phone": 20}),
                   "Region": pick(r, {"India": 45, "Mexico": 25, "Poland": 30}), "Delay_Reason": reason, "Resolution_Time_Hrs": round(h, 1)}
            if r.random() < 0.02: row["Logged_Via"] = ""          # realistic gaps
            if r.random() < 0.01: row["Resolution_Time_Hrs"] = ""  # still open, no value
            rows.append(row)
    write("it_service_desk.csv", rows)


# 4) Insurance claims payout accuracy  (higher is better, LSL 98% accuracy)
def claims():
    r = random.Random(44); rows = []
    for day in workdays(dt.date(2026, 6, 1), 50):
        for _ in range(r.randint(10, 16)):
            ctype = pick(r, {"Motor": 40, "Health": 35, "Property": 25})
            auto = pick(r, {"Auto-adjudicated": 45, "Manual": 55})
            training = pick(r, {"Certified": 60, "Not certified": 40})
            a = 99.1 + (-0.9 if auto == "Manual" else 0) + (-0.8 if training == "Not certified" else 0) + (-0.5 if ctype == "Property" else 0)
            a += r.gauss(0, 0.55)
            rows.append({"Claim_ID": f"CLM{len(rows)+90001}", "Processed_Date": day.isoformat(), "Claim_Type": ctype, "Processing_Mode": auto,
                         "Adjuster_Training": training, "Site": pick(r, {"Pune": 50, "Manila": 50}), "Claim_Value_USD": round(math.exp(r.gauss(8, 0.9)), 2),
                         "Accuracy_Pct": round(min(100, a), 2)})
    write("claims_accuracy.csv", rows)


# 5) Live feed for the Live Monitor: 120 working days of invoices with planted events
#    days 1-30   baseline (used to set control limits and the critical Xs)
#    days 55-57  ERP outage: every invoice +18 h (system-wide special cause)
#    days 80-86  Team C new joiners: Team C +16 h (local special cause)
#    days 87-102 Team C coached: its extra time falls below its old baseline (improvement)
#    days 60-110 Paper share falls from 10% to 1% and Email from 30% to 18% (channel migration, improvement)
def live_feed():
    r = random.Random(55); rows = []
    days = workdays(dt.date(2026, 7, 1), 120)
    for di, day in enumerate(days, start=1):
        mig = 0 if di < 60 else min(1, (di - 60) / 50)          # channel migration progress
        paper, email = 10 - 9 * mig, 30 - 12 * mig
        team_c = 8.0
        if 80 <= di <= 86: team_c = 8 + 16
        elif 87 <= di <= 102: team_c = 8 - 7 * (di - 86) / 16
        elif di > 102: team_c = 1.0
        for _ in range(r.randint(10, 14)):
            channel = pick(r, {"EDI": 34 + 11 * mig, "Supplier Portal": 26 + 6 * mig, "Email": email, "Paper": paper})
            po = pick(r, {"PO": 70, "Non-PO": 30})
            team = pick(r, {"Team A": 27, "Team B": 25, "Team C": 24, "Team D": 24})
            lines = max(1, round(math.exp(1.7 + 0.7 * r.gauss(0, 1))))
            ct = 14 + {"EDI": 0, "Supplier Portal": 3, "Email": 11, "Paper": 19}[channel] + (9 if po == "Non-PO" else 0)
            ct += {"Team A": 0, "Team B": 1.5, "Team C": team_c, "Team D": 0.5}[team] + 0.32 * lines
            if 55 <= di <= 57: ct += 18
            ct = max(2, ct * math.exp(r.gauss(0, 0.22)))
            rows.append({"Invoice_ID": f"INV-{300000 + len(rows)}", "Received_Date": day.isoformat(), "Region": pick(r, {"North America": 35, "Europe": 30, "LATAM": 20, "APAC": 15}),
                         "Channel": channel, "PO_Type": po, "Team": team, "Shift": pick(r, {"Day": 62, "Night": 38}), "Line_Items": lines, "Cycle_Time_Hrs": round(ct, 1)})
    write("live_feed_invoices.csv", rows)


if __name__ == "__main__":
    call_centre(); fill_line(); it_tickets(); claims(); live_feed()
