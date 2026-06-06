---
name: feedback-biome-clean-report-lie
description: executor reports "formatters/biome clean" but biome check still finds warnings — always re-run biome on the step's changed files
metadata:
  type: feedback
---

The step-executor repeatedly reports "biome clean" / "formatters clean" while `npx biome check <files>` still surfaces warnings (unused vars, unsafe optional-chain, comment alignment in gofmt's case).

**Why:** the executor often runs biome with autofix or on a narrower scope, or eyeballs it; the verifier must treat the report's "clean" claim as unverified. Recurred at EL02 (2 warnings), EL00 (i18n), BA21/BA20/BA16/CE02 (various), now EL03 (unused `g` in a test helper).

**How to apply:** ALWAYS run `npx biome check` on the exact changed front files (and `gofmt -l` on changed Go files) yourself, never trust the report. Warnings that are dead code / type-unsafe are fixable-now gaps — fix them directly (delete the dead var, tighten the type), don't pass them through. A leftover unused var is usually an incomplete refactor (e.g. EL03's reconstruct() kept `const g = newGraph(...)` after switching to building the object literal directly).
