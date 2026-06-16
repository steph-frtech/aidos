import { createHash } from "node:crypto";
import ts from "typescript";

/**
 * twin-as-live-fitness — the T5 cliquet (anti-retour) arch-fitness invariant
 * NO_TWIN_AS_LIVE_PATH as a REAL TypeScript-compiler-API AST pass (the A7
 * precedent, ADR 0066 / DP08 endpoint-fitness): the compiler walks a panel
 * file (`app/<route>/*.tsx` | `app/<route>/actions.ts` | a `components/*Panel`
 * a panel pulls) and forbids it from producing DISPLAYED data via a
 * twin-LOGIQUE lib (a `lib/<x>.ts` that re-implements the Go, recognised by
 * its `lib/<x>-data.ts` demo sibling) OUTSIDE the demo-fallback frontier.
 *
 * THE LOCK IT WELDS (ADR 0092). The live path is ONE: the moteur Go via the
 * passerelle — lib/gateway-sdk.readVia(scope, tool, args, decoder, demo) →
 * { data, source:"live"|"demo" }. A twin-LOGIQUE re-implementation in TS is
 * NEVER the live source; a `*-data.ts` fixture is KEPT but only as the
 * deterministic demo fallback (`source:"demo"`). The cliquet WELDS each flip:
 * once a panel reads live (readVia) or via a demo-tagged fallback, a future
 * step CANNOT silently make a TS twin its live source again — the AST pass
 * reds the build.
 *
 * THE RULE (pure, total, closed). A panel imports a twin-LOGIQUE lib only:
 *   - as `import type { … }` (a type-only import pulls NO runtime logic) — OR
 *   - while the SAME file also imports the demo-fallback frontier from
 *     `@/lib/gateway-sdk` (`readVia` / `callGateway` / `decodeVia`), which
 *     forces the twin compute BEHIND a `source:"demo"` fallback.
 * A panel that makes a VALUE import of a twin WITHOUT the frontier reads the
 * twin as the LIVE path → RED (one Finding per offending import).
 *
 * Why this exact rule is load-bearing (and not over-broad): the proven cutover
 * panels (app/context-pack, app/changeset) DO value-import their twin
 * (`compile`, the *-data fixtures) — but only to build the `demoPack()` /
 * `demoEnvelopes()` fallback, and they ALSO import `readVia` + `Source` from
 * gateway-sdk. The frontier import is the deterministic witness that the twin
 * sits behind `source:"demo"`, never as the live source. A twin-as-live panel
 * (e.g. an AdoptionPanel computing displayed data from `assemble`/`plan` with
 * NO readVia) has the value import and NO frontier → it reds.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). An import-graph / AST check IS a pure
 * function — the depguard / go-arch-lint / dependency-cruiser family — so it
 * MUST be code, never an "LLM that reads the imports". `sense` is pure and
 * total: same (panels, twinNames) ⇒ same verdict ⇒ same content address (the
 * reproducibility mirror in twin-as-live-fitness.test.ts). The twin set is
 * itself derived deterministically from the filesystem (a `lib/<x>.ts` with a
 * `lib/<x>-data.ts` sibling) by `twinNamesFromLibDir`; the pure classifier
 * takes it as DATA so the verdict stays reproducible over a fixed input.
 *
 * THE WALL (CLAUDE.md §2). This module MEASURES — it writes no truth. The
 * intent ("the live path is the Go moteur, ADR 0092") is above the line; this
 * is its below-the-line deterministic projection. Softening the rule (allowing
 * a twin as a live source) is a truth change (idée → miroir → /goal), never a
 * silent edit here.
 */

/** RULE — the cliquet invariant name and BlockReason code. */
export const RULE = "NO_TWIN_AS_LIVE_PATH";

/** The CLOSED reason set, canonical order. */
export const REASONS = ["twin_value_import_without_frontier"] as const;
export type Reason = (typeof REASONS)[number];

/** The demo-fallback frontier symbols a legal panel imports from gateway-sdk. */
export const FRONTIER_SYMBOLS = [
	"readVia",
	"callGateway",
	"decodeVia",
] as const;

/** The module specifier of the one live door (ADR 0092 / S59). */
export const GATEWAY_SDK_MODULE = "@/lib/gateway-sdk";

export interface Finding {
	/** the panel file that read a twin as a live path. */
	file: string;
	/** the 1-based line of the offending import. */
	line: number;
	/** the twin-LOGIQUE lib it value-imported (the `@/lib/<x>` specifier). */
	twin: string;
	reason: Reason;
}

export interface Verdict {
	rule: string;
	state: "green" | "red";
	tree_address: string;
	findings: Finding[];
}

// ---------------------------------------------------------------------------
// The twin set — derived deterministically from the lib directory listing.
// ---------------------------------------------------------------------------

/**
 * twinNamesFromLibDir — the DETERMINISTIC twin set: a lib `<x>` is a
 * twin-LOGIQUE iff `lib/<x>.ts` AND `lib/<x>-data.ts` both exist (the demo
 * sibling is the witness that `<x>.ts` re-implements the Go and `<x>-data.ts`
 * is its demo fallback). Pure over the given listing (sorted, stable). The
 * caller supplies the real `fs.readdirSync('lib')` listing — the I/O lives at
 * the edge; this stays a pure function of the names.
 */
export function twinNamesFromLibDir(libEntries: string[]): string[] {
	const set = new Set(libEntries);
	const out: string[] = [];
	for (const name of libEntries) {
		if (!name.endsWith("-data.ts")) continue;
		const base = name.slice(0, -"-data.ts".length);
		if (set.has(`${base}.ts`)) out.push(base);
	}
	out.sort();
	return out;
}

// ---------------------------------------------------------------------------
// The AST pass — the real TypeScript compiler API.
// ---------------------------------------------------------------------------

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
	return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** A `@/lib/<x>` import normalised to its twin base name `<x>`, or null. */
function libBaseOf(spec: string): string | null {
	const prefix = "@/lib/";
	if (!spec.startsWith(prefix)) return null;
	const rest = spec.slice(prefix.length);
	// only a direct `@/lib/<x>` (no deeper path) maps to a twin name `<x>`.
	if (rest.includes("/")) return null;
	return rest;
}

interface ParsedImports {
	/** every value (non-type-only) import of a twin: twin base → import line. */
	twinValueImports: { twin: string; line: number }[];
	/** true iff the file imports any demo-fallback frontier symbol from gateway-sdk. */
	hasFrontier: boolean;
}

/**
 * parseImports — the AST walk over ONE panel file. It records, for the given
 * twin set, every VALUE import of a twin (`import { fn } from "@/lib/<x>"`,
 * `import x from "@/lib/<x>"`, `import * as x …`, or a mixed import whose
 * value bindings are non-type), SKIPPING type-only imports
 * (`import type { … }` and `import { type … }`-only). It also detects the
 * demo-fallback frontier: an import of `readVia` / `callGateway` / `decodeVia`
 * (value binding) from `@/lib/gateway-sdk`.
 */
export function parseImports(src: string, twinNames: string[]): ParsedImports {
	const twinSet = new Set(twinNames);
	const frontierSet = new Set<string>(FRONTIER_SYMBOLS);
	const sf = ts.createSourceFile(
		"panel.tsx",
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const twinValueImports: { twin: string; line: number }[] = [];
	let hasFrontier = false;

	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const spec = stmt.moduleSpecifier.text;
		const clause = stmt.importClause;
		if (clause === undefined) continue; // side-effect import — no bindings.

		// Is this a VALUE import (at least one non-type-only binding)?
		const hasValueBinding = clauseHasValueBinding(clause);

		// Frontier detection: a value import of a frontier symbol from gateway-sdk.
		if (spec === GATEWAY_SDK_MODULE && hasValueBinding) {
			if (clauseImportsAny(clause, frontierSet)) hasFrontier = true;
		}

		// Twin detection: a value import of a twin lib.
		const base = libBaseOf(spec);
		if (base !== null && twinSet.has(base) && hasValueBinding) {
			twinValueImports.push({ twin: spec, line: lineOf(sf, stmt) });
		}
	}

	return { twinValueImports, hasFrontier };
}

/** clauseHasValueBinding — true iff the import clause pulls any RUNTIME binding. */
function clauseHasValueBinding(clause: ts.ImportClause): boolean {
	if (clause.isTypeOnly) return false; // `import type … from …` — no runtime.
	// a default binding (`import x from …`) is always a value binding.
	if (clause.name !== undefined) return true;
	const bindings = clause.namedBindings;
	if (bindings === undefined) return false;
	// `import * as x from …` — a value namespace binding.
	if (ts.isNamespaceImport(bindings)) return true;
	// named: `import { a, type b } from …` — value iff at least one non-type elem.
	for (const el of bindings.elements) {
		if (!el.isTypeOnly) return true;
	}
	return false;
}

/** clauseImportsAny — true iff the clause value-imports any name in `names`. */
function clauseImportsAny(
	clause: ts.ImportClause,
	names: Set<string>,
): boolean {
	const bindings = clause.namedBindings;
	if (bindings === undefined || !ts.isNamedImports(bindings)) return false;
	for (const el of bindings.elements) {
		if (el.isTypeOnly) continue; // `import { type readVia }` is not the runtime frontier.
		if (names.has(el.name.text)) return true;
	}
	return false;
}

/** scanPanel — the rule over ONE panel file, sorted by line then twin. */
export function scanPanel(
	path: string,
	src: string,
	twinNames: string[],
): Finding[] {
	const { twinValueImports, hasFrontier } = parseImports(src, twinNames);
	// The frontier (readVia/callGateway/decodeVia) forces every twin compute
	// behind `source:"demo"` — so a twin value import is LEGAL iff the frontier
	// is present in the same file. No frontier ⇒ the twin IS the live path ⇒ RED.
	if (hasFrontier) return [];
	const out: Finding[] = twinValueImports.map((t) => ({
		file: path,
		line: t.line,
		twin: t.twin,
		reason: "twin_value_import_without_frontier" as Reason,
	}));
	out.sort((a, b) =>
		a.line !== b.line
			? a.line - b.line
			: a.twin < b.twin
				? -1
				: a.twin > b.twin
					? 1
					: 0,
	);
	return out;
}

// ---------------------------------------------------------------------------
// Canonicalization + content address (records.Canonicalize/Hash twin — S02).
// ---------------------------------------------------------------------------

function encodeCanonical(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return `[${v.map(encodeCanonical).join(",")}]`;
	if (typeof v === "object") {
		const keys = Object.keys(v as Record<string, unknown>).sort();
		const parts = keys.map(
			(k) =>
				`${JSON.stringify(k)}:${encodeCanonical((v as Record<string, unknown>)[k])}`,
		);
		return `{${parts.join(",")}}`;
	}
	return JSON.stringify(v);
}

function sha256hex(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * sense — THE T5 cliquet sensor: the deterministic verdict over a set of panel
 * files (path → source), given the twin set. Green iff NO panel reads a twin as
 * a live path. Pure: same (panels, twinNames) → same verdict.
 */
export function sense(
	panels: Record<string, string>,
	twinNames: string[],
): Verdict {
	const paths = Object.keys(panels).sort();
	const findings: Finding[] = [];
	for (const p of paths) {
		findings.push(...scanPanel(p, panels[p] ?? "", twinNames));
	}
	const treeAddress = sha256hex(encodeCanonical({ panels, twinNames }));
	return {
		rule: RULE,
		state: findings.length > 0 ? "red" : "green",
		tree_address: treeAddress,
		findings,
	};
}

/** canonicalVerdict — the S02-canonical bytes of a verdict. */
export function canonicalVerdict(v: Verdict): string {
	return encodeCanonical({ verdict: v });
}

/** hashVerdict — the content address of the canonical verdict. */
export function hashVerdict(v: Verdict): string {
	return sha256hex(canonicalVerdict(v));
}

// ---------------------------------------------------------------------------
// The demo sandbox — the canonical double-sided fault-injection fixture.
// ---------------------------------------------------------------------------

/** The twin set the sandbox panels reference (a fixed, minimal set). */
export const DEMO_TWIN_NAMES = ["adoption", "context-pack"];

/**
 * RED_PANEL — the canonical fault-injection panel: it value-imports a
 * twin-LOGIQUE lib (`assemble`, `plan` from `@/lib/adoption`) and computes
 * DISPLAYED data with NO readVia / NO source:"demo" frontier → the twin IS the
 * live path. The cliquet must RED this.
 */
export const RED_PANEL_PATH = "app/__cliquet_red__/page.tsx";
export const RED_PANEL_SOURCE =
	"// FAULT INJECTION (T5 cliquet) — a twin read AS the live path.\n" +
	'import { assemble, plan } from "@/lib/adoption";\n' +
	'import { SCENARIOS } from "@/lib/adoption-data";\n' +
	"\n" +
	"export default function Page() {\n" +
	"\tconst pl = plan(SCENARIOS[0]);\n" +
	"\tconst pack = assemble(pl);\n" +
	"\treturn <pre>{JSON.stringify(pack)}</pre>;\n" +
	"}\n";

/**
 * GREEN_PANEL_FRONTIER — a legal panel: it value-imports a twin (`compile` from
 * `@/lib/context-pack`) ONLY to build a demo fallback, and ALSO imports the
 * demo-fallback frontier (`readVia`, `Source`) from gateway-sdk — the twin
 * compute sits behind `source:"demo"`. The cliquet PASSES this (mirrors the
 * proven app/context-pack/actions.ts cutover).
 */
export const GREEN_FRONTIER_PATH = "app/__cliquet_green_live__/actions.ts";
export const GREEN_FRONTIER_SOURCE =
	'"use server";\n' +
	'import { compile } from "@/lib/context-pack";\n' +
	'import { CHECKOUT_GOAL, CHECKOUT_GRAPH } from "@/lib/context-pack-data";\n' +
	'import { readVia, type Source } from "@/lib/gateway-sdk";\n' +
	'import { panelScope } from "@/lib/panelScope";\n' +
	"\n" +
	"export async function live(): Promise<{ source: Source }> {\n" +
	"\tconst scope = await panelScope();\n" +
	'\tconst demo = compile(CHECKOUT_GOAL, "main", CHECKOUT_GRAPH);\n' +
	'\tconst { source } = await readVia(scope, "context_pack_get", {}, () => null, demo);\n' +
	"\treturn { source };\n" +
	"}\n";

/**
 * GREEN_PANEL_TYPEONLY — a legal panel: it imports a twin's TYPES only
 * (`import type { … }`) — no runtime logic is pulled, so it is NOT a live-path
 * read. The cliquet PASSES this (mirrors app/context-pack/page.tsx).
 */
export const GREEN_TYPEONLY_PATH = "app/__cliquet_green_type__/page.tsx";
export const GREEN_TYPEONLY_SOURCE =
	'import type { AdoptionPlan } from "@/lib/adoption";\n' +
	'import { liveContextPack } from "@/lib/some-actions";\n' +
	"\n" +
	"export default async function Page() {\n" +
	"\tconst v: { plan?: AdoptionPlan } = await liveContextPack();\n" +
	"\treturn <pre>{JSON.stringify(v)}</pre>;\n" +
	"}\n";

/** DEMO_GREEN_PANELS — the canonical GREEN sandbox (both legal forms). */
export const DEMO_GREEN_PANELS: Record<string, string> = {
	[GREEN_FRONTIER_PATH]: GREEN_FRONTIER_SOURCE,
	[GREEN_TYPEONLY_PATH]: GREEN_TYPEONLY_SOURCE,
};

/** DEMO_RED_PANELS — the GREEN sandbox PLUS the injected twin-as-live panel. */
export const DEMO_RED_PANELS: Record<string, string> = {
	...DEMO_GREEN_PANELS,
	[RED_PANEL_PATH]: RED_PANEL_SOURCE,
};
