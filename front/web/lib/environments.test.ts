import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	bindings,
	bindingsFor,
	canonicalBindings,
	DATASTORES,
	ENVIRONMENTS,
	hashBindings,
	isKnownDatastore,
	isKnownEnvironment,
	isRefusal,
	validateDatastore,
} from "./environments";

/**
 * Reproducibility mirror (vitest + fast-check): reflects=DP06-environments,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * DP06 — the TS twin of the authoritative Go projection
 * (back/runtime/envbindings): the per-environment connection bindings over the
 * WIDENED closed environment set (S15 + ADR 0065 — prod, staging, dev, local,
 * future_cloud). THE GO CODE IS AUTHORITATIVE — the twin is BYTE-PARITY-PINNED:
 * the canonical projection must hash to the EXACT Go address GO_BINDINGS_HASH.
 *
 * Laws (the DP06 done-criteria, twin side):
 *   L1 byte parity with Go — the canonical bindings hash to GO_BINDINGS_HASH;
 *   L2 five environments, closed, canonical order (S15 prefix + DP06 appended);
 *   L3 the A1 gate — prod + doltgres REFUSED (DOLTGRES_NOT_ALLOWED_IN_PROD);
 *      every non-prod environment admits doltgres (opt-in);
 *   L4 fail-closed on the unknown — out-of-set env/datastore refused, never
 *      guessed;
 *   L5 allowed ⇔ validate — the table and the gate never diverge;
 *   L6 ${VAR} references, never values;
 *   L7 reproducibility — same input → same output, ∀ + ×100.
 */

// The Go-AUTHORITATIVE content address (back/runtime/envbindings — pinned by
// the rapid property mirror envbindings_property_test.go).
const GO_BINDINGS_HASH =
	"aaca11ab05812777fbac50c18f6f38f5ad72030a67439f83ed32b002a519a419";

describe("DP06 — environments twin (Go-authoritative, byte-parity-pinned)", () => {
	it("L1: the canonical bindings hash to the EXACT Go address (byte parity)", async () => {
		expect(await hashBindings()).toBe(GO_BINDINGS_HASH);
	});

	it("L2: five environments, closed, S15 prefix preserved + DP06 appended", () => {
		expect(ENVIRONMENTS).toEqual([
			"prod",
			"staging",
			"dev",
			"local",
			"future_cloud",
		]);
		const all = bindings();
		expect(all).toHaveLength(5);
		all.forEach((b, i) => {
			expect(b.environment).toBe(ENVIRONMENTS[i]);
		});
	});

	it("L3: the A1 gate — prod + doltgres is REFUSED with the closed code", () => {
		const refusal = validateDatastore("prod", "doltgres");
		expect(refusal?.code).toBe("DOLTGRES_NOT_ALLOWED_IN_PROD");
		// prod + postgres passes (the prod default).
		expect(validateDatastore("prod", "postgres")).toBeNull();
	});

	it("L3': every non-prod environment admits doltgres (opt-in, ADR 0065)", () => {
		for (const env of ENVIRONMENTS.filter((e) => e !== "prod")) {
			expect(validateDatastore(env, "doltgres")).toBeNull();
		}
	});

	it("L4: an out-of-set environment is refused, never guessed (∀)", () => {
		fc.assert(
			fc.property(fc.string(), (raw) => {
				fc.pre(!isKnownEnvironment(raw));
				const b = bindingsFor(raw);
				expect(isRefusal(b)).toBe(true);
				if (isRefusal(b)) expect(b.code).toBe("UNKNOWN_ENVIRONMENT");
				expect(validateDatastore(raw, "postgres")?.code).toBe(
					"UNKNOWN_ENVIRONMENT",
				);
			}),
		);
	});

	it("L4': an out-of-set datastore is refused, never guessed (∀)", () => {
		fc.assert(
			fc.property(fc.string(), (raw) => {
				fc.pre(!isKnownDatastore(raw));
				expect(validateDatastore("dev", raw)?.code).toBe("UNKNOWN_DATASTORE");
			}),
		);
	});

	it("L5: allowed_datastores ⇔ validateDatastore — never diverging", () => {
		for (const b of bindings()) {
			for (const ds of DATASTORES) {
				const allowed = b.allowed_datastores.includes(ds);
				const passes = validateDatastore(b.environment, ds) === null;
				expect(passes).toBe(allowed);
			}
		}
	});

	it("L6: every URL pattern is an env-var reference, never a value", () => {
		for (const b of bindings()) {
			expect(b.url_pattern).toContain("${");
			for (const leak of ["sagedesk", ".fr", ".com"]) {
				expect(b.url_pattern).not.toContain(leak);
			}
		}
	});

	it("L6': defaults follow ADR 0065 — postgres in prod/future_cloud, doltgres off-prod", () => {
		for (const b of bindings()) {
			const wantPostgres =
				b.environment === "prod" || b.environment === "future_cloud";
			expect(b.default_datastore).toBe(wantPostgres ? "postgres" : "doltgres");
		}
		// prod admits ONLY postgres.
		const prod = bindingsFor("prod");
		if (!isRefusal(prod)) {
			expect(prod.allowed_datastores).toEqual(["postgres"]);
		}
	});

	it("L7: the canonical projection is byte-identical across 100 runs", () => {
		const first = canonicalBindings();
		for (let i = 0; i < 100; i++) {
			expect(canonicalBindings()).toBe(first);
		}
	});

	it("L7': bindingsFor is deterministic (∀ known environment)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...ENVIRONMENTS), (env) => {
				expect(bindingsFor(env)).toEqual(bindingsFor(env));
				expect(validateDatastore(env, "postgres")).toEqual(
					validateDatastore(env, "postgres"),
				);
			}),
		);
	});

	it("L7'': mutating a returned binding never mutates the declared table", () => {
		const a = bindingsFor("dev");
		if (!isRefusal(a)) {
			a.allowed_datastores.push("postgres");
			a.url_pattern = "tampered";
		}
		const b = bindingsFor("dev");
		if (!isRefusal(b)) {
			expect(b.allowed_datastores).toEqual(["postgres", "doltgres"]);
			expect(b.url_pattern).not.toBe("tampered");
		}
	});
});
