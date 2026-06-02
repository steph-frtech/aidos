/**
 * The control-spec + action-spec — the Workbench /control projection source (AIDOS
 * step S11).
 *
 * BEHAVIOUR-AS-ARTIFACT ALL THE WAY DOWN TO THE BUTTON (KRD §24.1/§24.2/§94): a
 * control-spec is a BUTTON AS A SOURCE — {view, label, visible_when, enabled_when,
 * triggers} — and an action-spec BINDS it to an operation — {on: click(control),
 * invoke: operation, on_success, on_error}. Neither is a rendered component; the
 * rendered <button>/onClick is a later projection (S38). The control's truth is a
 * STATE fixture (given → visible/enabled); the action's truth is an EVENT fixture
 * (event → invoke/effect).
 *
 * This module holds the DECLARED description of those shapes (field-for-field with
 * back/kernel/control + back/kernel/action), the §24.1/§24.2 checkout-button /
 * checkout-submit anchors, a tiny deterministic EvalState mirroring Go's
 * control.EvalState over the closed Expr catalogue, and a planAction mirroring Go's
 * action.Plan — so /control renders the button state-fixture table and the bound
 * action before the live kernel.control/kernel.action SELECT wiring lands.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static registry + a pure evaluator (no
 * clock, no rng, no I/O). The reproducibility mirror lib/control.test.ts pins the
 * three state-fixture rows and the bind against the Go fixtures (visible=false empty
 * cart, enabled=false invalid form, enabled=true valid form; Plan resolves
 * click("checkout-button") to invoke operation "createOrder").
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /control is a visualization; it projects
 * the kernel.control/kernel.action AST and the fixture RESULT — no truth write, no
 * capability. The control/action ASTs are written only by the aidos CLI through an
 * approved ChangeSet; the rendered button + handler are a later projection. There is
 * no headless capability hidden here; read-only is correct (the interpreter is a pure
 * lib, no backend op to bind).
 */

// ── The control-spec shape (mirrors control.Control) ─────────────────────────

/** A $-rooted situation the control conditions evaluate against. */
export type Given = Record<string, unknown>;

/** The checkout-button control-spec, VERBATIM (KRD §24.1/§94). */
export interface ControlSpec {
	name: string;
	view: string;
	label: string;
	/** Human-readable form of the visible_when Expr ($.cart.items.length > 0). */
	visibleWhenSrc: string;
	/** Human-readable form of the enabled_when Expr ($.form.valid && !$.submitting). */
	enabledWhenSrc: string;
	/** The control→action link (triggers). */
	triggers: string;
}

export const CHECKOUT_BUTTON: ControlSpec = {
	name: "checkout-button",
	view: "cart",
	label: "i18n(cart.checkout)",
	visibleWhenSrc: "$.cart.items.length > 0",
	enabledWhenSrc: "$.form.valid && !$.submitting",
	triggers: "checkout-submit",
};

// ── The action-spec shape (mirrors action.Action) ────────────────────────────

/** One on_success / on_error effect — a verbatim verb + its arg (KRD §24.2). */
export interface EffectSpec {
	verb: string;
	arg: string;
}

/** The checkout-submit action-spec, VERBATIM (KRD §24.2/§94). */
export interface ActionSpec {
	name: string;
	/** on: click(controlRef). */
	on: { kind: "click"; control: string };
	/** The action→operation link (binds), held as the invoke ref. */
	invoke: string;
	/** The invoke with{…} args, by name (Expr refs). */
	withArgs: Record<string, string>;
	onSuccess: EffectSpec[];
	onError: EffectSpec[];
}

export const CHECKOUT_SUBMIT: ActionSpec = {
	name: "checkout-submit",
	on: { kind: "click", control: "checkout-button" },
	invoke: "createOrder",
	withArgs: { cart: "$.cart", user: "$.auth.user" },
	onSuccess: [
		{ verb: "navigate", arg: "/orders/{result.id}" },
		{ verb: "toast", arg: "order.created" },
	],
	onError: [{ verb: "toast.error", arg: "$.error.message" }],
};

// ── EvalState: the deterministic mirror of Go's control.EvalState ────────────

/** The computed button state (mirrors control.State). */
export interface ButtonState {
	visible: boolean;
	enabled: boolean;
}

function resolve(path: string, root: Given): unknown {
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

/**
 * visible_when = $.cart.items.length > 0 — true iff the cart has at least one item.
 * Mirrors the Go Expr Call(">", Ref($.cart.items.length), Lit(0)).
 */
function evalVisible(given: Given): boolean {
	const len = resolve("$.cart.items.length", given);
	return typeof len === "number" && len > 0;
}

/**
 * enabled_when = $.form.valid && !$.submitting. Mirrors the Go Expr
 * Call("&&", Ref($.form.valid), Call("!", Ref($.submitting))). A dangling ref yields
 * false (the condition is not satisfiable), matching EvalState's typed-error → not
 * enabled handling for the panel.
 */
function evalEnabled(given: Given): boolean {
	const valid = resolve("$.form.valid", given);
	const submitting = resolve("$.submitting", given);
	return valid === true && submitting === false;
}

/**
 * evalState computes the button state for a given, consulting enabled_when ONLY when
 * visible_when holds (a hidden button has no enabled state). Deterministic — same
 * given ⇒ same state. Mirrors control.EvalState byte-for-byte on the three fixture
 * rows.
 */
export function evalState(given: Given): ButtonState {
	if (!evalVisible(given)) return { visible: false, enabled: false };
	return { visible: true, enabled: evalEnabled(given) };
}

// ── The state-fixture table the /control panel renders ───────────────────────

/** One row of the state-fixture table: a labelled given + the computed state. */
export interface FixtureRow {
	id: string;
	givenLabel: string;
	given: Given;
	state: ButtonState;
}

/** The three KRD §35 state-fixture rows, with their computed button state. */
export function stateFixtureRows(): FixtureRow[] {
	const rows: Array<{ id: string; givenLabel: string; given: Given }> = [
		{
			id: "empty-cart-hides",
			givenLabel: "{ cart: { items: [] } }",
			given: { cart: { items: [] } },
		},
		{
			id: "filled-cart-invalid-form-disabled",
			givenLabel: "{ cart: { items: [x] }, form.valid: false }",
			given: {
				cart: { items: [{ id: "x" }] },
				form: { valid: false },
				submitting: false,
			},
		},
		{
			id: "filled-cart-valid-form-enabled",
			givenLabel: "{ cart: { items: [x] }, form.valid: true }",
			given: {
				cart: { items: [{ id: "x" }] },
				form: { valid: true },
				submitting: false,
			},
		},
	];
	return rows.map((r) => ({ ...r, state: evalState(r.given) }));
}

// ── planAction: the deterministic mirror of Go's action.Plan ─────────────────

/** The resolved bind (mirrors action.PlanResult). */
export interface ActionPlan {
	invoke: string;
	args: string[];
	onSuccess: EffectSpec[];
	onError: EffectSpec[];
}

/**
 * planAction resolves the action's bind for a click on the control — WITHOUT
 * executing it. Mirrors action.Plan: it returns the bound operation, the with-arg
 * names, and the effect lists. Returns null for a foreign event (a click on another
 * control), matching the Go ErrEventNotForThisAction.
 */
export function planAction(
	a: ActionSpec,
	clickControl: string,
): ActionPlan | null {
	if (clickControl !== a.on.control) return null;
	return {
		invoke: a.invoke,
		args: Object.keys(a.withArgs),
		onSuccess: a.onSuccess,
		onError: a.onError,
	};
}

/** The /control fixture verdict: the state rows + the bind, with a PASS computation. */
export interface ControlTrace {
	rows: FixtureRow[];
	plan: ActionPlan | null;
	/** PASS iff the three rows match the fixture AND the action binds createOrder. */
	pass: boolean;
}

/**
 * controlTrace computes the /control panel verdict exactly as the Go fixtures assert:
 * visible=false (empty cart), enabled=false (invalid form), enabled=true (valid form),
 * and Plan(click("checkout-button")) binds operation "createOrder". Deterministic.
 */
export function controlTrace(): ControlTrace {
	const rows = stateFixtureRows();
	const plan = planAction(CHECKOUT_SUBMIT, CHECKOUT_SUBMIT.on.control);
	const r0 = rows[0]?.state;
	const r1 = rows[1]?.state;
	const r2 = rows[2]?.state;
	const pass =
		r0?.visible === false &&
		r1?.visible === true &&
		r1?.enabled === false &&
		r2?.visible === true &&
		r2?.enabled === true &&
		plan?.invoke === "createOrder";
	return { rows, plan, pass };
}
