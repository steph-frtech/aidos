/**
 * The entity-modeler twin — the Workbench /entity-modeler source (AIDOS step S75).
 *
 * The DECLARED projection of the Go package back/kernel/entities/modeler: the canvas-side
 * engine that shapes a draft entity/relation schema (entities with scalar attributes +
 * identifiers, and the relations between them) and PROPOSES it as a project-scoped Kernel
 * source via propose → ChangeSet → approval — NEVER a direct truth-write from the screen
 * (the wall, CLAUDE.md §2).
 *
 * DRAFT-LEVEL CONCURRENCY (distinct from S110's truth-write concurrency). The canvas is a
 * pre-proposal artifact: two editors conflict over a DRAFT, not over truth. mergeDrafts is
 * a CRDT-style three-way merge so that NEITHER editor's add/edit is silently overwritten
 * (the S75 done-criterion "deux éditeurs simultanés ne s'écrasent pas").
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng,
 * no I/O, no LLM. schemaHash is canonical and INPUT-ORDER-INVARIANT (nodes/relations sorted
 * before hashing), so two editors who built the same nodes in a different order get the
 * same content address — byte-equal to the Go modeler.SchemaHash. The reproducibility
 * mirror lib/entity-modeler.test.ts (fast-check) pins it. The Go output is AUTHORITATIVE;
 * this twin reproduces it for the screen.
 *
 * READ-ONLY w.r.t. truth (the wall): propose returns a DRAFT changeset; it writes nothing.
 */

import { createHash } from "node:crypto";
import type { Cardinality, Relation, Semantic } from "./entity-relation";

export type { Cardinality, Relation, Semantic };

/** The CLOSED entity scalar set (S35), reused verbatim — never widened. */
export type ScalarType = "string" | "int" | "decimal" | "bool" | "timestamptz";

export const SCALAR_TYPES: readonly ScalarType[] = [
	"string",
	"int",
	"decimal",
	"bool",
	"timestamptz",
] as const;

/** One ordered scalar attribute of an entity (order is semantic). */
export interface Attribute {
	name: string;
	type: ScalarType;
	required?: boolean;
	identifier?: boolean;
	multivalued?: boolean;
}

/** The entity SOURCE AST (S35): name + ordered attributes. */
export interface Entity {
	name: string;
	attributes: Attribute[];
}

/** A canvas node: an entity + the relations declared on it (the shape S74 emits). */
export interface EntityNode {
	entity: Entity;
	relations: Relation[];
}

/** The canvas draft: a project-scoped set of entity nodes (pre-proposal, no truth). */
export interface Draft {
	project: string;
	nodes: EntityNode[];
}

/** The S13 BlockReason shape (reused, never a new code beyond a human red). */
export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

const KNOWN_SCALARS = new Set<string>(SCALAR_TYPES);
const KNOWN_CARDS = new Set<string>(["1-1", "1-N", "N-N"]);
const KNOWN_SEMS = new Set<string>(["fk", "association", "composition"]);

function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

/** The single identifier attribute of an entity, or null. */
export function identifier(e: Entity): Attribute | null {
	for (const a of e.attributes) if (a.identifier) return a;
	return null;
}

/**
 * validate — checks the whole draft is a proposable, RESOLVABLE schema (mirrors Go
 * modeler.Validate): a project scope + at least one node; unique entity names; every entity
 * valid (name, attrs, known types, ≤1 identifier); every relation resolves against the
 * declared set (UNKNOWN_RELATION_TARGET refused, never guessed); an FK/1-1/1-N/N-N relation
 * requires the target to carry an identifier (the FK-target-without-identifier gate).
 * Returns null when proposable, else the cause.
 */
export function validate(d: Draft): string | null {
	if (!d.project) return "draft pins no project scope";
	if (d.nodes.length === 0) return "draft has no entity nodes";
	const seen = new Set<string>();
	const known = new Set<string>();
	for (const n of d.nodes) {
		if (seen.has(n.entity.name))
			return `two nodes declare the same entity name: ${n.entity.name}`;
		seen.add(n.entity.name);
		known.add(n.entity.name);
	}
	const byName = new Map<string, Entity>();
	for (const n of d.nodes) byName.set(n.entity.name, n.entity);
	for (const n of d.nodes) {
		const e = n.entity;
		if (!e.name) return "entity pins no name";
		if (e.attributes.length === 0) return `entity ${e.name} pins no attributes`;
		let ids = 0;
		for (const a of e.attributes) {
			if (!a.name) return `entity ${e.name}: an attribute pins no name`;
			if (!KNOWN_SCALARS.has(a.type))
				return `entity ${e.name}: attribute ${a.name} pins an unknown type ${a.type}`;
			if (a.identifier) ids++;
		}
		if (ids > 1) return `entity ${e.name}: more than one identifier`;
		for (const r of n.relations) {
			if (!r.name) return `entity ${e.name}: relation pins no name`;
			if (!r.target) return `entity ${e.name}: relation pins no target`;
			if (!KNOWN_CARDS.has(r.cardinality))
				return `entity ${e.name}: relation ${r.name} unknown cardinality`;
			if (!KNOWN_SEMS.has(r.semantic))
				return `entity ${e.name}: relation ${r.name} unknown semantic`;
			if (!known.has(r.target))
				return `entity ${e.name}: relation ${r.name} targets an entity outside the declared set: ${r.target}`;
			const tgt = byName.get(r.target);
			if (tgt && !identifier(tgt))
				return `entity ${e.name}: relation ${r.name} targets ${r.target} which has no identifier (FK has no column to reference)`;
		}
	}
	return null;
}

/** blockInvalid — the canonical BlockReason for a malformed draft (no prison). */
export function blockInvalid(cause: string): BlockReason {
	return {
		code: "MODELER_INVALID_DRAFT",
		severity: "blocking",
		explanation: `Le brouillon n'est pas un schéma proposable : ${cause}.`,
		how_to_fix: [
			"corrigez l'entité ou la relation signalée (nom, type scalaire, identifiant, cible de relation)",
			"toute relation doit cibler une entité déclarée dans le brouillon (jamais devinée)",
			"une relation 1-1 / 1-N / N-N exige que l'entité cible porte un identifiant",
		],
	};
}

/** A JSON value canonicalizer mirroring Go's records.Canonicalize (sorted object keys). */
function canon(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	const o = v as Record<string, unknown>;
	const keys = Object.keys(o).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}

/** An attribute as Go marshals it (omitempty on false required/identifier/multivalued). */
function attrJSON(a: Attribute): Record<string, unknown> {
	const o: Record<string, unknown> = {
		name: a.name,
		type: a.type,
		required: !!a.required,
	};
	if (a.identifier) o.identifier = true;
	if (a.multivalued) o.multivalued = true;
	return o;
}

/** A relation as Go marshals it (omitempty on false required). */
function relJSON(r: Relation): Record<string, unknown> {
	const o: Record<string, unknown> = {
		name: r.name,
		target: r.target,
		cardinality: r.cardinality,
		semantic: r.semantic,
	};
	if (r.required) o.required = true;
	return o;
}

/**
 * canonicalDraft — the INPUT-ORDER-INVARIANT body the schema hash is taken over: entities
 * sorted by name, each entity's relations sorted by name; ATTRIBUTE ORDER PRESERVED (it is
 * semantic). Mirrors Go modeler.canonicalize → Body.
 */
function canonicalDraft(d: Draft): unknown {
	const nodes = d.nodes
		.map((n) => ({
			entity: {
				name: n.entity.name,
				attributes: n.entity.attributes.map(attrJSON),
			},
			relations: [...n.relations]
				.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
				.map(relJSON),
		}))
		.sort((a, b) =>
			a.entity.name < b.entity.name
				? -1
				: a.entity.name > b.entity.name
					? 1
					: 0,
		);
	return { project: d.project, nodes };
}

/** schemaBody — the canonical JSON body string (= Go modeler.Body). */
export function schemaBody(d: Draft): string {
	return canon(canonicalDraft(d));
}

/**
 * schemaHash — the content address of the draft schema (= Go modeler.SchemaHash =
 * Hash(Body)). INPUT-ORDER-INVARIANT: the same logical nodes in any edit order hash the same.
 */
export function schemaHash(d: Draft): string {
	return sha256(schemaBody(d));
}

/** A minimal ChangeSet shape (mirrors Go changeset.ChangeSet, the fields the screen reads). */
export interface ChangeSetView {
	label: string;
	status: "DRAFT";
	parent_phase: string;
	spec_delta: { kind: string; target: string; body: string };
	mirror_delta: { kind: string; target: string };
}

export interface Proposal {
	ok: boolean;
	changeset?: ChangeSetView;
	schema_hash?: string;
	block?: BlockReason;
}

/**
 * propose — validate the draft and, on success, return a `proposed` (DRAFT) ChangeSet
 * carrying the canonical draft as a project-scoped spec_delta + a mirror_delta (completeness
 * law). It NEVER applies (status is always DRAFT, no applied_at) — the wall. A reject
 * discards this DRAFT; the kernel is never touched. Mirrors Go modeler.Propose.
 */
export function propose(d: Draft, parentPhase: string): Proposal {
	const cause = validate(d);
	if (cause) return { ok: false, block: blockInvalid(cause) };
	const hash = schemaHash(d);
	const target = `entity-schema@${d.project}`;
	return {
		ok: true,
		schema_hash: hash,
		changeset: {
			label: `modeler: propose schema ${hash.slice(0, 8)} for ${d.project}`,
			status: "DRAFT",
			parent_phase: parentPhase,
			spec_delta: { kind: "add", target, body: schemaBody(d) },
			mirror_delta: { kind: "add", target: `${target}#mirror` },
		},
	};
}

// ── Draft-level concurrency: presence + CRDT merge ───────────────────────────

export interface Presence {
	editor: string;
	locked_node?: string;
}

/** join — add/replace an editor's presence (idempotent on editor id), name-sorted. */
export function join(set: Presence[], p: Presence): Presence[] {
	const out = set.filter((e) => e.editor !== p.editor);
	out.push(p);
	out.sort((a, b) => (a.editor < b.editor ? -1 : a.editor > b.editor ? 1 : 0));
	return out;
}

/** leave — remove an editor's presence (idempotent). */
export function leave(set: Presence[], editor: string): Presence[] {
	return set.filter((e) => e.editor !== editor);
}

/** lockHolder — the editor (if any) who soft-locks a node (advisory). */
export function lockHolder(set: Presence[], node: string): string | null {
	for (const e of set) if (e.locked_node === node) return e.editor;
	return null;
}

export interface MergeOutcome {
	merged: Draft;
	added_by_a: string[];
	added_by_b: string[];
	conflicts: string[];
}

/** nodeHash — the content address of a single node (order-invariant over its relations). */
function nodeHash(n: EntityNode): string {
	return schemaHash({ project: "_node_", nodes: [n] });
}

/**
 * mergeDrafts — the CRDT-style three-way merge of two editors' drafts (a, b) off a common
 * base, keyed by entity name (mirrors Go modeler.MergeDrafts). The anti-overwrite rule:
 * a one-sided add/edit is always kept; a divergent edit on the same node is SURFACED as a
 * conflict (a's version kept on the canvas, the name recorded) — NEVER last-write-wins.
 * Deterministic + order-independent (result sorted by name).
 */
export function mergeDrafts(base: Draft, a: Draft, b: Draft): MergeOutcome {
	const baseM = new Map(base.nodes.map((n) => [n.entity.name, n] as const));
	const aM = new Map(a.nodes.map((n) => [n.entity.name, n] as const));
	const bM = new Map(b.nodes.map((n) => [n.entity.name, n] as const));
	const names = [
		...new Set([...baseM.keys(), ...aM.keys(), ...bM.keys()]),
	].sort();

	const out: MergeOutcome = {
		merged: { project: a.project, nodes: [] },
		added_by_a: [],
		added_by_b: [],
		conflicts: [],
	};
	for (const name of names) {
		const inBase = baseM.has(name);
		const aN = aM.get(name);
		const bN = bM.get(name);
		const baseN = baseM.get(name);
		if (!inBase && aN && !bN) {
			out.merged.nodes.push(aN);
			out.added_by_a.push(name);
		} else if (!inBase && !aN && bN) {
			out.merged.nodes.push(bN);
			out.added_by_b.push(name);
		} else if (!inBase && aN && bN) {
			out.merged.nodes.push(aN);
			if (nodeHash(aN) !== nodeHash(bN)) out.conflicts.push(name);
		} else if (inBase && aN && bN && baseN) {
			const aChanged = nodeHash(aN) !== nodeHash(baseN);
			const bChanged = nodeHash(bN) !== nodeHash(baseN);
			if (!aChanged && !bChanged) out.merged.nodes.push(baseN);
			else if (aChanged && !bChanged) out.merged.nodes.push(aN);
			else if (!aChanged && bChanged) out.merged.nodes.push(bN);
			else {
				out.merged.nodes.push(aN);
				if (nodeHash(aN) !== nodeHash(bN)) out.conflicts.push(name);
			}
		} else if (inBase && aN && !bN) {
			out.merged.nodes.push(aN);
		} else if (inBase && !aN && bN) {
			out.merged.nodes.push(bN);
		}
		// inBase && !aN && !bN → both removed → drop.
	}
	return out;
}

// ── The declared demo (no clock, no rng, no I/O) ─────────────────────────────

const ID_ATTR: Attribute = {
	name: "id",
	type: "string",
	required: true,
	identifier: true,
};

/** Customer ◀──1-N── Order — the canonical resolvable draft (the S75 scenario). */
export const DEMO_DRAFT: Draft = {
	project: "shop",
	nodes: [
		{
			entity: {
				name: "Customer",
				attributes: [
					ID_ATTR,
					{ name: "email", type: "string", required: true },
				],
			},
			relations: [],
		},
		{
			entity: {
				name: "Order",
				attributes: [
					ID_ATTR,
					{ name: "total", type: "decimal", required: true },
				],
			},
			relations: [
				{
					name: "customer",
					target: "Customer",
					cardinality: "1-N",
					semantic: "fk",
					required: true,
				},
			],
		},
	],
};

/** A draft whose Order relates to an UNDECLARED entity — the canonical refusal. */
export const DEMO_BAD_DRAFT: Draft = {
	project: "shop",
	nodes: [
		{
			entity: { name: "Order", attributes: [ID_ATTR] },
			relations: [
				{ name: "ghost", target: "Ghost", cardinality: "1-1", semantic: "fk" },
			],
		},
	],
};
