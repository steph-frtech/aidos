import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isMirrorForm } from "./besoin-completeness";
import { allLevels, type Level, levels } from "./besoin-grammar";
import { levelToProposes } from "./besoin-proposes";
import {
	type BacklogNode,
	BESOIN_CYCLE,
	backlogCount,
	CycleError,
	type Edge,
	redBacklog,
} from "./red-backlog";

// red-backlog.test.ts — the EL17 TS twin mirror (byte-equivalent to red_backlog_property_test.go).

// build a resolved SOURCE node with its canonical outgoing ref (mirrors the Go fixture helper).
function resolved(level: Level): BacklogNode {
	const refMap: Partial<Record<Level, { field: string; to: Level }>> = {
		product: { field: "journeys", to: "journey" },
		journey: { field: "views", to: "view" },
		view: { field: "controls", to: "control" },
		control: { field: "triggers", to: "action" },
		action: { field: "invoke", to: "operation" },
		operation: { field: "mutate", to: "entity" },
	};
	const r = refMap[level];
	return {
		level,
		status: "resolved",
		utterance: `je veux ${level}`,
		refs: r ? [r] : [],
		body: { marker: level },
	};
}

// canonical constrains edges between consecutive present SOURCE rungs.
function constrainsEdges(present: Level[]): Edge[] {
	const src = levels();
	const set = new Set(present);
	const out: Edge[] = [];
	for (let i = 0; i + 1 < src.length; i++) {
		if (set.has(src[i]) && set.has(src[i + 1])) {
			out.push({ from: src[i], to: src[i + 1], kind: "constrains" });
		}
	}
	return out;
}

describe("redBacklog (EL17)", () => {
	it("product+entity → 2 items, product before entity", () => {
		const nodes = [resolved("product"), resolved("entity")];
		const bl = redBacklog(nodes, constrainsEdges(["product", "entity"]));
		expect(bl.map((b) => b.fromLevel)).toEqual(["product", "entity"]);
	});

	it("journey is NoEmit — 1 item (product), never in the list", () => {
		const nodes = [resolved("product"), resolved("journey")];
		const bl = redBacklog(nodes, constrainsEdges(["product", "journey"]));
		expect(bl).toHaveLength(1);
		expect(bl[0].fromLevel).toBe("product");
		expect(bl.some((b) => b.fromLevel === "journey")).toBe(false);
	});

	it("NoEmit rungs (journey/view) appear in anchors_above of a deeper item, never in the list", () => {
		const present: Level[] = [
			"product",
			"journey",
			"view",
			"control",
			"action",
		];
		const nodes = present.map(resolved);
		const bl = redBacklog(nodes, constrainsEdges(present));
		const control = bl.find((b) => b.fromLevel === "control");
		expect(control).toBeDefined();
		const anchorLevels = control?.anchorsAbove.map((a) => a.level) ?? [];
		expect(anchorLevels).toContain("journey");
		expect(anchorLevels).toContain("view");
		expect(
			bl.some((b) => b.fromLevel === "journey" || b.fromLevel === "view"),
		).toBe(false);
	});

	it("a dangling deeper ref is carried as a forward-dep OpenQuestion (never dropped)", () => {
		// control present, action absent → control's →action ref is dangling.
		const nodes = [resolved("product"), resolved("control")];
		const bl = redBacklog(nodes, constrainsEdges(["product", "control"]));
		const control = bl.find((b) => b.fromLevel === "control");
		expect(control?.unresolvedRefs.length).toBeGreaterThan(0);
		expect(control?.openQuestions.length).toBeGreaterThan(0);
	});

	it("a ref resolves @version when its target rung exists resolved", () => {
		const present: Level[] = [
			"product",
			"control",
			"action",
			"operation",
			"entity",
		];
		const nodes = present.map(resolved);
		const bl = redBacklog(nodes, constrainsEdges(present));
		const control = bl.find((b) => b.fromLevel === "control");
		expect(control?.unresolvedRefs).toHaveLength(0);
		expect(control?.resolvedRefs.length).toBeGreaterThan(0);
	});

	it("a cycle is refused with BESOIN_CYCLE", () => {
		const nodes = [resolved("product"), resolved("entity")];
		const edges: Edge[] = [
			{ from: "product", to: "entity", kind: "seeds" },
			{ from: "entity", to: "product", kind: "seeds" },
		];
		expect(() => redBacklog(nodes, edges)).toThrowError(CycleError);
		try {
			redBacklog(nodes, edges);
		} catch (e) {
			expect((e as CycleError).code).toBe(BESOIN_CYCLE);
		}
		expect(backlogCount(nodes, edges)).toBe(0);
	});

	it("PROPERTY: deterministic + topo-correct + form annexed + NoEmit never in list", () => {
		fc.assert(
			fc.property(fc.subarray(allLevels(), { minLength: 0 }), (picked) => {
				const nodes = picked.map(resolved);
				const sourcePresent = picked.filter((l) => levels().includes(l));
				const edges = constrainsEdges(sourcePresent);
				const a = redBacklog(nodes, edges);
				const b = redBacklog(nodes, edges);
				// deterministic
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
				const pos = new Map(a.map((it, i) => [it.fromLevel, i]));
				for (const e of edges) {
					const lp = pos.get(e.from);
					const dp = pos.get(e.to);
					if (lp !== undefined && dp !== undefined) expect(lp).toBeLessThan(dp);
				}
				for (const it of a) {
					// NoEmit never in list
					expect(levelToProposes(it.fromLevel).kind).toBe("emit");
					// form annexed + closed
					expect(isMirrorForm(it.mirrorForm)).toBe(true);
				}
			}),
		);
	});
});
