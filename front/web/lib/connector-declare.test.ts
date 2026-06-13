import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	declarationLabel,
	ParentPhaseConnectors,
	proposeConnectorDeclaration,
} from "./connector-declare";
import {
	AI_FORBIDDEN_DATASTORE_EGRESS,
	type ConnectorSource,
	canonicalBody,
	DEMO_CONNECTORS,
} from "./connector-source";

/**
 * Reproducibility mirror (∀) for the DP24 connector-declare TS twin — the front mirror of
 * back/runtime/connectordeclare. fast-check is the frozen front invariant slot (CLAUDE.md §3).
 * The invariants mirror connectordeclare_property_test.go verdict-for-verdict:
 *
 *  1. VALID ⇒ PROPOSED DRAFT — a valid source proposes a ChangeSet, status « proposed », appliedAt null, COMPLETE.
 *  2. NEVER APPLIED          — ∀ valid source the status is « proposed », NEVER "applied" (the wall).
 *  3. DETERMINISTIC ID       — same source ⇒ same proposed id (content-addressed); any field change ⇒ different id.
 *  4. SPEC BODY ROUND-TRIPS  — the spec_delta body byte-equals the DP20 canonical body.
 *  5. AI→DB REFUSED          — an ai source with a datastore egress ⇒ refused AI_DIRECT_DB_ACCESS_FORBIDDEN, NO draft.
 *  6. RW-NO-AUTHORITY REFUSED — a read_write source with no authority ⇒ refused CONNECTOR_RW_REQUIRES_AUTHORITY, NO draft.
 */

/** A well-formed S16 authority (always passes the RW gate). */
const wellFormedAuthority = {
	domain: "connectors",
	truthKind: "behavioral",
	approvers: ["security"],
};

/** an arbitrary VALID read_only internal connector source (no authority needed). */
const validRoSource = (): fc.Arbitrary<ConnectorSource> =>
	fc
		.record({
			name: fc
				.string({ minLength: 1, maxLength: 12 })
				.filter((s) => s.trim() !== ""),
			egress: fc.array(fc.constantFrom("api.example.com", "hooks.x.com"), {
				maxLength: 3,
			}),
		})
		.map(({ name, egress }) => ({
			layer: "above",
			kind: "connector",
			name,
			classification: "internal",
			scope: "read_only",
			egressHosts: egress,
			target: "crm",
			dataTruthScope: ["new_records"],
			authority: null,
			truthScope: { region: "fr", environment: "prod" },
		}));

describe("connector-declare twin — the DP24 propose path (∀ reproducibility mirror)", () => {
	it("1+2+4 — a valid source proposes a COMPLETE « proposed » DRAFT, never applied, body round-trips", () => {
		fc.assert(
			fc.property(validRoSource(), (source) => {
				const res = proposeConnectorDeclaration(source);
				expect(res.ok).toBe(true);
				if (!res.ok) return;
				const cs = res.changeSet;
				// (1) proposed DRAFT, complete envelope (spec + mirror), no commit stamp.
				expect(cs.status).toBe("proposed");
				expect(cs.appliedAt).toBeNull();
				expect(cs.specDelta).not.toBeNull();
				expect(cs.mirrorDelta).not.toBeNull();
				expect(cs.parentPhase).toBe(ParentPhaseConnectors);
				expect(cs.label).toBe(declarationLabel(source));
				// (2) the status is NEVER "applied" (the wall — the agent has no GRANT).
				expect(cs.status as string).not.toBe("applied");
				expect(cs.status as string).not.toBe("APPLIED");
				// (4) the spec_delta body byte-equals the DP20 canonical body.
				expect(cs.specDelta.body).toBe(canonicalBody(source));
			}),
		);
	});

	it("3 — same source ⇒ same proposed id; any name change ⇒ different id (content-addressed)", () => {
		fc.assert(
			fc.property(validRoSource(), (source) => {
				const a = proposeConnectorDeclaration(source);
				const b = proposeConnectorDeclaration({ ...source });
				expect(a.ok && b.ok).toBe(true);
				if (a.ok && b.ok) {
					expect(a.changeSet.id).toBe(b.changeSet.id);
					// a changed content-bearing field yields a different id.
					const renamed = proposeConnectorDeclaration({
						...source,
						name: `${source.name}-x`,
					});
					expect(renamed.ok).toBe(true);
					if (renamed.ok) {
						expect(renamed.changeSet.id).not.toBe(a.changeSet.id);
					}
				}
			}),
		);
	});

	it("5 — an ai source with a datastore egress is REFUSED AI_DIRECT_DB_ACCESS_FORBIDDEN, NO draft", () => {
		const res = proposeConnectorDeclaration(AI_FORBIDDEN_DATASTORE_EGRESS);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.code).toBe("AI_DIRECT_DB_ACCESS_FORBIDDEN");
		}
	});

	it("6 — a read_write source with no authority is REFUSED CONNECTOR_RW_REQUIRES_AUTHORITY, NO draft", () => {
		const rwNoAuthority: ConnectorSource = {
			layer: "above",
			kind: "connector",
			name: "rw-no-authority",
			classification: "external",
			scope: "read_write",
			egressHosts: ["hooks.slack.com"],
			target: "slack",
			dataTruthScope: ["new_records"],
			authority: null,
			truthScope: { region: "fr", environment: "prod" },
		};
		const res = proposeConnectorDeclaration(rwNoAuthority);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.code).toBe("CONNECTOR_RW_REQUIRES_AUTHORITY");
		}
		// the SAME source WITH a well-formed authority is proposed.
		const ok = proposeConnectorDeclaration({
			...rwNoAuthority,
			authority: wellFormedAuthority,
		});
		expect(ok.ok).toBe(true);
	});

	it("the seeded DEMO_CONNECTORS all propose a « proposed » DRAFT (never applied)", () => {
		for (const c of DEMO_CONNECTORS) {
			const res = proposeConnectorDeclaration(c);
			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.changeSet.status).toBe("proposed");
				expect(res.changeSet.appliedAt).toBeNull();
			}
		}
	});
});
