"use server";

import {
	type BehaviorRecord,
	type Kind,
	type Proposal,
	propose,
} from "@/lib/behavior-expander";
import {
	demoCatalogue,
	demoExpansion,
	type ExpansionView,
	gatewayCatalogueArgs,
	gatewayExpandArgs,
} from "@/lib/behavior-expander-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { catalogueDecoder, expandDecoder } from "./live";

/**
 * Server Actions for the /behavior-expander Workbench panel (S76 — « AST behavior-macro + expander
 * dry-run déterministe, l'UNIQUE Expand »).
 *
 * THE STEP (ROADMAP-app-builder S76): a behavior RECORD (ownable, versioned, taggable, localizable)
 * whose Expand(behavior, entity) is the ONE pure authoritative function producing attributs /
 * relations / operations / policies / fixtures — never an LLM, never re-implemented (S67/S79/S80/S81
 * consume it). The EXPANSION is a PROPOSED DRAFT changeset, jamais une vérité appliquée.
 *
 * ADR 0092 CUTOVER (the Go engine is the SINGLE live source). The CHEAP reads now read LIVE from the Go
 * `aidos-behavior-expander` MCP server through the passerelle: `catalogueLive` reads the declared kinds
 * (`readVia(scope, "behavior_catalogue", …)`) and `expandLive` runs the ONE authoritative dry-run Expand
 * (`readVia(scope, "behavior_expand", …)`), both dispatched below-the-line reads (WroteKernel always
 * false), with the twin `lib/behavior-expander` preserved ONLY as the deterministic demo fallback
 * (`source:"live"|"demo"`, lib/behavior-expander-data). `proposeAction` STAYS on the twin compute: it
 * returns a DRAFT ChangeSet — a truth-PROPOSAL — so it keeps its OWN voie (propose → ChangeSet →
 * approval), never dispatched (route(behavior_propose) → unknown_tool). The `readVia` frontier import
 * keeps the T5 cliquet GREEN over the twin `propose` import (the twin sits behind the demo fallback).
 *
 * THE WALL (§2/§7). Every action WRITES NOTHING: the catalogue + expand are read-only below-the-line
 * reads; propose validates the record, runs the ONE Expand and PROPOSES a DRAFT changeset — the `aidos`
 * CLI applies it only after human approval; a reject discards the DRAFT and the kernel is never touched.
 * The expansion is PURE (the ONE Go Expand, or the twin behind the demo fallback), never an LLM
 * (determinism-first, §6/§8).
 */

export interface CatalogueView {
	kinds: string[];
	source: Source;
}

/**
 * catalogueLive reads the declared behavior-macro kinds LIVE from the Go engine through the passerelle
 * (the dispatched `behavior_catalogue` read); the twin demoCatalogue() is the deterministic fallback
 * (`source:"live"|"demo"`). Read-only. The page renders the dropdown from this.
 */
export async function catalogueLive(): Promise<CatalogueView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"behavior_catalogue",
		gatewayCatalogueArgs(),
		catalogueDecoder,
		demoCatalogue(),
	);
	return { kinds: data, source };
}

export interface ExpansionResult {
	ok: boolean;
	expansion?: ExpansionView;
	source: Source;
}

/**
 * expandLive runs the ONE authoritative dry-run Expand LIVE from the Go engine through the passerelle
 * (the dispatched `behavior_expand` read) over the chosen behavior+entity; the twin demoExpansion() is
 * the deterministic fallback (`source:"live"|"demo"`). Read-only — it materialises NO ChangeSet (the
 * preview), so it is a below-the-line read, never the truth-PROPOSAL door.
 */
export async function expandLive(
	behavior: string,
	entity: string,
): Promise<ExpansionResult> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"behavior_expand",
		gatewayExpandArgs(behavior, entity),
		expandDecoder,
		demoExpansion(behavior, entity),
	);
	return { ok: true, expansion: data, source };
}

export interface ProposeView {
	ok: boolean;
	proposal?: Proposal;
	record?: BehaviorRecord;
	error?: string;
	source?: Source;
}

/**
 * proposeAction is the action-capable control behind the expander (CLAUDE.md §7 ui-completeness): the
 * user picks a behavior + entity, owns/versions/tags/localises the record, and submits — the action
 * VALIDATES the record and, on success, runs the ONE Expand and PRODUCES a `proposed` (DRAFT)
 * ChangeSet carrying the canonical expansion. An unknown behavior or a malformed record yields a
 * verbatim S76 error (never a guessed expansion). It WRITES NOTHING (the wall).
 *
 * THE PROPOSE VOIE STAYS THE TWIN (ADR 0092 classification). `behavior_propose` returns a DRAFT
 * ChangeSet — a truth-PROPOSAL — so it is NOT dispatched; this control keeps the twin
 * `lib/behavior-expander.propose` as its legitimate voie propre (propose → ChangeSet → approval),
 * tagged `source:"demo"` (the twin compute, behind the demo fallback frontier — never the live source).
 */
export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const kind = String(formData.get("behavior") ?? "ownable").trim() as Kind;
	const entity = String(formData.get("entity") ?? "Order").trim();
	const owner = String(formData.get("owner") ?? "alice").trim();
	const version = Number(formData.get("version") ?? 1);
	const tags = String(formData.get("tags") ?? "scoping")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const fr = String(formData.get("labelFr") ?? "propriété").trim();
	const en = String(formData.get("labelEn") ?? "").trim();
	const parentPhase = String(formData.get("parentPhase") ?? "phase-0").trim();

	const labels: Record<string, string> = { fr };
	if (en) labels.en = en;
	const record: BehaviorRecord = { kind, owner, version, tags, labels };

	const proposal = propose(record, entity, parentPhase);
	if (!proposal.ok)
		return { ok: true, record, error: proposal.error, source: "demo" };
	return { ok: true, record, proposal, source: "demo" };
}
