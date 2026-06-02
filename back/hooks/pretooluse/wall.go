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
// Level 2 (the Postgres GRANTs in back/migrations/wall_grants_baseline.sql) is the
// fail-closed backstop: even if this hook is bypassed, the agent DB role has no
// write privilege above the line. The wall holds at both levels.
package main

import (
	"strings"
)

// Verdict is the hook's decision. There are exactly two — there is no third
// verdict (the rapid invariant pins this).
type Verdict string

const (
	// VerdictAllow lets the write proceed (below the waterline — projections, free).
	VerdictAllow Verdict = "allow"
	// VerdictDeny refuses the write (above the waterline — kernel/mirrors/fitness).
	VerdictDeny Verdict = "deny"
)

// BlockCode is the stable, machine-readable code of a refusal.
type BlockCode string

// CodeAgentWriteAboveWaterline is the one code this wall emits: an agent attempted
// to write a truth zone above the waterline.
const CodeAgentWriteAboveWaterline BlockCode = "AGENT_WRITE_ABOVE_WATERLINE"

// BlockReason is the actionable refusal shape shared across AIDOS block sites
// (CLAUDE.md §2: code, severity, explanation, how_to_fix[]). A wall without a
// BlockReason becomes a prison — the refusal always names the door.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Decision is the classifier's output: a verdict and, on deny, the BlockReason.
type Decision struct {
	Verdict     Verdict
	BlockReason *BlockReason
}

// aboveWaterlineSchemas are the truth schemas above the line — the agent never
// writes them (CLAUDE.md §1 schema→holds table; §2 the wall). `fitness` is the
// NIVEAU 3 read-only méta-méta; `mirrors` covers the bicephalous Mirror plane.
var aboveWaterlineSchemas = []string{"kernel", "mirrors", "fitness"}

// aboveWaterlinePathPrefixes are the on-disk source zones that ARE truth (the code
// projection of the above-the-line schemas). back/kernel/** covers
// back/kernel/mirror/** by ADR 0002 (the Mirror is a plane inside the Kernel).
var aboveWaterlinePathPrefixes = []string{
	"back/kernel/",
	"back/migrations/", // the truth-store DDL is truth-shaped; only aidos writes it
}

// Classify maps any write target (a schema name or a path) to a Decision. It is
// the deep, well-named heart of the wall: deny IFF the target resolves to a zone
// above the waterline; allow otherwise. Pure and total.
func Classify(target string) Decision {
	t := strings.TrimSpace(target)
	t = strings.TrimPrefix(t, "/")

	if isAboveWaterline(t) {
		return Decision{Verdict: VerdictDeny, BlockReason: aboveWaterlineBlockReason(target)}
	}
	return Decision{Verdict: VerdictAllow}
}

// isAboveWaterline reports whether a target string names a truth zone. It matches
// both a bare schema name (`kernel`), a schema-qualified table (`kernel.truth`),
// and an on-disk source path (`back/kernel/...`).
func isAboveWaterline(t string) bool {
	lower := strings.ToLower(t)

	// Schema-qualified or bare schema name: "kernel", "kernel.truth", "mirrors", …
	head := lower
	if i := strings.IndexAny(head, "./ \t"); i >= 0 {
		head = head[:i]
	}
	for _, s := range aboveWaterlineSchemas {
		if head == s {
			return true
		}
	}

	// On-disk source paths that are truth.
	for _, p := range aboveWaterlinePathPrefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

// aboveWaterlineBlockReason builds the canonical actionable refusal. The how_to_fix
// always names the only door to the kernel: idea → mirror → /goal → approval.
func aboveWaterlineBlockReason(target string) *BlockReason {
	return &BlockReason{
		Code:     CodeAgentWriteAboveWaterline,
		Severity: "error",
		Explanation: "Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness). " +
			"Cible refusée : « " + target + " ». Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
		HowToFix: []string{
			"Ne jamais écrire la vérité au passage : créez une idea (candidate-truth) dans le schéma ideas.",
			"Écrivez son mirror (Gherkin / property / fixture) — le rouge est le /goal.",
			"Ouvrez un /goal et obtenez l'approbation humaine : idea → mirror → /goal → approbation.",
			"Le ChangeSet approuvé est appliqué par le rôle `aidos` — la seule porte vers le noyau.",
		},
	}
}
