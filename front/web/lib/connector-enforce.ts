/**
 * connector-enforce — the PURE TS twin of back/runtime/connectorenforce (DP21, piste DP,
 * EPIC E).
 *
 * DP21 ENFORCES a connector EFFECT by the FIVE EXISTING agentlayer axes RESERRÉES by the
 * connector's declared scope (DP20 ConnectorSource) — it adds NO new permission model and
 * FORKS no axis. The authoritative engine is the Go package (runtime/connectorenforce); this
 * twin lets the Workbench RE-RUN the enforcement verdict from the screen, verdict-for-verdict
 * with the Go `EnforceConnectorAction`.
 *
 * AMENDEMENT A2 — DEUX PORTES DISTINCTES. (1) the DECLARATION of a connector (source/scope)
 * is admitted ABOVE the line (propose → ChangeSet → approbation, S85/S110). (2) the EXECUTION
 * of a write is a RUNTIME, below-the-line, human-in-the-loop authorisation
 * (ConnectorRuntimeApproval), NEVER authority.Decide. This twin therefore consults the runtime
 * approval, never the S16 graph, to admit a write — exactly the Go enforcer.
 *
 * AMENDEMENT A3 — the AI-never-direct-to-DB invariant, enforced AT RUNTIME as set-membership:
 * egress_hosts(ai) ∩ {hosts classified datastore} = ∅ (kernel/connector.IsDatastoreHost, the
 * DECLARED closed set, mirrored by isDatastoreHost in lib/connector-source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): `enforceConnectorAction` is a PURE, TOTAL, fail-closed
 * function of its inputs — no I/O, no clock, no rng, no Date.now(). Same input ⇒ same verdict
 * (the reproducibility mirror lib/connector-enforce.test.ts pins it). The five axes are
 * functions, never an LLM.
 *
 * THE WALL (CLAUDE.md §2): RO reads are below-the-line (lecture libre dans le scope); RW writes
 * are gated by the runtime approval (A2). This twin writes NO truth and consults NO truth-store.
 */

import {
	type ConnectorSource,
	isDatastoreHost,
	isValid,
} from "./connector-source";

/**
 * Op is the attempted operation through a connector — the CLOSED two-member set
 * {read, write}. Mirrors the Go connectorenforce.Op.
 */
export const OPS = ["read", "write"] as const;
export type Op = (typeof OPS)[number];

/**
 * EnforceCode — the deterministic refusal codes the enforcer can return, the SAME verbatim
 * codes as the Go EnforceConnectorAction (and the canonical blockreason registry). `null` is
 * the admission (no code).
 */
export type EnforceCode =
	| "CONNECTOR_READ_ONLY"
	| "CONNECTOR_RW_NEEDS_APPROVAL"
	| "EGRESS_NOT_ALLOWED"
	| "AI_DIRECT_DB_ACCESS_FORBIDDEN";

/**
 * ConnectorRuntimeApproval is the A2 disposable, RUNTIME, human-in-the-loop authorisation
 * that admits a connector WRITE. It is NOT the Kernel truth-admitter (authority.Decide): it
 * gates a runtime EFFECT (qui / quand / quel-effet), not a truth change. A write is admitted
 * IFF a fresh approval names the exact (connector, op) and is granted by a human. Absent,
 * denied, or for another connector/op ⇒ the write is refused (fail-closed set-membership).
 */
export interface ConnectorRuntimeApproval {
	/** the connector name this approval is for (must match the source's name). */
	connector: string;
	/** the operation approved (a write — a read needs no approval). */
	op: Op;
	/** true IFF a human granted it; false (or absent) is not a grant. */
	granted: boolean;
	/** who approved it (audit trail; free text — never consulted for the verdict). */
	by?: string;
}

/**
 * ConnectorAction is the attempted RUNTIME effect through a connector: the operation, the
 * egress host it reaches, and — for a write — the optional A2 runtime approval. NOTHING here
 * is a truth; it is the runtime command the enforcer judges against the declared source.
 */
export interface ConnectorAction {
	/** the attempted operation (read | write). */
	op: Op;
	/** the egress host the action reaches (checked against the source allow-list + datastore set). */
	host: string;
	/** the A2 runtime authorisation for a write (null/absent for a read or an absent grant). */
	approval?: ConnectorRuntimeApproval | null;
}

/**
 * EnforceDecision is enforceConnectorAction's verdict: admitted or refused, with the DP21
 * refusal code on a deny (null on an admission). The SAME fail-closed SHAPE as the Go
 * connectorenforce.Decision, here in the twin.
 */
export interface EnforceDecision {
	/** true IFF the action is permitted (the effect may proceed). */
	admitted: boolean;
	/** the refusal code on a deny; null on an admission (the closed DP21 set). */
	code: EnforceCode | null;
}

/**
 * covers reports whether an approval is a fresh, GRANTED authorisation for (connector, op).
 * Set-membership, fail-closed. Pure, total.
 */
function covers(
	approval: ConnectorRuntimeApproval | null | undefined,
	connector: string,
	op: Op,
): boolean {
	return (
		approval != null &&
		approval.connector === connector &&
		approval.op === op &&
		approval.granted === true
	);
}

/**
 * egressAllowed mirrors the EXISTING agentimpl.EgressAllowed (set-membership, fail-closed):
 * the host MUST be a member of the source's declared egress allow-list. An EMPTY allow-list
 * denies EVERY host (fail-closed). The host is never widened below the line.
 */
function egressAllowed(allowList: string[], host: string): boolean {
	const h = host.trim();
	if (h === "") {
		return false;
	}
	return allowList.includes(h);
}

/**
 * enforceConnectorAction is the PURE, TOTAL, fail-closed connector-scope runtime enforcer —
 * the verdict-for-verdict twin of the Go EnforceConnectorAction. It governs a connector EFFECT
 * by the FIVE EXISTING axes RESERRÉES by the source's declared scope; it adds NO new wall and
 * FORKS no axis. The order is FIXED so the refusal is DETERMINISTIC:
 *
 *  1. A3 (AI∩DATASTORE=∅) — an `ai`-classified source whose action reaches a DATASTORE host
 *     (isDatastoreHost, the DECLARED closed set) is refused AI_DIRECT_DB_ACCESS_FORBIDDEN.
 *     Checked first: the AI never reaches the DB directly, whatever the scope or approval.
 *  2. SCOPE — a write through a read_only source is refused CONNECTOR_READ_ONLY (no write
 *     door at all). Checked before egress so the scope refusal is stable.
 *  3. EGRESS — the action's host MUST be in the source's egress allow-list (set-membership,
 *     fail-closed); a host off the list is refused EGRESS_NOT_ALLOWED.
 *  4. A2 RUNTIME APPROVAL — a write through a read_write source needs a fresh GRANTED
 *     ConnectorRuntimeApproval for (connector, write). Absent ⇒ CONNECTOR_RW_NEEDS_APPROVAL.
 *     (NEVER authority.Decide — A2.)
 *
 * A read needs only (1)+(3). Pure: no I/O, no clock. Same input ⇒ same verdict.
 */
export function enforceConnectorAction(
	source: ConnectorSource,
	action: ConnectorAction,
): EnforceDecision {
	// (1) A3 — the AI never reaches a datastore host directly (set-membership, fail-closed).
	if (source.classification === "ai" && isDatastoreHost(action.host)) {
		return { admitted: false, code: "AI_DIRECT_DB_ACCESS_FORBIDDEN" };
	}

	// (2) SCOPE — a write through a read_only source has no door (refuse before egress).
	if (action.op === "write" && source.scope === "read_only") {
		return { admitted: false, code: "CONNECTOR_READ_ONLY" };
	}

	// (3) EGRESS — REUSE the existing set-membership (fail-closed) over the declared allow-list.
	if (!egressAllowed(source.egressHosts, action.host)) {
		return { admitted: false, code: "EGRESS_NOT_ALLOWED" };
	}

	// (4) A2 — a write through a read_write source needs a fresh GRANTED runtime approval.
	if (action.op === "write" && source.scope === "read_write") {
		if (!covers(action.approval, source.name, "write")) {
			return { admitted: false, code: "CONNECTOR_RW_NEEDS_APPROVAL" };
		}
	}

	return { admitted: true, code: null };
}

/** Pure convenience: true when enforceConnectorAction admits the action. */
export function isAdmitted(
	source: ConnectorSource,
	action: ConnectorAction,
): boolean {
	return enforceConnectorAction(source, action).admitted;
}

/**
 * isEnforceableSource reports whether a source is well-formed enough to be enforced against —
 * a declared, valid ConnectorSource (the enforcer only governs effects of VALID sources; an
 * invalid declaration never reaches runtime, A2). Pure convenience over isValid.
 */
export function isEnforceableSource(source: ConnectorSource): boolean {
	return isValid(source);
}
