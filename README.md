# Autonomous Black Belt

**Explainable Six Sigma.** Upload process data and get a complete, statistically proven DMAIC, with the logic behind every conclusion shown step by step.

Part 1 of *The Autonomous Enterprise*, a series of AI tools for operational excellence by Vikas Choudhary, Lean Six Sigma Master Black Belt.

## The problem

Six Sigma analysis takes weeks, depends on scarce Black Belts, and often ends in opinion rather than proof. Most AI tools that claim to "analyse your process" are black boxes: they guess, and you can't check their reasoning.

## What it does

| Phase | What the tool does automatically |
|---|---|
| **Define** | Writes the problem and goal statements from the data and the customer spec |
| **Measure** | Baseline, capability (Pp/Ppk, Cp/Cpk), DPMO, sigma level, normality check, I-MR control chart with Nelson rules |
| **Analyse** | Tests every input (X), choosing ANOVA, Welch ANOVA, Kruskal-Wallis, t-tests or correlation based on the data. Checks assumptions, adjusts for multiple testing (Holm), measures effect size, ranks the vital few, builds Pareto charts |
| **Improve** | Simulates each fix with a regression model, gives a 90% range by bootstrap, and builds the business case |
| **Control** | Generates the control plan with projected limits and reaction plans |
| **Storyboard** | AI writes the executive narrative and 30-60-90 day plan, using only the computed results |

## What makes it different

- **Logic trail on every conclusion.** Why this test, which assumptions held, what the p-value and effect size mean. A Black Belt can challenge any result and see the reasoning.
- **The maths is real.** The statistics engine is validated against SciPy and statsmodels: all 53 checks match to six significant figures (`npm run validate`).
- **AI does the writing, not the maths.** Numbers come from the engine; the language model only explains them.
- **Thinks like a Master Black Belt.** It switches tests when assumptions fail, cross-checks with non-parametric tests, separates symptoms from levers, and for two-sided specs tests spread as well as the average, after removing known effects.
- **Private by design.** All statistics run in the browser. Raw data is never uploaded.

## Run it

In VS Code: open **Run and Debug** and click **Run Autonomous Black Belt**. It opens the app in Chrome.

Or open `index.html` in any browser. No install, no server, no build. Then upload a CSV from `data/`, enter the spec limits, and click **Run DMAIC**.

With Node.js:

```bash
npm start          # serves the app at http://localhost:5173
npm test           # runs the engine on all test datasets
npm run validate   # cross-checks the stats engine against SciPy (needs Python with scipy, statsmodels, pandas)
npm run build      # bundles everything into dist/autonomous-black-belt.html
```

## Test data

`data/` holds five synthetic datasets (finance, contact centre, manufacturing, IT service desk, insurance) with planted root causes. `data/ANSWER_KEY.md` lists the truth for each, so you can confirm the tool finds it.

## Project structure

```
index.html            App shell
src/stats.js          Statistics engine (distributions, tests, capability, SPC, regression)
src/engine.js         DMAIC decision logic: test selection, verdicts, scenarios, control plan inputs
src/charts.js         SVG charts: histogram, control chart, interval plot, scatter, Pareto
src/app.js            Interface and AI storyboard
src/styles.css        Design system (light and dark themes)
src/data.js           Invoice test-dataset generator (used by tests)
scripts/              Dataset generator and single-file build
tests/                Engine tests and SciPy validation
data/                 Test datasets and answer key
```

## Tech

Plain JavaScript with no dependencies. Statistics engine written from first principles: incomplete beta and gamma functions, Anderson-Darling, Levene (Brown-Forsythe), one-way and Welch ANOVA, Kruskal-Wallis, chi-square, Pearson and Spearman correlation, OLS regression, I-MR control charts, bootstrap simulation. AI narrative is optional and runs only where an AI service is connected.

## Status

Prototype (v1). Supports a continuous output (Y). Next: attribute data (defect counts, pass/fail), DOE analysis, and live data connectors.

© 2026 Vikas Choudhary. All rights reserved.
