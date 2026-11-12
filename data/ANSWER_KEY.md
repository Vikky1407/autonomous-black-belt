# Test datasets and answer key

All five datasets are synthetic, generated with known ("planted") root causes. They let you check that the Autonomous Black Belt finds the real drivers and ignores the noise. Regenerate with `python3 scripts/make_datasets.py` (the invoice data comes from `src/data.js`).

| File | Output (Y) | Spec to enter | Planted root causes | Pure noise (should be "Not proven") | Planted special cause |
|---|---|---|---|---|---|
| `sample_invoices.csv` | Cycle_Time_Hrs | USL 48 | Channel (Paper, Email slow), PO_Type (Non-PO), Team C, Line_Items; Exception_Reason is a symptom | Shift, Region, Invoice_Value_USD | ERP slowdown, early Sep 2026 |
| `call_centre_handle_time.csv` | Handle_Time_Min | USL 8 | Transfers, Call_Type (Billing dispute), Agent_Tenure (under 6 months), Knowledge_Base_Used = No | Shift, Language, Customer_Tier | none |
| `filling_line_weight.csv` | Fill_Weight_g | LSL 495, USL 505 | Viscosity_cP (slope), Nozzle N3 overfills, Line 2 has extra spread (not a mean shift) | Operator, Shift, Ambient_Temp_C | Calibration drift, 22 Sep 2026 morning |
| `it_service_desk.csv` | Resolution_Time_Hrs | USL 24 | Reassignments, Category, Priority; Delay_Reason is a symptom. Has blank cells on purpose | Logged_Via, Region | none planted |
| `claims_accuracy.csv` | Accuracy_Pct | LSL 98 (higher is better) | Processing_Mode (Manual), Adjuster_Training (Not certified), Claim_Type (Property) | Site, Claim_Value_USD | none |

## What a good result looks like

- Every planted cause is ranked **Vital X** or **Contributing**.
- Every noise column is **Not proven**.
- The filling line shows **Line** as a Vital X driven by spread (Levene), which is the subtle one.
- The IT file reports skipped blank rows in a warning instead of failing.

## Live demo tip

Upload `filling_line_weight.csv`, set LSL 495 and USL 505, and run. It shows the two-sided logic: the tool switches from "make it faster" to "hold it on target and cut the spread".

## Live Monitor feed: `live_feed_invoices.csv`

Open **Live Monitor**, choose this file, set **USL 48**, start. 120 working days; the first 30 are the baseline.

| Days | Planted event | What the monitor should do |
|---|---|---|
| 55–57 (15–17 Sep) | ERP outage: every invoice +18 h | Deviation #1, diagnosed as **system-wide** |
| 80–86 (20–28 Oct) | Team C new joiners: Team C +16 h | Deviation #2, diagnosed as **localised to Team C** |
| 87–102 | Team C coached below its old level | Team tracker turns **Improving** |
| 60–110 | Paper and Email volume moves to EDI and Portal | Channel tracker turns **Improving** |
| all | No change in PO type | PO_Type tracker stays **Stable** |

Expected: exactly two deviations, no false alarms.
