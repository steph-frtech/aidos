import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canonicalBody,
	exampleManifest,
	hashManifest,
	newRecord,
	PROFILES,
	ROLES,
	type StackManifest,
	validate,
} from "./stack-manifest";

/**
 * Reproducibility mirror (vitest + fast-check): reflects=DP02-stack-manifest,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * DP02 — the TS twin is BYTE-PARITY-PINNED to the authoritative Go Kernel
 * source (back/kernel/stackmanifest): the pinned Example manifest must hash to
 * the EXACT content address Go measured (GO_MANIFEST_HASH below — printed by
 * stackmanifest.NewRecord(Example()) on the Go side). Any one-byte divergence
 * of canonicalization, omitempty or the fixture reds this mirror.
 *
 * Laws (the DP02 done-criteria, twin side):
 *   L1 round-trip content-addressed: same body → same hash (key order erased);
 *   L2 reproducibility ×100 (pure — no clock, no RNG);
 *   L3 UNKNOWN_SERVICE_ROLE / L4 DUPLICATE_INTERNAL_PORT / L5 STACK_HAS_NO_SERVER
 *      / L6 STACK_NAME_REQUIRED refusals;
 *   L7 the closed sets are exactly the engraved ones.
 */

// The Go-authoritative content address of stackmanifest.Example() — measured by
// the Go side (records.Hash(records.Canonicalize(body))), pinned here verbatim.
const GO_MANIFEST_HASH =
	"8011728e4f9c01130c151d5c49b89b28afa1e3dc5e741fcc12c04c38062acdd2";

// The Go-authoritative canonical body bytes (printed by the Go side), pinned to
// prove the twin canonicalizes byte-identically, not just hash-identically.
const GO_CANONICAL_BODY =
	'{"app":"alphashop","connector_scopes":["postgres:read-only"],"kind":"stack_manifest","network":{"external":true,"name":"traefik_default"},"services":[{"depends_on":["postgres"],"healthcheck":"wget -q --spider http://localhost:3000/health","image":"node:22-alpine","internal_port":3000,"name":"app","profile":"core","role":"server"},{"healthcheck":"pg_isready -U app","image":"postgres:17-alpine","internal_port":5432,"name":"postgres","profile":"core","role":"datastore"},{"healthcheck":"wget -q --spider http://localhost:8973/health","internal_port":8973,"name":"interpreter","profile":"core","role":"interpreter"}],"volumes":[{"device_var":"APP_DATA_PATH","name":"app_data"}]}';

describe("DP02 — StackManifest TS twin pinned to the authoritative Go source", () => {
	it("the seeded Example manifest canonicalizes and hashes EXACTLY as Go (byte parity)", async () => {
		expect(canonicalBody(exampleManifest())).toBe(GO_CANONICAL_BODY);
		expect(await hashManifest(exampleManifest())).toBe(GO_MANIFEST_HASH);
		const rec = await newRecord(exampleManifest());
		expect(rec.id).toBe(GO_MANIFEST_HASH);
		expect(rec.version).toBe(rec.id);
	});

	it("L2 — reproducibility: same manifest → same record, ×100 (pure)", async () => {
		const first = await newRecord(exampleManifest());
		for (let i = 0; i < 100; i++) {
			const again = await newRecord(exampleManifest());
			expect(again.id).toBe(first.id);
			expect(again.body).toBe(first.body);
		}
	});

	it("L1 — the content address erases JSON key order (round-trip)", () => {
		const m = exampleManifest();
		const reordered: StackManifest = JSON.parse(
			JSON.stringify({
				connector_scopes: m.connector_scopes,
				network: m.network,
				volumes: m.volumes,
				services: m.services,
				app: m.app,
			}),
		);
		expect(canonicalBody(reordered)).toBe(canonicalBody(m));
	});

	it("L1∀ — property: any valid manifest round-trips content-addressed (validate ∧ canonical stable)", () => {
		const svcArb = (idx: number) =>
			fc.record({
				name: fc.constant(`svc${idx}`),
				role: fc.constantFrom(...ROLES),
				image: fc.constantFrom("node:22-alpine", "postgres:17-alpine"),
				internal_port: fc.constant(1024 + idx),
				profile: fc.constantFrom(...PROFILES),
			});
		const manifestArb = fc
			.integer({ min: 0, max: 4 })
			.chain((n) =>
				fc.record({
					app: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
					services: fc.tuple(
						...Array.from({ length: n + 1 }, (_, i) => svcArb(i)),
					),
					network: fc.constant({ name: "traefik_default", external: true }),
				}),
			)
			.map((m) => {
				// L5: guarantee one server.
				const services = [...m.services];
				services[0] = { ...services[0], role: "server" };
				return { ...m, services } as StackManifest;
			});

		fc.assert(
			fc.property(manifestArb, (m) => {
				expect(validate(m)).toBeNull();
				expect(canonicalBody(m)).toBe(
					canonicalBody(JSON.parse(JSON.stringify(m))),
				);
			}),
			{ numRuns: 50 },
		);
	});

	it("L3 — a role outside the closed set is refused (UNKNOWN_SERVICE_ROLE)", () => {
		const m = exampleManifest();
		m.services[1].role = "blockchain";
		expect(validate(m)?.code).toBe("UNKNOWN_SERVICE_ROLE");
		expect(() => canonicalBody(m)).toThrow(/UNKNOWN_SERVICE_ROLE/);
	});

	it("L4 — two identical internal ports are refused (DUPLICATE_INTERNAL_PORT)", () => {
		const m = exampleManifest();
		m.services[1].internal_port = m.services[0].internal_port;
		expect(validate(m)?.code).toBe("DUPLICATE_INTERNAL_PORT");
	});

	it("L5 — a stack without role=server is refused (STACK_HAS_NO_SERVER)", () => {
		const m = exampleManifest();
		for (const s of m.services) {
			if (s.role === "server") s.role = "datastore";
		}
		expect(validate(m)?.code).toBe("STACK_HAS_NO_SERVER");
	});

	it("L6 — the app name is required (STACK_NAME_REQUIRED)", () => {
		const m = exampleManifest();
		m.app = "";
		expect(validate(m)?.code).toBe("STACK_NAME_REQUIRED");
	});

	it("L7 — the closed sets are exactly the engraved ones (DP02 / SPEC-stack-2026)", () => {
		expect([...ROLES]).toEqual([
			"server",
			"datastore",
			"cache",
			"pooler",
			"workflow",
			"bus",
			"observability",
			"errortracking",
			"git",
			"tickets",
			"auth",
			"docs",
			"connector",
			"interpreter",
		]);
		expect([...PROFILES]).toEqual([
			"core",
			"docs",
			"observability",
			"qa",
			"git",
			"tickets",
			"connectors",
			"non-prod",
			"full",
		]);
	});

	it("L8 — a one-byte logical change moves the content address (append-only: a NEW version)", async () => {
		const m = exampleManifest();
		m.app = "alphashopx";
		expect(await hashManifest(m)).not.toBe(GO_MANIFEST_HASH);
	});
});
