import { describe, expect, it } from "vitest";
import { lookup } from "../../lib/gateway";
import {
	DEMO_GARDEN,
	DEMO_GARDEN_PLAN,
	gardenDecoder,
	planDecoder,
} from "./liveGarden";

/**
 * /kernel-debt live GARDEN read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch-2 kernel-garden flip).
 *
 * It proves the TS `gardenDecoder` / `planDecoder` decode a SAMPLE of the Go kernel-garden
 * `garden_tend_project` (kernelgardensrv.gardenOut) / `garden_suggest_trim` (planOut) outputs —
 * the tools' CONTRACT, NOT a second garden (the Go garden.Tend / SuggestGardenTrim are
 * authoritative). This test pins only that the wire shape decodes faithfully (the snake_case
 * fields, the items/suggestions arrays, an absent list) and that a malformed payload
 * deterministically falls back to the demo garden/plan. It ALSO pins the CRITICAL link (d): the
 * three kernel-garden tools resolve in the front gateway registry (else route→unknown_tool→demo,
 * a hollow flip).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("kernel-garden live — garden_tend_project decoder parity", () => {
	it("decodes a byte-faithful Go-sample gardenOut (dead-liveness + low-value rots)", () => {
		const goSample = {
			project_ref: "proj-A",
			kernel_head: "head-1",
			items: [
				{
					id: "proj-A:dead_liveness:mir-dead",
					project_ref: "proj-A",
					kind: "dead_liveness",
					target_ref: "mir-dead",
					reason: "liveness morte (KRD §34) : preuve morte",
					severity: "high",
				},
				{
					id: "proj-A:low_value_constraint:cell-costly",
					project_ref: "proj-A",
					kind: "low_value_constraint",
					target_ref: "cell-costly",
					reason: "contrainte à faible valeur (KRD §66.3)",
					severity: "medium",
				},
			],
			count: 2,
		};
		expect(gardenDecoder(goSample)).toEqual({
			projectRef: "proj-A",
			kernelHead: "head-1",
			items: [
				{
					id: "proj-A:dead_liveness:mir-dead",
					projectRef: "proj-A",
					kind: "dead_liveness",
					targetRef: "mir-dead",
					reason: "liveness morte (KRD §34) : preuve morte",
					severity: "high",
				},
				{
					id: "proj-A:low_value_constraint:cell-costly",
					projectRef: "proj-A",
					kind: "low_value_constraint",
					targetRef: "cell-costly",
					reason: "contrainte à faible valeur (KRD §66.3)",
					severity: "medium",
				},
			],
			count: 2,
		});
	});

	it("decodes a clean garden (count 0, absent items → [])", () => {
		const decoded = gardenDecoder({
			project_ref: "proj-A",
			kernel_head: "head-1",
			count: 0,
		});
		expect(decoded?.count).toBe(0);
		expect(decoded?.items).toEqual([]);
	});

	it("rejects a malformed gardenOut (→ demo fallback)", () => {
		expect(gardenDecoder(null)).toBeNull();
		expect(gardenDecoder({})).toBeNull(); // missing project_ref/kernel_head/count
		// a non-number count → null.
		expect(
			gardenDecoder({
				project_ref: "p",
				kernel_head: "h",
				count: "two",
			}),
		).toBeNull();
		// an item missing a required field → null.
		expect(
			gardenDecoder({
				project_ref: "p",
				kernel_head: "h",
				count: 1,
				items: [{ id: "x", kind: "orphan_mirror" }],
			}),
		).toBeNull();
	});
});

describe("kernel-garden live — garden_suggest_trim decoder parity", () => {
	it("decodes a byte-faithful Go-sample planOut (one suggestion, deletes nothing)", () => {
		const goSample = {
			project_ref: "proj-A",
			suggestions: [
				{
					debt_item_ref: "proj-A:dead_liveness:mir-dead",
					project_ref: "proj-A",
					proposed_action: "open_idea_to_revive_or_retire_mirror",
					rationale: "preuve morte — proposition seulement",
					requires: "idea → mirror → /goal → human approval",
				},
			],
			deletes_anything: false,
		};
		expect(planDecoder(goSample)).toEqual({
			projectRef: "proj-A",
			suggestions: [
				{
					debtItemRef: "proj-A:dead_liveness:mir-dead",
					projectRef: "proj-A",
					proposedAction: "open_idea_to_revive_or_retire_mirror",
					rationale: "preuve morte — proposition seulement",
					requires: "idea → mirror → /goal → human approval",
				},
			],
			deletesAnything: false,
		});
	});

	it("decodes an empty plan (absent suggestions → [])", () => {
		const decoded = planDecoder({
			project_ref: "proj-A",
			deletes_anything: false,
		});
		expect(decoded?.suggestions).toEqual([]);
		expect(decoded?.deletesAnything).toBe(false);
	});

	it("rejects a malformed planOut (→ demo fallback)", () => {
		expect(planDecoder(null)).toBeNull();
		expect(planDecoder({})).toBeNull(); // missing project_ref + deletes_anything
		// deletes_anything not a boolean → null.
		expect(
			planDecoder({ project_ref: "p", deletes_anything: "no" }),
		).toBeNull();
		// a suggestion missing a required field → null.
		expect(
			planDecoder({
				project_ref: "p",
				deletes_anything: false,
				suggestions: [{ debt_item_ref: "x" }],
			}),
		).toBeNull();
	});
});

describe("kernel-garden flip — the critical link (d): gateway registry", () => {
	it("resolves the three kernel-garden tools to the kernel-garden server (else the flip is hollow)", () => {
		for (const name of [
			"garden_tend_project",
			"garden_suggest_trim",
			"garden_accept_proposal",
		]) {
			const tool = lookup(name);
			expect(tool).toBeDefined();
			expect(tool?.server).toBe("kernel-garden");
			expect(tool?.disposition).toBe("below_line");
		}
	});
});

describe("kernel-garden flip — the demo fallback (twin demoted)", () => {
	it("the demo garden carries the FIVE rots over a fixed snapshot", () => {
		expect(DEMO_GARDEN.projectRef).toBe("demoshop");
		expect(DEMO_GARDEN.count).toBe(DEMO_GARDEN.items.length);
		expect(DEMO_GARDEN.count).toBeGreaterThan(0);
		const kinds = new Set(DEMO_GARDEN.items.map((i) => i.kind));
		// the snapshot was built to surface all five rots.
		for (const k of [
			"orphan_mirror",
			"stale_fixture",
			"surviving_mutant",
			"dead_liveness",
			"low_value_constraint",
		]) {
			expect(kinds.has(k)).toBe(true);
		}
	});

	it("the demo plan deletes nothing and requires the door per suggestion", () => {
		expect(DEMO_GARDEN_PLAN.deletesAnything).toBe(false);
		expect(DEMO_GARDEN_PLAN.suggestions.length).toBe(DEMO_GARDEN.count);
		for (const s of DEMO_GARDEN_PLAN.suggestions) {
			expect(s.requires).toBe("idea → mirror → /goal → human approval");
		}
	});
});
