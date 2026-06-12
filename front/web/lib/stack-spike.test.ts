import { describe, expect, it } from "vitest";
import {
	decide,
	emit,
	FIXTURE,
	harvest,
	outputHash,
	sourceHash,
} from "./stack-spike";

/**
 * stack-spike vitest mirror (DP01 — SPIKE-gate StackManifest-as-source).
 * mirror record: reflects=DP01-stack-spike-twin, test_kind=property, cert_language=vitest, liveness=live
 *
 * The TS twin of /spike/stackmanifest must be REPRODUCIBLE (determinism-first,
 * CLAUDE.md §6): same manifest → same bytes → same hashes, N times. And it must
 * agree with the AUTHORITATIVE Go spike byte-for-byte: the pinned hashes below are
 * the ones MEASURED by `go run ./cmd/verdict` in /spike/stackmanifest — if the twin
 * diverges from the Go emitter, these constants go red (the cross-twin parity
 * mirror). The wall: everything here is pure judgment — nothing is written.
 */

// measured by the Go spike (spike/stackmanifest, cmd/verdict) — never invented.
const GO_SOURCE_HASH =
	"04b2c7abec6a2c37772ccc4530cc9ee56a68b24e821e811894c3672a45729dfb";
const GO_OUTPUT_HASH =
	"665a85273e71e8383f85f46a4974ddfe3f936dfd1c25d12a18e7a982adefa065";

describe("DP01 stack-spike TS twin", () => {
	it("re-emits byte-identical bytes (reproducibility mirror)", async () => {
		const first = await emit(FIXTURE);
		for (let i = 0; i < 25; i++) {
			expect(await emit(FIXTURE)).toBe(first);
		}
	});

	it("matches the authoritative Go spike hashes byte-for-byte", async () => {
		expect(await sourceHash(FIXTURE)).toBe(GO_SOURCE_HASH);
		expect(await outputHash(await emit(FIXTURE))).toBe(GO_OUTPUT_HASH);
	});

	it("computes the measured GO verdict (byte-identity ∧ round-trip ∧ drift asymmetry)", async () => {
		const v = await decide();
		expect(v.go).toBe(true);
		expect(v.measurement.byteIdentical).toBe(true);
		expect(v.measurement.roundTripOK).toBe(true);
		expect(v.measurement.driftDetectedOnSource).toBe(true);
		expect(v.measurement.driftDetectedOnTmpl).toBe(false);
		expect(v.chosenForm).toBe("record-kind");
		expect(v.forms).toHaveLength(3);
	});

	it("verdict is reproducible: decide() twice → deep-equal", async () => {
		expect(await decide()).toEqual(await decide());
	});

	it("harvest is a content-addressed RECORD that proposes, never freezes", async () => {
		const v = await decide();
		const r1 = await harvest(v);
		const r2 = await harvest(v);
		expect(r1.recordHash).toBe(r2.recordHash);
		expect(r1.hasMirror).toBe(false);
		expect(r1.hasVersion).toBe(false);
		expect(r1.status).toBe("draft");
	});

	it("emitted compose hardcodes no host/secret and publishes no ports", async () => {
		const c = await emit(FIXTURE);
		expect(c).not.toContain("sagedesk.fr");
		expect(c).not.toContain("password");
		expect(c).not.toContain("ports:");
		expect(c).toContain("name: ${TRAEFIK_NETWORK_NAME}");
		expect(c).toContain("device: ${APP_DATA_PATH}");
	});
});
