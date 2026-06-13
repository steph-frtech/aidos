import { createHash } from "node:crypto";
import ts from "typescript";

/**
 * endpoint-fitness — the DP08 arch-fitness invariant
 * EMITTED_NO_HARDCODED_ENDPOINT as the TS AST PASS (A7, ADR 0066): the REAL
 * TypeScript compiler API walks the emitted tree (Hono handlers, workers,
 * boot config) and classifies every string/template literal with the
 * DECLARED closed rules — no host, URL, IP or concrete host:port may live
 * as a literal in emitted source; every endpoint flows through the DP07
 * projection (resolveConnection → process.env / requireEnv at boot —
 * SPEC-stack-2026: « AUCUNE URL/secret en dur »).
 *
 * DETERMINISM-FIRST: a pure function of the tree — same tree → same verdict
 * → same content address (the reproducibility mirror). NEVER an LLM judge.
 * The authoritative Go twin is back/runtime/endpointfitness (its lexer has
 * AST-equivalent semantics); the pinned addresses in endpoint-fitness.test.ts
 * red on one byte of divergence. The declared rule lives above the line in
 * back/runtime/agentloop/arch-fitness.json (changing it is idée → miroir →
 * /goal). THE WALL: this module measures — it writes nothing.
 */

/** RULE — the arch-fitness invariant name and BlockReason code. */
export const RULE = "EMITTED_NO_HARDCODED_ENDPOINT";

/** The CLOSED reason set, canonical order (parity with Go Reasons()). */
export const REASONS = [
	"localhost_literal",
	"ip_literal",
	"url_concrete_host",
	"host_port_literal",
] as const;
export type Reason = (typeof REASONS)[number];

export interface Finding {
	file: string;
	line: number;
	literal: string;
	reason: Reason;
}

export interface Verdict {
	rule: string;
	state: "green" | "red";
	tree_address: string;
	findings: Finding[];
}

// sentinel poisons adjacency where a template ${expr} span or a textual
// ${VAR} placeholder stood — an env-derived fragment never completes a
// concrete host. NUL never appears in real TS source.
const SENTINEL = "\u0000";

const PLACEHOLDER_RE = /\$\{[^}]*\}/g;

function stripPlaceholders(s: string): string {
	return s.replace(PLACEHOLDER_RE, SENTINEL);
}

// ---------------------------------------------------------------------------
// The classifier — the DECLARED rules (arch-fitness.json), pure and total.
// ---------------------------------------------------------------------------

const LOCALHOST_RE = /(^|[^a-z0-9_-])localhost($|[^a-z0-9_-])/i;
const IPV4_RE =
	/(^|[^0-9.])([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})($|[^0-9.])/g;

function hasIPv4(t: string, pred: (o: number[]) => boolean): boolean {
	for (const m of t.matchAll(IPV4_RE)) {
		const octets = [m[2], m[3], m[4], m[5]].map((s) => Number(s));
		if (octets.every((v) => v <= 255) && pred(octets)) return true;
	}
	return false;
}

function isAlnum(c: string): boolean {
	return /[a-zA-Z0-9]/.test(c);
}

function urlConcreteHost(t: string): boolean {
	let rest = t;
	for (;;) {
		const idx = rest.indexOf("://");
		if (idx < 0) return false;
		let authority = rest.slice(idx + 3);
		const cut = authority.search(/[/?#]/);
		if (cut >= 0) authority = authority.slice(0, cut);
		const at = authority.lastIndexOf("@");
		if (at >= 0) authority = authority.slice(at + 1);
		let host = authority;
		const colon = host.indexOf(":");
		if (colon >= 0) host = host.slice(0, colon);
		if (!host.includes(SENTINEL) && [...host].some(isAlnum)) return true;
		rest = rest.slice(idx + 3);
	}
}

function isHostChar(c: string): boolean {
	return /[a-zA-Z0-9.-]/.test(c) || c === SENTINEL;
}

function hostPortConcrete(t: string): boolean {
	for (let i = 0; i < t.length; i++) {
		if (t.charAt(i) !== ":") continue;
		let j = i + 1;
		while (j < t.length && t.charAt(j) >= "0" && t.charAt(j) <= "9") j++;
		const digits = j - i - 1;
		if (digits < 2 || digits > 5) continue;
		if (j < t.length && isHostChar(t.charAt(j))) continue;
		let k = i;
		while (k > 0 && isHostChar(t.charAt(k - 1))) k--;
		const host = t.slice(k, i);
		if (host === "" || host.includes(SENTINEL)) continue;
		// scheme-relative authorities are the URL rule's business.
		if (k >= 2 && t[k - 1] === "/" && t[k - 2] === "/") continue;
		if (/[a-zA-Z]/.test(host)) return true;
	}
	return false;
}

/**
 * classifyLiteral — the closed rules over one extracted literal. Returns the
 * FIRST matching reason in canonical order, or null when the literal passes.
 */
export function classifyLiteral(text: string): Reason | null {
	const t = stripPlaceholders(text);
	if (
		LOCALHOST_RE.test(t) ||
		hasIPv4(t, (o) => o[0] === 127 || o.every((v) => v === 0))
	) {
		return "localhost_literal";
	}
	if (hasIPv4(t, () => true)) return "ip_literal";
	if (urlConcreteHost(t)) return "url_concrete_host";
	if (hostPortConcrete(t)) return "host_port_literal";
	return null;
}

// ---------------------------------------------------------------------------
// The AST pass — the real TypeScript compiler API (A7).
// ---------------------------------------------------------------------------

interface ExtractedLiteral {
	text: string;
	line: number;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
	return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function rawOf(sf: ts.SourceFile, node: ts.TemplateLiteralLikeNode): string {
	if (node.rawText !== undefined) return node.rawText;
	const text = node.getText(sf);
	return text.slice(1, -1);
}

/**
 * extractLiterals — every string literal (its textual ${VAR} placeholders
 * sentinel-poisoned), every template literal (its raw parts joined with the
 * sentinel — the TemplateExpression semantics) and, exactly like the Go
 * twin's lexer, the literals found INSIDE template ${expr} spans.
 */
export function extractLiterals(src: string): ExtractedLiteral[] {
	const sf = ts.createSourceFile(
		"emitted.ts",
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const out: ExtractedLiteral[] = [];

	const visit = (node: ts.Node): void => {
		if (ts.isStringLiteral(node)) {
			const raw = node.getText(sf).slice(1, -1);
			out.push({ text: stripPlaceholders(raw), line: lineOf(sf, node) });
			return;
		}
		if (ts.isNoSubstitutionTemplateLiteral(node)) {
			out.push({ text: rawOf(sf, node), line: lineOf(sf, node) });
			return;
		}
		if (ts.isTemplateExpression(node)) {
			const parts = [rawOf(sf, node.head)];
			for (const span of node.templateSpans)
				parts.push(rawOf(sf, span.literal));
			out.push({ text: parts.join(SENTINEL), line: lineOf(sf, node) });
			// the literals inside ${expr} spans are still scanned (AST walk).
			for (const span of node.templateSpans) visit(span.expression);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

/** scanSource — the pass + the classifier over ONE emitted file, sorted. */
export function scanSource(path: string, src: string): Finding[] {
	const out: Finding[] = [];
	for (const lit of extractLiterals(src)) {
		const reason = classifyLiteral(lit.text);
		if (reason !== null) {
			out.push({
				file: path,
				line: lit.line,
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the sentinel is DISPLAYED as a literal ${…} env-reference marker (Go twin parity).
				literal: lit.text.replaceAll(SENTINEL, "${…}"),
				reason,
			});
		}
	}
	out.sort((a, b) =>
		a.line !== b.line
			? a.line - b.line
			: a.literal < b.literal
				? -1
				: a.literal > b.literal
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
	if (Array.isArray(v)) {
		return `[${v.map(encodeCanonical).join(",")}]`;
	}
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
 * sense — THE DP08 sensor: the deterministic verdict over a whole emitted
 * tree (path → source). Green iff NO literal in NO file is a hardcoded
 * endpoint. Pure: same tree → same verdict.
 */
export function sense(files: Record<string, string>): Verdict {
	const paths = Object.keys(files).sort();
	const findings: Finding[] = [];
	for (const p of paths) {
		findings.push(...scanSource(p, files[p] ?? ""));
	}
	const treeAddress = sha256hex(encodeCanonical({ files }));
	return {
		rule: RULE,
		state: findings.length > 0 ? "red" : "green",
		tree_address: treeAddress,
		findings,
	};
}

/** canonicalVerdict — the S02-canonical bytes of a verdict (Go twin parity). */
export function canonicalVerdict(v: Verdict): string {
	return encodeCanonical({ verdict: v });
}

/**
 * hashVerdict — the content address of the canonical verdict. MUST equal the
 * Go-authoritative address on the demo tree (pinned in the vitest mirror and
 * the Playwright e2e) — « même arbre → même verdict ».
 */
export function hashVerdict(v: Verdict): string {
	return sha256hex(canonicalVerdict(v));
}

// ---------------------------------------------------------------------------
// The demo sandbox tree — BYTE-IDENTICAL to Go DemoEmittedTree()
// (back/runtime/endpointfitness): the canonical fixture the /endpoints-
// fitness screen, the vitest mirror and the Playwright e2e all replay.
// ---------------------------------------------------------------------------

/** LEAK_PATH — the canonical fault-injection file path. */
export const LEAK_PATH = "gen/app/leak.ts";

/** LEAK_SOURCE — the canonical injected hardcoded endpoint (DP08 example). */
export const LEAK_SOURCE =
	'// FAULT INJECTION (DP08 sandbox) — the canonical hardcoded endpoint.\nexport const LEAK = "https://1.2.3.4:5432";\n';

/** DEMO_EMITTED_TREE — the canonical GREEN emitted tree (env-derived only). */
export const DEMO_EMITTED_TREE: Record<string, string> = {
	"gen/app/connections.prod.ts":
		"// Code generated by AIDOS connresolve (DP07) — DO NOT EDIT.\n" +
		"function requireEnv(name: string): string {\n" +
		"\tconst v = process.env[name];\n" +
		'\tif (v === undefined || v === "") {\n' +
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture IS emitted TS source — byte-identical to Go DemoEmittedTree().
		"\t\tthrow new Error(`MISSING_ENV_AT_BOOT: ${name}`);\n" +
		"\t}\n" +
		"\treturn v;\n" +
		"}\n" +
		"\n" +
		"export const connections = {\n" +
		// biome-ignore lint/suspicious/noTemplateCurlyInString: emitted fixture source — env-derived endpoint, byte-identical to Go.
		'\tcache: `${requireEnv("APP_NAME")}-cache:6379`,\n' +
		'\tcrm: requireEnv("CRM_MANAGED_URL"),\n' +
		// biome-ignore lint/suspicious/noTemplateCurlyInString: emitted fixture source — env-derived endpoint, byte-identical to Go.
		'\tdb: `${requireEnv("APP_NAME")}-db:5432`,\n' +
		// biome-ignore lint/suspicious/noTemplateCurlyInString: emitted fixture source — env-derived endpoint, byte-identical to Go.
		'\tserver: `https://${requireEnv("APP_SUBDOMAIN")}.${requireEnv("DOMAIN")}`,\n' +
		"};\n",
	"gen/app/worker.ts":
		"// Code generated by AIDOS (DP08 demo worker) — DO NOT EDIT.\n" +
		'import { connections } from "./connections.prod";\n' +
		"\n" +
		"export function queueTarget(): string {\n" +
		"\treturn connections.cache;\n" +
		"}\n",
};
