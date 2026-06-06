---
name: fn01-functional-spike
description: FN01 = confined throwaway spike proving a pure-functional emitter byte-reproduces the checkout slice; spike steps ship no UI/e2e (UI lands at FN06).
metadata:
  type: project
---

FN01 is a spike-gate step (KRD §84, ratchet OFF, rigor T0) in the FN topic (ROADMAP-functional.md). Modeled on HR01.

The probe lives in an ISOLATED Go module `aidos.spike/functional` (`/data/dev/aidos/spike/functional/`, own go.mod, imports nothing from back/ — `TestConfinement` AST-scans for `steph-frtech/aidos`). `EmitFunctional(Entity) Projection` is a pure pipeline: `typeBindings()` returns the binding table by value (replaces the imperative emitter's package-level `var typeMap` at back/runtime/generators/emit.go:24); render{Go,DDL,TS} fold/concat over immutable slices via `mapFields` (higher-order). Verdict is COMPUTED by `Decide()` reading bytes (parity ∧ reproducibility ∧ zero globals), never declared (§8).

**Why no UI/e2e:** the FN roadmap explicitly assigns the Workbench functional-graph route + Playwright e2e + 2 Mintlify pages to **FN06**. FN01's own done-criteria are only "spike confiné prouve faisabilité + verdict documenté". A confined throwaway spike has no graduating capability to wire to a screen (like HR01, which shipped no route). So ui-completeness is N/A for spike steps — record as an OpenQuestion, do NOT block.

**How to apply:** for any FN-topic spike step, verify: tests green from `cd spike/functional`, fault-injection alive (inject a package-level `var` → TestNoGlobalMutableVar goes red), both Mintlify pages live (concept + internals with 3 layers) and pushed to origin/main, mint validate clean. Do NOT demand a Workbench route or e2e — those are FN06. Linear OAuth typically unauthenticated → OpenQuestion per §11, not a blocker. Verified-green.
