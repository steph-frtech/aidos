// Package wall is the IMPORTABLE, single-sourced waterline classifier of AIDOS —
// the deep heart of the wall (CLAUDE.md §2), extracted from the S04 PreToolUse hook
// binary (back/hooks/pretooluse, package main) which could not be imported.
//
// Why this package exists (OQ-S52-wall, resolved at BA03). The classifier USED to
// live in `package main` of the hook binary, so neither the agentlayer wall
// (MayWrite) nor the agentimpl emitter (ForbiddenPaths) could import it — each
// re-derived the same schema/prefix set by hand, a single-source-of-truth gap. This
// package is now the ONE place the above-the-waterline zone set is declared; the
// hook re-exports these symbols (anti-overwrite §9: supersede-via-projection, the
// hook keeps its exact public surface, its regression mirrors pass UNCHANGED), and
// the emitter's WallForbiddenPaths reads ForbiddenZones() from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Classify is a PURE TOTAL function of the
// target string — no clock, no rng, no I/O — so the same target always yields the
// same verdict (the property mirror pins it). The wall is a MEANS to enforce the
// human-owned truth boundary; it is not a truth itself (it writes nothing).
package wall

import "strings"

// Verdict is the classifier's decision. There are exactly two — there is no third
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

// ForbiddenZones returns a FRESH copy of the closed set of truth zones above the
// waterline — the schemas (kernel, mirrors, fitness) THEN the on-disk truth path
// prefixes (back/kernel/, back/migrations/), in canonical order. This is the ONE
// single source the hook, the agentlayer wall, and the agentimpl emitter all read;
// nobody mutates the canonical slice (a fresh copy is returned). Non-empty by
// construction.
func ForbiddenZones() []string {
	out := make([]string, 0, len(aboveWaterlineSchemas)+len(aboveWaterlinePathPrefixes))
	out = append(out, aboveWaterlineSchemas...)
	out = append(out, aboveWaterlinePathPrefixes...)
	return out
}

// Classify maps any write target (a schema name or a path) to a Decision. It is
// the deep, well-named heart of the wall: deny IFF the target resolves to a zone
// above the waterline; allow otherwise. Pure and total.
func Classify(target string) Decision {
	t := strings.TrimSpace(target)
	t = strings.TrimPrefix(t, "/")

	if IsAboveWaterline(t) {
		return Decision{Verdict: VerdictDeny, BlockReason: aboveWaterlineBlockReason(target)}
	}
	return Decision{Verdict: VerdictAllow}
}

// IsAboveWaterline reports whether a target string names a truth zone. It matches
// both a bare schema name (`kernel`), a schema-qualified table (`kernel.truth`),
// and an on-disk source path (`back/kernel/...`). Pure and total.
func IsAboveWaterline(t string) bool {
	lower := strings.ToLower(strings.TrimSpace(t))
	lower = strings.TrimPrefix(lower, "/")

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
