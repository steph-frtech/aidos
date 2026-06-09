import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { trace } from "./caused-by";
import {
	type BuildInput,
	build,
	type Edge,
	type Reproduction,
	serializeBody,
} from "./why-tree";

// Reproducibility mirror (∀) for the WhyTree TS twin (FK13). reflects=lib/why-tree ·
// test_kind=property · cert_language=fast-check · liveness=live. It pins the SAME invariants as the
// Go property mirror (back/kernel/whytree) so the /why-tree panel never drifts from the Go source.

const ref = (id: string, version = "v1") => ({ id, version });

function exampleEdges(): Edge[] {
	return [
		{ from: ref("checkout-accept"), to: ref("createOrder") },
		{ from: ref("createOrder"), to: ref("Order") },
		{ from: ref("createOrder"), to: ref("authzPolicy") },
		{ from: ref("Order"), to: ref("add_total_col") },
	];
}

function allReproduced(): Reproduction[] {
	return [
		{ causeId: "createOrder", reproduced: true },
		{ causeId: "Order", reproduced: true },
		{ causeId: "authzPolicy", reproduced: true },
		{ causeId: "add_total_col", reproduced: true },
	];
}

describe("WhyTree — the FK13 worked example (fixture)", () => {
	it("builds a tree rooted at the deepest reproduced cause", () => {
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-1", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.tree.causes.map((c) => c.causeId)).toEqual([
			"createOrder",
			"Order",
			"authzPolicy",
			"add_total_col",
		]);
		expect(r.tree.rootCause).toBe("add_total_col");
		expect(r.tree.terminal.mirrorId).toBe("mir-1");
	});

	it("refuses a tree with no terminal mirror (WHYTREE_NO_MIRROR)", () => {
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("WHYTREE_NO_MIRROR");
	});

	it("refuses a non-reproduced cause (anti-confabulation)", () => {
		const repros: Reproduction[] = [
			{ causeId: "createOrder", reproduced: true },
			{ causeId: "Order", reproduced: false },
			{ causeId: "authzPolicy", reproduced: true },
			{ causeId: "add_total_col", reproduced: true },
		];
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: exampleEdges(),
			reproductions: repros,
			terminal: { mirrorId: "mir-1", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("WHYTREE_CAUSE_NOT_REPRODUCED");
	});

	it("refuses a missing reproduction proof too", () => {
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: exampleEdges(),
			reproductions: [{ causeId: "createOrder", reproduced: true }],
			terminal: { mirrorId: "mir-1", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("WHYTREE_CAUSE_NOT_REPRODUCED");
	});

	it("a leaf symptom is its own root", () => {
		const r = build({
			symptom: "add_total_col",
			provenance: "incident",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-1", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.tree.causes).toHaveLength(0);
		expect(r.tree.rootCause).toBe("add_total_col");
	});

	it("refuses a terminal mirror reflecting the wrong node", () => {
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-1", reflectsRootCause: "createOrder" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("WHYTREE_TERMINAL_MISMATCH");
	});

	it("refuses a caused_by cycle (no partial tree)", () => {
		const cyclic: Edge[] = [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("createOrder") },
		];
		const r = build({
			symptom: "checkout-accept",
			provenance: "mirror",
			edges: cyclic,
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-1", reflectsRootCause: "x" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("CAUSED_BY_CYCLE");
	});

	it("refuses an unknown provenance", () => {
		const r = build({
			symptom: "checkout-accept",
			provenance: "telepathy",
			edges: exampleEdges(),
			reproductions: allReproduced(),
			terminal: { mirrorId: "mir-1", reflectsRootCause: "add_total_col" },
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toBe("UNKNOWN_PROVENANCE");
	});
});

// ── property invariants (mirror the Go rapid mirror) ──

const arbRef = () =>
	fc.record({
		id: fc.constantFrom("n0", "n1", "n2", "n3", "n4"),
		version: fc.constantFrom("v1", "v2"),
	});
const arbEdge = () => fc.record({ from: arbRef(), to: arbRef() });
const arbEdges = () => fc.array(arbEdge(), { maxLength: 8 });

function reproduceAll(): Reproduction[] {
	return ["n0", "n1", "n2", "n3", "n4"].map((id) => ({
		causeId: id,
		reproduced: true,
	}));
}

function withRoot(symptom: string, edges: Edge[]): string {
	const t = trace(symptom, edges);
	if (!t.ok || t.chain.causes.length === 0) return symptom;
	return t.chain.causes[t.chain.causes.length - 1];
}

describe("WhyTree — properties (∀)", () => {
	it("build is deterministic (same input ⇒ same tree or same error)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("n0", "n1", "n2"),
				arbEdges(),
				(symptom, edges) => {
					const input: BuildInput = {
						symptom,
						provenance: "mirror",
						edges,
						reproductions: reproduceAll(),
						terminal: {
							mirrorId: "m1",
							reflectsRootCause: withRoot(symptom, edges),
						},
					};
					const a = build(input);
					const b = build(input);
					expect(a.ok).toBe(b.ok);
					if (a.ok && b.ok) {
						expect(serializeBody(a.tree)).toBe(serializeBody(b.tree));
					}
				},
			),
		);
	});

	it("dropping a reachable cause's reproduction refuses (anti-confabulation)", () => {
		fc.assert(
			fc.property(fc.constantFrom("n0", "n1"), arbEdges(), (symptom, edges) => {
				const t = trace(symptom, edges);
				if (!t.ok || t.chain.causes.length === 0) return;
				const drop = t.chain.causes[0];
				const repros = reproduceAll().filter((r) => r.causeId !== drop);
				const r = build({
					symptom,
					provenance: "mirror",
					edges,
					reproductions: repros,
					terminal: {
						mirrorId: "m1",
						reflectsRootCause: withRoot(symptom, edges),
					},
				});
				expect(r.ok).toBe(false);
				if (!r.ok) expect(r.error).toBe("WHYTREE_CAUSE_NOT_REPRODUCED");
			}),
		);
	});

	it("an empty terminal mirror never builds (WHYTREE_NO_MIRROR)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("n0", "n1", "n2"),
				arbEdges(),
				(symptom, edges) => {
					const r = build({
						symptom,
						provenance: "mirror",
						edges,
						reproductions: reproduceAll(),
						terminal: { mirrorId: "", reflectsRootCause: "" },
					});
					expect(r.ok).toBe(false);
				},
			),
		);
	});

	it("every admitted cause is reproduced", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("n0", "n1", "n2"),
				arbEdges(),
				(symptom, edges) => {
					const r = build({
						symptom,
						provenance: "incident",
						edges,
						reproductions: reproduceAll(),
						terminal: {
							mirrorId: "m1",
							reflectsRootCause: withRoot(symptom, edges),
						},
					});
					if (!r.ok) return;
					for (const c of r.tree.causes) expect(c.reproduced).toBe(true);
				},
			),
		);
	});
});
