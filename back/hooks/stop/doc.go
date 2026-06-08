// Package main is the AIDOS Stop hook (KRD §74/§77 line
// `run: "goal-check && completeness-check", on_fail: continue`). At session/turn
// close it runs the NON-BYPASSABLE completeness gate over the current cut of
// mirrors ⋈ kernel and BLOCKS while any monster exists (a spec without a living
// mirror = no_truth_without_mirror; an orphan mirror = no_orphan_mirror — KRD §29,
// LIVRE XXII §126-§127).
//
// ACTIVATED AT S12 for the completeness half. The goal-check half (red set → green
// ∧ prior green intact ∧ mutation ≥ threshold ∧ no monster) is now ACTIVE at S29
// (was OQ-S12-2): it REUSES the pure engine goal.IsClosed / goal.CloseBlockReason
// (back/runtime/goal) and BLOCKS the Stop while an OPEN goal is not closeable —
// the non-gameable stop (the agent never grades its own copy). goal-check runs
// FIRST (`goal-check && completeness-check`); both have fault-injection tests.
//
// THE WALL (CLAUDE.md §2): this hook READS the head projection of mirrors ⋈ kernel
// (the cut) and writes only its own audit log in runtime.completeness_runs (below
// the waterline — ADR 0014/0015). It never writes truth. It is harness-invoked,
// never a callable op (so: not an MCP).
package main
