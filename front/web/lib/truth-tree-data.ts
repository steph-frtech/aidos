/**
 * The KRD §114 worked composition example + the per-node own_mirror verdicts for the /truth-tree
 * panel (AIDOS step S18).
 *
 * The shape is the §114 worked example: `product → journey → view → control`, a composite chain
 * where the product composes a journey, the journey composes a view, the view composes a control.
 * Each `composes` edge carries its DECLARED weight (load-bearing | cosmetic), and each composite
 * carries its DECLARED activation_threshold. The refs reuse layer ids in the spirit of S11's
 * pinned control/action artifacts — the agent coins no new truth as fact: these are CANDIDATE
 * rows (the FORM of composes edges + thresholds, no freeze) used to exercise the recursive
 * aggregate. The weights/thresholds are EXAMPLE-ONLY; a real project's are human-declared above
 * the line (honesty rule — never guessed, never learned).
 *
 * THE DONE CRITERION is visible here: under the all-green own-mirrors the product aggregates
 * GREEN; flip the leaf `control` own_mirror RED and the load-bearing chain reddens the view, the
 * journey and the product (drill-down names the control). Flip a cosmetic sibling below threshold
 * and the product stays GREEN.
 */

import type { Tree, Verdict } from "./truth-tree";

/** The §114 composition chain: product → journey → view → control (+ a cosmetic helptext leaf). */
export function buildTree(own: Record<string, Verdict>): Tree {
	return {
		nodes: {
			product: {
				layerId: "checkout-product",
				version: "v1",
				ownMirror: own.product,
				activationThreshold: 1.0,
			},
			journey: {
				layerId: "checkout-journey",
				version: "v1",
				ownMirror: own.journey,
				activationThreshold: 1.0,
			},
			view: {
				layerId: "checkout-view",
				version: "v2",
				ownMirror: own.view,
				activationThreshold: 1.0,
			},
			control: {
				layerId: "checkout-button",
				version: "v1",
				ownMirror: own.control,
				activationThreshold: 0,
			},
			helptext: {
				layerId: "checkout-helptext",
				version: "v1",
				ownMirror: own.helptext,
				activationThreshold: 0,
			},
		},
		edges: [
			{
				parent: { id: "product", version: "v1" },
				child: { id: "journey", version: "v1" },
				weight: "load-bearing",
			},
			{
				parent: { id: "journey", version: "v1" },
				child: { id: "view", version: "v2" },
				weight: "load-bearing",
			},
			{
				parent: { id: "view", version: "v2" },
				child: { id: "control", version: "v1" },
				weight: "load-bearing",
			},
			{
				parent: { id: "view", version: "v2" },
				child: { id: "helptext", version: "v1" },
				weight: "cosmetic",
			},
		],
	};
}

/** The root layer the panel aggregates from (the whole). */
export const ROOT_ID = "product";

/** The ordered node ids, root-first, for a stable render. */
export const NODE_ORDER = [
	"product",
	"journey",
	"view",
	"control",
	"helptext",
] as const;

/** ALL-GREEN own mirrors — the product aggregates GREEN. */
export const OWN_ALL_GREEN: Record<string, Verdict> = {
	product: "GREEN",
	journey: "GREEN",
	view: "GREEN",
	control: "GREEN",
	helptext: "GREEN",
};

/**
 * RED LEAF own mirrors — the load-bearing `control` leaf is RED. The fall-back-up tints the view,
 * the journey and the product RED; the drill-down from the product names the control. THE done
 * criterion, rendered.
 */
export const OWN_RED_CONTROL: Record<string, Verdict> = {
	product: "GREEN",
	journey: "GREEN",
	view: "GREEN",
	control: "RED",
	helptext: "GREEN",
};

/**
 * COSMETIC-CHANGED own mirrors — only the cosmetic `helptext` leaf changed (and is GREEN); the
 * activation stays below the view's threshold, so the product stays GREEN (cosmetic isolation).
 * The changed-set is carried on the tree so `reopensOnChange` reflects §112.
 */
export const OWN_COSMETIC_GREEN: Record<string, Verdict> = OWN_ALL_GREEN;
export const COSMETIC_CHANGED: readonly string[] = ["helptext"];
