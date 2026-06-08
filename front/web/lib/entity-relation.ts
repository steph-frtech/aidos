/**
 * The entity-relation twin — the Workbench /entity-relation source (AIDOS step S71).
 *
 * The DECLARED projection of the Go package back/kernel/entities/ref: the SAME relation
 * AST node — a DISTINCT node from a scalar Attribute — that extends the entity type
 * system with a typed reference (1-1 / 1-N / N-N, fk / association / composition)
 * WITHOUT widening the closed scalar set of S35. The two planes are disjoint: an entity
 * carries ordered scalar attributes AND, additively, ordered relations. A relation never
 * widens the scalar enum.
 *
 * THE CLOSED-SET HONESTY (the S71 done-criterion). A relation's TARGET is RESOLVED
 * against the declared entity set, never guessed: a relation to an entity the set does
 * not declare is REFUSED (UNKNOWN_RELATION_TARGET), exactly as an unknown scalar type is
 * refused. An out-of-set cardinality/semantic is refused (UNKNOWN_RELATION_KIND). No
 * mapping is ever invented.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no
 * rng, no I/O, no LLM — so a relation ROUND-TRIPS as a content-addressed AST and yields
 * the SAME content hash as the Go ref.ID (verified byte-equal). The reproducibility
 * mirror lib/entity-relation.test.ts (fast-check) pins determinism, the content-addressed
 * round-trip, the closed sets, and the UNKNOWN_RELATION_TARGET refusal. The Go output is
 * the AUTHORITATIVE truth; this twin reproduces it for the screen.
 *
 * READ-ONLY (the wall): /entity-relation PROJECTS and VALIDATES; it never writes truth. A
 * relation is a SOURCE above the line; truth-writes go via propose → ChangeSet → approval.
 */

import { createHash } from "node:crypto";

/** The CLOSED relation-cardinality set — never invented ad-hoc. */
export type Cardinality = "1-1" | "1-N" | "N-N";

/** The canonical cardinality order — declared, never derived from iteration. */
export const CARDINALITIES: readonly Cardinality[] = [
	"1-1",
	"1-N",
	"N-N",
] as const;

/** The CLOSED relation-semantic set — the meaning of the reference. */
export type Semantic = "fk" | "association" | "composition";

/** The canonical semantic order — declared, never derived from iteration. */
export const SEMANTICS: readonly Semantic[] = [
	"fk",
	"association",
	"composition",
] as const;

/** The entity-relation SOURCE AST node (KRD §23/§26, S71) — a DISTINCT node, not a scalar. */
export interface Relation {
	name: string;
	target: string;
	cardinality: Cardinality;
	semantic: Semantic;
	required?: boolean;
}

/** The S13 BlockReason shape (reused, never a new code beyond a human red). */
export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

const KNOWN_CARDINALITIES = new Set<string>(CARDINALITIES);
const KNOWN_SEMANTICS = new Set<string>(SEMANTICS);

/** isKnownCardinality — membership in the closed cardinality set. */
export function isKnownCardinality(c: string): c is Cardinality {
	return KNOWN_CARDINALITIES.has(c);
}

/** isKnownSemantic — membership in the closed semantic set. */
export function isKnownSemantic(s: string): s is Semantic {
	return KNOWN_SEMANTICS.has(s);
}

/** SHA-256 hex — the same content hash Go uses (records.Hash). */
function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

/**
 * canonicalBody mirrors Go's records.Canonicalize(json.Marshal(Relation)): object keys
 * sorted lexicographically, no insignificant whitespace, omitempty for false `required`.
 * Verified byte-equal to the Go ref.Body.
 */
function canonicalBody(r: Relation): string {
	const o: Record<string, unknown> = {
		name: r.name,
		target: r.target,
		cardinality: r.cardinality,
		semantic: r.semantic,
	};
	// Go's json.Marshal has `required,omitempty`: a false required key is ABSENT.
	if (r.required) o.required = true;
	const keys = Object.keys(o).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(",")}}`;
}

/** The content address of a relation (= Go's ref.ID = Hash(Canonicalize(body))). */
export function relationId(r: Relation): string {
	return sha256(canonicalBody(r));
}

/** The canonical body string (= Go's ref.Body) — the round-trip serialization. */
export function relationBody(r: Relation): string {
	return canonicalBody(r);
}

/** A well-shaped relation returns null; otherwise the cause string. Does NOT resolve target. */
export function validateShape(r: Relation): string | null {
	if (!r.name) return "relation pins no name";
	if (!r.target) return "relation pins no target entity";
	if (!isKnownCardinality(r.cardinality))
		return `unknown cardinality: ${r.cardinality}`;
	if (!isKnownSemantic(r.semantic)) return `unknown semantic: ${r.semantic}`;
	return null;
}

/**
 * resolve — validates the shape AND resolves the target against the declared entity set.
 * A target the set does not hold is the canonical UNKNOWN_RELATION_TARGET refusal (the
 * honesty of the closed set: never guessed). Returns null when resolvable, else a cause.
 */
export function resolve(r: Relation, known: readonly string[]): string | null {
	const shape = validateShape(r);
	if (shape) return shape;
	if (!known.includes(r.target))
		return `relation targets an entity outside the declared set: ${r.target}`;
	return null;
}

/** blockUnknownTarget — the canonical S13 BlockReason for a refused relation (no prison). */
export function blockUnknownTarget(cause: string): BlockReason {
	const code =
		cause.startsWith("unknown cardinality") ||
		cause.startsWith("unknown semantic")
			? "UNKNOWN_RELATION_KIND"
			: "UNKNOWN_RELATION_TARGET";
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Relation refusée (${code}) : ${cause}. Un nœud de relation référence une entité DÉCLARÉE de l'ensemble, avec une cardinalité du jeu fermé (1-1 | 1-N | N-N) et une sémantique du jeu fermé (fk | association | composition). L'ensemble scalaire reste clos : une relation est un nœud à part, jamais un scalaire, et sa cible n'est JAMAIS devinée (honnêteté de l'ensemble clos).`,
		how_to_fix: [
			"declare_the_target : déclarez l'entité cible dans l'ensemble avant de la référencer ; une cible inconnue n'est jamais devinée.",
			"use_a_known_kind : la cardinalité ∈ {1-1, 1-N, N-N} et la sémantique ∈ {fk, association, composition}.",
			"pin_the_relation : complétez le nœud de relation (name + target + cardinality + semantic).",
		],
	};
}

/** A type guard discriminating a content address (ok) from a BlockReason. */
export function isBlocked(x: string | BlockReason): x is BlockReason {
	return typeof x !== "string";
}

/**
 * address — resolve then content-address a relation. Returns the content hash (ok), or a
 * BlockReason (refused). This is the single op the screen invokes.
 */
export function address(
	r: Relation,
	known: readonly string[],
): string | BlockReason {
	const cause = resolve(r, known);
	if (cause) return blockUnknownTarget(cause);
	return relationId(r);
}

// ── The declared demo (no clock, no rng, no I/O) ─────────────────────────────

/** The declared entity set the demo relations resolve against. */
export const DEMO_ENTITIES: readonly string[] = [
	"Order",
	"Customer",
	"LineItem",
	"Product",
] as const;

/** Order ──1-N FK──▶ Customer — the canonical resolvable relation. */
export const DEMO_RELATION: Relation = {
	name: "customer",
	target: "Customer",
	cardinality: "1-N",
	semantic: "fk",
	required: true,
};

/** Order ──▶ Ghost — the canonical UNKNOWN_RELATION_TARGET (Ghost is not declared). */
export const DEMO_BAD_RELATION: Relation = {
	name: "ghost",
	target: "Ghost",
	cardinality: "1-1",
	semantic: "fk",
};
