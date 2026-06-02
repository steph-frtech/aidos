/**
 * demo-checkout — the deterministic TypeScript twin of the S46 checkout SLICE
 * (back/runtime/checkout). It mirrors the slice's ordered loop events and its worked
 * cart so the Workbench /demo-checkout panel renders exactly the loop the Go slice
 * walks — one source, no drift. The authoritative trace is the Go one
 * (back/runtime/checkout.RunSlice); this twin pins the SHAPE the panel projects (the
 * ordered events, the loop stages, the cart, the placed order), and the reproducibility
 * mirror lib/demo-checkout.test.ts pins it.
 *
 * THE WALL (CLAUDE.md §2): the panel is read-only over truth. Running the slice from
 * the screen executes a deterministic projection (this twin) — it never writes the
 * kernel; the real kernel write is the approved, completeness-gated ChangeSet on the
 * back, never a screen write.
 *
 * DETERMINISM-FIRST: no clock, no rng, no I/O. runSlice(cart) is a pure function of
 * the cart — same cart ⇒ same ordered events and the same placed order (N in ⇒ N out).
 *
 * HONESTY (CLAUDE.md §8): the slice covers EXACTLY "create an order from a cart".
 * A line item pins only product + quantity; there is no price/tax/total field to
 * invent (out of scope, an OpenQuestion). The placed order carries only id + items.
 */

/** The ordered loop events — the N2 state→command→events truth form (KRD §93). */
export type SliceEvent =
	| "IdeaIntaken"
	| "GoalOpened"
	| "ChangeSetApplied"
	| "MirrorLive"
	| "ArtifactsEmitted"
	| "OrderPlaced"
	| "PhaseSealed";

/** The canonical ordered event list the slice emits — byte-identical to the Go slice. */
export const SLICE_EVENTS: readonly SliceEvent[] = [
	"IdeaIntaken",
	"GoalOpened",
	"ChangeSetApplied",
	"MirrorLive",
	"ArtifactsEmitted",
	"OrderPlaced",
	"PhaseSealed",
] as const;

/** One loop stage as the pipeline renders it — the event, the tooth it composes, the KRD ref. */
export interface LoopStage {
	event: SliceEvent;
	/** The prior tooth this stage CALLS (it re-implements nothing). */
	tooth: string;
	/** The KRD reference the stage anchors to. */
	krdRef: string;
}

/** The pipeline the panel renders left to right — each stage maps an event to its tooth. */
export const LOOP_STAGES: readonly LoopStage[] = [
	{ event: "IdeaIntaken", tooth: "S27 idea-intake", krdRef: "KRD §117–§119" },
	{
		event: "GoalOpened",
		tooth: "S29 goal-engine (the red set IS the goal)",
		krdRef: "KRD §56–§59",
	},
	{
		event: "ChangeSetApplied",
		tooth: "S20 changeset (the door, completeness-gated)",
		krdRef: "KRD §44/§98",
	},
	{
		event: "MirrorLive",
		tooth: "S06 mirror records (no monster)",
		krdRef: "KRD §29/§33",
	},
	{
		event: "ArtifactsEmitted",
		tooth: "S34/S36/S37/S38 emitters",
		krdRef: "KRD LIVRE V",
	},
	{
		event: "OrderPlaced",
		tooth: "S10 operation.Interpret (createOrder)",
		krdRef: "KRD §93",
	},
	{ event: "PhaseSealed", tooth: "S23 phases.IsStable", krdRef: "KRD §43" },
] as const;

/** One entry of the cart — pins ONLY a product ref and a quantity (no price, by type). */
export interface LineItem {
	product: string;
	quantity: number;
}

/** The cart — the command input to createOrder. */
export interface Cart {
	id: string;
	items: LineItem[];
}

/** The placed order — its line items MATCH the cart; carries only id + items (no total). */
export interface PlacedOrder {
	id: string;
	items: LineItem[];
}

/** The kernel ASTs the slice promotes — the four pinned anchor refs (read-only). */
export const KERNEL_ASTS = {
	entity: "Order",
	operation: "createOrder",
	control: "checkout-button",
	action: "checkout-submit",
} as const;

/** The seed Idea — the verbatim candidate-truth, paraphrased by nothing. */
export const SEED_IDEA = "a customer places an order from their cart" as const;

/** The worked cart the panel shows — EXACTLY 2 line items (the journey asserts 2). */
export function exampleCart(): Cart {
	return {
		id: "cart-demo",
		items: [
			{ product: "widget", quantity: 2 },
			{ product: "gadget", quantity: 1 },
		],
	};
}

/** The slice's run outcome — the ordered events + the placed order, or a block. */
export type SliceResult =
	| { kind: "green"; events: readonly SliceEvent[]; order: PlacedOrder }
	| { kind: "blocked"; code: "NO_ORDER_EMPTY_CART"; reason: string };

/**
 * runSlice is the deterministic twin of the Go RunSlice: it returns the ordered loop
 * events and the placed order (its line items MATCH the cart, N in ⇒ N out), or a
 * BlockReason for an empty cart (no order to place) — never an invented order. Pure.
 */
export function runSlice(cart: Cart): SliceResult {
	if (cart.items.length === 0) {
		return {
			kind: "blocked",
			code: "NO_ORDER_EMPTY_CART",
			reason:
				"un panier vide n'est pas une commande : aucune commande n'est créée (BlockReason, jamais de commande inventée).",
		};
	}
	return {
		kind: "green",
		events: SLICE_EVENTS,
		order: { id: `${cart.id}-order`, items: cart.items.map((i) => ({ ...i })) },
	};
}
