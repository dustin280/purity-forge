## Problem

Current serial dilution uses equal geometric steps (e.g. ~14.14× × 14.14× for a 200× total). You want every step to be a whole-number dilution factor — no fractional or "remainder" factors anywhere.

## Fix

Rework the serial-dilution branch in `computeDilution` (`src/lib/sample-prep/dilution.ts`) to produce an integer factorization of the total dilution factor.

Rules:
1. Compute total `df = c1/c2`. Require it to be an integer within a tight tolerance (e.g. `|df − round(df)| < 1e-6`). If not, return an error: *"Serial dilution requires a whole-number total dilution factor. Adjust target concentration or volume so C1/C2 is an integer (currently N.NN×)."* No fractional steps are ever emitted.
2. Compute `maxStepDf = floor(v2Ul / minPipetteUl)` — the largest integer per-step factor that keeps the aliquot ≥ 10 µL at the chosen final volume.
3. Greedy decomposition of `df` into integer factors, each ≥ 2 and ≤ `maxStepDf`:
   - While `remaining > maxStepDf`: pick the largest integer `k` in `[2, maxStepDf]` that divides `remaining`, preferring `10` when `10` is a divisor and `10 ≤ maxStepDf`. Push `k`, set `remaining /= k`.
   - Final step factor = `remaining` (guaranteed integer ≤ `maxStepDf`, ≥ 2).
4. If no divisor ≥ 2 fits at some point (e.g. `df` is prime and larger than `maxStepDf` — like 199×), return an error: *"Cannot build a whole-number serial dilution for factor N× at final volume V. Increase the final volume or adjust the target."*
5. Cap at a reasonable number of steps (e.g. 6); if exceeded, error out with the same "adjust target/volume" guidance.
6. Emit steps normally: each uses target final volume `v2Ul`, aliquot = `finalVolUl / stepFactor` (whole µL when the factor divides cleanly), diluent = `finalVolUl − aliquot`. Label intermediates numerically; last step is "Final".

Example (your case, `20 → 0.1 mg/mL, 1 mL`, df = 200, maxStepDf = 100):
- Step 1 (Intermediate 1): 10× — 100 µL stock + 900 µL diluent → 1 mL at 2 mg/mL
- Step 2 (Final): 20× — 50 µL of Intermediate 1 + 950 µL diluent → 1 mL at 0.1 mg/mL

Single-step branch, unit conversions, warnings plumbing, procedure rendering, and the UI in `dilution-calculator.tsx` are unchanged.

## Files

- `src/lib/sample-prep/dilution.ts` — rewrite the serial-dilution section of `computeDilution` (roughly lines 107–152). No API/type changes.
