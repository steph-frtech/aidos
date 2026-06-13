/**
 * connector-governance.test.ts — the T0 MIRROR of the DP19 spike TS twin. It MEASURES
 * the four DONE-CRITERIA the same way the Go fixture does, and asserts the COMPUTED
 * verdict. The verdict is a MEASURE, never an LLM-judge (CLAUDE.md §8).
 */

import { describe, expect, it } from "vitest";
import {
	AI_DIRECT_DB_TARGET,
	type ConnectorRuntimeApproval,
	computeVerdict,
	GOVERNED_SURFACE,
	gateAIDataAccess,
	gateConnectorAction,
	MEASURED_MATRIX,
	POSTGRES_RO,
	SLACK_RW,
} from "./connector-governance";

const GRANT: ConnectorRuntimeApproval[] = [
	{ connector: "slack", op: "write", granted: true },
];

describe("DP19 connector-governance spike (T0, zone /spike)", () => {
	it("(a) RW Slack write SANS approbation runtime → refusé", () => {
		const out = gateConnectorAction(GOVERNED_SURFACE, SLACK_RW, "write", []);
		expect(out.admitted).toBe(false);
		expect(out.code).toBe("CONNECTOR_WRITE_NOT_APPROVED");
	});

	it("(a') RW Slack write AVEC approbation runtime → admis", () => {
		const out = gateConnectorAction(GOVERNED_SURFACE, SLACK_RW, "write", GRANT);
		expect(out.admitted).toBe(true);
		expect(out.code).toBe("");
	});

	it("(b) appel IA→DB DIRECT → refusé AI_DIRECT_DB_ACCESS_FORBIDDEN (A3)", () => {
		const out = gateAIDataAccess(
			GOVERNED_SURFACE,
			null,
			AI_DIRECT_DB_TARGET,
			"read",
			[],
		);
		expect(out.admitted).toBe(false);
		expect(out.code).toBe("AI_DIRECT_DB_ACCESS_FORBIDDEN");
	});

	it("(b') appel IA→DB via connecteur Postgres-RO contrôlé → admis", () => {
		const out = gateAIDataAccess(
			GOVERNED_SURFACE,
			POSTGRES_RO,
			"store.query",
			"read",
			[],
		);
		expect(out.admitted).toBe(true);
	});

	it("(c) connecteur RO Postgres-RO lecture → admis", () => {
		const out = gateConnectorAction(GOVERNED_SURFACE, POSTGRES_RO, "read", []);
		expect(out.admitted).toBe(true);
	});

	it("(c') connecteur RO Postgres-RO écriture → refusé (scope RO)", () => {
		const out = gateConnectorAction(GOVERNED_SURFACE, POSTGRES_RO, "write", []);
		expect(out.admitted).toBe(false);
		expect(out.code).toBe("CONNECTOR_SCOPE_READ_ONLY");
	});

	it("capacité: une capacité de connecteur NON liée → refusé", () => {
		const rogue = {
			name: "rogue",
			server: "rogue",
			readTool: "read",
			writeTool: "",
			scope: "ro" as const,
			plane: "internal" as const,
			egressHost: "",
		};
		const out = gateConnectorAction(GOVERNED_SURFACE, rogue, "read", []);
		expect(out.admitted).toBe(false);
		expect(out.code).toBe("CONNECTOR_TOOL_NOT_BOUND");
	});

	it("confinement: un connecteur externe vers un hôte NON autorisé → refusé", () => {
		const out = gateConnectorAction(
			GOVERNED_SURFACE,
			{ ...SLACK_RW, egressHost: "evil.example.com" },
			"write",
			GRANT,
		);
		expect(out.admitted).toBe(false);
		expect(out.code).toBe("CONNECTOR_EGRESS_NOT_ALLOWED");
	});

	it("la matrice gravée: 6 mesures, chaque cellule passe, ledger ok, verdict GO", () => {
		expect(MEASURED_MATRIX.rows).toHaveLength(6);
		for (const r of MEASURED_MATRIX.rows) {
			expect(r.pass).toBe(true);
			expect(r.ledgerEntry).toBe(true);
		}
		expect(MEASURED_MATRIX.ledgerOK).toBe(true);
		expect(MEASURED_MATRIX.ledgerLength).toBe(6);
		expect(MEASURED_MATRIX.verdict).toBe("go");
	});

	it("le verdict global est COMPUTÉ depuis la matrice, jamais déclaré", () => {
		expect(computeVerdict(MEASURED_MATRIX.rows, MEASURED_MATRIX.ledgerOK)).toBe(
			"go",
		);
		// no-go reproductible: si le ledger ne vérifie pas, le verdict bascule.
		expect(computeVerdict(MEASURED_MATRIX.rows, false)).toBe("no-go");
		// no-go reproductible: une cellule en échec bascule le verdict.
		const broken = MEASURED_MATRIX.rows.map((r, i) =>
			i === 0 ? { ...r, pass: false } : r,
		);
		expect(computeVerdict(broken, true)).toBe("no-go");
	});

	it("déterminisme: même surface → même verdict (set-membership pur)", () => {
		const a = gateConnectorAction(GOVERNED_SURFACE, SLACK_RW, "write", GRANT);
		const b = gateConnectorAction(GOVERNED_SURFACE, SLACK_RW, "write", GRANT);
		expect(a).toEqual(b);
	});
});
