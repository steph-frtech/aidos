// Package main is the AIDOS Stop:besoin-gate hook (ROADMAP-compound-requirements
// EL11) — a SEPARATE Go binary from back/hooks/stop (which reads the kernel-side
// completeness CUT from the `mirrors` Postgres schema). This hook gates the
// COMPOUND-DU-BESOIN sessions: at Stop it refuses to let a level be DESCENDED (or
// an Idea be promoted) while the current rung of an OPEN BesoinGraph is not yet
// right-sized OR carries a need-completeness monster.
//
// SCOPED, NEVER OVER-FIRING (CLAUDE.md §5 — a hook that fires on every session is
// the dead/over-firing hook). The gate is scoped to sessions that carry an OPEN
// BesoinGraph: the Stop event names a project + a current level + the graph cut.
// A session WITHOUT a BesoinGraph (no `besoin` block in the event) is a NO-OP — the
// hook allows the Stop, untouched (it is not the kernel completeness gate).
//
// THE OR, NOT THE AND (EL11). The gate BLOCKS the descent iff, for the current
// level, EITHER:
//   - ¬CanDescend(graph, level, meta).Enough  (EL07: the rung is not right-sized), OR
//   - BesoinCompleteness(graph, mirrors, metadata) finds a monster AT the current
//     level (EL09: a resolved rung without/with-wrong its level-mirror, an orphan,
//     or vanished metadata).
//
// The two failure modes are INDEPENDENT — each blocks on its own (an OR). A level
// can be not_enough WITHOUT a monster and still be refused; a monster blocks even
// when the rung is otherwise enough.
//
// DISPATCH / ORDER WITH THE KERNEL Stop (EL11). This binary is the BESOIN gate; the
// existing back/hooks/stop binary is the KERNEL-completeness gate. They are distinct
// processes wired on the same Stop phase: the harness runs the kernel gate over the
// `mirrors` cut and this gate over the besoin event. Order is independent — each
// fails closed on its own zone; neither relaxes the other (the wall only ADDs).
//
// THE WALL (CLAUDE.md §2 — the hook REINFORCES the wall, never removes a guard,
// meta-loop §5): this hook READS the BesoinGraph carried in the Stop event (above
// the line — a need, not a truth) and WRITES NOTHING (no kernel, no mirror, no
// besoin row). Its only output is an actionable BlockReason on stdout. A
// malformed/undecodable `besoin` block fails CLOSED (block) — an unverifiable gate
// never silently passes (KRD §82 .passthrough()).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is COMPUTED by the pure functions
// CanDescend (EL07) + BesoinCompleteness (EL09), never an LLM judgment. The
// reproducibility mirror (gate_property_test.go) pins same-event → same-decision.
// It is harness-invoked, never a callable op (so: not an MCP).
package main
