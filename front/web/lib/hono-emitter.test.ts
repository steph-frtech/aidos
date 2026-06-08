/**
 * lib/hono-emitter.test.ts — the S87 reproducibility mirror for the Workbench twin
 * (fast-check, the frozen front property slot). It pins what the panel relies on:
 *   1. determinism + input-order invariance (same Kernel cut → byte-identical output);
 *   2. every SYNC op is wired (a route per sync op, /healthz present, async ops NOT routed);
 *   3. FN02 purity (no module-scope mutable `let`/`var` in any emitted module);
 *   4. the Pulumi program carries the shared network + a container per service + Traefik
 *      labels on the server, and is byte-stable under service-order permutation.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_MANIFEST,
	DEMO_SPEC,
	emitPulumi,
	emitServer,
	emitWorker,
	isBlocked,
	type Op,
	SERVICE_ROLES,
	type ServerSpec,
	type Service,
	type StackManifest,
	TRIGGER_KINDS,
} from "./hono-emitter";

const opArb: fc.Arbitrary<Op> = fc
	.record({
		name: fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/),
		async: fc.boolean(),
		trigger: fc.constantFrom(...TRIGGER_KINDS),
	})
	.map((o) =>
		o.async ? { ...o, at: "2026-01-01T00:00:00Z" } : { name: o.name },
	);

const specArb: fc.Arbitrary<ServerSpec> = fc.record({
	project: fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
	ops: fc
		.uniqueArray(opArb, { minLength: 1, maxLength: 5, selector: (o) => o.name })
		.filter((ops) => ops.length >= 1),
});

const serviceArb: fc.Arbitrary<Service> = fc.record({
	name: fc.stringMatching(/^svc[0-9]$/),
	role: fc.constantFrom(...SERVICE_ROLES),
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
		// ensure a server + unique ports
		const services: Service[] = [
			{
				name: "server",
				role: "server",
				image: "img:latest",
				internalPort: 3000,
			},
		];
		let port = 5000;
		for (const e of extra) services.push({ ...e, internalPort: port++ });
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

describe("hono-emitter twin (S87)", () => {
	it("server + worker are byte-identical, invariant to op order", () => {
		fc.assert(
			fc.property(specArb, (spec) => {
				const a = emitServer(spec);
				const b = emitServer({ ...spec, ops: shuffle(spec.ops) });
				expect(isBlocked(a)).toBe(false);
				expect(a).toBe(b);
				const w1 = emitWorker(spec);
				const w2 = emitWorker({ ...spec, ops: shuffle(spec.ops) });
				expect(w1).toBe(w2);
			}),
		);
	});

	it("wires EVERY sync op + /healthz, never routes an async op", () => {
		fc.assert(
			fc.property(specArb, (spec) => {
				const srv = emitServer(spec);
				if (isBlocked(srv)) return;
				expect(srv).toContain('app.get("/healthz"');
				for (const op of spec.ops) {
					const route = `app.post("/${op.name.toLowerCase()}"`;
					if (op.async) expect(srv).not.toContain(route);
					else expect(srv).toContain(route);
				}
			}),
		);
	});

	it("emitted modules are FN02-pure (no module-scope mutable binding)", () => {
		fc.assert(
			fc.property(specArb, (spec) => {
				for (const code of [emitServer(spec), emitWorker(spec)]) {
					if (isBlocked(code)) continue;
					for (const line of code.split("\n")) {
						expect(line.startsWith("let ")).toBe(false);
						expect(line.startsWith("var ")).toBe(false);
					}
				}
			}),
		);
	});

	it("pulumi program is byte-stable + has network/containers/traefik", () => {
		fc.assert(
			fc.property(manifestArb, (m) => {
				const a = emitPulumi(m);
				expect(isBlocked(a)).toBe(false);
				const b = emitPulumi({ ...m, services: shuffle(m.services) });
				expect(a).toBe(b);
				const s = a as string;
				expect(s).toContain('import * as docker from "@pulumi/docker"');
				expect(s).toContain("export function program()");
				expect(s).toContain("new docker.Network");
				expect(s).toContain('new docker.Container("server"');
				expect(s).toContain('"traefik.enable"');
				for (const line of s.split("\n")) {
					expect(line.startsWith("let ")).toBe(false);
					expect(line.startsWith("var ")).toBe(false);
				}
			}),
		);
	});

	it("refuses malformed sources (honesty)", () => {
		expect(isBlocked(emitServer({ project: "", ops: [{ name: "x" }] }))).toBe(
			true,
		);
		expect(isBlocked(emitServer({ project: "p", ops: [] }))).toBe(true);
		expect(
			isBlocked(
				emitPulumi({
					app: "a",
					services: [],
					network: { name: "n", external: true },
				}),
			),
		).toBe(true);
		expect(
			isBlocked(
				emitPulumi({
					app: "a",
					services: [
						{ name: "db", role: "datastore", image: "i", internalPort: 5432 },
					],
					network: { name: "n", external: true },
				}),
			),
		).toBe(true);
	});

	it("demo fixtures emit cleanly", () => {
		expect(isBlocked(emitServer(DEMO_SPEC))).toBe(false);
		expect(isBlocked(emitWorker(DEMO_SPEC))).toBe(false);
		expect(isBlocked(emitPulumi(DEMO_MANIFEST))).toBe(false);
	});
});
