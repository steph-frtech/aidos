import { deriveDoc, type Kernel } from "@/lib/derivedoc";
import type { Divergence, HumanDoc } from "@/lib/docmirror";

/**
 * Non-action module for /doc-mirror (FK07): the comparison scenarios + view types + empty
 * view. Kept OUT of actions.ts because a "use server" module may export ONLY async Server
 * Actions. The scenarios each pair a human doc s2 against a derived s9 (from a kernel), to
 * demonstrate the three doc-mirror outcomes: aligned (green), a behaviour removed from the
 * code (red, structural), and prose-only edit (green + advisory).
 */

/** the canonical checkout kernel s9 is derived from. */
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

/** authors a structurally-matching human doc s2 from a derived s9 (own prose). */
function humanMatching(kernel: Kernel): HumanDoc {
	const s9 = deriveDoc(kernel).s9;
	return {
		kernel_id: s9.kernel_id,
		concepts: [...s9.concepts],
		errors: [...s9.errors],
		behaviors: s9.behaviors.map((b) => ({
			id: b.id,
			description: `Doc humain : ${b.id}.`,
		})),
	};
}

/** the kernel WITHOUT the emit — its emit behaviour disappears from s9. */
const checkoutNoEmit: Kernel = {
	...checkoutKernel,
	operations: [{ ...checkoutKernel.operations![0], emits: [] }],
};

export interface DocMirrorScenario {
	id: string;
	label: string;
	/** the human doc s2 (frozen at scenario authoring). */
	human: HumanDoc;
	/** the kernel whose derived s9 is compared against s2. */
	kernel: Kernel;
}

/**
 * The three scenarios:
 *  - aligned       — human matches the code exactly → GREEN.
 *  - code-missing  — human still documents the emit behaviour, the code dropped it → RED.
 *  - prose-edited  — human re-words one behaviour, structure unchanged → GREEN + advisory.
 */
export const SCENARIOS: DocMirrorScenario[] = [
	{
		id: "aligned",
		label: "aligned (vert)",
		human: humanMatching(checkoutKernel),
		kernel: checkoutKernel,
	},
	{
		id: "code-missing",
		label: "behavior retiré du code (rouge)",
		// the human still documents the FULL surface (incl. the emit behaviour)…
		human: humanMatching(checkoutKernel),
		// …but the code dropped the emit → s9 no longer carries it → structural divergence.
		kernel: checkoutNoEmit,
	},
	{
		id: "prose-edited",
		label: "prose seule éditée (advisory)",
		// structurally identical, but one behaviour's prose is rewritten by a human.
		human: (() => {
			const h = humanMatching(checkoutKernel);
			if (h.behaviors && h.behaviors.length > 0) {
				h.behaviors[0] = {
					...h.behaviors[0],
					description:
						"Une prose totalement réécrite par un humain (drift de wording).",
				};
			}
			return h;
		})(),
		kernel: checkoutKernel,
	},
];

export interface DocMirrorView {
	ok: boolean;
	error?: string;
	kernelId?: string;
	verdict?: "green" | "red";
	pairingMismatch?: boolean;
	structural: Divergence[];
	advisories: Divergence[];
	/** the second run's verdict — proves the verdict is deterministic (run twice → same). */
	verdictAgain?: "green" | "red";
	deterministic?: boolean;
}

export const emptyView: DocMirrorView = {
	ok: false,
	structural: [],
	advisories: [],
};
