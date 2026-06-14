/**
 * pulumi-target.test.ts — the DP33 reproducibility mirror (property ∀ N1 +
 * fixtures), the TS twin of the Go mirror back/runtime/honoemit/
 * pulumi_stack_target_test.go. Écrit D'ABORD (RED → VERT).
 *
 * PORTABILITÉ FUTURE-CLOUD : le MÊME StackManifest se projette vers self_hosted
 * ET future_cloud SANS réécrire la déclaration. « Une source → N projections ».
 *
 * Les propriétés scellées :
 *  (1) le jeu de cibles est CLOS {self_hosted, future_cloud} — une cible inconnue
 *      est refusée (BlockReason typé), jamais devinée ;
 *  (2) ∀ — le MÊME manifest émet vers self_hosted ET future_cloud
 *      déterministiquement : chaque cible re-émise est byte-identique (invariante
 *      à l'ordre des services) ;
 *  (3) self_hosted ≡ emitPulumi byte-à-byte (la cible cloud est ADDITIVE) ;
 *  (4) PROPRIÉTÉ CAPITALE — la DÉCLARATION (la source) est INVARIANTE entre les
 *      cibles : un seul sourceHash partagé par les deux projections, des bytes de
 *      sortie DIFFÉRENTS, et la source n'est JAMAIS mutée ;
 *  (5) fixture — un service MANAGÉ en future_cloud se résout en managed_url
 *      (datastore → ${POSTGRES_MANAGED_URL}, bus → ${EVENTS_MANAGED_URL}) ; un
 *      service managé n'est PAS un docker.Container dans la cible cloud ;
 *  (6) honnêteté — une cible inconnue / un manifest sans server = BlockReason typé.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	emitPulumi,
	isBlocked,
	type Service,
	type StackManifest,
} from "./hono-emitter";
import {
	emitPulumiStackTarget,
	isCloudManaged,
	isTarget,
	isTargetProjection,
	managedVar,
	sourceHash,
	TARGET_FUTURE_CLOUD,
	TARGET_SELF_HOSTED,
	targets,
} from "./pulumi-target";

// A name-sorted-by-role richer fixture: server + interpreter (APP) + datastore +
// bus + cache (MANAGED). Server carries the public domain in future_cloud.
const FIXTURE: StackManifest = {
	app: "shop",
	services: [
		{
			name: "server",
			role: "server",
			image: "shop:latest",
			internalPort: 3000,
		},
		{
			name: "interpreter",
			role: "interpreter",
			image: "aidos-interpreter:latest",
			internalPort: 8080,
		},
		{
			name: "postgres",
			role: "datastore",
			image: "postgres:16",
			internalPort: 5432,
		},
		{ name: "events", role: "bus", image: "nats:2", internalPort: 4222 },
		{
			name: "valkey",
			role: "cache",
			image: "valkey/valkey:8",
			internalPort: 6379,
		},
	],
	network: { name: "traefik_default", external: true },
};

const serviceArb = fc.record({
	name: fc.stringMatching(/^svc[0-9]$/),
	role: fc.constantFrom(
		"datastore",
		"cache",
		"pooler",
		"workflow",
		"bus",
		"interpreter",
	),
	image: fc.constant("img:latest"),
	internalPort: fc.integer({ min: 4000, max: 4099 }),
});

const manifestArb: fc.Arbitrary<StackManifest> = fc
	.record({
		app: fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
		extra: fc.uniqueArray(serviceArb, {
			maxLength: 3,
			selector: (s) => s.name,
		}),
	})
	.map(({ app, extra }) => {
		const services: Service[] = [
			{
				name: "server",
				role: "server",
				image: "img:latest",
				internalPort: 3000,
			},
		];
		let port = 5000;
		for (const e of extra)
			services.push({
				...e,
				role: e.role as Service["role"],
				internalPort: port++,
			});
		return {
			app,
			services,
			network: { name: "traefik_default", external: true },
		};
	});

function shuffle<T>(xs: T[]): T[] {
	if (xs.length < 2) return xs;
	const out = [...xs];
	[out[0], out[out.length - 1]] = [out[out.length - 1], out[0]];
	return out;
}

describe("pulumi-target twin (DP33 — portabilité future-cloud)", () => {
	// (1) the closed target set.
	it("the deployment-target set is CLOSED {self_hosted, future_cloud}", () => {
		expect(targets()).toEqual([TARGET_SELF_HOSTED, TARGET_FUTURE_CLOUD]);
		expect(isTarget("self_hosted")).toBe(true);
		expect(isTarget("future_cloud")).toBe(true);
		expect(isTarget("kubernetes")).toBe(false);
		expect(isTarget("")).toBe(false);
	});

	// (2) ∀ — the SAME manifest emits to BOTH targets deterministically, byte-identical re-emission.
	it("∀ the same manifest → BOTH targets deterministically (byte-identical, order-invariant)", async () => {
		await fc.assert(
			fc.asyncProperty(manifestArb, async (m) => {
				for (const target of [TARGET_SELF_HOSTED, TARGET_FUTURE_CLOUD]) {
					const a = await emitPulumiStackTarget(m, target);
					const b = await emitPulumiStackTarget(
						{ ...m, services: shuffle(m.services) },
						target,
					);
					expect(isTargetProjection(a)).toBe(true);
					expect(isTargetProjection(b)).toBe(true);
					if (isTargetProjection(a) && isTargetProjection(b)) {
						// byte-identical re-emission, invariant to service order.
						expect(a.program).toBe(b.program);
						expect(a.outputHash).toBe(b.outputHash);
					}
				}
			}),
		);
	});

	// (3) self_hosted ≡ emitPulumi byte-for-byte (the cloud target is ADDITIVE).
	it("∀ self_hosted ≡ emitPulumi byte-for-byte (additive proof)", async () => {
		await fc.assert(
			fc.asyncProperty(manifestArb, async (m) => {
				const proj = await emitPulumiStackTarget(m, TARGET_SELF_HOSTED);
				const direct = emitPulumi(m);
				expect(isTargetProjection(proj)).toBe(true);
				if (isTargetProjection(proj) && !isBlocked(direct)) {
					expect(proj.program).toBe(direct);
					expect(proj.provider).toBe("@pulumi/docker");
				}
			}),
		);
	});

	// (4) PROPERTY CAPITAL — the source is INVARIANT across targets (one sourceHash, different output,
	//     source never mutated).
	it("∀ the SOURCE is invariant across targets (one sourceHash, different bytes, source unmutated)", async () => {
		await fc.assert(
			fc.asyncProperty(manifestArb, async (m) => {
				const before = JSON.stringify(m);
				const expectedSrc = await sourceHash(m);

				const self = await emitPulumiStackTarget(m, TARGET_SELF_HOSTED);
				const cloud = await emitPulumiStackTarget(m, TARGET_FUTURE_CLOUD);
				expect(isTargetProjection(self)).toBe(true);
				expect(isTargetProjection(cloud)).toBe(true);
				if (isTargetProjection(self) && isTargetProjection(cloud)) {
					// ONE source content address, shared by both projections.
					expect(self.sourceHash).toBe(expectedSrc);
					expect(cloud.sourceHash).toBe(expectedSrc);
					expect(self.sourceHash).toBe(cloud.sourceHash);
					// the OUTPUT bytes DIFFER (two distinct projections of the one source).
					expect(self.program).not.toBe(cloud.program);
					expect(self.outputHash).not.toBe(cloud.outputHash);
					expect(self.provider).not.toBe(cloud.provider);
				}
				// the SOURCE was never mutated by either projection.
				expect(JSON.stringify(m)).toBe(before);
			}),
		);
	});

	// (5) fixture — a MANAGED service in future_cloud resolves to managed_url.
	it("future_cloud resolves managed services to managed_url (datastore/bus), NOT docker.Container", async () => {
		const cloud = await emitPulumiStackTarget(FIXTURE, TARGET_FUTURE_CLOUD);
		expect(isTargetProjection(cloud)).toBe(true);
		if (!isTargetProjection(cloud)) return;

		// the managed bindings are surfaced for the screen.
		const byService = Object.fromEntries(
			cloud.managed.map((r) => [r.service, r]),
		);
		// biome-ignore-start lint/suspicious/noTemplateCurlyInString: ${<NAME>_MANAGED_URL} is the LITERAL secret-store reference (DP07), never an interpolated value
		expect(byService.postgres?.mode).toBe("managed_url");
		expect(byService.postgres?.url).toBe("${POSTGRES_MANAGED_URL}");
		expect(byService.events?.mode).toBe("managed_url");
		expect(byService.events?.url).toBe("${EVENTS_MANAGED_URL}");
		expect(byService.valkey?.url).toBe("${VALKEY_MANAGED_URL}");
		// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal managed_url references

		// the program imports @pulumi/cloud and routes the server at the public domain.
		expect(cloud.program).toContain('import * as cloud from "@pulumi/cloud"');
		expect(cloud.program).toContain('process.env["POSTGRES_MANAGED_URL"]');
		expect(cloud.program).toContain('domain: "shop.sagedesk.fr"');

		// MANAGED services are NOT docker.Container in the cloud projection.
		expect(cloud.program).not.toContain("docker.Container");
		expect(cloud.program).not.toContain("@pulumi/docker");

		// the APP services are @pulumi/cloud.Service.
		expect(cloud.program).toContain('new cloud.Service("server"');
		expect(cloud.program).toContain('new cloud.Service("interpreter"');
	});

	// (5b) the managed-role membership is the closed DP07 rule, the managedVar twin is exact.
	it("managed-role membership + managedVar are the closed DP07 rule", () => {
		expect(isCloudManaged("datastore")).toBe(true);
		expect(isCloudManaged("bus")).toBe(true);
		expect(isCloudManaged("cache")).toBe(true);
		expect(isCloudManaged("pooler")).toBe(true);
		expect(isCloudManaged("workflow")).toBe(true);
		// app services are NOT managed.
		expect(isCloudManaged("server")).toBe(false);
		expect(isCloudManaged("interpreter")).toBe(false);
		// managedVar upper-snakes the name + _MANAGED_URL.
		expect(managedVar("postgres")).toBe("POSTGRES_MANAGED_URL");
		expect(managedVar("events-bus")).toBe("EVENTS_BUS_MANAGED_URL");
	});

	// (6) honesty — an unknown target / a no-server manifest = a typed BlockReason.
	it("an unknown target / a no-server manifest is a typed BlockReason (honesty)", async () => {
		const unknown = await emitPulumiStackTarget(FIXTURE, "kubernetes");
		expect(isBlocked(unknown)).toBe(true);
		if (isBlocked(unknown)) {
			expect(unknown.code).toBe("UNKNOWN_TARGET");
			expect(unknown.how_to_fix.length).toBeGreaterThan(0);
		}

		const noServer: StackManifest = {
			app: "broken",
			services: [
				{
					name: "postgres",
					role: "datastore",
					image: "postgres:16",
					internalPort: 5432,
				},
			],
			network: { name: "traefik_default", external: true },
		};
		const refused = await emitPulumiStackTarget(noServer, TARGET_FUTURE_CLOUD);
		expect(isBlocked(refused)).toBe(true);
	});
});
