/**
 * connector-governance — the TS twin of back/runtime/spike/dp19connectorgov (DP19,
 * EPIC E preamble). The DP19 SPIKE-GATE asks ONE thing, BY MEASURE: does the
 * governance of connectors (Connector / Skill / MCP-server = declared SOURCES) HOLD
 * WITH THE EXISTING WALL — the five fail-closed enforcers (agentimpl) + the Merkle
 * audit ledger (agentrun) — WITHOUT adding a new single point of trust?
 *
 * AMENDEMENT A2 (load-bearing): an RW write is gated by a disposable RUNTIME HITL
 * approval (ConnectorRuntimeApproval), NOT by authority.Decide. The Kernel truth-
 * admitter gates a TRUTH change, never a runtime EFFECT.
 *
 * AMENDEMENT A3 (the load-bearing invariant): the AI never reaches the DB directly —
 * a direct AI→DB call is REFUSED with AI_DIRECT_DB_ACCESS_FORBIDDEN by set-membership;
 * the AI passes ALWAYS through a controlled connector (here a Postgres-RO).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the gate is a PURE function of declared inputs
 * (set-membership, fail-closed) and the global verdict is COMPUTED from the matrix,
 * never an LLM-judge. The authoritative engine is the Go package; this twin lets the
 * Workbench render the measured matrix + re-run the verdict from the screen.
 *
 * THE WALL (CLAUDE.md §2): the spike reuses the EXISTING wall + enforcers + ledger and
 * adds NO new wall — only the runtime guards A2 (approval) + A3 (the AI→DB invariant),
 * exactly the §5 "ADD a guardrail, never REMOVE one" shape. Writes NOTHING.
 */

export type Scope = "ro" | "rw";
export type Op = "read" | "write";
export type Confinement = "internal" | "external" | "ai" | "cloud";
export type Verdict = "go" | "no-go";

/** the spike's THROWAWAY refusal codes — NOT the canonical blockreason truth. */
export type SpikeCode =
	| ""
	| "AI_DIRECT_DB_ACCESS_FORBIDDEN"
	| "CONNECTOR_WRITE_NOT_APPROVED"
	| "CONNECTOR_SCOPE_READ_ONLY"
	| "CONNECTOR_TOOL_NOT_BOUND"
	| "CONNECTOR_EGRESS_NOT_ALLOWED";

/** the sentinel direct-DB target the AI is tempted to hit — never a member of the AI surface (A3). */
export const AI_DIRECT_DB_TARGET = "postgres://truth-store/direct";

export interface Connector {
	name: string;
	server: string;
	readTool: string;
	/** empty for a pure-RO connector — a write then has no door at all. */
	writeTool: string;
	scope: Scope;
	plane: Confinement;
	/** the external host (plane === "external" only); empty otherwise. */
	egressHost: string;
}

/** the disposable runtime HITL approval (A2) — NOT authority.Decide. */
export interface ConnectorRuntimeApproval {
	connector: string;
	op: Op;
	granted: boolean;
}

/** the GOVERNED surface (the EXISTING five-axis enforcers' declared inputs). */
export interface GovernedSurface {
	/** the bound (server, tool) capability pairs (the capacity axis). */
	tools: { server: string; tool: string }[];
	/** the egress allow-list (the confinement axis); empty ⇒ deny all (fail-closed). */
	allowedHosts: string[];
}

export interface GateOutcome {
	admitted: boolean;
	code: SpikeCode;
}

/** capacity axis (twin of agentimpl.ToolAllowed): set-membership, fail-closed. */
export function toolAllowed(
	s: GovernedSurface,
	server: string,
	tool: string,
): boolean {
	return s.tools.some((t) => t.server === server && t.tool === tool);
}

/** confinement/egress axis (twin of agentimpl.EgressAllowed): fail-closed (empty ⇒ deny all). */
export function egressAllowed(s: GovernedSurface, host: string): boolean {
	return s.allowedHosts.includes(host);
}

function approvalFor(
	approvals: ConnectorRuntimeApproval[],
	connector: string,
	op: Op,
): boolean {
	return approvals.some(
		(a) => a.connector === connector && a.op === op && a.granted,
	);
}

/**
 * gateConnectorAction is the PURE, fail-closed connector governance gate (twin of the
 * Go GateConnectorAction). It REUSES the existing axes and ADDS only A2:
 *   1. scope — a write through an RO connector is refused (no door);
 *   2. capacity — the capability must be bound (toolAllowed);
 *   3. egress — an external connector's host must be allowed;
 *   4. A2 — an RW write needs a fresh GRANTED runtime approval.
 */
export function gateConnectorAction(
	s: GovernedSurface,
	c: Connector,
	op: Op,
	approvals: ConnectorRuntimeApproval[],
): GateOutcome {
	const tool = op === "write" ? c.writeTool : c.readTool;

	if (op === "write" && c.scope === "ro") {
		return { admitted: false, code: "CONNECTOR_SCOPE_READ_ONLY" };
	}
	if (!toolAllowed(s, c.server, tool)) {
		return { admitted: false, code: "CONNECTOR_TOOL_NOT_BOUND" };
	}
	if (c.plane === "external" && !egressAllowed(s, c.egressHost)) {
		return { admitted: false, code: "CONNECTOR_EGRESS_NOT_ALLOWED" };
	}
	if (
		op === "write" &&
		c.scope === "rw" &&
		!approvalFor(approvals, c.name, "write")
	) {
		return { admitted: false, code: "CONNECTOR_WRITE_NOT_APPROVED" };
	}
	return { admitted: true, code: "" };
}

/**
 * gateAIDataAccess is the A3 gate (twin of the Go GateAIDataAccess): the AI may reach
 * the DB ONLY through a controlled connector; a direct target is refused fail-closed
 * with AI_DIRECT_DB_ACCESS_FORBIDDEN; a mediated path defers to gateConnectorAction.
 */
export function gateAIDataAccess(
	s: GovernedSurface,
	via: Connector | null,
	target: string,
	op: Op,
	approvals: ConnectorRuntimeApproval[],
): GateOutcome {
	if (via === null || target === AI_DIRECT_DB_TARGET) {
		return { admitted: false, code: "AI_DIRECT_DB_ACCESS_FORBIDDEN" };
	}
	return gateConnectorAction(s, via, op, approvals);
}

/** one graved measurement row — the exact shape the Go MatrixRow projects. */
export interface MatrixRow {
	case: string;
	connector: string;
	scope: Scope;
	plane: Confinement;
	op: Op;
	approvalRequired: boolean;
	expectAdmitted: boolean;
	measuredAdmitted: boolean;
	measuredCode: SpikeCode;
	ledgerEntry: boolean;
	pass: boolean;
}

/** the complete graved result — twin of the Go Matrix. */
export interface Matrix {
	rows: MatrixRow[];
	ledgerRoot: string;
	ledgerOK: boolean;
	ledgerLength: number;
	verdict: Verdict;
}

/** computeVerdict is the deterministic global gate: go iff every row passes ∧ ledger OK. */
export function computeVerdict(rows: MatrixRow[], ledgerOK: boolean): Verdict {
	if (!ledgerOK) {
		return "no-go";
	}
	return rows.every((r) => r.pass) ? "go" : "no-go";
}

/**
 * MEASURED_MATRIX — the GRAVED verdict as DATA, copied verbatim from the Go fixture run
 * (back/runtime/spike/dp19connectorgov, 2026-06-13). Six measures over the two probed
 * disposable connectors (Postgres-RO + Slack) and the AI-direct-DB attempt:
 *   (a)  RW Slack write SANS approbation  → CONNECTOR_WRITE_NOT_APPROVED (refusé)
 *   (a') RW Slack write AVEC approbation   → admis
 *   (b)  IA→DB direct                      → AI_DIRECT_DB_ACCESS_FORBIDDEN (refusé)
 *   (b') IA→DB via Postgres-RO contrôlé    → admis
 *   (c)  RO Postgres-RO lecture            → admis
 *   (c') RO Postgres-RO écriture           → CONNECTOR_SCOPE_READ_ONLY (refusé)
 * Each action ⇒ a verifiable Merkle ledger entry (6 entries, Verify().OK).
 * VERDICT GLOBAL: GO — la gouvernance des connecteurs TIENT avec le mur existant
 * (n'ajoute que les gardes runtime A2 + A3, §5). Le mur, les enforcers et le ledger
 * EXISTANTS suffisent : aucun nouveau point de confiance unique requis.
 */
export const MEASURED_MATRIX: Matrix = {
	rows: [
		{
			case: "a) connecteur RW (Slack) écriture SANS approbation runtime",
			connector: "slack",
			scope: "rw",
			plane: "external",
			op: "write",
			approvalRequired: true,
			expectAdmitted: false,
			measuredAdmitted: false,
			measuredCode: "CONNECTOR_WRITE_NOT_APPROVED",
			ledgerEntry: true,
			pass: true,
		},
		{
			case: "a') connecteur RW (Slack) écriture AVEC approbation runtime",
			connector: "slack",
			scope: "rw",
			plane: "external",
			op: "write",
			approvalRequired: true,
			expectAdmitted: true,
			measuredAdmitted: true,
			measuredCode: "",
			ledgerEntry: true,
			pass: true,
		},
		{
			case: "b) appel IA→DB DIRECT",
			connector: "ai-direct-db",
			scope: "rw",
			plane: "ai",
			op: "read",
			approvalRequired: false,
			expectAdmitted: false,
			measuredAdmitted: false,
			measuredCode: "AI_DIRECT_DB_ACCESS_FORBIDDEN",
			ledgerEntry: true,
			pass: true,
		},
		{
			case: "b') appel IA→DB via connecteur Postgres-RO contrôlé",
			connector: "postgres-ro",
			scope: "ro",
			plane: "internal",
			op: "read",
			approvalRequired: false,
			expectAdmitted: true,
			measuredAdmitted: true,
			measuredCode: "",
			ledgerEntry: true,
			pass: true,
		},
		{
			case: "c) connecteur RO (Postgres-RO) lecture",
			connector: "postgres-ro",
			scope: "ro",
			plane: "internal",
			op: "read",
			approvalRequired: false,
			expectAdmitted: true,
			measuredAdmitted: true,
			measuredCode: "",
			ledgerEntry: true,
			pass: true,
		},
		{
			case: "c') connecteur RO (Postgres-RO) écriture",
			connector: "postgres-ro",
			scope: "ro",
			plane: "internal",
			op: "write",
			approvalRequired: false,
			expectAdmitted: false,
			measuredAdmitted: false,
			measuredCode: "CONNECTOR_SCOPE_READ_ONLY",
			ledgerEntry: true,
			pass: true,
		},
	],
	ledgerRoot:
		"a5f508e2804d9e592b241aae5231b58b957dca58fc7e9ab0d7a0ccef992738ab",
	ledgerOK: true,
	ledgerLength: 6,
	verdict: "go",
};

/** the disposable probed connectors — the front re-runnable twins of the Go fixtures. */
export const POSTGRES_RO: Connector = {
	name: "postgres-ro",
	server: "store",
	readTool: "query",
	writeTool: "",
	scope: "ro",
	plane: "internal",
	egressHost: "",
};

export const SLACK_RW: Connector = {
	name: "slack",
	server: "slack",
	readTool: "list_channels",
	writeTool: "post_message",
	scope: "rw",
	plane: "external",
	egressHost: "slack.com",
};

/** the disposable GOVERNED surface — bound to exactly the two connectors + slack.com. */
export const GOVERNED_SURFACE: GovernedSurface = {
	tools: [
		{ server: "store", tool: "query" },
		{ server: "slack", tool: "list_channels" },
		{ server: "slack", tool: "post_message" },
	],
	allowedHosts: ["slack.com"],
};
