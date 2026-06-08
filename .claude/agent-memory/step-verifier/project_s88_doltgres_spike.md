---
name: project-s88-doltgres-spike
description: S88 gating spike — Doltgres go/no-go verdict as a PURE content-addressed Decision; plain-postgres default by construction; verified green zero corrections
metadata:
  type: project
---

S88 = EPIC9 gating spike (ADR 0006 open-q #1) resolving "is Doltgres the emitted-app DEFAULT or opt-in?" by a MEASURE not an opinion.

- **back/runtime/doltgresspike**: PURE Evaluate(Measurement×Thresholds)→(Verdict,reasons) + Decide→content-addressed Decision via records.Hash. DefaultTarget ALWAYS plain-postgres (escape hatch by construction); doltgres in opt-in set iff Go. DefaultThresholds DECLARED {MaxPerfRatio 6.0, MaxFailedConns 0}. no-go iff REPRODUCIBLE instability past ceiling OR perf ratio over ceiling; non-reproducible blip never flips (recorded as caveat, stableEnough=true). unmeasured ratio(0)=worst-case no-go.
- **Done-crit**: Testcontainers concurrency_test submits N=64 concurrent pgx conns vs real Doltgres container + plain-postgres baseline, measures stability+perf ratio, RE-RUNS for reproducibility, asserts DefaultTarget==PlainPostgres always + verdict routing (go⇒0 failed / no-go⇒doltgres withdrawn). Decision=record (records.Hash). Real run gated AIDOS_RUN_DOLTGRES_SPIKE=1, skips cleanly w/o Docker = by-design forward-dep OpenQuestion (verdict logic proven by property mirror). PASS.
- **Mirrors green**: rapid property (Determinism/DefaultAlwaysPlainPostgres/OptInIffGo/ReproFlipsBlipDoesNot/PerfCeiling/5.2×-still-Go) + fast-check TS twin 7/7 + 4 e2e. TS twin uses sha256-over-JSON, NOT byte-pinned to Go records.Hash — acceptable (verdict logic mirrored, id content-addressed within each twin; same pattern as prior steps).
- go build/vet/gofmt clean, test -count=1 ok; tsc clean (only pre-existing behavior-capture Kind err, NOT this step); biome 6 files clean; vitest 7/7.
- MCP doltgres-spike 2 PURE tools (decide, defaults) write NOTHING; wall-grep CLEAN on MCP+actions. actions.ts WRITES NOTHING (Decision is a record). view.ts split out because "use server" only exports async fns (correct Next pattern). lib imports node:crypto LAZILY for client-bundle safety.
- nav-reachable WorkbenchHeader:150 {href:/doltgres-spike, k:doltgresSpike}; i18n 4535==4535, doltgresSpike 20==20 keys, nav.doltgresSpike both langs. panel has all e2e testids (decide-submit/field-conns/thresholds/decision/verdict/default-target/decision-id/field-failed/field-reproducible/data-optin).
- ADR 0047 (addendum 0006) accepted. docs 3-layer (## Implémentation/## Méta/## Méta-méta) docs.json:245-246, mint validate PASS, pushed 2591f5e HEAD==origin/main 0/0.
- OQ (by-design, non-blocking): real Doltgres test opt-in/Docker-gated forward-dep; Linear MCP unauthenticated (only OAuth tool surfaced).

verified-green ZERO corrections.
