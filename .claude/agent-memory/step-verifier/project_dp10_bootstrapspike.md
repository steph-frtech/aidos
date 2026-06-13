---
name: dp10-bootstrapspike
description: DP10 SPIKE-gate bootstrap one-shot — verdict GO mesuré verified green after 1 biome fix (noTemplateCurlyInString RECURRED in lib twin, 6th DP occurrence)
metadata:
  type: project
---

# DP10 — SPIKE-gate bootstrap one-shot déterministe (verdict GO mesuré)

Verified green 2026-06-13, **1 correction** (50d233e).

- SPIKE RULE applied: ratchet OFF by design, zone /spike (Go module `aidos.spike/bootstrap`, go test ok, no untracked binaries, fully tracked in cce4b2a).
- **Scar recurrence (6th time on DP track):** biome `noTemplateCurlyInString` warning on literal `${APP_DATA_PATH}` string — this time in the **TS twin lib** (`front/web/lib/bootstrap-spike.ts:416` OPEN_QUESTIONS array), not the e2e spec. Executor's "aucun binaire parasite" claim was true but biome was never mentioned and was NOT clean. Fix = `// biome-ignore lint/suspicious/noTemplateCurlyInString:` immediately before the flagged string. **Rule confirmed: re-run biome on ALL committed TS files of every DP step, including lib files quoting compose conventions.**
- Hash parity verified live: `a2f23a64…` pinned in 4 places (Go verdict-measured.json ×2, TS lib MEASURED_GO_VERDICT_HASH, e2e spec) — TS `decide(MEASURED)` re-derives it (parity property), flip-one-fact → no-go + other address (conjunction proof).
- Port resolution PURE confirmed by reading ports.go (ParseSS/ParseDockerPS/ResolvePort — parse `ss -ltn`/`docker ps` as data, first free ≥ 18080, never a prompt); permutation-stable start order property in vitest.
- vitest 2162/2162; e2e 20/20 in ONE run on :3210 (4 DP10 + 16 v3); prod :3000 untouched; tsc 0.
- Throwaway PG password: env `DP10_PG_PASSWORD` with labeled non-secret default `dp10spike-throwaway` for the ephemeral probe — acceptable at T0 /spike (env wins, never a real secret); secrets materialization is DP12/S91 (OQ-DP10-1).
- Docs: 8f1b66d == origin/main, mint validate + broken-links clean, both pages live 200; docs.json:579-580.
- `validation_humaine` STILL 0 hits in lib/v2 (consistent every DP step — requirement not yet built, so not regressable).
- OQ by-design: Linear MCP unauth (recurring), traefik_default prod routing = DP12, ideas persistence via idea_capture (record models, doesn't execute).
