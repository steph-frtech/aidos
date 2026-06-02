---
name: s50-temporal
description: S50 TemporalInvariant (KRD §49.3) — pure clock-required Validate + one-sided tolerance-band Evaluate, expand-only migration, action-capable /temporal-invariants; verified-green
metadata:
  type: project
---

S50 = KRD §49.3 TemporalInvariant — "toute vérité temporelle doit déclarer son horloge".

**Shape**: pure Go `back/kernel/temporal` + TS twin `front/web/lib/temporal.ts`. AST {property, antecedent, consequent, relation, bound, clock, tolerance, mirror}. `Validate` = load-bearing clock-required rule (missing clock rejected) + enum/duration guards + logical-clock-no-wall-tolerance. `Evaluate(inv, obs)→{held|violated}` total/deterministic/no-panic; tolerance band applied EXACTLY ONCE, ONE-SIDED upper (you violate a deadline by being late). Event order checked (consequent before antecedent ⇒ violated). NO time.Now()/clock — elapsed PASSED IN via Observation (determinism-first). Reproducibility mirror = rapid property (total+deterministic, band-once, exact-bound inclusive +1ns past violated).

**The done case**: 4m58s HELD (in bound), 5m04s HELD (in tolerance 5m+10s — the NO-FLAKE case), 5m20s VIOLATED/TEMPORAL_INVARIANT_VIOLATED (how_to_fix confirm_within_5m_or_compensate), out-of-order VIOLATED.

**Migration** `kernel_temporal_invariant_baseline.sql` expand-only: MOVE 1 widens S06 mirror_record cert_language CHECK to admit statechart+tla+ (uppaal omitted — no live row, dead-enum-member = monster); MOVE 2 adds NULLABLE temporal jsonb on kernel.truth + CHECK pinning clock∈{system,external,logical} & mirror∈{statechart,tla+,uppaal} when present. NOT a new truth_kind (§13.4 has no temporal). GRANTs UNCHANGED (wall held). NB: S06 cert_language CHECK is UNNAMED inline but Postgres auto-names it `mirror_record_cert_language_check` so the DROP IF EXISTS hits it — confirmed by Testcontainers TestMirrorCertLanguageWidened passing (statechart/tla+ accepted, uml rejected). Executor's flagged "DROP no-op" concern resolved by reality.

**ADR**: 0034 (note: 0027 was already taken by S37; executor renumbered to 0034 — ADR collision scar).

**Mirrors**: fixture (6 Go tests) + rapid property (4) + Testcontainers roundtrip (fragment roundtrip, clock/mirror CHECK reject, cert_language widened, agent SELECT-only wall). All green (go test ./kernel/temporal ok ~11s). tsc clean, vitest 9/9, biome clean, go vet/build clean.

**UI**: action-capable /temporal-invariants (34 i18n keys both locales, nav wired under nav.temporal, propose→ChangeSet stub for truth-write, read-only re-evaluate); e2e 7 scenarios mirroring sagas pattern (not run live — verdicts deterministic from EVALUATION_ROWS, same evaluate proven by vitest).

**Docs**: concept + internals (3 layers) mdx, registered in docs.json (2 refs), mint validate success, pushed to steph-frtech/docs main commit 1e3bc95 (HEAD==upstream).

Verified-green. Linear = OQ (linear-server MCP unauthenticated in env).
