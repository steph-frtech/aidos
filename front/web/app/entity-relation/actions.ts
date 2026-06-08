"use server";

import {
	address,
	type BlockReason,
	type Cardinality,
	DEMO_ENTITIES,
	isBlocked,
	type Relation,
	relationBody,
	type Semantic,
} from "@/lib/entity-relation";

/**
 * Server Actions for the /entity-relation Workbench panel (S71 — « le nœud de relation
 * de l'Entity AST »).
 *
 * THE STEP (ROADMAP-app-builder S71, KRD §23/§26): extend the entity type system with a
 * DISTINCT relation node (1-1 / 1-N / N-N, fk / association / composition) WITHOUT
 * widening the closed scalar set. A relation round-trips as a content-addressed AST; a
 * relation to a nonexistent entity is refused UNKNOWN_RELATION_TARGET — never a guessed
 * mapping (the honesty of the closed set).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it validates, resolves and
 * hashes a relation node as VALUES over the declared entity set. The resolution and hash
 * are PURE (lib/entity-relation), never an LLM. A relation is a SOURCE above the line;
 * a truth-write would go via propose → ChangeSet → approval, never from this screen.
 */

export interface RelationResolveView {
	ok: boolean;
	/** the relation as submitted (echoed back for display). */
	relation: Relation | null;
	/** the declared entity set the target resolved against. */
	known: string[];
	/** the content address (id) when resolved — the content-addressed round-trip. */
	id?: string;
	/** the canonical body (= Go ref.Body) when resolved. */
	body?: string;
	/** the refusal when the target is undeclared or a kind is out of set. */
	block?: BlockReason;
}

/**
 * resolveAction is the action-capable control behind the relation surface (CLAUDE.md §7
 * ui-completeness): the user pins a relation (name/target/cardinality/semantic) and
 * submits — the action RESOLVES it against the declared entity set and CONTENT-ADDRESSES
 * it. A declared target yields its id + canonical body (the round-trip); an undeclared
 * target yields the UNKNOWN_RELATION_TARGET BlockReason (never a guessed mapping). It
 * WRITES NOTHING (the wall).
 */
export async function resolveAction(
	_prev: RelationResolveView,
	formData: FormData,
): Promise<RelationResolveView> {
	const name = String(formData.get("name") ?? "").trim();
	const target = String(formData.get("target") ?? "").trim();
	const cardinality = String(formData.get("cardinality") ?? "") as Cardinality;
	const semantic = String(formData.get("semantic") ?? "") as Semantic;
	const required = formData.get("required") === "on";

	const known = [...DEMO_ENTITIES];
	const relation: Relation = { name, target, cardinality, semantic, required };

	const out = address(relation, known);
	if (isBlocked(out)) {
		return { ok: true, relation, known, block: out };
	}
	return { ok: true, relation, known, id: out, body: relationBody(relation) };
}
