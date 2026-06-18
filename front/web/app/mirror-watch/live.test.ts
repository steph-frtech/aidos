import { describe, expect, it } from "vitest";
import { materialize } from "../../lib/mirror-watch";
import { demoRun, runArgs } from "../../lib/mirror-watch-data";
import { runDecoder } from "./live";

/**
 * /mirror-watch live run read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * PHASE-4 kill-twins flip).
 *
 * It proves the TS `runDecoder` decodes a SAMPLE of the Go mirror-watch `watch_run` tool output
 * (mirrorwatchsrv.runOutput: `{ ok, mirror_id, runner, final, red, events:[{phase,runner,status,
 * detail}] }`, snake_case json tags) — the tool's CONTRACT, NOT a second implementation of the
 * run-stream logic (the Go `watch.RunStream` is authoritative). And it pins PARITY: the decoded
 * live verdict (red, runner, the ordered phases) matches the twin demo run for the SAME input
 * (absent code ⇒ RED, a stub ⇒ GREEN), so the panel shows the identical stream whether the source
 * is "live" or "demo". A malformed / refused payload deterministically falls back to the demo run.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

const GHERKIN =
	"Scenario: place an order\nGiven a cart\nWhen I place the order\nThen an order exists";

describe("mirror-watch live — watch_run decoder parity", () => {
	it("decodes a Go-sample runOutput (RED against absent code)", () => {
		const goSample = {
			ok: true,
			mirror_id: "Order.place:gherkin",
			runner: "godog",
			final: "dead",
			red: true,
			events: [
				{
					phase: "queued",
					runner: "godog",
					status: "dead",
					detail: "run accepted, awaiting materialization",
				},
				{
					phase: "materialized",
					runner: "godog",
					status: "dead",
					detail: "materialized gherkin source for godog",
				},
				{
					phase: "running",
					runner: "godog",
					status: "dead",
					detail: "running godog against Order.place",
				},
				{
					phase: "verdict",
					runner: "godog",
					status: "dead",
					detail:
						"no code under Order.place — the mirror fails (watch it fail)",
				},
			],
		};
		const decoded = runDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decoded?.red).toBe(true);
		expect(decoded?.runner).toBe("godog");
		expect(decoded?.final).toBe("dead");
		expect(decoded?.events.map((e) => e.phase)).toEqual([
			"queued",
			"materialized",
			"running",
			"verdict",
		]);
	});

	it("decodes a GREEN runOutput (a stub passes)", () => {
		const decoded = runDecoder({
			ok: true,
			mirror_id: "Order.place:gherkin",
			runner: "godog",
			final: "alive",
			red: false,
			events: [
				{ phase: "verdict", runner: "godog", status: "alive", detail: "ok" },
			],
		});
		expect(decoded?.red).toBe(false);
		expect(decoded?.final).toBe("alive");
	});

	it("rejects a malformed / errored payload (→ demo fallback)", () => {
		expect(runDecoder({ ok: false, error: "boom" })).toBeNull();
		expect(runDecoder({ ok: true })).toBeNull(); // no runner
		expect(runDecoder({ ok: true, runner: "godog" })).toBeNull(); // no red boolean
		expect(runDecoder({ ok: true, runner: "godog", red: "yes" })).toBeNull();
		expect(runDecoder("nope")).toBeNull();
		expect(
			runDecoder({
				ok: true,
				runner: "godog",
				red: false,
				events: [{ phase: 1 }],
			}),
		).toBeNull(); // malformed event
	});

	it("PARITY: the live decode matches the twin demo run for the same input", () => {
		const { materialized } = materialize("acceptance", "Order.place", GHERKIN);
		expect(materialized).not.toBeNull();
		if (!materialized) return;

		for (const present of [false, true]) {
			// the twin demo run (the deterministic fallback the panel shows on source:"demo").
			const { stream } = demoRun(materialized, present);
			expect(stream).not.toBeNull();
			if (!stream) continue;

			// a faithful Go-sample runOutput for the SAME materialized mirror + probe.
			const goSample = {
				ok: true,
				mirror_id: stream.mirrorId,
				runner: stream.runner,
				final: stream.final,
				red: stream.red,
				events: stream.events.map((e) => ({
					phase: e.phase,
					runner: e.runner,
					status: e.status,
					detail: e.detail,
				})),
			};
			const decoded = runDecoder(goSample);
			expect(decoded).not.toBeNull();
			// PARITY: red verdict, runner, and the ordered phases agree.
			expect(decoded?.red).toBe(stream.red);
			expect(decoded?.red).toBe(!present); // absent ⇒ red, present ⇒ green
			expect(decoded?.runner).toBe(stream.runner);
			expect(decoded?.events.map((e) => e.phase)).toEqual(
				stream.events.map((e) => e.phase),
			);
		}
	});

	it("runArgs projects the materialized mirror to the Go runInput contract", () => {
		const { materialized } = materialize("acceptance", "Order.place", GHERKIN);
		if (!materialized) throw new Error("materialize failed");
		const args = runArgs(materialized, false);
		expect(args.code_present).toBe(false);
		const m = args.materialized as Record<string, unknown>;
		// Go watch.MaterializedMirror has NO json tags → PascalCase field names.
		expect(m.TargetRunner).toBe("godog");
		expect(m.Shape).toBe("gherkin");
		expect(typeof m.MaterializedSource).toBe("string");
	});
});
