/**
 * connector-declare — the PURE TS twin of back/runtime/connectordeclare (DP24, piste DP,
 * CLÔT EPIC E — the connector cockpit).
 *
 * DP24 graves the ONE legal door by which the Workbench connectors cockpit declares a
 * Connector / Skill / MCP-server as truth: it PROPOSES a ChangeSet (status DRAFT, surfaced
 * « proposed » on screen) wrapping the DP20 connector source — it NEVER applies it. The
 * authoritative engine is the Go package (runtime/connectordeclare.ProposeConnectorDeclaration);
 * this twin lets the Workbench RE-RUN the propose verdict from the screen, verdict-for-verdict.
 *
 * AMENDEMENT A2 — DEUX PORTES DISTINCTES. (1) the DECLARATION of a connector source/scope is
 * admitted ABOVE the line (propose → ChangeSet → approbation). THIS twin's concern. (2) the
 * EXECUTION of a write is a RUNTIME, below-the-line authorisation (connectorenforce) — NOT this
 * twin's concern. proposeConnectorDeclaration only opens the declaration door.
 *
 * THE WALL (CLAUDE.md §2): proposeConnectorDeclaration validates the source (DP20 validate)
 * then OPENS a DRAFT envelope whose spec_delta is the source's canonical body and whose
 * mirror_delta keeps the envelope COMPLETE (a spec without its mirror is a monster, KRD §33).
 * The returned ChangeSet is ALWAYS DRAFT/proposed — the screen NEVER applies it (the agent has
 * NO GRANT; the human applies through the aidos writer role, idée → miroir → /goal →
 * approbation). This twin writes NO truth and consults NO truth-store: it is a PURE function of
 * the declared source.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): proposeConnectorDeclaration is a PURE, TOTAL function of
 * its input — no DB, no clock, no rng, no I/O. The validation verdict is the DP20 `validate`
 * (set-membership over closed sets); the ChangeSet id is an FNV-1a content-address over the
 * canonical envelope (the TS analogue of the S20 records.Hash scheme). Same source ⇒ same
 * proposed ChangeSet (the reproducibility mirror lib/connector-declare.test.ts pins it). NO LLM
 * enters — the proposal is a pure composition of two existing pure engines (DP20 validate + S20
 * envelope).
 *
 * REUSE, NEVER REINVENT (CLAUDE.md §3): the connector model + its validate + its canonical body
 * is lib/connector-source (composed, never forked); the envelope SHAPE (DRAFT, spec/mirror
 * deltas) mirrors lib/changeset (the S20 twin). DP24 adds only the glue: validate-then-open + the
 * connector mirror reference.
 */

import {
	type ConnectorSource,
	canonicalBody,
	validate,
} from "./connector-source";

/**
 * ParentPhaseConnectors — the stable phase a connector-declaration ChangeSet branches from.
 * Declared (not invented per call) so the proposed envelope is byte-stable across calls — the
 * verbatim Go connectordeclare.ParentPhaseConnectors.
 */
export const ParentPhaseConnectors = "connectors";

/** the layer the spec_delta touches: a connector SOURCE — the verbatim Go specDeltaTarget. */
const SPEC_DELTA_TARGET = "connector_source";

/** the mirror the declaration reflects — the verbatim Go mirrorReflects. */
const MIRROR_REFLECTS = "kernel.connector-source";

/**
 * ProposeStatus — the human-facing status of a connector declaration on the cockpit. The S20
 * envelope is a DRAFT; the cockpit surfaces it as « proposed » (a proposal awaiting the human's
 * /goal → approbation). It is NEVER "applied" from the screen (the wall).
 */
export type ProposeStatus = "proposed";

/** A proposed delta — the spec/mirror change the envelope carries (mirror of changeset.Delta). */
export interface ProposeDelta {
	readonly kind: "add" | "remove" | "refine";
	readonly target: string;
	/** the canonical body bytes (the spec_delta carries the source's S02 canonical body). */
	readonly body: string;
}

/**
 * ProposedChangeSet — the DRAFT envelope a connector declaration PROPOSES. It is the verdict
 * the cockpit renders (status « proposed », never applied; an un-applied envelope has no commit
 * stamp). The SHAPE mirrors the Go changeset.ChangeSet (label, parentPhase, spec/mirror deltas,
 * a content-addressed id) reduced to the fields the screen reads.
 */
export interface ProposedChangeSet {
	/** the content-address (FNV-1a over the canonical envelope — same source ⇒ same id). */
	readonly id: string;
	/** the human label: "declare {kind}: {name}" (deterministic, byte-stable). */
	readonly label: string;
	/** ALWAYS « proposed » — the screen never reaches APPLIED (the wall). */
	readonly status: ProposeStatus;
	/** the stable phase the declaration branches from (ParentPhaseConnectors). */
	readonly parentPhase: string;
	/** the spec_delta: adds the connector source (body = the S02 canonical body). */
	readonly specDelta: ProposeDelta;
	/** the mirror_delta: keeps the envelope COMPLETE (no monster). */
	readonly mirrorDelta: ProposeDelta;
	/** an un-applied envelope has NO commit stamp — ALWAYS null (the wall). */
	readonly appliedAt: null;
}

/** The deterministic refusal codes a propose can surface — the DP20 validate codes. */
export type ProposeRefusalCode =
	| "UNKNOWN_CONNECTOR_KIND"
	| "EMPTY_NAME"
	| "UNKNOWN_CONNECTOR_CLASS"
	| "UNKNOWN_CONNECTOR_SCOPE"
	| "UNKNOWN_CONNECTOR_TARGET"
	| "AI_DIRECT_DB_ACCESS_FORBIDDEN"
	| "CONNECTOR_RW_REQUIRES_AUTHORITY"
	| "NOT_ABOVE_THE_LINE"
	| "INVALID_SCOPE";

/**
 * ProposeResult — the verdict of proposeConnectorDeclaration: either a proposed DRAFT ChangeSet
 * (ok), or a refusal with the verbatim DP20 code (an invalid source is NEVER proposed — no DRAFT
 * is opened for a source that could never be graved; the screen surfaces the exact BlockReason).
 */
export type ProposeResult =
	| { readonly ok: true; readonly changeSet: ProposedChangeSet }
	| { readonly ok: false; readonly code: ProposeRefusalCode };

/**
 * declarationLabel renders the human label of a connector-declaration ChangeSet,
 * deterministically from the source's kind + name (e.g. "declare connector: slack-notify").
 * Pure — same source ⇒ same label (so the proposed id is byte-stable). Verbatim Go semantics.
 */
export function declarationLabel(source: ConnectorSource): string {
	return `declare ${source.kind}: ${source.name}`;
}

/** the mirror_delta body — the connector mirror reference (reflects + test_kind). */
const MIRROR_BODY = JSON.stringify({
	reflects: MIRROR_REFLECTS,
	test_kind: "invariant",
});

/**
 * envelopeContentId returns the content-address of a proposed envelope: a stable FNV-1a hash over
 * its canonical, key-ordered body (label, parentPhase, the two deltas). The TS analogue of the
 * S20 records.Hash scheme — same source ⇒ same id; ANY change to the source (hence its canonical
 * body) yields a DIFFERENT id. Pure, total, deterministic.
 */
function envelopeContentId(
	label: string,
	specBody: string,
	mirrorBody: string,
): string {
	// the canonical envelope body — key-ordered, deltas pinned to their (kind, target, body).
	const canonical = JSON.stringify({
		label,
		mirrorDelta: { body: mirrorBody, kind: "add", target: MIRROR_REFLECTS },
		parentPhase: ParentPhaseConnectors,
		specDelta: { body: specBody, kind: "add", target: SPEC_DELTA_TARGET },
	});
	let h = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i++) {
		h ^= canonical.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `cs_${h.toString(16).padStart(8, "0")}`;
}

/**
 * proposeConnectorDeclaration is the PURE, TOTAL propose gesture of a connector declaration —
 * the verdict-for-verdict twin of the Go ProposeConnectorDeclaration. It:
 *
 *   1. VALIDATES the DP20 source (validate — set-membership over closed sets, the
 *      AI-never-direct-to-DB invariant, the RW-needs-authority rule). An invalid source is
 *      REFUSED with its verbatim code — NO DRAFT is opened (no proposal for a monster).
 *   2. OPENS a DRAFT envelope (« proposed ») wrapping the source's canonical body as the
 *      spec_delta and the connector mirror reference as the mirror_delta (so the envelope is
 *      COMPLETE — committable IF and only IF a human applies it through the gate).
 *
 * It RETURNS the proposed ChangeSet; it NEVER applies it (status « proposed », appliedAt null —
 * the wall). Pure: no DB, no clock, no rng, no I/O. Same source ⇒ same proposed ChangeSet (the
 * property mirror pins it).
 */
export function proposeConnectorDeclaration(
	source: ConnectorSource,
): ProposeResult {
	// 1. VALIDATE (DP20) — a malformed source is never proposed (no DRAFT for a monster).
	const verdict = validate(source);
	if (!verdict.ok) {
		// validate guarantees a code on !ok; the non-null assertion is total here.
		return { ok: false, code: verdict.code as ProposeRefusalCode };
	}

	// 2. OPEN a DRAFT envelope (always « proposed »; the screen never reaches APPLIED — the wall).
	const specBody = canonicalBody(source);
	const label = declarationLabel(source);
	const id = envelopeContentId(label, specBody, MIRROR_BODY);

	return {
		ok: true,
		changeSet: {
			id,
			label,
			status: "proposed",
			parentPhase: ParentPhaseConnectors,
			specDelta: { kind: "add", target: SPEC_DELTA_TARGET, body: specBody },
			mirrorDelta: { kind: "add", target: MIRROR_REFLECTS, body: MIRROR_BODY },
			appliedAt: null,
		},
	};
}
