/**
 * The Operation DSL — the Workbench /operation projection source (AIDOS step S10).
 *
 * WORKFLOW-AS-ARTIFACT (KRD §24.3, §93): an operation body is an ordered list of
 * TYPED step verbs — validate / authorize / read / mutate / branch / return —
 * stored content-addressed in kernel.operation, never free code. Its truth is the
 * fixture `state → command → events` (N2). This module holds the DECLARED
 * description of that shape (the six verbs — field-for-field with
 * back/kernel/operation), the §93 createOrder anchor, and a tiny deterministic
 * interpreter that mirrors Go's operation.Interpret over MOCK deps — so the
 * /operation panel renders the step pipeline and the createOrder/happy event trace
 * before the live kernel.operation SELECT wiring lands.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static registry + a pure interpreter (no
 * clock, no rng, no I/O). The reproducibility mirror lib/operation.test.ts pins the
 * verb set, the anchor's pipeline, and the happy trace against the Go fixture
 * (events [OrderCreated, CartCleared], status "pending", total 15, authorize before
 * any mutate).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /operation is a visualization; it
 * projects the kernel.operation AST and the fixture RESULT, it does not run truth
 * writes and exposes no capability — an operation AST is written only by the aidos
 * CLI through an approved ChangeSet, and a mutate reaches the world only through a
 * Mutator seam (below the waterline). There is no headless capability hidden here.
 */

/** The six operation verbs (matches operation.go stepKinds, canonical order). */
export const STEP_KINDS = [
	"validate",
	"authorize",
	"read",
	"mutate",
	"branch",
	"return",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** A typed step node — a discriminated union, the closed grammar. */
export type Step =
	| { kind: "validate"; schema: string }
	| { kind: "authorize"; policy: string }
	| { kind: "read"; entity: string; where: Record<string, unknown>; as: string }
	| {
			kind: "mutate";
			entity: string;
			op: "create" | "clear";
			data?: Record<string, unknown>;
			where?: Record<string, unknown>;
			as?: string;
	  }
	| { kind: "return"; ref: string };

/** A typed Operation (matches the Go Operation struct). */
export interface Operation {
	name: string;
	input: string;
	steps: Step[];
	emits: string[];
}

/** Is k one of the six verbs? (mirrors operation.IsStepKind). */
export function isStepKind(k: string): k is StepKind {
	return (STEP_KINDS as readonly string[]).includes(k);
}

/**
 * The KRD §93 anchor operation createOrder, VERBATIM (no invented step/event):
 *   input CreateOrderInput; steps [validate, authorize, read, mutate, mutate,
 *   return]; emits [OrderCreated, CartCleared].
 */
export const CREATE_ORDER: Operation = {
	name: "createOrder",
	input: "CreateOrderInput",
	steps: [
		{ kind: "validate", schema: "CreateOrderInput" },
		{ kind: "authorize", policy: "canPlaceOrder" },
		{
			kind: "read",
			entity: "Cart",
			where: { id: "$.input.cartId" },
			as: "$.cart",
		},
		{
			kind: "mutate",
			entity: "Order",
			op: "create",
			data: {
				userId: "$.auth.user.id",
				items: "$.cart.items",
				status: "pending",
				// total = sum($.cart.items, "price") — computed by the mutate seam.
			},
			as: "$.order",
		},
		{ kind: "mutate", entity: "Cart", op: "clear", where: { id: "$.cart.id" } },
		{ kind: "return", ref: "$.order" },
	],
	emits: ["OrderCreated", "CartCleared"],
};

/** One ordered pipeline chip for the panel: the verb + its one-line target. */
export interface PipelineChip {
	kind: StepKind;
	label: string;
}

/** The ordered pipeline chips of an operation (the visual step list). */
export function pipeline(op: Operation): PipelineChip[] {
	return op.steps.map((s): PipelineChip => {
		switch (s.kind) {
			case "validate":
				return { kind: "validate", label: s.schema };
			case "authorize":
				return { kind: "authorize", label: s.policy };
			case "read":
				return { kind: "read", label: `${s.entity} → ${s.as}` };
			case "mutate":
				return { kind: "mutate", label: `${s.entity} ${s.op}` };
			case "return":
				return { kind: "return", label: s.ref };
			default:
				// The verb set is closed; an unknown kind is a typed failure (mirrors
				// the Go step table's explicit default → unknown step kind).
				throw new Error(
					`operation: unknown step kind ${(s as { kind: string }).kind}`,
				);
		}
	});
}

// ── A tiny deterministic interpreter mirroring Go's operation.Interpret ───────

/** The $-rooted state bag ($.input, $.auth, named slots). */
type StateRoot = Record<string, unknown>;

function resolve(path: string, root: StateRoot): unknown {
	if (!path.startsWith("$")) return undefined;
	const segs = path.split(".").slice(1);
	let cur: unknown = root;
	for (const s of segs) {
		if (s === "length") {
			if (Array.isArray(cur) || typeof cur === "string") return cur.length;
			return undefined;
		}
		if (typeof cur !== "object" || cur === null) return undefined;
		cur = (cur as Record<string, unknown>)[s];
	}
	return cur;
}

function resolveMap(
	m: Record<string, unknown> | undefined,
	root: StateRoot,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!m) return out;
	for (const [k, v] of Object.entries(m)) {
		out[k] = typeof v === "string" && v.startsWith("$") ? resolve(v, root) : v;
	}
	return out;
}

/** The mock deps the fixture passes (mirrors the Go mockDeps). */
export interface MockDeps {
	authorizeAllow: boolean;
	cart: unknown;
	calls: string[];
}

/** The result of an interpreted operation (mirrors the Go Result). */
export interface RunResult {
	events: string[];
	ref: Record<string, unknown> | null;
	denied: boolean;
	calls: string[];
}

/**
 * run walks an operation's steps in order over the mock deps, returning the ordered
 * events and the return ref — the deterministic mirror of Go's Interpret. An
 * authorize DENY short-circuits (events stay empty, no mutate runs).
 */
export function run(
	op: Operation,
	state: StateRoot,
	deps: MockDeps,
): RunResult {
	const root: StateRoot = { ...state };
	const events: string[] = [];
	let ref: Record<string, unknown> | null = null;

	for (const step of op.steps) {
		switch (step.kind) {
			case "validate":
				deps.calls.push("validate");
				break;
			case "authorize":
				deps.calls.push("authorize");
				if (!deps.authorizeAllow) {
					return { events: [], ref: null, denied: true, calls: deps.calls };
				}
				break;
			case "read": {
				deps.calls.push("read");
				if (step.as) root[step.as.slice(2)] = deps.cart;
				break;
			}
			case "mutate": {
				deps.calls.push("mutate");
				const data = resolveMap(step.data, root);
				if (step.op === "create") {
					let total = 0;
					const items = data.items;
					if (Array.isArray(items)) {
						for (const it of items) {
							if (it && typeof it === "object" && "price" in it) {
								const p = (it as { price: unknown }).price;
								if (typeof p === "number") total += p;
							}
						}
					}
					const created = { status: data.status, total };
					events.push("OrderCreated");
					if (step.as) root[step.as.slice(2)] = created;
				} else {
					events.push("CartCleared");
				}
				break;
			}
			case "return": {
				const v = resolve(step.ref, root);
				ref =
					v && typeof v === "object" ? (v as Record<string, unknown>) : null;
				break;
			}
		}
	}
	return { events, ref, denied: false, calls: deps.calls };
}

/** The createOrder/happy given state: authed u1, cart c1 with two priced items. */
export const HAPPY_STATE: StateRoot = {
	input: { cartId: "c1" },
	auth: { user: { id: "u1" } },
};

/** The cart the mock Reader yields for createOrder/happy. */
export const HAPPY_CART = {
	id: "c1",
	userId: "u1",
	items: [{ price: 10 }, { price: 5 }],
};

/** The fixture trace the /operation panel renders: the createOrder/happy run + its PASS verdict. */
export interface FixtureTrace {
	id: string;
	events: string[];
	status: unknown;
	total: unknown;
	authorizeBeforeMutate: boolean;
	pass: boolean;
}

/**
 * createOrderHappyTrace runs the createOrder/happy fixture through the mirror
 * interpreter and computes the PASS verdict exactly as the Go fixture asserts:
 * events == [OrderCreated, CartCleared], status "pending", total 15, authorize ran
 * before any mutate. Deterministic — same inputs, same trace.
 */
export function createOrderHappyTrace(): FixtureTrace {
	const deps: MockDeps = {
		authorizeAllow: true,
		cart: HAPPY_CART,
		calls: [],
	};
	const res = run(CREATE_ORDER, HAPPY_STATE, deps);
	const ai = res.calls.indexOf("authorize");
	const mi = res.calls.indexOf("mutate");
	const authorizeBeforeMutate = ai >= 0 && mi >= 0 && ai < mi;
	const status = res.ref?.status;
	const total = res.ref?.total;
	const pass =
		res.events.length === 2 &&
		res.events[0] === "OrderCreated" &&
		res.events[1] === "CartCleared" &&
		status === "pending" &&
		total === 15 &&
		authorizeBeforeMutate;
	return {
		id: "createOrder/happy",
		events: res.events,
		status,
		total,
		authorizeBeforeMutate,
		pass,
	};
}
