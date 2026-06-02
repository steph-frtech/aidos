/**
 * aidos-expr — the TypeScript twin of the FROZEN Expr DSL evaluator
 * (back/kernel/expr) for the closed catalogue used by control-specs: `>`, `length`,
 * `&&`, `!`, plus `ref` ($-rooted dotted path with `.length`) and `lit`.
 *
 * THE EMITTED WEB PROJECTION (S38) imports this twin: a control's visible_when /
 * enabled_when are embedded in the .tsx as their canonical Expr AST JSON (the kernel
 * head form, back/kernel/expr.Canonicalize), and the component computes its
 * visible/enabled by evaluating those ASTs over the runtime `given` — a FAITHFUL mirror
 * of back/kernel/control.EvalState (S11), NEVER a re-implemented business rule. The
 * semantics here match the Go interpreter token-for-token:
 *   - resolveRef walks a `$`-rooted dotted path; a `.length` segment on an array/string
 *     yields its length; a missing segment / non-object throws (the dangling-ref error).
 *   - `>` expects two numbers, `&&` two booleans, `!` one boolean, `length` one
 *     array/string — a type mismatch throws (never a guessed coercion).
 *   - evalState evaluates visible_when; ONLY when visible does it consult enabled_when
 *     (a hidden button has no enabled state — KRD §24.1, Go control.EvalState).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a pure function of (ast, given) — no clock, no
 * rng, no I/O, no LLM — so the same inputs always yield the same {visible, enabled}.
 * This is the deterministic render core; the Go EvalState is the authoritative truth and
 * this twin reproduces it for the browser.
 */

/** The canonical Expr AST node shapes (back/kernel/expr — the closed catalogue). */
export type ExprNode =
	| { kind: "lit"; value: unknown }
	| { kind: "ref"; path: string }
	| { kind: "call"; fn: string; args: ExprNode[] };

/** A typed evaluation error — the twin throws it, never a silent default (honesty). */
export class ExprError extends Error {}

/** Walk a `$`-rooted dotted path through `given`; `.length` yields array/string length. */
function resolveRef(path: string, root: unknown): unknown {
	const segs = path.split(".");
	// segs[0] === "$" (the AST guarantees the prefix).
	let cur: unknown = root;
	for (const s of segs.slice(1)) {
		if (s === "length") {
			if (Array.isArray(cur) || typeof cur === "string") return cur.length;
			throw new ExprError(`.length on non-collection at ${path}`);
		}
		if (cur === null || typeof cur !== "object") {
			throw new ExprError(`ref ${path}: segment ${s} not an object`);
		}
		const obj = cur as Record<string, unknown>;
		if (!(s in obj)) throw new ExprError(`ref ${path}: segment ${s} absent`);
		cur = obj[s];
	}
	return cur;
}

/** Evaluate an Expr AST node over the `$`-rooted `given`. Pure, deterministic. */
export function evalExpr(
	node: ExprNode,
	given: Record<string, unknown>,
): unknown {
	switch (node.kind) {
		case "lit":
			return node.value;
		case "ref":
			return resolveRef(node.path, given);
		case "call": {
			const args = node.args.map((a) => evalExpr(a, given));
			switch (node.fn) {
				case "length": {
					const a = args[0];
					if (Array.isArray(a) || typeof a === "string") return a.length;
					throw new ExprError("length on non-collection");
				}
				case ">": {
					const [l, r] = args;
					if (typeof l !== "number" || typeof r !== "number")
						throw new ExprError("> expects numbers");
					return l > r;
				}
				case "&&": {
					const [l, r] = args;
					if (typeof l !== "boolean" || typeof r !== "boolean")
						throw new ExprError("&& expects booleans");
					return l && r;
				}
				case "!": {
					const b = args[0];
					if (typeof b !== "boolean") throw new ExprError("! expects boolean");
					return !b;
				}
				default:
					throw new ExprError(`${node.fn} has no evaluator`);
			}
		}
	}
}

/** Evaluate an Expr AST to a boolean — a non-bool result is a typed error. */
function evalBool(node: ExprNode, given: Record<string, unknown>): boolean {
	const v = evalExpr(node, given);
	if (typeof v !== "boolean") throw new ExprError("condition is not boolean");
	return v;
}

/** The computed button state — the result of evalState (= Go control.State). */
export interface ButtonState {
	visible: boolean;
	enabled: boolean;
}

/**
 * evalState — the faithful TS mirror of back/kernel/control.EvalState (S11). It
 * evaluates visible_when, and — ONLY when visible — enabled_when, over the `$`-rooted
 * `given`. A hidden button reports `enabled: false` without consulting enabled_when. A
 * dangling ref / type mismatch is treated as "not applicable" → `{visible:false}` for a
 * faithful render (the Go EvalState surfaces a typed error; the projected component
 * cannot crash the page, so an unevaluable condition renders nothing — never a guessed
 * visible button).
 */
export function evalState(
	visibleWhen: ExprNode,
	enabledWhen: ExprNode,
	given: Record<string, unknown>,
): ButtonState {
	let visible: boolean;
	try {
		visible = evalBool(visibleWhen, given);
	} catch {
		return { visible: false, enabled: false };
	}
	if (!visible) return { visible: false, enabled: false };
	let enabled: boolean;
	try {
		enabled = evalBool(enabledWhen, given);
	} catch {
		return { visible: true, enabled: false };
	}
	return { visible: true, enabled };
}
