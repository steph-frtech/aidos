import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	apply as applyEnvelope,
	type ChangeSet as Envelope,
} from "./changeset";
import {
	DEMO_SERVICES,
	hashDemoMatrix,
	isConnRefusal,
	resolveConnection,
} from "./connections";
import {
	APPLIED_AT,
	approveBinding,
	type BindingDraft,
	cockpitMatrix,
	effectiveBindings,
	hashCockpitMatrix,
	isCockpitRefusal,
	NETWORKS,
	proposeBinding,
	resolveWith,
	sensorStatus,
	validateDraft,
} from "./env-binding-cockpit";
import { bindingsFor, ENVIRONMENTS, isRefusal } from "./environments";
import { route } from "./gateway";
import type { Scope } from "./projectWall";

/**
 * DP09 mirror — the /environments cockpit reducer (propose → ChangeSet →
 * approval for binding-truths; matrix recompute as the PURE DP07 projection).
 * mirror record: reflects=DP09-env-binding-cockpit, test_kind=property,
 * cert_language=vitest+fast-check, liveness=live
 *
 * WRITTEN FIRST AND RED (KRD: red → green → refactor) — the module
 * lib/env-binding-cockpit.ts does not exist when this mirror is born.
 *
 * THE LAWS:
 *  1. PARITY ∀ — resolveWith(bindingsFor(env), svc) ≡ DP07
 *     resolveConnection(svc, env) on the whole declared domain: the cockpit
 *     matrix IS the DP07 projection, never an estimation.
 *  2. EMPTY-COCKPIT PIN — zero applied ChangeSet ⇒ the cockpit matrix hashes
 *     to the EXACT Go-authoritative DP07 demo-matrix address.
 *  3. DETERMINISM — same draft ⇒ same content-addressed envelope id; same
 *     applied set ⇒ same recomputed matrix address (property, fast-check).
 *  4. THE GATES IN THE DOOR — prod+doltgres refused (DP06 A1), a hardcoded
 *     endpoint in the url_pattern refused with the DP08 closed reason, the
 *     closed sets fail-closed (unknown env/datastore/network refused).
 *  5. THE ENVELOPE — propose yields DRAFT (spec_delta + mirror_delta
 *     together, S20); approve applies ONLY a DRAFT whose content address
 *     re-verifies (a tampered proposal is refused); the applied delta changes
 *     the effective bindings and the matrix recomputes.
 *  6. THE WALL VIA S58 — the cockpit's only doors are changeset_open /
 *     changeset_apply (routed below-the-line); kernel_write is REFUSED by the
 *     gateway with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET.
 */

// The Go-authoritative DP07 demo-matrix address (pinned by connections.test.ts
// + tests/e2e/connections.spec.ts).
const GO_MATRIX_HASH =
	"eb382dcff9243e410ceb6d7bbfe79a942d3845d3adba1f3732439bdb39f45772";

// The Go-authoritative DP08 GREEN verdict address (pinned by
// endpoint-fitness.test.ts + tests/e2e/endpoints-fitness.spec.ts).
const GO_GREEN_ADDRESS =
	"43f2e914534d162173904514b6e5e0d916584092df50ce47944564a264a52970";

const SCOPE: Scope = { identity: "workbench", activeProject: "p-demo" };
const TARGET = { projectId: "p-demo" };

function draft(over: Partial<BindingDraft> = {}): BindingDraft {
	return {
		environment: "dev",
		default_datastore: "postgres",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference, never a value (the DP03–DP05 law).
		url_pattern: "https://${APP_NAME}-dev.${DOMAIN}",
		tls: true,
		network: "traefik_default",
		managed: false,
		...over,
	};
}

async function mustPropose(d: BindingDraft) {
	const out = await proposeBinding(d);
	if (isCockpitRefusal(out)) {
		throw new Error(`unexpected refusal: ${out.code}`);
	}
	return out.changeset;
}

describe("DP09 — law 1: parity ∀ — resolveWith IS the DP07 projection", () => {
	it("equals resolveConnection on every declared environment × demo service", () => {
		for (const env of ENVIRONMENTS) {
			const b = bindingsFor(env);
			expect(isRefusal(b)).toBe(false);
			if (isRefusal(b)) continue;
			for (const svc of DEMO_SERVICES) {
				expect(resolveWith(b, svc)).toEqual(resolveConnection(svc, env));
			}
		}
	});
});

describe("DP09 — law 2: the empty cockpit pins the Go DP07 address", () => {
	it("zero applied ChangeSet ⇒ the exact Go-authoritative matrix address", async () => {
		expect(await hashCockpitMatrix([])).toBe(GO_MATRIX_HASH);
		expect(await hashCockpitMatrix([])).toBe(await hashDemoMatrix());
	});
});

describe("DP09 — law 3: determinism (property)", () => {
	it("same draft ⇒ same content-addressed envelope id; a field flip moves the address", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom("dev", "staging", "local", "future_cloud"),
				fc.constantFrom("postgres", "doltgres"),
				fc.boolean(),
				fc.boolean(),
				fc.constantFrom(...NETWORKS),
				async (env, ds, tls, managed, network) => {
					const d = draft({
						environment: env,
						default_datastore: ds,
						tls,
						managed,
						network,
						url_pattern:
							env === "local"
								? // biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference.
									"http://localhost:${APP_PORT}"
								: // biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference.
									"https://${APP_NAME}.${DOMAIN}",
					});
					const a = await proposeBinding(d);
					const b = await proposeBinding(d);
					expect(b).toEqual(a);
					if (!isCockpitRefusal(a) && !isCockpitRefusal(b)) {
						expect(b.changeset.envelope.id).toBe(a.changeset.envelope.id);
						const flipped = await proposeBinding({ ...d, tls: !tls });
						if (!isCockpitRefusal(flipped)) {
							expect(flipped.changeset.envelope.id).not.toBe(
								a.changeset.envelope.id,
							);
						}
					}
				},
			),
			{ numRuns: 40 },
		);
	});

	it("same applied set ⇒ same recomputed matrix address (measure twice)", async () => {
		const cs = await mustPropose(draft({ managed: true }));
		const approved = approveBinding(cs);
		expect(isCockpitRefusal(approved)).toBe(false);
		if (isCockpitRefusal(approved)) return;
		const h1 = await hashCockpitMatrix([approved.applied]);
		const h2 = await hashCockpitMatrix([approved.applied]);
		expect(h2).toBe(h1);
	});
});

describe("DP09 — law 4: the gates in the door (fail-closed closed sets)", () => {
	it("prod + doltgres is refused at propose time (DP06 A1)", async () => {
		const out = await proposeBinding(
			draft({ environment: "prod", default_datastore: "doltgres" }),
		);
		expect(isCockpitRefusal(out)).toBe(true);
		if (isCockpitRefusal(out)) {
			expect(out.code).toBe("DOLTGRES_NOT_ALLOWED_IN_PROD");
		}
	});

	it("a hardcoded endpoint in the url_pattern is refused with the DP08 closed reason", async () => {
		const ip = await proposeBinding(
			draft({ url_pattern: "https://1.2.3.4:5432" }),
		);
		expect(isCockpitRefusal(ip)).toBe(true);
		if (isCockpitRefusal(ip)) {
			expect(ip.code).toBe("HARDCODED_ENDPOINT_IN_BINDING");
			expect(ip.reason).toBe("ip_literal");
		}
		const lh = await proposeBinding(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference.
			draft({ url_pattern: "http://localhost:${APP_PORT}" }),
		);
		expect(isCockpitRefusal(lh)).toBe(true);
		if (isCockpitRefusal(lh)) {
			expect(lh.code).toBe("HARDCODED_ENDPOINT_IN_BINDING");
			expect(lh.reason).toBe("localhost_literal");
		}
		// …but localhost stays legal on the local machine (the declared table's own shape).
		const local = await proposeBinding(
			draft({
				environment: "local",
				network: "default",
				tls: false,
				// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference.
				url_pattern: "http://localhost:${APP_PORT}",
			}),
		);
		expect(isCockpitRefusal(local)).toBe(false);
	});

	it("unknown environment / datastore / network and a disallowed datastore are refused", () => {
		expect(validateDraft(draft({ environment: "qa" }))?.code).toBe(
			"UNKNOWN_ENVIRONMENT",
		);
		expect(validateDraft(draft({ default_datastore: "mysql" }))?.code).toBe(
			"UNKNOWN_DATASTORE",
		);
		expect(validateDraft(draft({ network: "host" }))?.code).toBe(
			"UNKNOWN_NETWORK",
		);
		expect(
			validateDraft(
				draft({ environment: "prod", default_datastore: "doltgres" }),
			)?.code,
		).toBe("DOLTGRES_NOT_ALLOWED_IN_PROD");
		expect(validateDraft(draft())).toBeNull();
	});
});

describe("DP09 — law 5: the envelope (propose → approve → recompute)", () => {
	it("propose yields a DRAFT carrying spec_delta + mirror_delta together (S20 completeness)", async () => {
		const cs = await mustPropose(draft());
		expect(cs.envelope.status).toBe("DRAFT");
		expect(cs.envelope.specDelta?.target).toBe("kernel/binding/dev");
		expect(cs.envelope.mirrorDelta?.target).toBe("mirrors/binding/dev");
		expect(cs.envelope.appliedAt).toBeNull();
		// the S20 state machine itself admits this envelope.
		const { block } = applyEnvelope(cs.envelope, APPLIED_AT);
		expect(block).toBeNull();
	});

	it("approve applies ONLY a DRAFT; an already-applied envelope is refused NOT_DRAFT", async () => {
		const cs = await mustPropose(draft({ managed: true }));
		const ok = approveBinding(cs);
		expect(isCockpitRefusal(ok)).toBe(false);
		if (isCockpitRefusal(ok)) return;
		expect(ok.applied.envelope.status).toBe("APPLIED");
		expect(ok.applied.envelope.appliedAt).toBe(APPLIED_AT);
		const again = approveBinding(ok.applied);
		expect(isCockpitRefusal(again)).toBe(true);
		if (isCockpitRefusal(again)) expect(again.code).toBe("NOT_DRAFT");
	});

	it("a tampered proposal (content address no longer matches) is refused", async () => {
		const cs = await mustPropose(draft());
		const tampered = {
			...cs,
			binding: { ...cs.binding, managed: true },
		};
		const out = approveBinding(tampered);
		expect(isCockpitRefusal(out)).toBe(true);
		if (isCockpitRefusal(out)) {
			expect(out.code).toBe("PROPOSAL_ADDRESS_MISMATCH");
		}
	});

	it("the approved delta changes the effective bindings and the matrix recomputes (pure DP07)", async () => {
		const cs = await mustPropose(draft({ managed: true }));
		const approved = approveBinding(cs);
		expect(isCockpitRefusal(approved)).toBe(false);
		if (isCockpitRefusal(approved)) return;
		const eff = effectiveBindings([approved.applied]);
		const dev = eff.find((b) => b.environment === "dev");
		expect(dev?.managed).toBe(true);
		// dev becomes managed ⇒ EVERY dev resolution flips to managed_url —
		// recomputed by the SAME parity-pinned pure function, never estimated.
		const matrix = cockpitMatrix([approved.applied]);
		for (const r of matrix.filter((m) => m.environment === "dev")) {
			expect(r.mode).toBe("managed_url");
		}
		// untouched environments keep the exact DP07 resolutions.
		for (const r of matrix.filter((m) => m.environment === "prod")) {
			const base = resolveConnection(
				DEMO_SERVICES.find((s) => s.name === r.service) ?? DEMO_SERVICES[0],
				"prod",
			);
			expect(isConnRefusal(base)).toBe(false);
			expect(r).toEqual(base);
		}
		const h = await hashCockpitMatrix([approved.applied]);
		expect(h).not.toBe(GO_MATRIX_HASH);
	});
});

describe("DP09 — law 6: the wall via the S58 gateway", () => {
	it("changeset_open / changeset_apply route below-the-line; kernel_write is refused", () => {
		expect(route(SCOPE, "changeset_open", TARGET).outcome).toBe("route");
		expect(route(SCOPE, "changeset_apply", TARGET).outcome).toBe("route");
		const denied = route(SCOPE, "kernel_write", TARGET);
		expect(denied.outcome).toBe("refused_truth_write");
		expect(denied.blockReason?.code).toBe(
			"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET",
		);
	});

	it("the DP08 sensor status the cockpit displays is the Go-pinned GREEN verdict", () => {
		const s = sensorStatus();
		expect(s.state).toBe("green");
		expect(s.rule).toBe("EMITTED_NO_HARDCODED_ENDPOINT");
		expect(s.address).toBe(GO_GREEN_ADDRESS);
	});
});

describe("DP09 — the envelope type stays the S20 shape (no fork)", () => {
	it("the proposal's envelope is assignable to the S20 ChangeSet", async () => {
		const cs = await mustPropose(draft());
		const env: Envelope = cs.envelope;
		expect(env.reverts).toBeNull();
	});
});
