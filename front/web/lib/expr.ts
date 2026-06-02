/**
 * The Expr DSL — the Workbench /expr projection source (AIDOS step S08).
 *
 * THE COMPORTEMENT-AS-ARTIFACT (KRD §24.5): a button's condition (visible_when,
 * enabled_when) is a TYPED JSON AST — lit / ref / call / obj / arr — over a CLOSED
 * function catalogue and $-rooted refs, stored content-addressed in kernel.expr,
 * never free code. This module holds the DECLARED, static description of that AST
 * shape (the five node kinds, the closed catalogue — field-for-field with
 * back/kernel/expr/catalogue.go), the seeded sample ASTs (the canonical
 * visible_when expr), and a tiny deterministic evaluator that mirrors Go's
 * expr.Eval for those samples — so the /expr panel renders the typed tree and its
 * evaluated result before the live kernel.expr SELECT wiring lands.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static registry + a pure evaluator (no
 * clock, no rng, no I/O — now/uuid/randomToken would resolve through injected
 * providers exactly as in Go). The reproducibility mirror lib/expr.test.ts pins
 * the node-kind set, the closed catalogue, and the sample verdicts against the Go
 * invariants ($.cart.items.length > 0 ⇒ true for a non-empty cart, false for an
 * empty one; an unknown function is rejected, never evaluated).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /expr is a visualization; it projects
 * kernel.expr (SELECT-only role), it does not write truth and exposes no
 * capability — an Expr AST is written only by the aidos CLI through an approved
 * ChangeSet. There is no headless capability hidden here; read-only is correct.
 */

/** The five Expr node kinds (matches expr.go nodeKinds, in canonical order). */
export const NODE_KINDS = ["lit", "ref", "call", "obj", "arr"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** The CLOSED function catalogue (matches catalogue.go, in canonical order). */
export const CATALOGUE = [
	{ name: "lowercase", arity: 1 },
	{ name: "concat", arity: -1 },
	{ name: "now", arity: 0 },
	{ name: "uuid", arity: 0 },
	{ name: "randomToken", arity: 0 },
	{ name: ">", arity: 2 },
	{ name: "&&", arity: 2 },
	{ name: "!", arity: 1 },
	{ name: "length", arity: 1 },
] as const;

export const CATALOGUE_NAMES: readonly string[] = CATALOGUE.map((c) => c.name);

/** Is fn in the closed catalogue? (mirrors expr.IsCatalogueFunc). */
export function isCatalogueFunc(fn: string): boolean {
	return CATALOGUE_NAMES.includes(fn);
}

/** Is kind one of the five node kinds? (mirrors expr.IsNodeKind). */
export function isNodeKind(k: string): k is NodeKind {
	return (NODE_KINDS as readonly string[]).includes(k);
}

/** The typed AST — a discriminated union, one variant per node kind. */
export type Expr =
	| { kind: "lit"; value: string | number | boolean | null }
	| { kind: "ref"; path: string }
	| { kind: "call"; fn: string; args: Expr[] }
	| { kind: "obj"; fields: Record<string, Expr> }
	| { kind: "arr"; items: Expr[] };

/** A $-rooted env value tree (mirrors the Go Env data under "$"). */
export type EnvData = Record<string, unknown>;

/** Parse rejection — an unknown kind or non-catalogue function. */
export class ExprRejected extends Error {}

/**
 * parse validates an AST against the closed grammar: every node kind must be one
 * of the five, every call name must be in the catalogue (no free-code escape),
 * and a ref must be $-rooted. It mirrors expr.Parse: an invalid AST throws
 * ExprRejected, it is never evaluated. (A faithful subset — arity is checked for
 * the cases the samples exercise.)
 */
export function parse(node: unknown): Expr {
	if (typeof node !== "object" || node === null) {
		throw new ExprRejected("node is not an object");
	}
	const n = node as Record<string, unknown>;
	const kind = n.kind;
	if (typeof kind !== "string" || !isNodeKind(kind)) {
		throw new ExprRejected(`unknown node kind: ${String(kind)}`);
	}
	switch (kind) {
		case "lit":
			return { kind, value: n.value as string | number | boolean | null };
		case "ref": {
			const path = n.path;
			if (typeof path !== "string" || !path.startsWith("$")) {
				throw new ExprRejected(`malformed ref: ${String(path)}`);
			}
			return { kind, path };
		}
		case "call": {
			const fn = n.fn;
			if (typeof fn !== "string" || !isCatalogueFunc(fn)) {
				throw new ExprRejected(
					`unknown function "${String(fn)}" (closed allow-list)`,
				);
			}
			const args = Array.isArray(n.args) ? n.args.map(parse) : [];
			return { kind, fn, args };
		}
		case "obj": {
			const fields: Record<string, Expr> = {};
			const raw = (n.fields ?? {}) as Record<string, unknown>;
			for (const [k, v] of Object.entries(raw)) fields[k] = parse(v);
			return { kind, fields };
		}
		case "arr": {
			const items = Array.isArray(n.items) ? n.items.map(parse) : [];
			return { kind, items };
		}
	}
}

/** Resolve a $-rooted dotted path; ".length" yields an array/string length. */
function resolveRef(path: string, root: unknown): unknown {
	const segs = path.split(".").slice(1); // drop "$"
	let cur: unknown = root;
	for (const s of segs) {
		if (s === "length") {
			if (Array.isArray(cur) || typeof cur === "string") return cur.length;
			throw new Error(`.length on non-collection: ${path}`);
		}
		if (typeof cur !== "object" || cur === null) {
			throw new Error(`ref does not resolve: ${path}`);
		}
		cur = (cur as Record<string, unknown>)[s];
	}
	return cur;
}

/**
 * evaluate mirrors Go's expr.Eval for the closed catalogue. PURE: no clock/rng/IO
 * (now/uuid/randomToken would resolve through injected providers). It never
 * throws on a type mismatch from a malformed sample — callers pass valid samples.
 */
export function evaluate(e: Expr, root: EnvData): unknown {
	switch (e.kind) {
		case "lit":
			return e.value;
		case "ref":
			return resolveRef(e.path, root);
		case "obj": {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(e.fields)) out[k] = evaluate(v, root);
			return out;
		}
		case "arr":
			return e.items.map((it) => evaluate(it, root));
		case "call": {
			const a = e.args.map((x) => evaluate(x, root));
			switch (e.fn) {
				case "lowercase":
					return String(a[0]).toLowerCase();
				case "concat":
					return a.map(String).join("");
				case "length":
					return Array.isArray(a[0]) || typeof a[0] === "string"
						? (a[0] as unknown[] | string).length
						: NaN;
				case ">":
					return Number(a[0]) > Number(a[1]);
				case "&&":
					return Boolean(a[0]) && Boolean(a[1]);
				case "!":
					return !a[0];
				default:
					throw new ExprRejected(`"${e.fn}" has no evaluator`);
			}
		}
	}
}

/** One seeded sample: an AST, its source notation, an Env, and the verdict. */
export interface ExprSample {
	id: string;
	/** Human-readable source (the §24.1 button notation). */
	source: string;
	/** What the AST is for (FR-first per ADR 0011). */
	role: string;
	ast: Expr;
	env: EnvData;
}

/** The canonical visible_when expr: $.cart.items.length > 0. */
const VISIBLE_WHEN: Expr = {
	kind: "call",
	fn: ">",
	args: [
		{ kind: "ref", path: "$.cart.items.length" },
		{ kind: "lit", value: 0 },
	],
};

/**
 * The seeded sample ASTs the /expr panel renders before live kernel.expr wiring.
 * They are the fixture-mirror cases, so the panel shows exactly what the Go
 * fixture proves: visible_when true for a non-empty cart, false for an empty one;
 * a composing function call.
 */
export const SAMPLES: readonly ExprSample[] = [
	{
		id: "visible_when-nonempty",
		source: "$.cart.items.length > 0",
		role: "visible_when du bouton checkout — vrai quand le panier a des articles.",
		ast: VISIBLE_WHEN,
		env: { cart: { items: [{ id: "a" }, { id: "b" }] } },
	},
	{
		id: "visible_when-empty",
		source: "$.cart.items.length > 0",
		role: "le MÊME visible_when — faux quand le panier est vide.",
		ast: VISIBLE_WHEN,
		env: { cart: { items: [] } },
	},
	{
		id: "lowercase-compose",
		source: "lowercase($.auth.user.name)",
		role: "un appel de fonction se compose — lowercase d'une racine $.auth.user.",
		ast: {
			kind: "call",
			fn: "lowercase",
			args: [{ kind: "ref", path: "$.auth.user.name" }],
		},
		env: { auth: { user: { name: "ADA" } } },
	},
] as const;

/** The roots a sample's refs reach into (for the panel's "roots" list). */
export function rootsOf(e: Expr): string[] {
	const out = new Set<string>();
	const walk = (n: Expr): void => {
		if (n.kind === "ref") out.add(n.path);
		else if (n.kind === "call") n.args.forEach(walk);
		else if (n.kind === "obj") Object.values(n.fields).forEach(walk);
		else if (n.kind === "arr") n.items.forEach(walk);
	};
	walk(e);
	return [...out];
}

/** A flat node list of an AST (depth-first), for the tree rendering. */
export interface FlatNode {
	/** Stable depth-first position, unique within one flattened AST (React key). */
	id: number;
	depth: number;
	kind: NodeKind;
	/** A one-line label: the literal value, the ref path, or the call fn. */
	label: string;
}

export function flatten(e: Expr): FlatNode[] {
	// Walk depth-first, assigning each node a stable sequential id (a unique React
	// key within one AST, never the array index).
	const out: FlatNode[] = [];
	let next = 0;
	const walk = (n: Expr, depth: number, prefix: string): void => {
		const id = next++;
		switch (n.kind) {
			case "lit":
				out.push({
					id,
					depth,
					kind: "lit",
					label: prefix + JSON.stringify(n.value),
				});
				return;
			case "ref":
				out.push({ id, depth, kind: "ref", label: prefix + n.path });
				return;
			case "call":
				out.push({ id, depth, kind: "call", label: prefix + n.fn });
				for (const a of n.args) walk(a, depth + 1, "");
				return;
			case "obj":
				out.push({ id, depth, kind: "obj", label: prefix + "{…}" });
				for (const [k, v] of Object.entries(n.fields))
					walk(v, depth + 1, `${k}: `);
				return;
			case "arr":
				out.push({ id, depth, kind: "arr", label: prefix + "[…]" });
				for (const it of n.items) walk(it, depth + 1, "");
				return;
		}
	};
	walk(e, 0, "");
	return out;
}

/** Look up a seeded sample by id (throws if absent — no non-null assertion). */
export function sampleById(id: string): ExprSample {
	const s = SAMPLES.find((x) => x.id === id);
	if (!s) throw new Error(`no sample with id "${id}"`);
	return s;
}

/** The evaluated result of a sample, as a display string. */
export function sampleResult(s: ExprSample): string {
	const v = evaluate(s.ast, s.env);
	return JSON.stringify(v);
}
