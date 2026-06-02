// fast-check + Vitest mirror of the kernel-debt twin (KRD §S41), anchored on the Go
// fixtures (back/runtime/debt). The invariants: only declared kinds; the input is
// never mutated; every suggestion is an open_idea_* at the door; clean ⇒ empty;
// the worked example yields the three kinds; suggest-only (no delete action exists).

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEBT_KINDS,
	type DebtKind,
	type Snapshot,
	scan,
	suggestTrim,
	THE_DOOR,
	TRIM_ACTIONS,
} from "./kernel-debt";
import { SCENARIOS } from "./kernel-debt-data";

const arbSnapshot: fc.Arbitrary<Snapshot> = fc.record({
	kernelHead: fc.constant("head"),
	truths: fc.array(
		fc.record({
			id: fc.constantFrom("truth-0", "truth-1", "truth-2"),
			version: fc.constantFrom("v1", "v2", "v3"),
			live: fc.boolean(),
		}),
		{ maxLength: 5 },
	),
	mirrors: fc.array(
		fc.record({
			id: fc.constantFrom("mir-0", "mir-1", "fix-0", "fix-1"),
			reflects: fc.record({
				layerId: fc.constantFrom("truth-0", "truth-1", "truth-2", "truth-GONE"),
				version: fc.constantFrom("v1", "v2", "v3"),
			}),
			testKind: fc.constantFrom("fixture", "property", "acceptance"),
			liveness: fc.constantFrom("alive", "dead"),
		}),
		{ maxLength: 5 },
	),
	mutation: fc.array(
		fc.record({
			target: fc.constantFrom("truth-0", "truth-1", "truth-2"),
			status: fc.constantFrom<"survived" | "killed">("survived", "killed"),
		}),
		{ maxLength: 4 },
	),
});

describe("kernel-debt twin — invariants (fast-check)", () => {
	it("only ever emits the three declared kinds", () => {
		fc.assert(
			fc.property(arbSnapshot, (s) => {
				for (const it of scan(s).items) {
					expect(DEBT_KINDS).toContain(it.kind);
				}
			}),
		);
	});

	it("never mutates the input snapshot (read-only)", () => {
		fc.assert(
			fc.property(arbSnapshot, (s) => {
				const before = JSON.stringify(s);
				const d = scan(s);
				suggestTrim(d);
				expect(JSON.stringify(s)).toBe(before);
			}),
		);
	});

	it("every suggestion is an open_idea_* action requiring the door", () => {
		fc.assert(
			fc.property(arbSnapshot, (s) => {
				const d = scan(s);
				const plan = suggestTrim(d);
				expect(plan.suggestions.length).toBe(d.items.length);
				for (const sg of plan.suggestions) {
					expect(TRIM_ACTIONS).toContain(sg.proposedAction);
					expect(sg.requires).toBe(THE_DOOR);
				}
			}),
		);
	});

	it("every target_ref traces to a real input mirror/truth (no invented target)", () => {
		fc.assert(
			fc.property(arbSnapshot, (s) => {
				const known = new Set<string>();
				for (const m of s.mirrors) known.add(m.id);
				for (const t of s.truths) known.add(t.id);
				for (const it of scan(s).items) {
					expect(known.has(it.targetRef)).toBe(true);
				}
			}),
		);
	});
});

describe("kernel-debt twin — worked example + clean", () => {
	it("the all-three scenario surfaces orphan, stale and survivor", () => {
		const sc = SCENARIOS.find((s) => s.id === "all-three");
		if (!sc) throw new Error("missing all-three scenario");
		const kinds = new Set<DebtKind>(scan(sc.snapshot).items.map((i) => i.kind));
		expect(kinds.has("orphan_mirror")).toBe(true);
		expect(kinds.has("stale_fixture")).toBe(true);
		expect(kinds.has("surviving_mutant")).toBe(true);
	});

	it("the clean scenario yields empty debt + empty plan (no false positives)", () => {
		const sc = SCENARIOS.find((s) => s.id === "clean");
		if (!sc) throw new Error("missing clean scenario");
		const d = scan(sc.snapshot);
		expect(d.items.length).toBe(0);
		expect(suggestTrim(d).suggestions.length).toBe(0);
	});

	it("no delete/apply action exists — /trim suggests, never deletes", () => {
		for (const a of TRIM_ACTIONS) {
			expect(a.startsWith("open_idea_")).toBe(true);
		}
	});
});
