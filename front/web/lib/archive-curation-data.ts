/**
 * The canonical §44.4 / §62 curation + QD examples for the /archive-curation panel (AIDOS step S26).
 *
 * These are the SAME cases the Go fixtures (back/archive/curation/curation_fixture_test.go and
 * back/archive/qd/qd_fixture_test.go) pin — the METHOD's example artifacts (var-7, phase-3, var-9,
 * createOrder/discount, n1), illustrative per the S26 spec, never invented business rules:
 *
 *   - the curation LEDGER: an UNSAFE branch ⇒ TOMBSTONE (still present); a stable_phase + a
 *     pareto_elite ⇒ KEEP; a failed variant >30d ⇒ COMPRESS (still present).
 *   - the MAP-Elites NICHE GRID: a green-mirror variant fills its niche cell (élite); a niche whose
 *     only candidate has a RED mirror leaves an EMPTY cell (no promotion without a green mirror).
 *
 * The panel renders the verdicts curate()/nicheGrid() compute over these — it RE-COMPUTES nothing
 * beyond the deterministic twin lib/archive-curation.ts (the Go deciders are authoritative).
 */

import type { Node, Variant } from "./archive-curation";

/** The fixed evaluation clock for the panel (a passed-in `now`, never Date.now()). */
export const NOW = Date.parse("2026-05-30T00:00:00Z");

/** The curation-ledger nodes — the §44.4 example DAG nodes. */
export const NODES: Node[] = [
	// THE done criterion: an unsafe branch ⇒ tombstone, still present.
	{ id: "var-7", flags: ["unsafe"] },
	// THE done criterion (keep): a stable phase node.
	{ id: "phase-3", kind: "stable_phase", flags: [] },
	// THE done criterion (keep): a pareto élite (this step's QD output).
	{ id: "var-2", flags: ["pareto_elite"] },
	// a failed variant older than 30d ⇒ compress, still present.
	{ id: "var-9", flags: ["failed"], createdAt: "2026-03-01T00:00:00Z" },
	// an obsolete experiment ⇒ tombstone.
	{ id: "exp-old", flags: ["obsolete_experiment"] },
	// a high-novelty stepping stone ⇒ keep (diversity).
	{ id: "var-novel", flags: ["high_novelty"] },
	// a duplicate behavior ⇒ compress.
	{ id: "var-dup", flags: ["duplicate_behavior"] },
];

/** The QD candidate variants — the §62 / §123 example niches. */
export const VARIANTS: Variant[] = [
	// THE done criterion (QD): a green-mirror variant fills its niche cell.
	{ id: "var-A", niche: "createOrder/discount", mirror: "green", fitness: 0.8 },
	// a higher-anchored-fitness green champion replaces the élite in the same niche.
	{ id: "var-C", niche: "createOrder/discount", mirror: "green", fitness: 0.9 },
	// THE anti-Goodhart anchor: a RED-mirror variant with HIGHER fitness ⇒ NOT promoted —
	// its niche cell stays EMPTY (the only candidate is red).
	{ id: "var-B", niche: "cancelOrder/refund", mirror: "red", fitness: 0.99 },
	// a second filled niche — MAP-Elites keeps one élite PER niche, a Pareto front of cells.
	{ id: "var-D", niche: "applyTax/eu", mirror: "green", fitness: 0.6 },
];
