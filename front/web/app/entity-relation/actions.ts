"use server";

import {
	type BlockReason,
	type Cardinality,
	DEMO_ENTITIES,
	type Relation,
	type Semantic,
} from "@/lib/entity-relation";
import {
	demoAddress,
	demoResolve,
	gatewayAddressArgs,
	gatewayResolveArgs,
} from "@/lib/entity-relation-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { addressDecoder, type LiveBlock, resolveDecoder } from "./live";

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
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The resolution +
 * content address are now read LIVE from the Go entity-relation MCP server (entityrelationsrv)
 * through the passerelle: `readVia(scope, "relation_resolve", …)` gates the target against the
 * declared set (UNKNOWN_RELATION_TARGET, the S71 honesty core), then `readVia(scope,
 * "relation_address", …)` content-addresses the shape-valid node (id + body, the round-trip).
 * The pure TS twin (lib/entity-relation) is NO LONGER the live path — it survives only as the
 * deterministic demo fixture (lib/entity-relation-data) the read falls back to when the gateway
 * is unreachable / undispatched / refused (`source:"live"|"demo"`). The `readVia` frontier import
 * keeps the T5 cliquet GREEN.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — both reads are below-the-line
 * (they validate, resolve and hash a relation node as VALUES). A relation is a SOURCE above
 * the line; a truth-write would go via propose → ChangeSet → approval, never from this screen.
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
	/** whether the verdict came from the live gateway or the deterministic demo fixture. */
	source?: Source;
}

/** liveBlockToReason maps the live/demo LiveBlock onto the panel's S13 BlockReason view shape. */
function liveBlockToReason(b: LiveBlock): BlockReason {
	return {
		code: b.code,
		severity: "blocking",
		explanation: b.explanation,
		how_to_fix: b.how_to_fix,
	};
}

/**
 * resolveAction is the action-capable control behind the relation surface (CLAUDE.md §7
 * ui-completeness): the user pins a relation (name/target/cardinality/semantic) and
 * submits — the action RESOLVES it against the declared entity set and CONTENT-ADDRESSES
 * it via the LIVE Go engine (the two dispatched below-the-line reads). A declared target
 * yields its id + canonical body (the round-trip); an undeclared target yields the
 * UNKNOWN_RELATION_TARGET BlockReason (never a guessed mapping). It WRITES NOTHING (the wall).
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

	const scope = await panelScope();

	// 1. LIVE resolve — gate the target against the declared set (the S71 honesty core). The
	//    twin demoResolve() is the deterministic fallback (source:"live"|"demo").
	const { data: verdict, source: resolveSource } = await readVia(
		scope,
		"relation_resolve",
		gatewayResolveArgs(relation, known),
		resolveDecoder,
		demoResolve(relation, known),
	);
	if (!verdict.ok && verdict.block) {
		return {
			ok: true,
			relation,
			known,
			block: liveBlockToReason(verdict.block),
			source: resolveSource,
		};
	}

	// 2. LIVE address — content-address the shape-valid, resolved node (the round-trip).
	const { data: addressed, source: addressSource } = await readVia(
		scope,
		"relation_address",
		gatewayAddressArgs(relation),
		addressDecoder,
		demoAddress(relation),
	);
	if (!addressed.ok && addressed.block) {
		return {
			ok: true,
			relation,
			known,
			block: liveBlockToReason(addressed.block),
			source: addressSource,
		};
	}

	// live iff BOTH reads were live; any demo fallback degrades the whole verdict to demo.
	const source: Source =
		resolveSource === "live" && addressSource === "live" ? "live" : "demo";
	return {
		ok: true,
		relation,
		known,
		id: addressed.id,
		body: addressed.body,
		source,
	};
}
