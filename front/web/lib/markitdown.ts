// markitdown.ts — the DETERMINISTIC TS twin of the MK02 DocConverter port
// (back/runtime/markitdown/markitdown.go, ADR 0039). The Workbench /ingestion panel runs THIS pure
// function FROM THE SCREEN — the same HTML→markdown transform the Go HTMLConverter runs: no I/O, no
// clock, no rng, no LLM. The markdown on screen matches the engine, byte-for-byte.
//
// THE WALL (CLAUDE.md §2): pure, below the line. It reads the document bytes it is handed and
// returns markdown; it writes NO truth. The markdown becomes a candidate-truth (an idea draft) at
// MK03 — ingestion PROPOSES, never freezes.
//
// DETERMINISM-FIRST: same (bytes, mime) → same markdown (proven by markitdown.test.ts, fast-check).
// A converter is a deterministic transform — code, never an LLM.

export type Mime = "text/html";

export const MIME_HTML: Mime = "text/html";

// toMarkdown is the TS twin of HTMLConverter.ToMarkdown. Total: an unsupported mime yields "".
export function toMarkdown(raw: string, mime: string): string {
	if (mime !== MIME_HTML) return "";
	return htmlToMarkdown(raw);
}

// htmlToMarkdown mirrors the Go pipeline order EXACTLY (that order IS the determinism):
// drop chrome → inline spans FIRST → headings → lists → tables → strip → unescape → collapse.
function htmlToMarkdown(raw: string): string {
	let s = raw;
	s = dropElements(s, ["script", "style", "head"]);
	s = normalizeWhitespace(dropElements(s, ["nav", "footer"]));

	s = convertInline(s);

	s = convertHeadings(s);
	s = convertLists(s);
	s = convertTables(s);
	s = stripRemainingTags(s);
	s = unescapeEntities(s);
	return `${collapseBlankLines(s.trim())}\n`;
}

const reTag = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
const reHeading = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
const reListItem = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
const reUL = /<ul\b[^>]*>([\s\S]*?)<\/ul>/gi;
const reOL = /<ol\b[^>]*>([\s\S]*?)<\/ol>/gi;
const reRow = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const reCell = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
const reTable = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const reStrong = /<(strong|b)\b[^>]*>([\s\S]*?)<\/(strong|b)>/gi;
const reEm = /<(em|i)\b[^>]*>([\s\S]*?)<\/(em|i)>/gi;
const reCode = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
const reLink = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
const reBlankLines = /\n{3,}/g;
const reInnerSpaces = /[ \t]+/g;

function dropElements(s: string, names: string[]): string {
	let out = s;
	for (const n of names) {
		const re = new RegExp(`<${n}\\b[^>]*>[\\s\\S]*?</${n}>`, "gi");
		out = out.replace(re, "");
	}
	return out;
}

function convertHeadings(s: string): string {
	return s.replace(reHeading, (_m, lvl: string, inner: string) => {
		const hashes = "#".repeat(Number(lvl));
		return `\n\n${hashes} ${stripRemainingTags(inner).trim()}\n\n`;
	});
}

function convertLists(s: string): string {
	let out = s.replace(reUL, (_m, inner: string) =>
		renderList(inner, () => "- "),
	);
	out = out.replace(reOL, (_m, inner: string) =>
		renderList(inner, (i) => `${i + 1}. `),
	);
	return out;
}

function renderList(inner: string, prefix: (i: number) => string): string {
	const items = [...inner.matchAll(reListItem)];
	let b = "\n";
	items.forEach((it, i) => {
		b += `${prefix(i)}${stripRemainingTags(it[1]).trim()}\n`;
	});
	b += "\n";
	return b;
}

function convertTables(s: string): string {
	return s.replace(reTable, (_m, inner: string) => {
		const rows = [...inner.matchAll(reRow)];
		if (rows.length === 0) return "";
		let b = "\n\n";
		rows.forEach((r, ri) => {
			const cells = [...r[1].matchAll(reCell)];
			b += "|";
			for (const c of cells) {
				b += ` ${stripRemainingTags(c[1]).trim()} |`;
			}
			b += "\n";
			if (ri === 0) {
				b += "|";
				for (let k = 0; k < cells.length; k++) b += " --- |";
				b += "\n";
			}
		});
		b += "\n";
		return b;
	});
}

function convertInline(s: string): string {
	let out = s.replace(reCode, "`$1`");
	out = out.replace(reStrong, "**$2**");
	out = out.replace(reEm, "*$2*");
	out = out.replace(reLink, "[$2]($1)");
	return out;
}

function stripRemainingTags(s: string): string {
	return s.replace(reTag, "");
}

function unescapeEntities(s: string): string {
	return s
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&copy;/g, "(c)")
		.replace(/&amp;/g, "&");
}

function normalizeWhitespace(s: string): string {
	return s
		.split("\n")
		.map((l) => l.replace(reInnerSpaces, " ").replace(/[ \t]+$/g, ""))
		.join("\n");
}

function collapseBlankLines(s: string): string {
	return s
		.replace(reBlankLines, "\n\n")
		.split("\n")
		.map((l) => l.replace(/[ \t]+$/g, ""))
		.join("\n");
}

// firstHeading derives the idea-draft title from the first markdown heading (deterministic).
export function firstHeading(md: string): string {
	for (const l of md.split("\n")) {
		const t = l.trim();
		if (t.startsWith("# ")) return t.slice(2).trim();
	}
	return "(untitled ingested document)";
}

// IdeaDraft is the SHAPE the frontier produces — a candidate-truth, NOT a kernel truth. At MK03 it
// is fed to idea-intake's idea_capture. status is always "draft": ingestion freezes nothing.
export interface IdeaDraft {
	title: string;
	body: string;
	provenance: string;
	status: "draft";
}

// toIdeaDraft maps converted markdown to the idea-draft shape (deterministic). THE WALL: this is a
// proposal, never a kernel write — the human freezes later via idea → mirror → /goal.
export function toIdeaDraft(
	raw: string,
	mime: string,
	sourceName: string,
): IdeaDraft {
	const md = toMarkdown(raw, mime);
	return {
		title: firstHeading(md),
		body: md,
		provenance: `ingested document: ${sourceName} (via markitdown frontier)`,
		status: "draft",
	};
}
