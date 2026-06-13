/**
 * bootstrap-spike.test.ts — the DP10 vitest mirror, WRITTEN FIRST and RED
 * (the module `./bootstrap-spike` did not exist — compile fail proven), then green.
 *
 * mirror record: reflects=DP10-bootstrap-spike, test_kind=property+unit,
 * cert_language=vitest+fast-check, liveness=live.
 *
 * The laws (T0 spike, ratchet OFF — but the determinism mandate still holds):
 *  1. port resolution is a PURE function of the observed state (∀ occupied sets:
 *     same input → same port; the resolved port is never occupied; never < base);
 *  2. start order is permutation-stable (∀ shuffles → traefik, datastore, server);
 *  3. the TS twin re-derives the EXACT verdict hash the authoritative Go spike
 *     measured (a2f23a64…) from the pinned measured runs — parity-pinned;
 *  4. the verdict is a conjunction: flip one measured fact → no-go + another address;
 *  5. the candidate scoring is a feature count over DECLARED criteria
 *     (native-go 5/5, wrapper 1/5, deploy-sh 0/5 given the measured script facts);
 *  6. the harvest record proposes and never freezes (draft, has_mirror=false).
 */
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	BASE_PORT,
	buildPlan,
	decide,
	FIXTURE_BUNDLE,
	harvest,
	MEASURED,
	MEASURED_GO_VERDICT_HASH,
	occupiedFrom,
	resolvePort,
	scoreCandidates,
	startOrder,
} from "./bootstrap-spike";

describe("DP10 — deterministic port resolution (law 1)", () => {
	test("∀ occupied sets: pure, never occupied, never below base", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.integer({ min: 1, max: 65535 }), { maxLength: 200 }),
				(occupied) => {
					const set = new Set(occupied);
					const p1 = resolvePort(set, BASE_PORT);
					const p2 = resolvePort(new Set(occupied), BASE_PORT);
					expect(p1).toBe(p2); // same observed state → same port (never a prompt)
					expect(set.has(p1)).toBe(false);
					expect(p1).toBeGreaterThanOrEqual(BASE_PORT);
				},
			),
		);
	});

	test("parses ss + docker ps AS DATA (the deploy.sh check, promptless)", () => {
		const state = {
			ssOutput: "LISTEN 0 4096 127.0.0.1:18080 0.0.0.0:*\n",
			dockerPsOutput: "127.0.0.1:18081->5432/tcp\n",
		};
		const occ = occupiedFrom(state);
		expect(occ.has(18080)).toBe(true);
		expect(occ.has(18081)).toBe(true);
		expect(resolvePort(occ, BASE_PORT)).toBe(18082);
	});
});

describe("DP10 — start order is permutation-stable (law 2)", () => {
	test("∀ shuffles of the bundle services → traefik, datastore, server", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
				const services = [...FIXTURE_BUNDLE.services];
				// deterministic Fisher-Yates on the seed (the mirror itself stays pure)
				let s = seed;
				for (let i = services.length - 1; i > 0; i--) {
					s = (s * 1103515245 + 12345) % 2147483648;
					const j = s % (i + 1);
					[services[i], services[j]] = [services[j], services[i]];
				}
				expect(startOrder(services)).toEqual(["traefik", "postgres", "server"]);
			}),
		);
	});

	test("the plan is data, computed before any effect, never on traefik_default", () => {
		const state = { ssOutput: "", dockerPsOutput: "" };
		const a = buildPlan(FIXTURE_BUNDLE, state);
		expect(a).toEqual(buildPlan(FIXTURE_BUNDLE, state));
		expect(a.network).not.toBe("traefik_default");
		expect(a.order).toEqual(["traefik", "postgres", "server"]);
		expect(a.urls[0]).toContain("dp10spike.localhost");
	});
});

describe("DP10 — verdict parity with the authoritative Go spike (laws 3+4)", () => {
	test("the TS twin re-derives the measured GO verdict at the EXACT Go address", async () => {
		const v = await decide(MEASURED);
		expect(v.go).toBe(true);
		expect(v.winner).toBe("native-go");
		expect(v.verdictHash).toBe(MEASURED_GO_VERDICT_HASH);
		// the measured startup log: ordered traefik→datastore→serveur, healthy, URLs printed
		const kinds = MEASURED.run1.events.map((e) => e.kind);
		expect(kinds).toEqual([
			"network-created",
			"traefik-up",
			"healthy:traefik",
			"datastore-up",
			"healthy:postgres",
			"server-up",
			"healthy:server",
			"url-probed",
			"urls-printed",
		]);
	});

	test("flip one measured fact → no-go and another content address", async () => {
		const bad = structuredClone(MEASURED);
		bad.run2.urlProbe = false;
		const v = await decide(bad);
		expect(v.go).toBe(false);
		expect(v.verdictHash).not.toBe(MEASURED_GO_VERDICT_HASH);
	});

	test("measure twice → same address (reproducibility)", async () => {
		const a = await decide(MEASURED);
		const b = await decide(MEASURED);
		expect(a.verdictHash).toBe(b.verdictHash);
	});
});

describe("DP10 — candidate scoring is a feature count (law 5)", () => {
	test("native-go 5/5, wrapper 1/5, deploy-sh 0/5 on the measured script facts", () => {
		const cs = scoreCandidates(MEASURED.script);
		expect(cs.map((c) => [c.id, c.score])).toEqual([
			["native-go", 5],
			["wrapper", 1],
			["deploy-sh", 0],
		]);
		// the facts are measured, never opined: 7 prompts, 3 hardcoded refs
		expect(MEASURED.script.promptCount).toBe(7);
		expect(MEASURED.script.dataDockersRefs).toBe(3);
	});
});

describe("DP10 — harvest proposes, never freezes (law 6)", () => {
	test("draft record, has_mirror=false, content-addressed deterministically", async () => {
		const v = await decide(MEASURED);
		const r = await harvest(v);
		expect(r.status).toBe("draft");
		expect(r.hasMirror).toBe(false);
		expect(r.hasVersion).toBe(false);
		expect(r.proposes).toBe("operation");
		expect(r.recordHash).toMatch(/^[0-9a-f]{64}$/);
		expect((await harvest(v)).recordHash).toBe(r.recordHash);
	});
});
