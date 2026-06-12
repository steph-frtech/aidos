import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	composeEnvRefs,
	DEPLOY_TIME_PLACEHOLDER,
	emitEnvBundle,
	envKeys,
	isClean,
	MERGE_ORDER,
	renderEnvExample,
	renderStartSh,
	renderStartWithRebuildSh,
	SECRET_PLACEHOLDER,
	scanEmission,
	secretEnvVar,
	TARGET_ENV_EXAMPLE,
	TARGET_START_SCRIPTS,
} from "./env-emit";
import { renderCompose } from "./stack-emit";
import {
	exampleManifest,
	PROFILES,
	ROLES,
	type StackManifest,
} from "./stack-manifest";

/**
 * Reproducibility mirror (vitest + fast-check): reflects=DP04-env-emitter,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * DP04 — the TS twin of the authoritative Go emitter (back/runtime/envemit):
 * Emit(stack_manifest) → .env.example + start.sh + start_with_rebuild.sh,
 * the /data/dockers merge order (global → bp-default → bp-secrets →
 * deploy-time) ENGRAVED as a pure emission template. The twin is
 * BYTE-PARITY-PINNED to Go: the pinned Example must emit bytes whose sha-256
 * are the EXACT output_hashes the Go side measured. Any one-byte divergence
 * reds.
 *
 * Laws (the DP04 done-criteria, twin side):
 *   L1 byte parity with Go (three output_hashes + source_hash + paths);
 *   L2 reproducibility — same manifest → byte-identical emission (×100 + ∀);
 *   L3 ZERO secret values — every secret key is the <<from-secret-store>>
 *      reference; the deterministic gitleaks-like scan is green;
 *   L4 coherence — every ${VAR} the DP03 compose references exists as a key
 *      of the .env.example;
 *   L5 merge order — the engraved layer sections render in order and the
 *      deploy-time APP_NAME overrides the inherited one (last write wins);
 *   L6 scripts — start.sh is down → up; start_with_rebuild.sh is down →
 *      build --no-cache → up;
 *   L7 an invalid manifest is REFUSED with its closed DP02 code;
 *   L8 the scanner itself fires on a real leak (fault-injection — a sensor
 *      that never fires is dead).
 */

// The Go-authoritative output_hashes of envemit.Emit(stackmanifest.Example())
// — records.Hash(bytes), printed by the Go side, pinned here verbatim.
const GO_ENV_OUTPUT_HASH =
	"0f8a51478417ab8b182947cd10f18471a0c384dd34e3cda40d5e02c3a9a874f9";
const GO_START_OUTPUT_HASH =
	"10525a91a69b915788cc517001216d1b50a893235b0ab269b8d6b35ac1c6b06e";
const GO_REBUILD_OUTPUT_HASH =
	"8a1b598c034efb01d08274b03d236325bfef2d879d87d83ef4b7214952d6f2db";

// The Go-authoritative source_hash (== DP02/DP03's — S02 reused, never forked).
const GO_SOURCE_HASH =
	"8011728e4f9c01130c151d5c49b89b28afa1e3dc5e741fcc12c04c38062acdd2";

const serviceName = fc
	.tuple(
		fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
		fc.stringMatching(/^[a-z0-9]{0,9}$/),
	)
	.map(([h, t]) => h + t);

const validManifest: fc.Arbitrary<StackManifest> = fc
	.record({
		app: serviceName,
		names: fc.uniqueArray(serviceName, { minLength: 1, maxLength: 5 }),
		ports: fc.uniqueArray(fc.integer({ min: 1024, max: 65535 }), {
			minLength: 5,
			maxLength: 5,
		}),
		roles: fc.array(fc.constantFrom(...ROLES), {
			minLength: 5,
			maxLength: 5,
		}),
		profiles: fc.array(fc.constantFrom(...PROFILES), {
			minLength: 5,
			maxLength: 5,
		}),
		external: fc.boolean(),
		volumes: fc.uniqueArray(serviceName, { maxLength: 2 }),
		scopes: fc.uniqueArray(serviceName, { maxLength: 3 }),
	})
	.map(({ app, names, ports, roles, profiles, external, volumes, scopes }) => ({
		app,
		services: names.map((name, i) => ({
			name,
			role: i === 0 ? "server" : roles[i],
			image: i % 2 === 0 ? "node:22-alpine" : "",
			internal_port: ports[i],
			profile: profiles[i],
		})),
		volumes: volumes.map((name, i) => ({
			name,
			device_var: i === 0 ? "APP_DATA_PATH" : "EXTRA_DATA_PATH",
		})),
		network: { name: "traefik_default", external },
		connector_scopes: scopes.map((s) => `${s}:read-only`),
	}));

describe("DP04 — env/scripts emitter TS twin pinned to the authoritative Go emitter", () => {
	it("L1 — the seeded Example emits EXACTLY the Go bytes (three output_hashes + source_hash + paths parity)", async () => {
		const b = await emitEnvBundle(exampleManifest());
		if ("refusal" in b) throw new Error("Example refused");
		expect(b.envExample.outputHash).toBe(GO_ENV_OUTPUT_HASH);
		expect(b.startSh.outputHash).toBe(GO_START_OUTPUT_HASH);
		expect(b.startWithRebuild.outputHash).toBe(GO_REBUILD_OUTPUT_HASH);
		expect(b.envExample.sourceHash).toBe(GO_SOURCE_HASH);
		expect(b.envExample.path).toBe("back/gen/alphashop/.env.example");
		expect(b.startSh.path).toBe("back/gen/alphashop/start.sh");
		expect(b.startWithRebuild.path).toBe(
			"back/gen/alphashop/start_with_rebuild.sh",
		);
		expect(b.envExample.target).toBe(TARGET_ENV_EXAMPLE);
		expect(b.startSh.target).toBe(TARGET_START_SCRIPTS);
	});

	it("L2 — reproducibility: same manifest → byte-identical bundle, ×100 (pure)", async () => {
		const first = await emitEnvBundle(exampleManifest());
		if ("refusal" in first) throw new Error("Example refused");
		for (let i = 0; i < 100; i++) {
			const again = await emitEnvBundle(exampleManifest());
			if ("refusal" in again) throw new Error("Example refused");
			expect(again.envExample.text).toBe(first.envExample.text);
			expect(again.startSh.text).toBe(first.startSh.text);
			expect(again.startWithRebuild.text).toBe(first.startWithRebuild.text);
		}
	});

	it("L2∀ — reproducibility over arbitrary valid manifests (fast-check)", () => {
		fc.assert(
			fc.property(validManifest, (m) => {
				expect(renderEnvExample(m, "deadbeef")).toBe(
					renderEnvExample(m, "deadbeef"),
				);
				expect(renderStartSh("deadbeef")).toBe(renderStartSh("deadbeef"));
				expect(renderStartWithRebuildSh("deadbeef")).toBe(
					renderStartWithRebuildSh("deadbeef"),
				);
			}),
		);
	});

	it("L3∀ — zero secret values: every secret key is a reference; the deterministic scan is green", () => {
		fc.assert(
			fc.property(validManifest, (m) => {
				const env = renderEnvExample(m, "deadbeef");
				expect(isClean(env)).toBe(true);
				expect(env).toContain(
					`GITHUB_PERSONAL_ACCESS_TOKEN=${SECRET_PLACEHOLDER}\n`,
				);
				for (const scope of m.connector_scopes ?? []) {
					expect(env).toContain(
						`${secretEnvVar(scope)}=${SECRET_PLACEHOLDER}\n`,
					);
				}
				for (const line of env.split("\n")) {
					if (line.startsWith("APP_SECRET_")) {
						expect(line.endsWith(`=${SECRET_PLACEHOLDER}`)).toBe(true);
					}
				}
			}),
		);
	});

	// biome-ignore lint/suspicious/noTemplateCurlyInString: the title names the LITERAL compose ${VAR} reference (never an interpolation).
	it("L4∀ — coherence: every ${VAR} the DP03 compose references exists in the .env.example", () => {
		fc.assert(
			fc.property(validManifest, (m) => {
				const compose = renderCompose(m, "deadbeef");
				const keys = new Set(envKeys(renderEnvExample(m, "deadbeef")));
				for (const ref of composeEnvRefs(compose)) {
					expect(keys.has(ref)).toBe(true);
				}
			}),
		);
	});

	it("L5∀ — the engraved merge order renders in order; deploy-time APP_NAME overrides (exactly once, last write wins)", () => {
		expect([...MERGE_ORDER]).toEqual([
			"global",
			"bp-default",
			"bp-secrets",
			"deploy-time",
		]);
		fc.assert(
			fc.property(validManifest, (m) => {
				const env = renderEnvExample(m, "deadbeef");
				let last = -1;
				for (const layer of MERGE_ORDER) {
					const idx = env.indexOf(`# --- ${layer} `);
					expect(idx).toBeGreaterThan(last);
					last = idx;
				}
				const appNames = env
					.split("\n")
					.filter((l) => l.startsWith("APP_NAME="));
				expect(appNames).toEqual([`APP_NAME=${m.app}`]);
			}),
		);
	});

	it("L6 — the scripts are the deploy.sh templates: down → up and down → build --no-cache → up", () => {
		const start = renderStartSh("deadbeef");
		const rebuild = renderStartWithRebuildSh("deadbeef");
		for (const s of [start, rebuild]) {
			expect(s.startsWith("#!/usr/bin/env bash\n")).toBe(true);
			expect(s).toContain('cd "$(dirname "$0")"');
			expect(s.indexOf("docker compose down")).toBeLessThan(
				s.indexOf("docker compose up -d"),
			);
		}
		expect(start).not.toContain("--no-cache");
		const build = rebuild.indexOf("docker compose build --no-cache");
		expect(build).toBeGreaterThan(rebuild.indexOf("docker compose down"));
		expect(build).toBeLessThan(rebuild.indexOf("docker compose up -d"));
	});

	it("L7 — an invalid manifest is refused with its closed DP02 code, never a guessed emission", async () => {
		const m = exampleManifest();
		m.services[1].internal_port = m.services[0].internal_port;
		const out = await emitEnvBundle(m);
		if (!("refusal" in out)) throw new Error("broken manifest emitted anyway");
		expect(out.refusal.code).toBe("DUPLICATE_INTERNAL_PORT");
	});

	it("L8 — fault-injection: the deterministic scanner FIRES on a real leak (a sensor that never fires is dead)", () => {
		const leaked = [
			"# a hand-written env with a REAL value (never emitted by AIDOS)",
			'POSTGRES_PASSWORD="hunter2hunter2hunter2"',
			"DATABASE_URL=postgresql://app:hunter2@postgres:5432/app",
		].join("\n");
		const findings = scanEmission(leaked);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings.map((f) => f.rule)).toContain("secret-assignment");
		expect(findings.map((f) => f.rule)).toContain("postgres-uri-password");
		expect(isClean(leaked)).toBe(false);
	});

	it("L9 — the placeholders never count as values: the scan stays green on the seeded Example", async () => {
		const b = await emitEnvBundle(exampleManifest());
		if ("refusal" in b) throw new Error("Example refused");
		expect(isClean(b.envExample.text)).toBe(true);
		expect(scanEmission(b.envExample.text)).toEqual([]);
		// the example carries the S91 reference for the declared connector scope.
		expect(b.envExample.text).toContain(
			`APP_SECRET_POSTGRES_READ_ONLY=${SECRET_PLACEHOLDER}`,
		);
	});

	it("L10 — the deploy-time placeholder marks every deploy-resolved key (DOMAIN, APP_SUBDOMAIN, CERT_RESOLVER_NAME, TRAEFIK_NETWORK_NAME, device vars, emitted images)", async () => {
		const b = await emitEnvBundle(exampleManifest());
		if ("refusal" in b) throw new Error("Example refused");
		for (const key of [
			"APP_SUBDOMAIN",
			"DOMAIN",
			"CERT_RESOLVER_NAME",
			"TRAEFIK_NETWORK_NAME",
			"APP_DATA_PATH",
			"INTERPRETER_IMAGE",
		]) {
			expect(b.envExample.text).toContain(
				`${key}=${DEPLOY_TIME_PLACEHOLDER}\n`,
			);
		}
		// the declared internal ports carry their declared (non-secret) values.
		expect(b.envExample.text).toContain("APP_PORT=3000\n");
		expect(b.envExample.text).toContain("POSTGRES_PORT=5432\n");
		expect(b.envExample.text).toContain("INTERPRETER_PORT=8973\n");
	});
});
