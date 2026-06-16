import { describe, expect, it } from "vitest";
import { DEMO_REPLAY, replayDecoder } from "./mirror-replay-live";

/**
 * mirror_replay live read — the PARITY MIRROR (Vitest, the frozen front N1 slot). Shared by
 * the /mirror-health and /mirror-watch panels (one decoder, one parity test — never
 * double-typed).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go mirror-runner `mirror_replay` output
 * (mirrorrunnersrv.replayOutput: `{ run_id, results: ratchet.RunRecord[], verdict }`) — the
 * tool's CONTRACT, NOT a second implementation of the replay logic. ratchet.RunRecord carries
 * no json tags, so its fields arrive PascalCase (RunID, MirrorID, Status, …); Status is
 * "green"|"red"; verdict is "ALLOWED"|"REJECTED". This test pins only that the wire shape
 * decodes faithfully and that a malformed payload deterministically falls back to the demo
 * replay.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("mirror_replay live — decoder parity", () => {
	it("decodes a Go-sample replayOutput (PascalCase RunRecord rows) faithfully", () => {
		// A byte-faithful sample of the Go mirrorrunnersrv.replayOutput JSON: ratchet.RunRecord
		// has no json tags ⇒ PascalCase field names; an extra field (Ref/ContentHash) is tolerated.
		const goSample = {
			run_id: "run-cand",
			verdict: "ALLOWED",
			results: [
				{
					RunID: "run-cand",
					MirrorID: "checkout-button.fixture",
					MirrorVersion: "v1",
					ContentHash: "a1c0",
					Status: "green",
					BaselineStatus: "green",
					Regressed: false,
					Ref: "HEAD",
				},
				{
					RunID: "run-cand",
					MirrorID: "place-order.fixture",
					MirrorVersion: "v1",
					ContentHash: "b2d1",
					Status: "red",
					BaselineStatus: "green",
					Regressed: true,
					Ref: "HEAD",
				},
			],
		};
		expect(replayDecoder(goSample)).toEqual({
			runId: "run-cand",
			verdict: "ALLOWED",
			results: [
				{
					mirrorId: "checkout-button.fixture",
					status: "green",
					regressed: false,
				},
				{ mirrorId: "place-order.fixture", status: "red", regressed: true },
			],
		});
	});

	it("treats an omitted results set as empty (no mirror replayed)", () => {
		expect(replayDecoder({ run_id: "r", verdict: "ALLOWED" })).toEqual({
			runId: "r",
			verdict: "ALLOWED",
			results: [],
		});
		expect(
			replayDecoder({ run_id: "r", verdict: "ALLOWED", results: null }),
		).toEqual({ runId: "r", verdict: "ALLOWED", results: [] });
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(replayDecoder(null)).toBeNull();
		expect(replayDecoder({ verdict: "ALLOWED", results: [] })).toBeNull(); // missing run_id
		// a row with a status outside the closed {green,red} set is refused, never coerced.
		expect(
			replayDecoder({
				run_id: "r",
				verdict: "ALLOWED",
				results: [{ MirrorID: "m", Status: "amber", Regressed: false }],
			}),
		).toBeNull();
		// a row missing MirrorID is refused.
		expect(
			replayDecoder({
				run_id: "r",
				verdict: "ALLOWED",
				results: [{ Status: "green", Regressed: false }],
			}),
		).toBeNull();
	});

	it("the demo replay is the deterministic green baseline", () => {
		expect(DEMO_REPLAY.verdict).toBe("ALLOWED");
		expect(DEMO_REPLAY.results.every((r) => r.status === "green")).toBe(true);
		expect(DEMO_REPLAY.results.every((r) => !r.regressed)).toBe(true);
	});
});
