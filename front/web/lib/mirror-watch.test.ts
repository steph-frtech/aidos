import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { materialize, runStream } from "./mirror-watch";

/**
 * Reproducibility mirror of lib/mirror-watch.ts (S69) — it mirrors the Go property test
 * back/kernel/mirror/watch/watch_test.go verbatim. materialize + runStream are PURE: same input ⇒
 * byte-identical output, and the verdict is decided by code-presence (absent ⇒ RED, present ⇒ GREEN).
 */

const GHERKIN =
	"Scenario: place an order\nGiven a cart\nWhen I place the order\nThen an order exists";

describe("S69 watch-it-fail — materialize + run", () => {
	it("dispatches each shape to its runner (closed table)", () => {
		const g = materialize("acceptance", "Order.place", GHERKIN);
		expect(g.materialized?.targetRunner).toBe("godog");

		const p = materialize(
			"invariant",
			"Order.total",
			"property: p\nforall: a\nholds: a == a",
		);
		expect(p.materialized?.targetRunner).toBe("rapid");

		const f = materialize(
			"workflow",
			"Order.flow",
			"fixture: f\nstate: s\ncommand: c\nevent: e",
		);
		expect(f.materialized?.targetRunner).toBe("fixture");
	});

	it("the canonical journey: RED against absent code, then GREEN against a stub", () => {
		const { materialized } = materialize("acceptance", "Order.place", GHERKIN);
		expect(materialized).not.toBeNull();
		if (!materialized) return;

		const red = runStream(materialized, false);
		expect(red.stream?.red).toBe(true);
		expect(red.stream?.final).toBe("dead");
		expect(red.stream?.events.map((e) => e.phase)).toEqual([
			"queued",
			"materialized",
			"running",
			"verdict",
		]);

		const green = runStream(materialized, true);
		expect(green.stream?.red).toBe(false);
		expect(green.stream?.final).toBe("alive");
	});

	it("refuses an unparseable / empty source (never a guessed runner)", () => {
		expect(materialize("acceptance", "L", "garbage").materialized).toBeNull();
		expect(materialize("nope", "L", GHERKIN).materialized).toBeNull();
	});

	it("PROPERTY: code-presence decides the verdict, reproducibly", () => {
		fc.assert(
			fc.property(fc.boolean(), (present) => {
				const { materialized } = materialize(
					"acceptance",
					"Order.place",
					GHERKIN,
				);
				if (!materialized) return false;
				const a = runStream(materialized, present);
				const b = runStream(materialized, present);
				// reproducible
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
				// absent ⇒ red, present ⇒ green
				return a.stream?.red === !present;
			}),
		);
	});

	it("PROPERTY: materialize is reproducible", () => {
		fc.assert(
			fc.property(fc.constant(GHERKIN), (src) => {
				const a = materialize("acceptance", "Order.place", src);
				const b = materialize("acceptance", "Order.place", src);
				return JSON.stringify(a) === JSON.stringify(b);
			}),
		);
	});
});
