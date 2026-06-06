---
name: project-el11-besoingate
description: EL11 verification — Stop:besoin-gate hook (OU between ¬enough EL07 and monster EL09)
metadata:
  type: project
---

EL11 = a DISTINCT Stop-phase Go binary `back/hooks/stop/besoin-gate/` (separate from `back/hooks/stop` kernel-completeness gate). Pure `Decide(StopEvent)->Decision`: blocks descent iff ¬CanDescend.enough (EL07) **OR** a monster AT the current level (EL09) — the OU not the ET, two INDEPENDENT library calls (besoin.CanDescend + besoin.BesoinCompleteness, no self-comparison). No `besoin` block in event ⇒ VerdictNoOp (no over-firing §5). Malformed ⇒ fail-closed block (KRD §82). Block surfaces declared EL11 umbrella how_to_fix (declare_missing_metadata/resolve_ref/state_invariant_as_forall/assign_authority/narrow_option_space). Monsters at OTHER levels ignored (gates CURRENT level only).

Done-criteria all PROVEN: fault-injection RED per disjunct each green — SuppressTruthKind→¬enough block, NotEnoughWithoutMonster→OU block, MonsterWithoutNotEnough→monster block, NoBesoinGraph→no-op, malformed→fail-closed. Verdict COMPUTED (rapid TestDecide_Deterministic + OR invariant + fast-check, no clock/rng/IO/LLM). Wall STRUCTURAL: gate.go/main.go import ONLY runtime/besoin + runtime/blockreason — no pgx/sql/INSERT/kernel-mirror/fitness; reads BesoinGraph from event payload, writes nothing (EL15 besoin schema = fwd-dep OQ).

Go gofmt/vet/test(-count=1)/build ./... clean. TS twin lib/besoin-gate.ts COMPOSES canDescend(EL07)+besoinCompleteness(EL09) twins (no re-impl), vitest 7/7, tsc clean. Panel takes labels as PROPS (no t() inside), runs decide() in-browser (no fetch/truth-write = front wall holds). 3 controls (evaluate/break-right-sizing/break-mirror) + reset/detach. nav.besoinGate wired WorkbenchHeader:50. i18n besoinGate ns 28 page keys ALL present both locales, total 2917==2917. e2e 3/3 :3000 (allow / break-right-sizing→OU block / break-mirror→monster then detach→no-op). docs e083684 HEAD==origin/main both pages 3 layers (Implémentation·Méta·Méta-méta) mint-validate passed, registered docs.json.

SCAR: [[feedback-biome-clean-report-lie]] recurred AGAIN — report said "vitest+fast-check 7/7 green / biome ... clean" but `biome check lib/besoin-gate.ts` had 1 import-ordering error (type import between two value-import groups). Autofix SAFE (pure reorder), applied + recommitted ba36c3f; vitest still 7/7. AIDOS code was committed by executor at 863fbcc.

OQ (non-blocking fwd-dep §6): (1) Linear MCP unauthenticated — step issue not moved, best-effort. (2) EL15 besoin Postgres schema + loader not built — gate reads BesoinGraph from Stop event payload, DB-scoped loader back-filled at EL15. (3) Mintlify hosted index propagation lag (pages pushed+validated+broken-links-clean).

Verdict: PASS, 1 correction (biome import-sort).
