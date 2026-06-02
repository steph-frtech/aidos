// Package main is the AIDOS Stop hook (KRD §74/§77 line
// `run: "goal-check && completeness-check", on_fail: continue`). At session/turn
// close it runs the NON-BYPASSABLE completeness gate over the current cut of
// mirrors ⋈ kernel and BLOCKS while any monster exists (a spec without a living
// mirror = no_truth_without_mirror; an orphan mirror = no_orphan_mirror — KRD §29,
// LIVRE XXII §126-§127).
//
// ACTIVATED AT S12 for the completeness half. The goal-check half (red set → green
// ∧ prior green intact ∧ mutation ≥ threshold) is OQ-S12-2, wired at S29; until
// then it is inert (the README documents the full scaffold).
//
// THE WALL (CLAUDE.md §2): this hook READS the head projection of mirrors ⋈ kernel
// (the cut) and writes only its own audit log in runtime.completeness_runs (below
// the waterline — ADR 0014/0015). It never writes truth. It is harness-invoked,
// never a callable op (so: not an MCP).
package main
