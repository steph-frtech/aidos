/**
 * The Tooling-Projection projection — the Workbench /tool-projection source (AIDOS step FK15).
 *
 * KRD FKE-20 / ROADMAP FK15 part (a): CLAUDE.md / AGENTS.md / .cursorrules / memory-bank EMITTED
 * from the kernel sources (policy / memory / style / architecture / agent-profile), never
 * hand-edited (hash-protected, drift detected by source-hash). The tooling files are DERIVED VIEWS
 * — the truth is the kernel sources; the files are projections (like Go structs / DDL / TS types).
 *
 * This module is the DECLARED projection of the Go package back/kernel/toolproject — the SAME five
 * closed source kinds, the SAME four closed targets, the SAME three drift kinds (HAND_EDITED /
 * MISSING_MARKER / STALE_HASH), the SAME deterministic render — so the /tool-projection panel emits
 * exactly as the Go Emit computes. One source, no drift.
 *
 * THE STORAGE FORK (the SAME FK14 decided): a tooling source rides inside a content-addressed
 * kernel.link body (link_kind:"tooling"), NOT a new record kind. serializeBody mirrors the Go body
 * shape (the sources emitted in the closed kind order + id order, so the body is order-independent).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O,
 * NO LLM — so the same kernel always yields byte-identical files. The judge is a deterministic render
 * + a byte comparison, never a prompt. The reproducibility mirror lib/tool-projection.test.ts
 * (fast-check) pins: same kernel → byte-identical files, drift ⇔ a hand-edit, order-independence.
 *
 * NOTE on the source-hash: the panel uses a deterministic in-browser digest (FNV-1a over the
 * canonical body) so the projection + drift detection are self-consistent in the UI. The AUTHORITATIVE
 * hash is the Go SHA-256 (the kernel record's content address); the panel demonstrates the projection.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /tool-projection EMITS + DETECTS DRIFT; it never
 * writes truth. Freezing/updating a ToolingKernel goes via propose → /goal → approval, never here.
 */

/** The tooling link-kind discriminator (mirrors the Go body's link_kind:"tooling"). */
export const TOOLING_KIND = "tooling" as const;

/** The five closed source kinds, in canonical order (FKE-20). The order is the contract. */
export const SOURCE_KINDS = [
	"policy",
	"memory",
	"style",
	"architecture",
	"agent-profile",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/** isKnownKind reports whether k is one of the five closed source kinds. */
export function isKnownKind(k: string): k is SourceKind {
	return (SOURCE_KINDS as readonly string[]).includes(k);
}

/** kindIndex is the canonical position of a source kind (unknown kinds sort last). */
export function kindIndex(k: string): number {
	const i = (SOURCE_KINDS as readonly string[]).indexOf(k);
	return i === -1 ? SOURCE_KINDS.length : i;
}

/** The four closed tooling targets, in canonical order (FKE-20). */
export const TARGETS = [
	"CLAUDE.md",
	"AGENTS.md",
	".cursorrules",
	"memory-bank.md",
] as const;

export type Target = (typeof TARGETS)[number];

/** A Source is one kernel-source the tooling files are projected from. */
export type Source = {
	kind: SourceKind;
	id: string;
	title: string;
	body: string;
};

/** A ToolingKernel bundles the kernel sources the tooling files are emitted from. */
export type ToolingKernel = {
	project: string;
	sources: Source[];
};

/** The closed reason an on-disk tooling file is out of projection (mirrors toolproject.DriftKind). */
export type DriftKind = "HAND_EDITED" | "MISSING_MARKER" | "STALE_HASH";

/** A Drift is one out-of-projection tooling file. */
export type Drift = {
	target: Target;
	kind: DriftKind;
	expected?: string;
};

/** A validation refusal (mirrors toolproject.Err*). */
export type ValidateError = "NO_PROJECT" | "UNKNOWN_KIND" | "EMPTY_ID" | null;

/** validate checks a ToolingKernel's shape; returns null when valid, else the closed refusal code. */
export function validate(k: ToolingKernel): ValidateError {
	if (!k.project.trim()) return "NO_PROJECT";
	for (const s of k.sources) {
		if (!isKnownKind(s.kind)) return "UNKNOWN_KIND";
		if (!s.id.trim()) return "EMPTY_ID";
	}
	return null;
}

/** sortedSourcesOfKind returns the sources of a kind in a STABLE order (by id). */
export function sortedSourcesOfKind(
	k: ToolingKernel,
	kind: SourceKind,
): Source[] {
	return k.sources
		.filter((s) => s.kind === kind)
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** renderSection renders a titled list of sources as markdown bullets (empty when none). */
function renderSection(heading: string, sources: Source[]): string {
	if (sources.length === 0) return "";
	let out = `\n## ${heading}\n\n`;
	for (const s of sources) {
		out += `- **${s.title}** (\`${s.id}\`): ${s.body}\n`;
	}
	return out;
}

/**
 * serializeBody renders the content-addressed kernel.link body carrying the ToolingKernel — the
 * storage fork (a tooling rides inside a kernel.link body, link_kind:"tooling"). The sources are
 * emitted in the closed kind order + id order so the body is independent of array order. Mirrors the
 * Go SerializeBody body shape.
 */
export function serializeBody(k: ToolingKernel): string {
	const srcs: Source[] = [];
	for (const kind of SOURCE_KINDS) {
		for (const s of sortedSourcesOfKind(k, kind)) {
			srcs.push({ kind: s.kind, id: s.id, title: s.title, body: s.body });
		}
	}
	return JSON.stringify({
		kind: "link",
		link_kind: TOOLING_KIND,
		project: k.project,
		sources: srcs,
	});
}

/**
 * sourceHash is a deterministic digest of the kernel's canonical body (FNV-1a over serializeBody) —
 * the file's source-hash. Independent of array order (serializeBody normalises it). A hand-edit
 * changes the FILE bytes but not the source-hash, so detectDrift catches it. Pure: same kernel ⇒
 * same hash. (The authoritative cross-language hash is the Go SHA-256; this panel digest is
 * self-consistent for the UI's projection + drift detection.)
 */
export function sourceHash(k: ToolingKernel): string {
	const body = serializeBody(k);
	let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

const MARKER_PREFIX = "<!-- AIDOS-TOOLING-SOURCE-HASH: ";

/** emitBody renders the markdown BODY of a target (without the footer) from the kernel sources. */
function emitBody(k: ToolingKernel, t: Target): string {
	switch (t) {
		case "CLAUDE.md":
			return (
				`# ${k.project} — Agent Contract\n` +
				`\n> Generated from the kernel sources. Do not hand-edit (hash-protected, FK15).\n` +
				renderSection("Policies", sortedSourcesOfKind(k, "policy")) +
				renderSection("Architecture", sortedSourcesOfKind(k, "architecture")) +
				renderSection("Style", sortedSourcesOfKind(k, "style"))
			);
		case "AGENTS.md":
			return (
				`# ${k.project} — Agents\n` +
				`\n> Generated from the kernel agent-profile sources. Do not hand-edit (FK15).\n` +
				renderSection("Agent profiles", sortedSourcesOfKind(k, "agent-profile"))
			);
		case ".cursorrules":
			return (
				`# ${k.project} — Cursor rules\n` +
				`\n> Generated from the kernel policy + style sources. Do not hand-edit (FK15).\n` +
				renderSection("Rules", sortedSourcesOfKind(k, "policy")) +
				renderSection("Style", sortedSourcesOfKind(k, "style"))
			);
		case "memory-bank.md":
			return (
				`# ${k.project} — Memory bank\n` +
				`\n> Generated from the kernel memory sources. Do not hand-edit (FK15).\n` +
				renderSection("Durable facts", sortedSourcesOfKind(k, "memory"))
			);
	}
}

/**
 * emit renders ONE tooling file from the kernel sources, deterministically, with the hash-protection
 * footer. Same kernel ⇒ byte-identical file (the FK15 done-criterion). Returns null on an invalid kernel.
 */
export function emit(k: ToolingKernel, t: Target): string | null {
	if (validate(k) !== null) return null;
	const body = emitBody(k, t);
	const h = sourceHash(k);
	return `${body}\n${MARKER_PREFIX}${h} — DO NOT EDIT; regenerate via /tool-project (FK15) -->\n`;
}

/** emitAll renders ALL four tooling files from the kernel sources, keyed by target. */
export function emitAll(k: ToolingKernel): Record<Target, string> | null {
	if (validate(k) !== null) return null;
	const out = {} as Record<Target, string>;
	for (const t of TARGETS) {
		const f = emit(k, t);
		if (f === null) return null;
		out[t] = f;
	}
	return out;
}

/** markerHash extracts the source-hash recorded in a file's protection marker (null when absent). */
export function markerHash(file: string): string | null {
	const i = file.lastIndexOf(MARKER_PREFIX);
	if (i < 0) return null;
	const rest = file.slice(i + MARKER_PREFIX.length);
	const m = rest.match(/^[^\s]+/);
	return m ? m[0] : null;
}

/**
 * detectDrift is the PURE hash-protection check (the FK15 done-criterion "hand-edit détecté"):
 *  - null           — the file equals the exact projection (no drift).
 *  - MISSING_MARKER — the file carries no AIDOS source-hash marker.
 *  - STALE_HASH     — the marker's hash differs from the kernel's current source-hash.
 *  - HAND_EDITED    — the marker matches the current source-hash, yet the bytes differ from emit().
 * Total, deterministic — a byte comparison + a string-equality on hashes, never a prompt.
 */
export function detectDrift(
	k: ToolingKernel,
	t: Target,
	onDisk: string,
): Drift | null {
	const want = emit(k, t);
	if (want === null) return null;
	if (onDisk === want) return null;
	const cur = sourceHash(k);
	const mh = markerHash(onDisk);
	if (mh === null) return { target: t, kind: "MISSING_MARKER", expected: cur };
	if (mh !== cur) return { target: t, kind: "STALE_HASH", expected: cur };
	return { target: t, kind: "HAND_EDITED", expected: cur };
}
