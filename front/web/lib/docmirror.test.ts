import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveDoc, type Kernel } from "./derivedoc";
import { compare, dataMirror, type HumanDoc } from "./docmirror";

const checkoutKernel: Kernel = {
	kernelId: "checkout",
	operations: [
		{
			name: "createOrder",
			input: "Cart",
			steps: [
				{ kind: "authorize", policy: "canCheckout" },
				{ kind: "mutate", entity: "Order" },
			],
			emits: ["OrderCreated"],
		},
	],
	controls: [{ name: "checkout-button", triggers: "checkout-submit" }],
	actions: [
		{
			name: "checkout-submit",
			invoke: "createOrder",
			onControl: "checkout-button",
		},
	],
};

function humanMatching(kernel: Kernel): HumanDoc {
	const s9 = deriveDoc(kernel).s9;
	return {
		kernel_id: s9.kernel_id,
		concepts: [...s9.concepts],
		errors: [...s9.errors],
		behaviors: s9.behaviors.map((b) => ({
			id: b.id,
			description: `Humain: ${b.id}`,
		})),
	};
}

describe("docmirror (FK07)", () => {
	it("an aligned doc-mirror is green", () => {
		const s9 = deriveDoc(checkoutKernel).s9;
		const rep = compare(humanMatching(checkoutKernel), s9);
		expect(rep.verdict).toBe("green");
		expect(rep.pairing_mismatch).toBe(false);
	});

	it("removing a behaviour from the code turns it red (code_missing)", () => {
		const s9full = deriveDoc(checkoutKernel).s9;
		const human = humanMatching(checkoutKernel);
		// code drops the emit → the emit behaviour disappears from s9.
		const reduced = deriveDoc({
			...checkoutKernel,
			operations: [{ ...checkoutKernel.operations![0], emits: [] }],
		}).s9;
		expect(s9full.behaviors.length).toBeGreaterThan(reduced.behaviors.length);
		const rep = compare(human, reduced);
		expect(rep.verdict).toBe("red");
		expect(
			rep.structural_divergences.some(
				(d) =>
					d.section === "behaviors" &&
					d.key === "emit:createOrder:OrderCreated" &&
					d.side === "code_missing",
			),
		).toBe(true);
	});

	it("editing only the prose stays green and yields an advisory", () => {
		const s9 = deriveDoc(checkoutKernel).s9;
		const human = humanMatching(checkoutKernel);
		human.behaviors![0].description = "Une prose réécrite par un humain.";
		const rep = compare(human, s9);
		expect(rep.verdict).toBe("green");
		expect(rep.structural_divergences).toHaveLength(0);
		expect(rep.prose_advisories.some((d) => d.plane === "prose")).toBe(true);
	});

	it("a pairing mismatch is red", () => {
		const s9 = deriveDoc(checkoutKernel).s9;
		const human = humanMatching(checkoutKernel);
		human.kernel_id = "other";
		const rep = compare(human, s9);
		expect(rep.verdict).toBe("red");
		expect(rep.pairing_mismatch).toBe(true);
	});

	it("the data-mirror (s3↔s7) is declared and structural", () => {
		const s3 = ["entity:Order", "field:Order.id", "field:Order.total"];
		expect(dataMirror("checkout", s3, s3).verdict).toBe("green");
		const rep = dataMirror("checkout", s3, ["entity:Order", "field:Order.id"]);
		expect(rep.verdict).toBe("red");
		expect(
			rep.structural_divergences.some(
				(d) => d.key === "field:Order.total" && d.side === "code_missing",
			),
		).toBe(true);
	});

	// Reproducibility mirror (the twin's own property, FK07 « même paire → même
	// verdict »): compare is PURE — the same (human, s9) pair always yields the same
	// verdict and the same structural divergences, INVARIANT under input ordering
	// (the comparator canonicalizes; it never echoes the caller's slice order).
	it("compare is deterministic and order-invariant (same pair → same verdict)", () => {
		const term = fc.stringMatching(/^(operation|entity|event):[a-z]{1,5}$/);
		const behavior = fc.record({
			id: fc.stringMatching(/^operation:[a-z]{1,5}$/),
			description: fc.stringMatching(/^[a-z ]{0,8}$/),
		});
		const doc = fc.record({
			concepts: fc.uniqueArray(term, { maxLength: 5 }),
			errors: fc.uniqueArray(term, { maxLength: 5 }),
			behaviors: fc.uniqueArray(behavior, {
				maxLength: 4,
				selector: (b) => b.id,
			}),
		});
		const shuffle = <T>(xs: T[], seed: number): T[] => {
			const out = [...xs];
			let s = seed >>> 0;
			for (let i = out.length - 1; i > 0; i--) {
				s = (s * 1664525 + 1013904223) >>> 0;
				const j = s % (i + 1);
				[out[i], out[j]] = [out[j], out[i]];
			}
			return out;
		};
		fc.assert(
			fc.property(doc, doc, fc.integer(), (h, c, seed) => {
				const human: HumanDoc = { kernel_id: "k", ...h };
				const s9 = { kernel_id: "k", ...c };
				const want = compare(human, s9);
				// re-run: byte-identical verdict + divergences.
				const again = compare(human, s9);
				expect(again.verdict).toBe(want.verdict);
				expect(JSON.stringify(again.structural_divergences)).toBe(
					JSON.stringify(want.structural_divergences),
				);
				// reorder both sides: verdict + structural divergences unchanged.
				const shuffled = compare(
					{
						kernel_id: "k",
						concepts: shuffle(h.concepts, seed),
						errors: shuffle(h.errors, seed + 1),
						behaviors: shuffle(h.behaviors, seed + 2),
					},
					{
						kernel_id: "k",
						concepts: shuffle(c.concepts, seed + 3),
						errors: shuffle(c.errors, seed + 4),
						behaviors: shuffle(c.behaviors, seed + 5),
					},
				);
				expect(shuffled.verdict).toBe(want.verdict);
				expect(JSON.stringify(shuffled.structural_divergences)).toBe(
					JSON.stringify(want.structural_divergences),
				);
			}),
		);
	});
});
