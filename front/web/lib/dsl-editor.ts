/**
 * dsl-editor — the S77 front twin of back/kernel/dsleditor (dsleditor.go). The TYPED DSL EDITOR over
 * the four behaviour DSLs — Operation (validate/authorize/read/mutate/return, incl. async/scheduled of
 * S73), Policy (the recursive ALLOW/DENY tree), and the verticale Control+Action
 * (visible_when/enabled_when/triggers → invoke operation). Every edit is a TYPED FORM (no free code)
 * that a PURE parser turns into the existing DSL types, validates, and PROPOSES as a DRAFT ChangeSet.
 *
 * NO FORK (ADR 0007): it IMPORTS the existing DSL libs (lib/policy, lib/operation, lib/control) — it
 * does NOT re-implement a DSL. It adds ONLY the S77 concerns: the no-free-code law, the typed parse
 * verdict, and proposeEdit (a DRAFT changeset). The authoritative content-addressed id is the Go one;
 * the front carries a stable handle.
 *
 * THE WALL (CLAUDE.md §2/§7): this module writes NOTHING. proposeEdit returns a Proposal VALUE — a
 * DRAFT ChangeSet (status always DRAFT, wrote_kernel false, no applied_at). The screen PROPOSES;
 * freezing into the kernel goes through the wall (propose → ChangeSet → /goal → approval).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): parseDoc + proposeEdit are PURE + TOTAL — same input → identical
 * output. Parsing DSL = pure function. dsl-editor.test.ts pins it (Vitest + fast-check).
 *
 * THE TWIN IS THE DEMO, NOT THE LIVE PATH (ADR 0092 batch-3). Since the kill-twins flip, the
 * /dsl-editor panel reads the LIVE proposal from the Go dsl-editor MCP server through the passerelle
 * (`readVia(scope, "dsl_propose", …)`); this module's parseDoc/proposeEdit/kinds are KEPT only as the
 * deterministic DEMO-FALLBACK compute (driven by lib/dsl-editor-data.ts, the `source:"demo"` path).
 * The presence of the `lib/dsl-editor-data.ts` sibling is what makes the T5 cliquet
 * (twin-as-live-fitness) classify this lib as a twin — guarding the flip (the panel reads via the
 * readVia frontier, the twin never sits on the live path again). The Go dsleditor.ParseDoc /
 * ProposeEdit is the authoritative implementation; this twin mirrors it.
 */

import { createHash } from "node:crypto";

/** Kind — the closed set of editable DSLs (twin of dsleditor.Kind). */
export const DSL_KINDS = ["operation", "policy", "control", "action"] as const;
export type DslKind = (typeof DSL_KINDS)[number];

/** kinds returns the four editable DSL kinds in canonical order. PURE. */
export function kinds(): DslKind[] {
	return [...DSL_KINDS];
}

export function isKind(s: string): s is DslKind {
	return (DSL_KINDS as readonly string[]).includes(s);
}

export const ERR_UNKNOWN_KIND =
	"dsleditor: kind is not one of the four editable DSLs (no free-code kind)";
export const ERR_FREE_CODE =
	"dsleditor: a typed editor forbids free code (no code/script/eval field, KRD §24)";
export const ERR_EMPTY_NAME = "dsleditor: doc has no name";
export const ERR_BAD_BODY = "dsleditor: typed body does not parse for its kind";

/** DslDoc — one typed editor document (twin of dsleditor.DslDoc). No `code` field — body IS the DSL. */
export interface DslDoc {
	kind: DslKind;
	name: string;
	body: Record<string, unknown>;
	knownActions?: string[];
	knownControls?: string[];
	knownOperations?: string[];
}

// canonicalEncode re-encodes a JSON value with object keys sorted recursively (the same scheme the Go
// records.Canonicalize uses) — so the canonical handle is a stable content address. PURE.
function canonicalEncode(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const o = v as Record<string, unknown>;
		const keys = Object.keys(o).sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalEncode(o[k])}`).join(",")}}`;
	}
	return JSON.stringify(v);
}

/** hasFreeCode reports whether a body smuggles a free-code escape (a code/script/eval field). PURE. */
export function hasFreeCode(body: Record<string, unknown>): boolean {
	return (
		Object.hasOwn(body, "code") ||
		Object.hasOwn(body, "script") ||
		Object.hasOwn(body, "eval")
	);
}

export interface Parsed {
	kind: DslKind;
	name: string;
	canonical: string; // canonical encoding of the typed body (a stable content handle)
}

export interface ParseResult {
	ok: boolean;
	error?: string;
	parsed?: Parsed;
}

/**
 * parseDoc — the PURE, TOTAL parse of a typed editor doc. It rejects an unknown kind, a free-code
 * escape, an empty name, and a body missing the kind's required typed fields. Same doc ⇒ same Parsed.
 * Parsing DSL = pure function (the done-criterion). Twin of dsleditor.ParseDoc.
 */
export function parseDoc(d: DslDoc): ParseResult {
	if (!isKind(d.kind))
		return { ok: false, error: `${ERR_UNKNOWN_KIND}: "${d.kind}"` };
	if (!d.name) return { ok: false, error: ERR_EMPTY_NAME };
	if (hasFreeCode(d.body)) return { ok: false, error: ERR_FREE_CODE };
	const shapeErr = checkShape(d.kind, d.body);
	if (shapeErr) return { ok: false, error: `${ERR_BAD_BODY}: ${shapeErr}` };
	const body = { ...d.body, name: d.name };
	return {
		ok: true,
		parsed: { kind: d.kind, name: d.name, canonical: canonicalEncode(body) },
	};
}

// checkShape verifies the typed body carries the closed-grammar fields its kind needs — never a free
// string. Returns a message or null. PURE (mirrors the Go DSL parsers' typed rejections).
function checkShape(
	kind: DslKind,
	body: Record<string, unknown>,
): string | null {
	switch (kind) {
		case "operation": {
			const steps = body.steps;
			if (!Array.isArray(steps))
				return "operation body needs a typed `steps` list";
			const verbs = [
				"validate",
				"authorize",
				"read",
				"mutate",
				"branch",
				"return",
			];
			for (const s of steps as Array<Record<string, unknown>>) {
				if (!verbs.includes(String(s.kind)))
					return `unknown step verb "${s.kind}" (closed grammar)`;
			}
			return null;
		}
		case "policy": {
			const scopes = ["RESOURCE", "OPERATION", "ENTITY", "FIELD"];
			if (!scopes.includes(String(body.scope)))
				return `unknown scope "${body.scope}" (closed set)`;
			if (body.effect !== "ALLOW" && body.effect !== "DENY")
				return `unknown effect "${body.effect}"`;
			if (!body.rule || typeof body.rule !== "object")
				return "policy body needs a typed `rule` tree";
			return null;
		}
		case "control": {
			if (!body.view) return "control body needs a `view`";
			if (!body.visible_when || !body.enabled_when)
				return "control body needs visible_when + enabled_when";
			return null;
		}
		case "action": {
			const on = body.on as Record<string, unknown> | undefined;
			if (!on || on.kind !== "click")
				return "action body needs on: { kind: click, control }";
			if (!body.invoke) return "action body needs an `invoke` operation ref";
			return null;
		}
	}
}

/** A minimal ChangeSet shape (mirrors Go changeset.ChangeSet, the fields the screen reads). */
export interface ChangeSetView {
	label: string;
	status: "DRAFT";
	parent_phase: string;
	wrote_kernel: false;
	spec_delta: { kind: string; target: string; body: string };
	mirror_delta: { kind: string; target: string };
}

export interface Proposal {
	ok: boolean;
	error?: string;
	parsed?: Parsed;
	changeset?: ChangeSetView;
}

/**
 * proposeEdit — parse the typed edit and wrap its canonical AST into a `proposed` (DRAFT) ChangeSet
 * carrying a project-scoped spec_delta + a mirror_delta (completeness law). It NEVER applies (status
 * always DRAFT, wrote_kernel false) — the wall. A reject discards this DRAFT; the kernel is never
 * touched. Twin of dsleditor.ProposeEdit.
 */
export function proposeEdit(d: DslDoc, parentPhase: string): Proposal {
	const r = parseDoc(d);
	if (!r.ok || !r.parsed) return { ok: false, error: r.error };
	const target = `dsl-edit@${r.parsed.kind}:${r.parsed.name}`;
	const bodyHash = createHash("sha256")
		.update(r.parsed.canonical)
		.digest("hex");
	return {
		ok: true,
		parsed: r.parsed,
		changeset: {
			label: `dsleditor: propose ${r.parsed.kind} edit "${r.parsed.name}"`,
			status: "DRAFT",
			parent_phase: parentPhase,
			wrote_kernel: false,
			spec_delta: { kind: "add", target, body: bodyHash },
			mirror_delta: { kind: "add", target: `${target}#mirror` },
		},
	};
}
