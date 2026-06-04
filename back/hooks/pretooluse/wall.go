// Package main is the AIDOS PreToolUse wall hook — level 1 of defense-in-depth
// (CLAUDE.md §2). It reads a tool-call event on stdin, classifies the write target
// against the waterline, and refuses any agent write above the line (kernel /
// mirrors / fitness) with an actionable BlockReason (code
// AGENT_WRITE_ABOVE_WATERLINE); it passes through anything below the line.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Classify is a pure total function of the
// target string — no clock, no rng, no I/O — so the same target always yields the
// same verdict. The wall is a MEANS to enforce the human-owned truth boundary; it
// is not a truth itself (it writes nothing).
//
// SINGLE-SOURCED (OQ-S52-wall, resolved at BA03). The classifier itself now lives in
// the IMPORTABLE package back/hooks/pretooluse/wall — the ONE source of the
// above-the-waterline zone set, shared by this hook, the agentlayer wall
// (MayWrite), and the agentimpl emitter (ForbiddenPaths). This file re-exports those
// symbols verbatim (anti-overwrite §9: supersede-via-projection — the hook keeps its
// exact public surface; its regression mirrors wall_bdd_test / wall_property_test
// pass UNCHANGED). The classifier moved; the behaviour did not.
//
// Level 2 (the Postgres GRANTs in back/migrations/wall_grants_baseline.sql) is the
// fail-closed backstop: even if this hook is bypassed, the agent DB role has no
// write privilege above the line. The wall holds at both levels.
package main

import (
	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
)

// Verdict is the hook's decision — re-exported from the single-sourced wall package.
type Verdict = wall.Verdict

const (
	// VerdictAllow lets the write proceed (below the waterline — projections, free).
	VerdictAllow = wall.VerdictAllow
	// VerdictDeny refuses the write (above the waterline — kernel/mirrors/fitness).
	VerdictDeny = wall.VerdictDeny
)

// BlockCode is the stable, machine-readable code of a refusal.
type BlockCode = wall.BlockCode

// CodeAgentWriteAboveWaterline is the one code this wall emits: an agent attempted
// to write a truth zone above the waterline.
const CodeAgentWriteAboveWaterline = wall.CodeAgentWriteAboveWaterline

// BlockReason is the actionable refusal shape shared across AIDOS block sites.
type BlockReason = wall.BlockReason

// Decision is the classifier's output: a verdict and, on deny, the BlockReason.
type Decision = wall.Decision

// Classify maps any write target (a schema name or a path) to a Decision. It is the
// single-sourced waterline classifier (wall.Classify): deny IFF the target resolves
// to a zone above the waterline; allow otherwise. Pure and total.
func Classify(target string) Decision {
	return wall.Classify(target)
}
