import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	BOOT_MERGE_ORDER,
	bootMergeOrder,
	DEPLOY_TIME_PLACEHOLDER,
	demoEnvExample,
	envExampleIsReferencesOnly,
	MISSING_SECRET_AT_BOOT,
	mergeBootEnv,
	parseEnvExample,
	referenceFor,
	rotateSecret,
	SECRET_PLACEHOLDER,
	scanEmittedSource,
	storeFingerprint,
} from "./secret-boot";
import { SecretStore } from "./secret-store";

/**
 * DP32 mirror (property + fixture, written FIRST — RED→VERT) — the twin of
 * back/runtime/bootstrap/bootenv.go (MergeBootEnv / RotateSecret / ScanBootEmission).
 *
 * The four done-criteria of DP32:
 *  (1) a secret of project A NEVER leaks to B nor into the emitted source (scan green +
 *      scopeKey isolation + S55) ;
 *  (2) a rotation INVALIDATES the old secret (the fingerprint changes, Get returns the new) ;
 *  (3) a secret missing at boot raises MISSING_SECRET_AT_BOOT (actionable, keys named) ;
 *  (4) the emitted `.env.example` carries ONLY references (zero value, ∀) ;
 * plus reproducibility (the engraved merge order is a pure deterministic function).
 *
 * THE WALL (§2): secrets live in the store, never the truth-store/git/emitted source. The
 * merge order is engraved (BOOT_MERGE_ORDER); the scan is the shared S91 code, never an LLM.
 */

// ── arbitraries ──────────────────────────────────────────────────────────────────

const arbProject = fc.stringMatching(/^[a-z]{1,8}$/);
const arbSecretName = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,12}$/);
// a high-entropy-ish value the scan can find verbatim (≥6 chars so the known-value rule fires).
const arbSecretValue = fc.stringMatching(/^[A-Za-z0-9]{12,24}$/);

// ── (4) the emitted .env.example carries ONLY references — ∀ ───────────────────────

describe("DP32 — le .env.example émis ne porte QUE des références (∀, zéro valeur)", () => {
	it("demoEnvExample is references-only — every secret key is the placeholder, never a value", () => {
		const refs = parseEnvExample(demoEnvExample());
		const secretRefs = refs.filter((r) => r.isSecret);
		expect(secretRefs.length).toBeGreaterThan(0);
		for (const r of secretRefs) {
			expect(r.value).toBe(SECRET_PLACEHOLDER);
		}
		// the deploy-time marker is carried, NOT a secret.
		const appName = refs.find((r) => r.key === "APP_NAME");
		expect(appName?.value).toBe(DEPLOY_TIME_PLACEHOLDER);
		expect(appName?.isSecret).toBe(false);
	});

	it("∀ project/value: the emitted .env.example never contains a concrete secret value (scan clean)", () => {
		fc.assert(
			fc.property(
				arbProject,
				arbSecretValue,
				arbSecretValue,
				(project, v1, v2) => {
					const store = new SecretStore();
					store.set(project, "APP_SECRET_DATABASE_URL", v1);
					store.set(project, "APP_SECRET_OAUTH_CLIENT_SECRET", v2);
					// the emitted source is the references-only .env.example — even checked against
					// the project's REAL values, the scan finds NOTHING (zero value in the source).
					return (
						envExampleIsReferencesOnly(demoEnvExample(), [v1, v2]) === true
					);
				},
			),
		);
	});
});

// ── (1) isolation: A's secret never reaches B nor the emitted source ───────────────

describe("DP32 — isolation : un secret de A ne fuite jamais vers B ni dans le source émis", () => {
	it("A's secret value is invisible under project B (the merge fails closed for B)", () => {
		const store = new SecretStore();
		store.set("project-a", "APP_SECRET_DATABASE_URL", "aSecretValueForA1");
		store.set("project-a", "APP_SECRET_OAUTH_CLIENT_SECRET", "anotherSecretA2");

		// merge for A resolves; merge for B (which never set these) fails closed.
		const a = mergeBootEnv(demoEnvExample(), store, "project-a");
		expect(a.ok).toBe(true);
		expect(a.env.APP_SECRET_DATABASE_URL).toBe("aSecretValueForA1");

		const b = mergeBootEnv(demoEnvExample(), store, "project-b");
		expect(b.ok).toBe(false);
		expect(b.block?.code).toBe(MISSING_SECRET_AT_BOOT);
		// B's (empty) env never carries A's value.
		expect(Object.values(b.env)).not.toContain("aSecretValueForA1");
	});

	it("∀ A≠B, v: A's value never appears in B's resolved env nor in the emitted source", () => {
		fc.assert(
			fc.property(arbProject, arbProject, arbSecretValue, (a, b, v) => {
				fc.pre(a !== b);
				const store = new SecretStore();
				store.set(a, "APP_SECRET_DATABASE_URL", v);
				store.set(a, "APP_SECRET_OAUTH_CLIENT_SECRET", v);
				const mb = mergeBootEnv(demoEnvExample(), store, b);
				// B never sees A's value (fail-closed, empty env), and the emitted source is
				// clean of A's value (references only).
				const notInB = !Object.values(mb.env).includes(v);
				const notInSource =
					scanEmittedSource(demoEnvExample(), [v]).length === 0;
				return notInB && notInSource;
			}),
		);
	});
});

// ── (2) a rotation invalidates the old secret ──────────────────────────────────────

describe("DP32 — la rotation INVALIDE l'ancien secret", () => {
	it("rotate changes the live value and the store fingerprint; the old value is gone", () => {
		const store = new SecretStore();
		store.set("p", "APP_SECRET_DATABASE_URL", "oldSecretValue1");
		store.set("p", "APP_SECRET_OAUTH_CLIENT_SECRET", "fixedOther2");

		const before = mergeBootEnv(demoEnvExample(), store, "p");
		expect(before.env.APP_SECRET_DATABASE_URL).toBe("oldSecretValue1");

		const res = rotateSecret(
			store,
			"p",
			"APP_SECRET_DATABASE_URL",
			"newSecretValue9",
		);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.decision.oldFingerprint).not.toBe(res.decision.newFingerprint);
			expect(res.decision.name).toBe("APP_SECRET_DATABASE_URL");
			// fingerprints never leak the value.
			expect(res.decision.oldFingerprint).not.toContain("oldSecretValue1");
			expect(res.decision.newFingerprint).not.toContain("newSecretValue9");
		}

		const after = mergeBootEnv(demoEnvExample(), store, "p");
		expect(after.env.APP_SECRET_DATABASE_URL).toBe("newSecretValue9");
		// the OLD value is no longer reachable — rotation invalidated it.
		expect(Object.values(after.env)).not.toContain("oldSecretValue1");
	});

	it("rotating an ABSENT secret is refused (you Set what does not exist, Rotate what does)", () => {
		const store = new SecretStore();
		const res = rotateSecret(store, "p", "APP_SECRET_NEVER_SET", "x123456789");
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.code).toBe("not-found");
	});

	it("∀ rotation with a different value changes the fingerprint", () => {
		fc.assert(
			fc.property(
				arbProject,
				arbSecretName,
				arbSecretValue,
				arbSecretValue,
				(project, name, v1, v2) => {
					fc.pre(v1 !== v2);
					const store = new SecretStore();
					store.set(project, name, v1);
					const before = storeFingerprint(store, project);
					const res = rotateSecret(store, project, name, v2);
					if (!res.ok) return false;
					const after = storeFingerprint(store, project);
					return (
						before !== after &&
						res.decision.oldFingerprint === before &&
						res.decision.newFingerprint === after
					);
				},
			),
		);
	});
});

// ── (3) a missing secret at boot raises MISSING_SECRET_AT_BOOT ──────────────────────

describe("DP32 — un secret manquant au boot lève MISSING_SECRET_AT_BOOT (actionnable)", () => {
	it("an unresolved secret reference fails closed and NAMES the missing key", () => {
		const store = new SecretStore();
		// only ONE of the two secret refs is present.
		store.set("p", "APP_SECRET_DATABASE_URL", "presentValue1");
		const res = mergeBootEnv(demoEnvExample(), store, "p");
		expect(res.ok).toBe(false);
		expect(res.env).toEqual({});
		expect(res.block?.code).toBe(MISSING_SECRET_AT_BOOT);
		expect(res.block?.explanation).toContain("APP_SECRET_OAUTH_CLIENT_SECRET");
		expect(res.block?.howToFix.length).toBeGreaterThan(0);
	});

	it("an override resolves a missing reference (the boot starts)", () => {
		const store = new SecretStore();
		store.set("p", "APP_SECRET_DATABASE_URL", "presentValue1");
		const res = mergeBootEnv(demoEnvExample(), store, "p", {
			APP_SECRET_OAUTH_CLIENT_SECRET: "overrideValue2",
		});
		expect(res.ok).toBe(true);
		expect(res.env.APP_SECRET_OAUTH_CLIENT_SECRET).toBe("overrideValue2");
	});

	it("an empty project_id fails closed (the isolation scope is mandatory)", () => {
		const store = new SecretStore();
		const res = mergeBootEnv(demoEnvExample(), store, "  ");
		expect(res.ok).toBe(false);
		expect(res.block?.code).toBe(MISSING_SECRET_AT_BOOT);
	});
});

// ── reproducibility: the engraved merge order is a pure deterministic function ──────

describe("DP32 — reproductibilité : l'ordre de merge est une fonction pure gravée", () => {
	it("BOOT_MERGE_ORDER is the engraved references → store → overrides", () => {
		expect(BOOT_MERGE_ORDER).toEqual(["references", "store", "overrides"]);
		expect(bootMergeOrder()).toEqual(["references", "store", "overrides"]);
		// it is a COPY — mutating it never mutates the constant.
		const copy = bootMergeOrder();
		copy.push("references");
		expect(bootMergeOrder()).toEqual(["references", "store", "overrides"]);
	});

	it("∀ same (env.example, store, project, overrides) ⇒ byte-identical resolved env", () => {
		fc.assert(
			fc.property(
				arbProject,
				arbSecretValue,
				arbSecretValue,
				arbSecretValue,
				(project, db, oauth, dom) => {
					const build = () => {
						const store = new SecretStore();
						store.set(project, "APP_SECRET_DATABASE_URL", db);
						store.set(project, "APP_SECRET_OAUTH_CLIENT_SECRET", oauth);
						return mergeBootEnv(demoEnvExample(), store, project, {
							DOMAIN: dom,
						});
					};
					const first = JSON.stringify(build());
					const second = JSON.stringify(build());
					return first === second;
				},
			),
		);
	});

	it("override wins last (the engraved order: references → store → overrides)", () => {
		const store = new SecretStore();
		store.set("p", "APP_SECRET_DATABASE_URL", "fromStore1");
		store.set("p", "APP_SECRET_OAUTH_CLIENT_SECRET", "fromStore2");
		const res = mergeBootEnv(demoEnvExample(), store, "p", {
			APP_SECRET_DATABASE_URL: "fromOverride9",
			DOMAIN: "override.example",
		});
		expect(res.ok).toBe(true);
		// the override beat the store value (last layer wins).
		expect(res.env.APP_SECRET_DATABASE_URL).toBe("fromOverride9");
		expect(res.env.DOMAIN).toBe("override.example");
	});

	it("referenceFor renders a dollar-brace reference shape, never a value", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the emitted .env.example reference text is a literal dollar-brace string, not a template interpolation.
		const want = "${APP_SECRET_DATABASE_URL}";
		expect(referenceFor("APP_SECRET_DATABASE_URL")).toBe(want);
	});
});
