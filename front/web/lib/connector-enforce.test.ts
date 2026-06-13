import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ConnectorAction,
	type ConnectorRuntimeApproval,
	enforceConnectorAction,
	type Op,
} from "./connector-enforce";
import type { ConnectorSource } from "./connector-source";

/**
 * Reproducibility mirror for the DP21 connector-enforce TS twin — the front mirror of
 * back/runtime/connectorenforce.EnforceConnectorAction. It pins the FIVE verdicts (fixture,
 * N2 state→cmd→events) AND the determinism / fail-closed property (∀, fast-check), verdict-
 * for-verdict with the Go connectorenforce_fixture_test.go + connectorenforce_property_test.go:
 *
 *   RO + write                      ⇒ CONNECTOR_READ_ONLY
 *   RW + write WITHOUT approval      ⇒ CONNECTOR_RW_NEEDS_APPROVAL
 *   RW + write WITH runtime approval ⇒ admitted (effect permitted)
 *   egress off the allow-list        ⇒ EGRESS_NOT_ALLOWED
 *   ai → datastore                   ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN
 *
 * Property: enforcement = set-membership pur fail-closed (déterministe) — same input ⇒ same
 * verdict, RO+write always refused, RW+write-without-approval always refused, ai→datastore
 * always forbidden.
 */

/** A well-formed S16 authority (a read_write source must declare one). */
const authority = {
	domain: "connectors",
	truthKind: "behavioral",
	approvers: ["security"],
};
const activeScope = { region: "fr", environment: "prod" };

/** A read_only Postgres-RO connector (internal). */
const roPostgres: ConnectorSource = {
	layer: "above",
	kind: "connector",
	name: "postgres-ro-truth",
	classification: "internal",
	scope: "read_only",
	egressHosts: ["db.example.internal"],
	target: "postgres_ro",
	dataTruthScope: ["existing_records"],
	authority: null,
	truthScope: activeScope,
};

/** A read_write Slack connector (external) WITH a declared authority. */
const rwSlack: ConnectorSource = {
	layer: "above",
	kind: "connector",
	name: "slack-notify",
	classification: "external",
	scope: "read_write",
	egressHosts: ["hooks.slack.com", "slack.com"],
	target: "slack",
	dataTruthScope: ["new_records"],
	authority,
	truthScope: activeScope,
};

/** An ai-plane connector (read_only, NO datastore egress). */
const aiConnector: ConnectorSource = {
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
};

/** A fresh, granted runtime approval naming exactly (slack-notify, write). */
const grantedSlackWrite: ConnectorRuntimeApproval = {
	connector: "slack-notify",
	op: "write",
	granted: true,
	by: "security",
};

describe("DP21 connector-enforce — the five verdicts (N2 fixture)", () => {
	it("RO + write ⇒ CONNECTOR_READ_ONLY", () => {
		const action: ConnectorAction = {
			op: "write",
			host: "db.example.internal",
		};
		expect(enforceConnectorAction(roPostgres, action)).toEqual({
			admitted: false,
			code: "CONNECTOR_READ_ONLY",
		});
	});

	it("RW + write WITHOUT approval ⇒ CONNECTOR_RW_NEEDS_APPROVAL", () => {
		const action: ConnectorAction = { op: "write", host: "hooks.slack.com" };
		expect(enforceConnectorAction(rwSlack, action)).toEqual({
			admitted: false,
			code: "CONNECTOR_RW_NEEDS_APPROVAL",
		});
	});

	it("RW + write WITH a fresh granted runtime approval ⇒ admitted", () => {
		const action: ConnectorAction = {
			op: "write",
			host: "hooks.slack.com",
			approval: grantedSlackWrite,
		};
		expect(enforceConnectorAction(rwSlack, action)).toEqual({
			admitted: true,
			code: null,
		});
	});

	it("RW + write with a DENIED approval ⇒ CONNECTOR_RW_NEEDS_APPROVAL", () => {
		const action: ConnectorAction = {
			op: "write",
			host: "hooks.slack.com",
			approval: { ...grantedSlackWrite, granted: false },
		};
		expect(enforceConnectorAction(rwSlack, action).code).toBe(
			"CONNECTOR_RW_NEEDS_APPROVAL",
		);
	});

	it("RW + write WITH an approval for ANOTHER connector ⇒ CONNECTOR_RW_NEEDS_APPROVAL", () => {
		const action: ConnectorAction = {
			op: "write",
			host: "hooks.slack.com",
			approval: { ...grantedSlackWrite, connector: "some-other" },
		};
		expect(enforceConnectorAction(rwSlack, action).code).toBe(
			"CONNECTOR_RW_NEEDS_APPROVAL",
		);
	});

	it("egress off the allow-list ⇒ EGRESS_NOT_ALLOWED", () => {
		const action: ConnectorAction = {
			op: "write",
			host: "evil.example.com",
			approval: grantedSlackWrite,
		};
		expect(enforceConnectorAction(rwSlack, action)).toEqual({
			admitted: false,
			code: "EGRESS_NOT_ALLOWED",
		});
	});

	it("ai → datastore ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN", () => {
		const action: ConnectorAction = {
			op: "read",
			host: "postgres://truth-store/direct",
		};
		expect(enforceConnectorAction(aiConnector, action)).toEqual({
			admitted: false,
			code: "AI_DIRECT_DB_ACCESS_FORBIDDEN",
		});
	});

	it("RO + read within the scope (egress allowed) ⇒ admitted", () => {
		const action: ConnectorAction = { op: "read", host: "db.example.internal" };
		expect(enforceConnectorAction(roPostgres, action)).toEqual({
			admitted: true,
			code: null,
		});
	});

	it("an empty host fails closed (EGRESS_NOT_ALLOWED)", () => {
		const action: ConnectorAction = { op: "read", host: "" };
		expect(enforceConnectorAction(rwSlack, action).code).toBe(
			"EGRESS_NOT_ALLOWED",
		);
	});
});

describe("DP21 connector-enforce — property (∀, set-membership pur fail-closed)", () => {
	const arbOp: fc.Arbitrary<Op> = fc.constantFrom("read", "write");
	const arbHost = fc.constantFrom(
		"hooks.slack.com",
		"slack.com",
		"db.example.internal",
		"evil.example.com",
		"postgres://truth-store/direct",
		"",
	);
	const arbApproval: fc.Arbitrary<ConnectorRuntimeApproval | null> = fc.option(
		fc.record({
			connector: fc.constantFrom("slack-notify", "other"),
			op: arbOp,
			granted: fc.boolean(),
			by: fc.constant("human"),
		}),
		{ nil: null },
	);
	const arbAction: fc.Arbitrary<ConnectorAction> = fc.record({
		op: arbOp,
		host: arbHost,
		approval: arbApproval,
	});

	it("is deterministic — same input ⇒ same verdict", () => {
		fc.assert(
			fc.property(arbAction, (action) => {
				const a = enforceConnectorAction(rwSlack, action);
				const b = enforceConnectorAction(rwSlack, action);
				expect(a).toEqual(b);
			}),
		);
	});

	it("a RO source never admits a write (always refused)", () => {
		fc.assert(
			fc.property(arbAction, (action) => {
				const d = enforceConnectorAction(roPostgres, {
					...action,
					op: "write",
				});
				expect(d.admitted).toBe(false);
			}),
		);
	});

	it("a RW write without a covering granted approval is always refused", () => {
		fc.assert(
			fc.property(arbHost, (host) => {
				const d = enforceConnectorAction(rwSlack, {
					op: "write",
					host,
					approval: null,
				});
				expect(d.admitted).toBe(false);
			}),
		);
	});

	it("an ai source reaching a datastore host is always forbidden", () => {
		fc.assert(
			fc.property(arbOp, (op) => {
				const d = enforceConnectorAction(aiConnector, {
					op,
					host: "postgres://truth-store/direct",
				});
				expect(d).toEqual({
					admitted: false,
					code: "AI_DIRECT_DB_ACCESS_FORBIDDEN",
				});
			}),
		);
	});
});
