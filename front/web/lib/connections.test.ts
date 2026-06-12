import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canonicalDemoMatrix,
	DEMO_SERVICES,
	demoMatrix,
	ENVIRONMENTS,
	hashDemoMatrix,
	isConnRefusal,
	isKnownMode,
	MODES,
	ROLES,
	resolveConnection,
	resolveFor,
	type StackService,
} from "./connections";

/**
 * Reproducibility mirror (vitest + fast-check): reflects=DP07-connections,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * DP07 — the TS twin of the authoritative Go projection
 * (back/runtime/connresolve): resolveConnection(service, environment) →
 * ConnectionMode ∈ the CLOSED set {docker_internal, traefik_url,
 * managed_url}. THE GO CODE IS AUTHORITATIVE — the twin is
 * BYTE-PARITY-PINNED: the canonical demo matrix must hash to the EXACT Go
 * address GO_MATRIX_HASH.
 *
 * Laws (the DP07 done-criteria, twin side):
 *   L1 byte parity with Go — the canonical demo matrix hashes to GO_MATRIX_HASH;
 *   L2 determinism — same (service, env) → same Resolution, ∀;
 *   L3 totality over the closed sets — every known role × env resolves,
 *      mode inside the closed three-member set;
 *   L4 fail-closed on the unknown — out-of-set env/role/unnamed refused;
 *   L5 no hardcoded endpoint, ever — no localhost, no IP literal, no domain
 *      value; ${VAR} references only;
 *   L6 prod wires docker_internal for internal services (container-name
 *      convention), traefik_url for the public server;
 *   L7 cloud is managed — connector everywhere, future_cloud for everything;
 *      the managed endpoint is EXACTLY one ${VAR} secret-store reference.
 */

// The Go-AUTHORITATIVE content address (back/runtime/connresolve — pinned by
// the rapid property mirror connresolve_property_test.go).
const GO_MATRIX_HASH =
	"eb382dcff9243e410ceb6d7bbfe79a942d3845d3adba1f3732439bdb39f45772";

const arbService: fc.Arbitrary<StackService> = fc.record({
	name: fc.stringMatching(/^[a-z][a-z0-9-]{0,14}$/),
	role: fc.constantFrom(...ROLES),
	internal_port: fc.integer({ min: 1, max: 65535 }),
});

const arbEnv = fc.constantFrom(...ENVIRONMENTS);

const IP_LITERAL = /\d+\.\d+\.\d+\.\d+/;

describe("DP07 connections — the TS twin of back/runtime/connresolve", () => {
	it("L1: the canonical demo matrix hashes to the Go-authoritative address (byte parity)", async () => {
		expect(await hashDemoMatrix()).toBe(GO_MATRIX_HASH);
	});

	it("L1bis: the canonical form is stable — re-encoding changes nothing", () => {
		expect(canonicalDemoMatrix()).toBe(canonicalDemoMatrix());
	});

	it("L2: resolveConnection is deterministic — same input → same output, ∀", () => {
		fc.assert(
			fc.property(arbService, arbEnv, (svc, env) => {
				const a = resolveConnection(svc, env);
				const b = resolveConnection(svc, env);
				expect(a).toEqual(b);
			}),
		);
	});

	it("L3: every known role × environment resolves, mode inside the closed set", () => {
		for (const role of ROLES) {
			for (const env of ENVIRONMENTS) {
				const r = resolveConnection(
					{ name: "svc", role, internal_port: 8080 },
					env,
				);
				expect(isConnRefusal(r)).toBe(false);
				if (!isConnRefusal(r)) expect(isKnownMode(r.mode)).toBe(true);
			}
		}
		expect(MODES).toHaveLength(3);
	});

	it("L4: an out-of-set environment is refused UNKNOWN_ENVIRONMENT, never guessed", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z]{3,10}$/), (bogus) => {
				fc.pre(!(ENVIRONMENTS as readonly string[]).includes(bogus));
				const r = resolveConnection(
					{ name: "svc", role: "server", internal_port: 80 },
					bogus,
				);
				expect(isConnRefusal(r) && r.code === "UNKNOWN_ENVIRONMENT").toBe(true);
			}),
		);
	});

	it("L4bis: an out-of-set role is refused UNKNOWN_ROLE; an unnamed service UNNAMED_SERVICE", () => {
		const badRole = resolveConnection(
			{ name: "svc", role: "quantum", internal_port: 80 },
			"prod",
		);
		expect(isConnRefusal(badRole) && badRole.code === "UNKNOWN_ROLE").toBe(
			true,
		);
		const unnamed = resolveConnection(
			{ name: "", role: "server", internal_port: 80 },
			"prod",
		);
		expect(isConnRefusal(unnamed) && unnamed.code === "UNNAMED_SERVICE").toBe(
			true,
		);
	});

	it("L5: no hardcoded endpoint, ever — ∀ resolutions: no localhost, no IP, no domain value", () => {
		fc.assert(
			fc.property(arbService, arbEnv, (svc, env) => {
				const r = resolveConnection(svc, env);
				expect(isConnRefusal(r)).toBe(false);
				if (isConnRefusal(r)) return;
				const low = r.endpoint_pattern.toLowerCase();
				expect(low).not.toContain("localhost");
				expect(IP_LITERAL.test(r.endpoint_pattern)).toBe(false);
				expect(low).not.toContain("sagedesk");
				expect(r.endpoint_pattern).toContain("${");
				expect(r.env_vars.length).toBeGreaterThan(0);
			}),
		);
	});

	it("L6: in prod an internal service is docker_internal with the container-name convention", () => {
		fc.assert(
			fc.property(arbService, (svc) => {
				fc.pre(svc.role !== "server" && svc.role !== "connector");
				const r = resolveConnection(svc, "prod");
				expect(isConnRefusal(r)).toBe(false);
				if (isConnRefusal(r)) return;
				expect(r.mode).toBe("docker_internal");
				expect(r.endpoint_pattern.startsWith(`\${APP_NAME}-${svc.name}:`)).toBe(
					true,
				);
			}),
		);
	});

	it("L6bis: the public server is traefik_url on prod/staging/dev, docker_internal on local", () => {
		const server: StackService = {
			name: "server",
			role: "server",
			internal_port: 3000,
		};
		for (const env of ["prod", "staging", "dev"] as const) {
			const r = resolveConnection(server, env);
			expect(isConnRefusal(r)).toBe(false);
			if (isConnRefusal(r)) continue;
			expect(r.mode).toBe("traefik_url");
			expect(r.endpoint_pattern).toBe(
				// biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var reference assertion.
				"https://${APP_SUBDOMAIN}.${DOMAIN}",
			);
		}
		const local = resolveConnection(server, "local");
		expect(!isConnRefusal(local) && local.mode === "docker_internal").toBe(
			true,
		);
	});

	it("L7: a connector is managed_url in EVERY environment", () => {
		for (const env of ENVIRONMENTS) {
			const r = resolveConnection(
				{ name: "crm", role: "connector", internal_port: 443 },
				env,
			);
			expect(!isConnRefusal(r) && r.mode === "managed_url").toBe(true);
		}
	});

	it("L7bis: future_cloud resolves EVERYTHING managed_url, exactly one env-var secret-store reference", () => {
		fc.assert(
			fc.property(arbService, (svc) => {
				const r = resolveConnection(svc, "future_cloud");
				expect(isConnRefusal(r)).toBe(false);
				if (isConnRefusal(r)) return;
				expect(r.mode).toBe("managed_url");
				expect(/^\$\{[A-Z][A-Z0-9_]*\}$/.test(r.endpoint_pattern)).toBe(true);
				expect(r.env_vars.endsWith("_MANAGED_URL")).toBe(true);
			}),
		);
	});

	it("the demo matrix covers the demo services × the five environments, in canonical order", () => {
		const m = demoMatrix();
		expect(m).toHaveLength(DEMO_SERVICES.length * ENVIRONMENTS.length);
		// first block is prod, services name-sorted
		expect(m[0]?.environment).toBe("prod");
		expect(m.map((r) => r.service).slice(0, 6)).toEqual([
			"cache",
			"crm",
			"db",
			"pooler",
			"server",
			"workflows",
		]);
	});

	it("resolveFor recalculates the modes per environment (the screen's switch)", () => {
		const prod = resolveFor("prod");
		const local = resolveFor("local");
		const cloud = resolveFor("future_cloud");
		const modeOf = (rs: ReturnType<typeof resolveFor>, name: string) => {
			const r = rs.find((x) => !isConnRefusal(x) && x.service === name);
			return r && !isConnRefusal(r) ? r.mode : undefined;
		};
		expect(modeOf(prod, "server")).toBe("traefik_url");
		expect(modeOf(local, "server")).toBe("docker_internal");
		expect(modeOf(prod, "db")).toBe("docker_internal");
		expect(modeOf(cloud, "db")).toBe("managed_url");
	});
});
