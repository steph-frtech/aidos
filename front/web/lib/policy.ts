/**
 * The Policy DSL — the Workbench /policy projection source (AIDOS step S09).
 *
 * AUTHORIZATION-AS-ARTIFACT (KRD §24.4, §93): a policy is a TYPED rule tree —
 * combinators all/any/not over comparison leaves (eq/gt/lt) and predicates
 * exists/matches on a $-rooted selector — with a scope (RESOURCE/OPERATION/
 * ENTITY/FIELD) and an effect (ALLOW/DENY), stored content-addressed in
 * kernel.policy, never free code. This module holds the DECLARED description of
 * that shape (the rule kinds, the scopes — field-for-field with
 * back/kernel/policy), the §93 canPlaceOrder anchor, and a tiny deterministic
 * evaluator that mirrors Go's policy.Eval for sample contexts — so the /policy
 * panel renders the rule tree and its ALLOW/DENY verdict before the live
 * kernel.policy SELECT wiring lands.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static registry + a pure evaluator (no
 * clock, no rng, no I/O). The reproducibility mirror lib/policy.test.ts pins the
 * rule-kind set, the scope set, and the sample verdicts against the Go invariants
 * (canPlaceOrder ALLOW iff the three §93 conditions, else DENY).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /policy is a visualization; it
 * projects kernel.policy (SELECT-only role), it does not write truth and exposes
 * no capability — a Policy AST is written only by the aidos CLI through an
 * approved ChangeSet. There is no headless capability hidden here; read-only is
 * correct.
 */

/** The eight rule-node kinds (matches policy.go ruleKinds, canonical order). */
export const RULE_KINDS = [
	"all",
	"any",
	"not",
	"eq",
	"gt",
	"lt",
	"exists",
	"matches",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** The four scopes (matches policy.go scopes, canonical order). */
export const SCOPES = ["RESOURCE", "OPERATION", "ENTITY", "FIELD"] as const;
export type Scope = (typeof SCOPES)[number];

/** The effect of a policy: ALLOW gates, DENY blocks (KRD §24.4). */
export type Effect = "ALLOW" | "DENY";
/** A total decision (KRD §93: every ALLOW passes; any DENY blocks). */
export type Decision = "ALLOW" | "DENY";

/** An operand: a $-rooted selector or a literal value. */
export type Operand =
	| { kind: "sel"; path: string }
	| { kind: "lit"; value: string | number | boolean | null };

/** A rule-tree node — a discriminated union, the closed grammar. */
export type Rule =
	| { kind: "all"; children: Rule[] }
	| { kind: "any"; children: Rule[] }
	| { kind: "not"; child: Rule }
	| { kind: "eq"; left: Operand; right: Operand }
	| { kind: "gt"; left: Operand; right: Operand }
	| { kind: "lt"; left: Operand; right: Operand }
	| { kind: "exists"; sel: string }
	| { kind: "matches"; sel: string; pattern: string };

/** A typed Policy (matches the Go Policy struct). */
export interface Policy {
	name: string;
	scope: Scope;
	target: string;
	rule: Rule;
	effect: Effect;
}

/** Is k one of the eight rule kinds? (mirrors policy.IsRuleKind). */
export function isRuleKind(k: string): k is RuleKind {
	return (RULE_KINDS as readonly string[]).includes(k);
}

/** Is s one of the four scopes? (mirrors policy.IsScope). */
export function isScope(s: string): s is Scope {
	return (SCOPES as readonly string[]).includes(s);
}

/** A $-rooted ctx value tree (mirrors the Go Ctx data under "$"). */
export type CtxData = Record<string, unknown>;

/**
 * The KRD §93 anchor policy canPlaceOrder, VERBATIM (no invented rule):
 *   scope OPERATION "createOrder", effect ALLOW,
 *   rule all([ exists($.auth.user),
 *              eq($.cart.userId, $.auth.user.id),
 *              gt($.cart.items.length, 0) ]).
 */
export const CAN_PLACE_ORDER: Policy = {
	name: "canPlaceOrder",
	scope: "OPERATION",
	target: "createOrder",
	effect: "ALLOW",
	rule: {
		kind: "all",
		children: [
			{ kind: "exists", sel: "$.auth.user" },
			{
				kind: "eq",
				left: { kind: "sel", path: "$.cart.userId" },
				right: { kind: "sel", path: "$.auth.user.id" },
			},
			{
				kind: "gt",
				left: { kind: "sel", path: "$.cart.items.length" },
				right: { kind: "lit", value: 0 },
			},
		],
	},
};

/** Resolve a $-rooted dotted path; ".length" yields an array/string length. */
function resolveSelector(path: string, root: unknown): unknown {
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

function resolveOperand(o: Operand, root: unknown): unknown {
	return o.kind === "sel" ? resolveSelector(o.path, root) : o.value;
}

function asNumber(v: unknown): number | undefined {
	return typeof v === "number" ? v : undefined;
}

/**
 * holds reports whether a rule tree holds under the ctx root. Mirrors Go's
 * policy.Holds: a failed selector / type mismatch makes a leaf NOT hold (totality),
 * never throws.
 */
export function holds(r: Rule, root: unknown): boolean {
	switch (r.kind) {
		case "all":
			return r.children.every((c) => holds(c, root));
		case "any":
			return r.children.some((c) => holds(c, root));
		case "not":
			return !holds(r.child, root);
		case "eq": {
			const l = resolveOperand(r.left, root);
			const rt = resolveOperand(r.right, root);
			const ln = asNumber(l);
			const rn = asNumber(rt);
			if (ln !== undefined && rn !== undefined) return ln === rn;
			return l === rt;
		}
		case "gt":
		case "lt": {
			const ln = asNumber(resolveOperand(r.left, root));
			const rn = asNumber(resolveOperand(r.right, root));
			if (ln === undefined || rn === undefined) return false;
			return r.kind === "gt" ? ln > rn : ln < rn;
		}
		case "exists": {
			const v = resolveSelector(r.sel, root);
			return v !== undefined && v !== null;
		}
		case "matches": {
			const v = resolveSelector(r.sel, root);
			if (typeof v !== "string") return false;
			try {
				return new RegExp(r.pattern).test(v);
			} catch {
				return false;
			}
		}
	}
}

/**
 * evaluate applies the §93 combination law via the policy's effect gate, returning
 * a total Decision. Mirrors Go's policy.Eval: ALLOW iff the rule holds (for an
 * ALLOW gate), else DENY; a DENY gate blocks iff the rule holds, else ALLOW.
 * The ctx is the value UNDER "$" (callers pass the root tree directly).
 */
export function evaluate(p: Policy, root: CtxData): Decision {
	const held = holds(p.rule, root);
	if (p.effect === "ALLOW") return held ? "ALLOW" : "DENY";
	return held ? "DENY" : "ALLOW";
}

/**
 * canonicalize serializes a Policy to the SAME canonical JSON bytes as Go's
 * policy.Canonicalize (keys statically sorted at every level, arrays in order, no
 * insignificant whitespace). It is the byte source of the content-address, so the
 * id the panel shows matches the kernel.policy id Go computes. Determinism-first:
 * a pure string transform, no I/O.
 */
export function canonicalize(p: Policy): string {
	const operand = (o: Operand): string =>
		o.kind === "sel"
			? `{"kind":"sel","path":${JSON.stringify(o.path)}}`
			: `{"kind":"lit","value":${JSON.stringify(o.value)}}`;
	const rule = (r: Rule): string => {
		switch (r.kind) {
			case "all":
			case "any":
				return `{"children":[${r.children.map(rule).join(",")}],"kind":${JSON.stringify(r.kind)}}`;
			case "not":
				return `{"child":${rule(r.child)},"kind":"not"}`;
			case "eq":
			case "gt":
			case "lt":
				return `{"kind":"compare","left":${operand(r.left)},"op":${JSON.stringify(r.kind)},"right":${operand(r.right)}}`;
			case "exists":
				return `{"kind":"exists","sel":${JSON.stringify(r.sel)}}`;
			case "matches":
				return `{"kind":"matches","pattern":${JSON.stringify(r.pattern)},"sel":${JSON.stringify(r.sel)}}`;
		}
	};
	return `{"effect":${JSON.stringify(p.effect)},"kind":"policy","name":${JSON.stringify(p.name)},"rule":${rule(p.rule)},"scope":${JSON.stringify(p.scope)},"target":${JSON.stringify(p.target)}}`;
}

/** One seeded authorization sample: a ctx and the verdict it should produce. */
export interface PolicySample {
	id: string;
	/** FR-first label (ADR 0011) — what this context represents. */
	role: string;
	ctx: CtxData;
}

/**
 * The seeded sample contexts the /policy panel evaluates against canPlaceOrder.
 * They are the fixture-mirror rows, so the panel shows exactly what the Go fixture
 * proves: an authed user with a matching non-empty cart → ALLOW; a broken
 * condition → DENY.
 */
export const SAMPLES: readonly PolicySample[] = [
	{
		id: "allow-authed-matching-cart",
		role: "Un utilisateur connecté, propriétaire d'un panier non vide → ALLOW.",
		ctx: {
			auth: { user: { id: "u1" } },
			cart: { userId: "u1", items: [{ id: 1 }] },
		},
	},
	{
		id: "deny-no-auth",
		role: "Aucun utilisateur connecté → DENY (la première règle, exists, échoue).",
		ctx: { auth: {}, cart: { userId: "u1", items: [{ id: 1 }] } },
	},
	{
		id: "deny-empty-cart",
		role: "Panier vide → DENY (la règle gt($.cart.items.length, 0) échoue).",
		ctx: { auth: { user: { id: "u1" } }, cart: { userId: "u1", items: [] } },
	},
] as const;

/** Look up a seeded sample by id (throws if absent — no non-null assertion). */
export function sampleById(id: string): PolicySample {
	const s = SAMPLES.find((x) => x.id === id);
	if (!s) throw new Error(`no policy sample with id "${id}"`);
	return s;
}

/** The decision of a sample against canPlaceOrder, as a display string. */
export function sampleDecision(s: PolicySample): Decision {
	return evaluate(CAN_PLACE_ORDER, s.ctx);
}

/** A flat node list of a rule tree (depth-first), for the tree rendering. */
export interface FlatRule {
	/** Stable depth-first position, unique within one flattened tree (React key). */
	id: number;
	depth: number;
	kind: RuleKind;
	/** A one-line, human label of the node. */
	label: string;
}

function operandLabel(o: Operand): string {
	return o.kind === "sel" ? o.path : JSON.stringify(o.value);
}

export function flatten(rule: Rule): FlatRule[] {
	const out: FlatRule[] = [];
	let next = 0;
	const walk = (n: Rule, depth: number): void => {
		const id = next++;
		switch (n.kind) {
			case "all":
			case "any":
				out.push({ id, depth, kind: n.kind, label: `${n.kind}([…])` });
				for (const c of n.children) walk(c, depth + 1);
				return;
			case "not":
				out.push({ id, depth, kind: "not", label: "not(…)" });
				walk(n.child, depth + 1);
				return;
			case "eq":
			case "gt":
			case "lt":
				out.push({
					id,
					depth,
					kind: n.kind,
					label: `${operandLabel(n.left)} ${n.kind} ${operandLabel(n.right)}`,
				});
				return;
			case "exists":
				out.push({ id, depth, kind: "exists", label: `exists(${n.sel})` });
				return;
			case "matches":
				out.push({
					id,
					depth,
					kind: "matches",
					label: `matches(${n.sel}, ${JSON.stringify(n.pattern)})`,
				});
				return;
		}
	};
	walk(rule, 0);
	return out;
}
