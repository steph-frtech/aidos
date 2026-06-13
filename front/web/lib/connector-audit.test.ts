import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AuditedAction,
	buildLedger,
	deriveConnectorBOM,
	GENESIS_ROOT,
	type Identity,
	root,
	tamperEntryHash,
	verify,
} from "./connector-audit";
import type { ConnectorAction } from "./connector-enforce";
import type { ConnectorSource } from "./connector-source";

/**
 * Reproducibility / tamper-evidence mirror for the DP22 connector-audit TS twin — the front
 * mirror of back/runtime/connectorenforce/connectoraudit (chaining the GV03 Merkle math). It
 * pins, entry-for-entry with the Go connectoraudit_property_test.go + connectoraudit_fixture_test.go:
 *
 *   (1) each of the FIVE enforced action shapes (RO read, RW approved, RW refused, egress refused,
 *       ai→datastore refused) produces a verifiable entry (verify().ok) carrying its drift-free BOM;
 *   (2) altering / deleting / reordering a PAST entry ⇒ verify().ok=false with the right TamperKind;
 *   (3) PROPERTY: the BOM is DERIVED from the recorded fields (drift-free — same action ⇒ same BOM);
 *       the chain is folded by HASH never timestamp; append/verify are pure/total; reproducibility
 *       (same ordered actions ⇒ same tip root).
 *
 * THE WALL (§2): the ledger is below-the-line audit telemetry — it writes NO truth.
 */

/** A well-formed S16 authority (a read_write source must declare one). */
const authority = {
	domain: "connectors",
	truthKind: "behavioral",
	approvers: ["security"],
};
const activeScope = { region: "fr", environment: "prod" };
const who: Identity = { subject: "agent-builder" };

/** A read_only Postgres-RO connector (internal). */
const roPostgres: ConnectorSource = {
	layer: "above",
	kind: "connector",
	name: "postgres-ro-truth",
	classification: "internal",
	scope: "read_only",
	egressHosts: ["db.internal.read"],
	target: "postgres_ro",
	dataTruthScope: ["existing_records"],
	authority: null,
	truthScope: activeScope,
	version: "cid_ro01",
};

/** A read_write Slack connector (external) with a declared authority. */
const rwSlack: ConnectorSource = {
	layer: "above",
	kind: "connector",
	name: "slack-notify",
	classification: "external",
	scope: "read_write",
	egressHosts: ["hooks.slack.com"],
	target: "slack",
	dataTruthScope: ["new_records"],
	authority,
	truthScope: activeScope,
	version: "cid_rw01",
};

/** An "ai"-classified plane (MCP-server), no datastore egress in its allow-list. */
const aiPlane: ConnectorSource = {
	layer: "above",
	kind: "mcp_server",
	name: "ai-agent-plane",
	classification: "ai",
	scope: "read_only",
	egressHosts: ["api.anthropic.com"],
	target: "github_forgejo",
	dataTruthScope: ["new_records"],
	authority: null,
	truthScope: activeScope,
	version: "cid_ai01",
};

/** The FIVE canonical enforced action shapes the DP22 mirror exercises. */
const FIVE_ACTIONS: AuditedAction[] = [
	// 1) RO read — admitted (lecture libre dans la portée).
	{
		source: roPostgres,
		identity: who,
		action: { op: "read", host: "db.internal.read" } as ConnectorAction,
	},
	// 2) RW write WITH a fresh runtime approval — admitted (A2).
	{
		source: rwSlack,
		identity: who,
		action: {
			op: "write",
			host: "hooks.slack.com",
			approval: {
				connector: "slack-notify",
				op: "write",
				granted: true,
				by: "humain",
			},
		} as ConnectorAction,
	},
	// 3) RW write WITHOUT approval — refused CONNECTOR_RW_NEEDS_APPROVAL.
	{
		source: rwSlack,
		identity: who,
		action: { op: "write", host: "hooks.slack.com" } as ConnectorAction,
	},
	// 4) egress off the allow-list — refused EGRESS_NOT_ALLOWED.
	{
		source: rwSlack,
		identity: who,
		action: {
			op: "write",
			host: "evil.example.com",
			approval: {
				connector: "slack-notify",
				op: "write",
				granted: true,
				by: "humain",
			},
		} as ConnectorAction,
	},
	// 5) ai → datastore — refused AI_DIRECT_DB_ACCESS_FORBIDDEN.
	{
		source: aiPlane,
		identity: who,
		action: {
			op: "read",
			host: "postgres://truth-store/direct",
		} as ConnectorAction,
	},
];

describe("connector-audit — DP22 connector-action Merkle audit ledger (twin)", () => {
	it("the five enforced action shapes each yield a verifiable entry with a drift-free BOM", () => {
		const ledger = buildLedger(FIVE_ACTIONS);
		expect(ledger).toHaveLength(5);
		expect(verify(ledger).ok).toBe(true);

		// the recorded results, entry-for-entry (the BOM is derived from the enforced verdict).
		const expected = [
			{ permitted: true, code: "" },
			{ permitted: true, code: "" },
			{ permitted: false, code: "CONNECTOR_RW_NEEDS_APPROVAL" },
			{ permitted: false, code: "EGRESS_NOT_ALLOWED" },
			{ permitted: false, code: "AI_DIRECT_DB_ACCESS_FORBIDDEN" },
		];
		ledger.forEach((e, i) => {
			expect(e.index).toBe(i);
			expect(e.bom.permitted).toBe(expected[i].permitted);
			expect(e.bom.block_reason_code).toBe(expected[i].code);
			expect(e.prior_root).toBe(i === 0 ? GENESIS_ROOT : ledger[i - 1].root);
		});
	});

	it("the BOM is DERIVED drift-free from the recorded action (deriveConnectorBOM matches the entry BOM)", () => {
		const ledger = buildLedger(FIVE_ACTIONS);
		FIVE_ACTIONS.forEach((a, i) => {
			const decisionPermitted = ledger[i].bom.permitted;
			const code = ledger[i].bom.block_reason_code;
			const derived = deriveConnectorBOM(
				a.source,
				a.identity,
				a.action,
				decisionPermitted,
				code === "" ? null : (code as never),
			);
			expect(derived).toEqual(ledger[i].bom);
			// the BOM carries the connector @version (DP20 content-id) — load-bearing.
			expect(derived.connector_version).toBe(a.source.version);
		});
	});

	it("altering a past entry turns verify red with TamperKind entry_hash", () => {
		const ledger = buildLedger(FIVE_ACTIONS);
		expect(verify(ledger).ok).toBe(true);
		const tampered = tamperEntryHash(ledger, 1);
		const r = verify(tampered);
		expect(r.ok).toBe(false);
		expect(r.tamper).toBe("entry_hash");
		expect(r.atIndex).toBe(1);
		// the original ledger is untouched (tamperEntryHash returns a copy — append-only).
		expect(verify(ledger).ok).toBe(true);
	});

	it("deleting a past entry turns verify red (tamper-evident)", () => {
		const ledger = buildLedger(FIVE_ACTIONS);
		// drop the 2nd entry — the remaining rows' indices/prior_roots no longer line up.
		const deleted = [ledger[0], ledger[2], ledger[3], ledger[4]];
		const r = verify(deleted);
		expect(r.ok).toBe(false);
		expect(r.tamper).not.toBe("none");
	});

	it("reordering past entries turns verify red (tamper-evident)", () => {
		const ledger = buildLedger(FIVE_ACTIONS);
		const swapped = [ledger[1], ledger[0], ledger[2], ledger[3], ledger[4]];
		const r = verify(swapped);
		expect(r.ok).toBe(false);
		expect(r.tamper).not.toBe("none");
	});

	it("the empty ledger verifies and its tip root is the genesis root", () => {
		expect(root([])).toBe(GENESIS_ROOT);
		expect(verify([]).ok).toBe(true);
	});

	it("PROPERTY: reproducible — same ordered actions ⇒ same tip root (chained by hash, no clock)", () => {
		const a = buildLedger(FIVE_ACTIONS);
		const b = buildLedger(FIVE_ACTIONS);
		expect(root(a)).toBe(root(b));
		expect(a).toEqual(b);
	});

	it("PROPERTY: any non-empty ledger built from arbitrary actions verifies ok, and altering any entry breaks it", () => {
		const opArb = fc.constantFrom("read", "write");
		const hostArb = fc.constantFrom(
			"db.internal.read",
			"hooks.slack.com",
			"evil.example.com",
			"postgres://truth-store/direct",
			"api.anthropic.com",
		);
		const sourceArb = fc.constantFrom(roPostgres, rwSlack, aiPlane);
		const grantArb = fc.boolean();
		const actionArb = fc
			.record({ source: sourceArb, op: opArb, host: hostArb, grant: grantArb })
			.map(
				(r): AuditedAction => ({
					source: r.source,
					identity: who,
					action: {
						op: r.op as "read" | "write",
						host: r.host,
						approval: r.grant
							? {
									connector: r.source.name,
									op: "write" as const,
									granted: true,
									by: "humain",
								}
							: null,
					},
				}),
			);

		fc.assert(
			fc.property(
				fc.array(actionArb, { minLength: 1, maxLength: 8 }),
				(actions) => {
					const ledger = buildLedger(actions);
					// a freshly-built ledger ALWAYS verifies (the chain is intact by construction).
					expect(verify(ledger).ok).toBe(true);
					// rebuilding the SAME actions yields the SAME tip root (reproducibility, no timestamp).
					expect(root(buildLedger(actions))).toBe(root(ledger));
					// altering ANY past entry turns verify red (tamper-evidence) — pick the first.
					const tampered = tamperEntryHash(ledger, 0);
					expect(verify(tampered).ok).toBe(false);
				},
			),
			{ numRuns: 200 },
		);
	});
});
