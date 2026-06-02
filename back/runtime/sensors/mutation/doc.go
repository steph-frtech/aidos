// Package mutation is the AIDOS mutation-testing sensor — the *densimètre* of
// kernel tightness (KRD §19 the three timing drawers, §43/§59.8 "Serrage", §64
// the non-gameable Stop). A noyau trop maigre lets behaviour leak through the
// holes ("les tests passent mais le système se dégrade", KRD §188); mutation
// testing is what lets you *feel* that density.
//
// WHAT THIS PACKAGE IS (and is NOT):
//
//   - It is a PURE orchestration over the FROZEN runners — gremlins for the Go
//     scope, StrykerJS for the front scope (CLAUDE.md §3 mutation-testing slot).
//     It INVOKES them as subprocesses and PARSES their own JSON reports into one
//     shared MutationReport. It NEVER reimplements a mutation operator — those
//     belong to the runners (the replaceable slot).
//   - It computes a Gate(report, threshold) → verdict: a pure, total,
//     deterministic comparison. score ≥ threshold ⇒ pass, else block.
//   - The `threshold` is an INPUT read SELECT-only from the `fitness` schema
//     (NIVEAU 3, above the waterline, read-only — CLAUDE.md §2/§8). It is NEVER a
//     literal in this package: the agent must not author the bar it is graded
//     against (§8 anti-Goodhart, KRD §1831 "une fitness function buggée passe
//     tout", §1893 the waterline is immutable). A missing threshold is a BLOCK
//     made explicit (MISSING_THRESHOLD), never a self-chosen default.
//
// THE TIMING DRAWER (KRD §19): mutation testing is the PIPELINE, post-integration,
// more-expensive drawer — NOT the per-diff computational drawer (that is S07's
// PostToolUse sensors). It runs PERIODICALLY (serrage), never at each diff.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Score, Gate and the parsers are pure total
// functions of their input — no clock, no rng, no I/O — so the same (report,
// threshold) always yields the same verdict. The reproducibility mirror
// (gate_property_test.go) pins that. Only the Runner adapters touch the outside
// world (they shell out to gremlins/Stryker), and even their parse step is pure.
//
// BELOW THE WATERLINE: the run-log runtime.mutation_runs is a Runtime audit log,
// not truth. The agent role MAY append to it (INSERT+SELECT on the runtime
// schema, S05). The truth schemas (kernel/mirrors/fitness) stay SELECT-only; this
// package adds no fitness row and no fitness write GRANT.
package mutation
