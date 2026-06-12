import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { composeEnvRefs, envKeys, isClean, scanEmission } from "./env-emit";
import {
	emitStackBundle,
	phaseVersionFor,
	renderTraefikDynamic,
	TARGET_TRAEFIK_DYNAMIC,
} from "./phase-emit";
import { driftDetected } from "./stack-emit";
import {
	exampleManifest,
	PROFILES,
	ROLES,
	type StackManifest,
} from "./stack-manifest";

/**
 * Reproducibility mirror (vitest + fast-check): reflects=DP05-stack-emitter,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * DP05 — the TS twin of the authoritative Go emitter
 * (back/runtime/stackemit): EmitStack(phase) → the COMPLETE 5-artifact stack
 * bundle {docker-compose.yml, .env.example, start.sh, start_with_rebuild.sh,
 * traefik.dynamic.yml}, triple-addressed (phase_version S23 · source_hash
 * S02 · bundle_hash). THE GO CODE IS AUTHORITATIVE — the twin is
 * BYTE-PARITY-PINNED: the pinned Example must hash to the EXACT Go values.
 *
 * Laws (the DP05 done-criteria, twin side):
 *   L1 byte parity with Go — PHASE_VERSION + TRAEFIK_HASH + BUNDLE_HASH of
 *      the seeded Example (octet-pour-octet);
 *   L2 reproducibility — same manifest → same bundle_hash, ×100 + ∀ (the
 *      cornerstone: même phase → mêmes octets);
 *   L3 coherence — every ${VAR} the compose AND the traefik dynamic config
 *      reference exists as a key of the .env.example;
 *   L4 interpreter sidecar (ADR 0040 D7) — the Example's role=interpreter
 *      service rides the compose (docker_internal) and its port is an env key;
 *   L5 zero secret values — the deterministic scan is green over every
 *      artifact; fault-injection: a planted value REDS the scanner;
 *   L6 hand-edit drift — one flipped byte is detected (the
 *      EMITTED_FILE_HAND_EDITED gate's drift law, twin side);
 *   L7 the bundle_hash MOVES with the manifest (a different manifest is a
 *      different bundle);
 *   L8 an invalid manifest is REFUSED with its closed DP02 code.
 */

// The Go-authoritative addresses of EmitStack(PhaseFor(Example), Example)
// — printed by the Go side (back/runtime/stackemit), pinned here verbatim.
const GO_PHASE_VERSION =
	"a26d29c79ce01cbd6001a665e480685d2d22ca54419864f0314fe6474a9ba76c";
const GO_TRAEFIK_OUTPUT_HASH =
	"8d08ebf598fea0520cb7fbc2ecd621455397609fc711cf2f9ca8dcf7a4cd9dad";
const GO_BUNDLE_HASH =
	"19670343b3cc053593df0f457b466a4ec94871381b69135ac26f6d2eb891af3a";
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

async function mustBundle(m: StackManifest) {
	const b = await emitStackBundle(m);
	if ("refusal" in b) throw new Error(`refused: ${b.refusal.code}`);
	return b;
}

describe("DP05 — full-stack phase emitter TS twin pinned to the authoritative Go emitter", () => {
	it("L1 — the seeded Example carries EXACTLY the Go addresses (phase_version + traefik output_hash + bundle_hash, octet-pour-octet)", async () => {
		const b = await mustBundle(exampleManifest());
		expect(b.phaseVersion).toBe(GO_PHASE_VERSION);
		expect(b.traefikDynamic.outputHash).toBe(GO_TRAEFIK_OUTPUT_HASH);
		expect(b.bundleHash).toBe(GO_BUNDLE_HASH);
		expect(b.sourceHash).toBe(GO_SOURCE_HASH);
		expect(b.traefikDynamic.path).toBe(
			"back/gen/alphashop/traefik.dynamic.yml",
		);
		expect(b.traefikDynamic.target).toBe(TARGET_TRAEFIK_DYNAMIC);
	});

	it("L1b — phaseVersionFor is the S23 content address of the one-constraint cut (records.Canonicalize twin)", async () => {
		expect(await phaseVersionFor(exampleManifest())).toBe(GO_PHASE_VERSION);
	});

	it("L2 — reproducibility ×100: same phase → same bundle_hash (the cornerstone)", async () => {
		const first = await mustBundle(exampleManifest());
		for (let i = 0; i < 100; i++) {
			const again = await mustBundle(exampleManifest());
			expect(again.bundleHash).toBe(first.bundleHash);
			expect(again.traefikDynamic.text).toBe(first.traefikDynamic.text);
		}
	});

	it("L2b — ∀ valid manifest: two emissions are byte-identical (pure function of the phase)", async () => {
		await fc.assert(
			fc.asyncProperty(validManifest, async (m) => {
				const b1 = await mustBundle(m);
				const b2 = await mustBundle(m);
				expect(b2.bundleHash).toBe(b1.bundleHash);
				expect(b2.phaseVersion).toBe(b1.phaseVersion);
				expect(b2.compose.yaml).toBe(b1.compose.yaml);
				expect(b2.env.envExample.text).toBe(b1.env.envExample.text);
				expect(b2.traefikDynamic.text).toBe(b1.traefikDynamic.text);
			}),
			{ numRuns: 30 },
		);
	});

	it("L3 — coherence: every $VAR reference of the compose AND the traefik dynamic config has its key in the .env.example", async () => {
		await fc.assert(
			fc.asyncProperty(validManifest, async (m) => {
				const b = await mustBundle(m);
				const keys = new Set(envKeys(b.env.envExample.text));
				for (const src of [b.compose.yaml, b.traefikDynamic.text]) {
					for (const ref of composeEnvRefs(src)) {
						expect(keys.has(ref)).toBe(true);
					}
				}
			}),
			{ numRuns: 30 },
		);
	});

	it("L4 — the Go interpreter sidecar (ADR 0040 D7) rides the compose as role=interpreter, profile core, docker_internal", async () => {
		const b = await mustBundle(exampleManifest());
		// the service block exists and is addressable on the shared network
		expect(b.compose.yaml).toContain("\n  interpreter:\n");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal compose env reference
		expect(b.compose.yaml).toContain("container_name: ${APP_NAME}-interpreter");
		// profile core ⇒ it always runs (no profiles: block in its section)
		const block = b.compose.yaml
			.split("\n  interpreter:\n")[1]
			.split("\n  ")[0];
		expect(block).not.toContain("profiles:");
		// its internal port is an env key (coherence with DP04)
		expect(envKeys(b.env.envExample.text)).toContain("INTERPRETER_PORT");
	});

	it("L5 — zero secret values: the deterministic scan is green over EVERY artifact of the bundle", async () => {
		const b = await mustBundle(exampleManifest());
		for (const text of [
			b.compose.yaml,
			b.env.envExample.text,
			b.env.startSh.text,
			b.env.startWithRebuild.text,
			b.traefikDynamic.text,
		]) {
			expect(isClean(text)).toBe(true);
		}
	});

	it("L5b — fault-injection: a planted real secret value REDS the scanner (a sensor that never fires is dead)", async () => {
		const b = await mustBundle(exampleManifest());
		const planted = `${b.env.envExample.text}AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP\n`;
		expect(isClean(planted)).toBe(false);
		expect(scanEmission(planted).length).toBeGreaterThan(0);
	});

	it("L6 — hand-edit drift: ONE flipped byte is detected against the recorded output_hash (the EMITTED_FILE_HAND_EDITED law, twin side)", async () => {
		const b = await mustBundle(exampleManifest());
		expect(
			await driftDetected(b.traefikDynamic.outputHash, b.traefikDynamic.text),
		).toBe(false);
		const edited = `${b.traefikDynamic.text} `;
		expect(await driftDetected(b.traefikDynamic.outputHash, edited)).toBe(true);
	});

	it("L7 — the bundle_hash MOVES with the manifest (a different manifest, a different bundle)", async () => {
		const a = await mustBundle(exampleManifest());
		const other = { ...exampleManifest(), app: "betashop" };
		const b = await mustBundle(other);
		expect(b.bundleHash).not.toBe(a.bundleHash);
		expect(b.phaseVersion).not.toBe(a.phaseVersion);
	});

	it("L8 — an invalid manifest is REFUSED with its closed DP02 code (never a guessed bundle)", async () => {
		const m = exampleManifest();
		const invalid: StackManifest = {
			...m,
			services: m.services.filter((s) => s.role !== "server"),
		};
		const r = await emitStackBundle(invalid);
		if (!("refusal" in r)) throw new Error("must refuse");
		expect(r.refusal.code).toBe("STACK_HAS_NO_SERVER");
	});

	it("renderTraefikDynamic renders references only — no hardcoded host/IP, header-protected", async () => {
		const b = await mustBundle(exampleManifest());
		const t = renderTraefikDynamic(exampleManifest(), b.sourceHash);
		expect(t).toBe(b.traefikDynamic.text);
		expect(t.startsWith("# CODE GENERATED BY AIDOS — DO NOT EDIT.")).toBe(true);
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env reference
		expect(t).toContain("url: http://${APP_NAME}:3000");
		expect(t).not.toMatch(/https?:\/\/\d+\.\d+\.\d+\.\d+/);
	});
});
