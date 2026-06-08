/**
 * S91 — per-app SECRET STORE reproducibility + isolation + leak-scan mirror
 * (Vitest + fast-check). reflects=s91-secret-store · test_kind=property.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the load-bearing judgments are PURE — same
 * input → same output. The eight pins:
 *   1. envVar is a pure, deterministic name map;
 *   2. injectEnv is fail-closed — a missing declared key → a BlockReason;
 *   3. injectEnv succeeds with all declared keys present (SORTED env);
 *   4. rotation invalidates the old secret (next inject carries the new value);
 *   5. cross-project isolation — A's secret never reaches B's boot;
 *   6. the leak scan FINDS an embedded secret value (complete);
 *   7. the leak scan does NOT flag a clean emission (sound, no false positive);
 *   8. the scanner never re-emits the raw secret in its own report (redaction).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { envVar, isClean, SecretStore, scanEmission } from "./secret-store";

describe("S91 secret-store — deterministic judgments", () => {
	it("1. envVar is a pure deterministic name map", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z][a-z0-9_]{0,11}$/), (name) => {
				expect(envVar(name)).toBe(envVar(name));
				expect(envVar(name).startsWith("APP_SECRET_")).toBe(true);
				expect(envVar(name)).toBe(envVar(name).toUpperCase());
			}),
		);
	});

	it("2. injectEnv is fail-closed on a missing declared key", () => {
		const st = new SecretStore();
		st.set("p", "present", "value-aaaaaa");
		const inj = st.injectEnv("p", ["present", "absent_key"]);
		expect(inj.ok).toBe(false);
		expect(inj.block?.code).toBe("SECRET_MISSING_AT_BOOT");
		expect(inj.block?.howToFix.length).toBeGreaterThan(0);
		expect(inj.block?.explanation).toContain("absent_key");
		expect(inj.env.length).toBe(0);
	});

	it("3. injectEnv succeeds with all declared keys present, SORTED", () => {
		const st = new SecretStore();
		st.set("p", "z_last", "vvvvvvvvvvvv");
		st.set("p", "a_first", "wwwwwwwwwwww");
		const inj = st.injectEnv("p", ["z_last", "a_first"]);
		expect(inj.ok).toBe(true);
		expect(inj.env.map((e) => e.name)).toEqual([
			"APP_SECRET_A_FIRST",
			"APP_SECRET_Z_LAST",
		]);
	});

	it("4. rotation invalidates the old secret", () => {
		const st = new SecretStore();
		st.set("p", "k", "OLD-value-1111");
		expect(st.rotate("p", "k", "NEW-value-2222")).toBe(true);
		const inj = st.injectEnv("p", ["k"]);
		expect(inj.env[0].value).toBe("NEW-value-2222");
		expect(inj.env[0].value).not.toContain("OLD");
		// rotating an absent secret is refused.
		expect(st.rotate("p", "never", "x")).toBe(false);
	});

	it("5. cross-project isolation — A's secret never reaches B", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-f0-9]{6}$/),
				fc.stringMatching(/^[a-f0-9]{6}$/),
				fc.stringMatching(/^[A-Za-z0-9]{12,20}$/),
				(a, b, value) => {
					fc.pre(a !== b);
					const st = new SecretStore();
					st.set(`proj_${a}`, "secret", value);
					expect(st.has(`proj_${b}`, "secret")).toBe(false);
					const inj = st.injectEnv(`proj_${b}`, ["secret"]);
					expect(inj.ok).toBe(false);
				},
			),
		);
	});

	it("6. leak scan FINDS an embedded secret value (complete)", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[A-Za-z0-9._-]{12,40}$/), (value) => {
				const leaky = `const dbPassword = "${value}";\n`;
				const found = scanEmission(leaky, [value]).some(
					(f) => f.rule === "known-secret-value",
				);
				expect(found).toBe(true);
			}),
		);
	});

	it("7. leak scan does NOT flag a clean emission (sound)", () => {
		const clean =
			'import { Hono } from "hono";\nconst app = new Hono();\nexport default app;\n';
		expect(isClean(clean, ["a-secret-value"])).toBe(true);
		// known credential patterns are caught.
		expect(isClean('const k = "AKIAIOSFODNN7EXAMPLE";\n')).toBe(false);
	});

	it("8. the scanner redacts — never re-emits the raw secret", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[A-Za-z0-9._-]{12,40}$/), (value) => {
				const leaky = `const x = "${value}";\n`;
				for (const f of scanEmission(leaky, [value])) {
					expect(f.excerpt).not.toContain(value);
					expect(f.excerpt).toContain("[REDACTED]");
				}
			}),
		);
	});
});
