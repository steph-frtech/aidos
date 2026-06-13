import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ACCESS_SCOPES,
	type AccessScope,
	AI_FORBIDDEN_DATASTORE_EGRESS,
	CLASSIFICATIONS,
	type Classification,
	type ConnectorSource,
	canonicalBody,
	contentId,
	DATASTORE_HOSTS,
	DEMO_CONNECTORS,
	isDatastoreHost,
	isValid,
	KINDS,
	type Kind,
	TARGETS,
	type Target,
	validate,
} from "./connector-source";

/**
 * Reproducibility mirror (∀) for the DP20 connector-source TS twin — the front mirror of
 * back/kernel/connector. fast-check is the frozen front invariant slot (CLAUDE.md §3).
 * The invariants mirror connector_property_test.go verdict-for-verdict:
 *
 *  1. ROUND-TRIP CONTENT-ADDRESS — same source ⇒ same contentId (stable), any field change ⇒ different id.
 *  2. CLOSED CLASSIFICATION SET  — a class outside {internal,external,ai,cloud} ⇒ UNKNOWN_CONNECTOR_CLASS.
 *  3. CLOSED SCOPE SET           — a scope outside {read_only,read_write} ⇒ UNKNOWN_CONNECTOR_SCOPE.
 *  4. AI-NEVER-DIRECT-TO-DB      — an "ai" source with a datastore egress ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN;
 *                                   the SAME host on a non-ai source does NOT trip it (anti-false-positive).
 *  5. RW-NEEDS-AUTHORITY         — a read_write source with no authority ⇒ CONNECTOR_RW_REQUIRES_AUTHORITY;
 *                                   read_only needs none.
 *  6. PURE / TOTAL / DETERMINISTIC — validate never throws, same input ⇒ same verdict.
 */

/** A well-formed S16 authority (always passes the RW gate). */
const wellFormedAuthority = {
	domain: "connectors",
	truthKind: "behavioral",
	approvers: ["security"],
};

/** A non-empty S15 scope (an active source carries one). */
const activeScope = { region: "fr", environment: "prod" };

/** A valid baseline ConnectorSource (non-ai, so a datastore egress never trips inv. 4). */
function validBaseline(
	kind: Kind,
	cls: Classification,
	scope: AccessScope,
	target: Target,
): ConnectorSource {
	const safeCls = cls === "ai" ? "external" : cls;
	return {
		layer: "above",
		kind,
		name: "conn-baseline",
		classification: safeCls,
		scope,
		egressHosts: ["api.example.com"],
		target,
		dataTruthScope: ["new_records"],
		authority: scope === "read_write" ? wellFormedAuthority : null,
		truthScope: activeScope,
	};
}

const arbKind = fc.constantFrom<Kind>(...KINDS);
const arbClass = fc.constantFrom<Classification>(...CLASSIFICATIONS);
const arbScope = fc.constantFrom<AccessScope>(...ACCESS_SCOPES);
const arbTarget = fc.constantFrom<Target>(...TARGETS);

describe("connector-source twin — closed sets are exhaustive and ordered", () => {
	it("the closed sets match the Go kernel/connector sets verbatim", () => {
		expect(KINDS).toEqual(["connector", "skill", "mcp_server"]);
		expect(CLASSIFICATIONS).toEqual(["internal", "external", "ai", "cloud"]);
		expect(ACCESS_SCOPES).toEqual(["read_only", "read_write"]);
		expect(TARGETS).toEqual([
			"gmail",
			"drive",
			"github_forgejo",
			"postgres_ro",
			"snowflake",
			"erp",
			"crm",
			"sirh",
			"slack",
		]);
	});

	it("the demo seed validates and the illegal AI fixture is refused", () => {
		for (const c of DEMO_CONNECTORS) {
			expect(isValid(c), `${c.name} must validate`).toBe(true);
		}
		expect(DEMO_CONNECTORS).toHaveLength(3);
		// the load-bearing demonstration: an ai source must carry NO datastore egress.
		const ai = DEMO_CONNECTORS.find((c) => c.classification === "ai");
		expect(ai).toBeDefined();
		expect(ai?.egressHosts.some(isDatastoreHost)).toBe(false);
		// the counter-fixture is refused with the invariant code.
		expect(validate(AI_FORBIDDEN_DATASTORE_EGRESS)).toEqual({
			ok: false,
			code: "AI_DIRECT_DB_ACCESS_FORBIDDEN",
		});
	});
});

describe("invariant 1 — round-trip content-address (stable + sensitive)", () => {
	it("same source ⇒ same id; any field change ⇒ different id", () => {
		fc.assert(
			fc.property(arbKind, arbClass, arbScope, arbTarget, (k, cls, sc, tg) => {
				const c = validBaseline(k, cls, sc, tg);
				const id1 = contentId(c);
				expect(contentId(c)).toBe(id1);
				expect(id1).not.toBe("");
				const c2 = { ...c, name: `${c.name}-x` };
				expect(contentId(c2)).not.toBe(id1);
			}),
		);
	});

	it("the content id is independent of egress-host order", () => {
		const a: ConnectorSource = {
			...validBaseline("connector", "external", "read_only", "slack"),
			egressHosts: ["a.com", "b.com", "c.com"],
		};
		const b: ConnectorSource = {
			...a,
			egressHosts: ["c.com", "a.com", "b.com"],
		};
		expect(contentId(a)).toBe(contentId(b));
		expect(canonicalBody(a)).toBe(canonicalBody(b));
	});
});

describe("invariant 2 — closed classification set", () => {
	it("a class outside the closed set ⇒ UNKNOWN_CONNECTOR_CLASS", () => {
		fc.assert(
			fc.property(
				fc
					.string()
					.filter((s) => !(CLASSIFICATIONS as readonly string[]).includes(s)),
				(bad) => {
					const c = validBaseline(
						"connector",
						"external",
						"read_only",
						"gmail",
					);
					const v = validate({ ...c, classification: bad as Classification });
					expect(v.code).toBe("UNKNOWN_CONNECTOR_CLASS");
				},
			),
		);
	});
});

describe("invariant 3 — closed access-scope set", () => {
	it("a scope outside the closed set ⇒ UNKNOWN_CONNECTOR_SCOPE", () => {
		fc.assert(
			fc.property(
				fc
					.string()
					.filter((s) => !(ACCESS_SCOPES as readonly string[]).includes(s)),
				(bad) => {
					const c = validBaseline(
						"connector",
						"external",
						"read_only",
						"gmail",
					);
					const v = validate({ ...c, scope: bad as AccessScope });
					expect(v.code).toBe("UNKNOWN_CONNECTOR_SCOPE");
				},
			),
		);
	});
});

describe("invariant 4 — AI never direct to DB (the anti-false-positive frontier)", () => {
	it("an ai source with a datastore egress ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN; non-ai passes", () => {
		fc.assert(
			fc.property(fc.constantFrom(...DATASTORE_HOSTS), (ds) => {
				const ai: ConnectorSource = {
					...validBaseline(
						"mcp_server",
						"external",
						"read_only",
						"postgres_ro",
					),
					classification: "ai",
					egressHosts: ["api.ok.com", ds],
					authority: null,
				};
				expect(validate(ai).code).toBe("AI_DIRECT_DB_ACCESS_FORBIDDEN");

				// the SAME datastore host on a non-ai source is NOT this refusal.
				const ext: ConnectorSource = {
					...ai,
					classification: "external",
					egressHosts: [ds],
				};
				expect(validate(ext).code).not.toBe("AI_DIRECT_DB_ACCESS_FORBIDDEN");
			}),
		);
	});
});

describe("invariant 5 — read_write requires an authority", () => {
	it("rw with no authority ⇒ CONNECTOR_RW_REQUIRES_AUTHORITY; read_only needs none", () => {
		const rw: ConnectorSource = {
			...validBaseline("connector", "external", "read_write", "slack"),
			authority: null,
		};
		expect(validate(rw).code).toBe("CONNECTOR_RW_REQUIRES_AUTHORITY");
		const ro: ConnectorSource = { ...rw, scope: "read_only" };
		expect(validate(ro).code).not.toBe("CONNECTOR_RW_REQUIRES_AUTHORITY");
		expect(isValid(ro)).toBe(true);
	});
});

describe("invariant 6 — validate is total and deterministic", () => {
	it("never throws and returns the same verdict for the same arbitrary input", () => {
		fc.assert(
			fc.property(
				fc.record({
					layer: fc.constantFrom("above", "below", "x"),
					kind: fc.string(),
					name: fc.string(),
					classification: fc.string(),
					scope: fc.string(),
					egressHosts: fc.array(fc.string()),
					target: fc.string(),
				}),
				(raw) => {
					const c = {
						...raw,
						dataTruthScope: [],
						authority: null,
						truthScope: { region: "fr", environment: "prod" },
					} as unknown as ConnectorSource;
					const v1 = validate(c);
					const v2 = validate(c);
					expect(v1).toEqual(v2);
					expect(() => contentId(c)).not.toThrow();
				},
			),
		);
	});
});
