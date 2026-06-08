/**
 * Shape editor — the DECLARED TWIN of the Go package back/runtime/shapeeditor (S68, KRD §34/§90).
 * The three-shape mirror authoring surface: the mirror FORM is DERIVED from the truth-NATURE (never
 * chosen), each shape's source is PARSED by a pure parser, the red project-scoped mirror is proposed
 * as a DRAFT ChangeSet, and two concurrent draft edits MERGE or LOCK — never last-write-wins.
 *
 * THE WALL (CLAUDE.md §2/§7). This module writes NOTHING. proposeMirror returns a Proposal VALUE — a
 * DRAFT ChangeSet wrapping the red mirror (wroteMirror stays false). The screen PROPOSES; freezing
 * into the mirrors schema goes through the wall (propose → ChangeSet → approval), via the changeset
 * door (S20). The authoritative content-addressed id is the Go one; the front carries a stable handle.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). deriveShape + the parsers + mergeEdits are PURE + TOTAL — same
 * input ⇒ same output. They are deterministic functions, never an LLM. The reproducibility mirror
 * lib/shape-editor.test.ts pins it (it mirrors the Go property test verbatim).
 */

/** TruthNature — the closed set of natures the three-shape editor serves (twin of shapeeditor.TruthNature). */
export type TruthNature = "acceptance" | "invariant" | "workflow";

/** Shape — the mirror form (twin of shapeeditor.Shape). */
export type Shape = "gherkin" | "property" | "fixture";

/** Natures returns the three natures in canonical order. */
export function natures(): TruthNature[] {
	return ["acceptance", "invariant", "workflow"];
}

export interface Derivation {
	shape: Shape;
	testKind: string;
	certLanguage: string;
}

/** The CLOSED selection table — read verbatim, never invented (twin of natureToDerivation). */
const NATURE_TO_DERIVATION: Record<TruthNature, Derivation> = {
	acceptance: {
		shape: "gherkin",
		testKind: "acceptance",
		certLanguage: "gherkin",
	},
	invariant: { shape: "property", testKind: "property", certLanguage: "rapid" },
	workflow: { shape: "fixture", testKind: "fixture", certLanguage: "fixture" },
};

export const ERR_UNKNOWN_NATURE =
	"shapeeditor: truth-nature is not in the closed derivation table (KRD §90)";
export const ERR_PARSE = "shapeeditor: source does not parse for its shape";
export const ERR_DRAFT_CONFLICT =
	"shapeeditor: concurrent edits conflict on the same field (lock, not last-write-wins)";
export const ERR_STALE_BASE =
	"shapeeditor: edit base version is stale and conflicts (re-base required)";

/** deriveShape maps a truth-nature to its form + typed fields — PURE. Unknown nature ⇒ null (never a guess). */
export function deriveShape(nature: string): Derivation | null {
	return NATURE_TO_DERIVATION[nature as TruthNature] ?? null;
}

export interface GherkinStep {
	keyword: string;
	text: string;
}

export interface ParsedSpec {
	shape: Shape;
	title?: string;
	steps?: GherkinStep[];
	quantifier?: string[];
	predicate?: string;
	state?: string;
	command?: string;
	events?: string[];
}

export interface ParseResult {
	spec: ParsedSpec | null;
	error: string | null;
}

const GHERKIN_KEYWORDS = new Set(["given", "when", "then", "and"]);

/** parseGherkin — minimal Scenario:/Given/When/Then parser. PURE. Mirrors ParseGherkin. */
export function parseGherkin(source: string): ParseResult {
	const spec: ParsedSpec = { shape: "gherkin", steps: [] };
	let hasWhen = false;
	let hasThen = false;
	for (const raw of source.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const lower = line.toLowerCase();
		if (lower.startsWith("scenario:")) {
			spec.title = line.slice("scenario:".length).trim();
			continue;
		}
		if (lower.startsWith("feature:")) continue;
		const sp = line.indexOf(" ");
		const kw = sp === -1 ? "" : line.slice(0, sp).toLowerCase();
		if (sp === -1 || !GHERKIN_KEYWORDS.has(kw)) {
			return {
				spec: null,
				error: `${ERR_PARSE} (gherkin): line is neither a keyword step nor a header: "${line}"`,
			};
		}
		if (kw === "when") hasWhen = true;
		if (kw === "then") hasThen = true;
		const keyword = kw.charAt(0).toUpperCase() + kw.slice(1);
		spec.steps?.push({ keyword, text: line.slice(sp + 1).trim() });
	}
	if (!spec.title)
		return {
			spec: null,
			error: `${ERR_PARSE} (gherkin): no \`Scenario:\` title`,
		};
	if ((spec.steps?.length ?? 0) === 0 || !hasWhen || !hasThen) {
		return {
			spec: null,
			error: `${ERR_PARSE} (gherkin): a scenario needs at least a When and a Then step`,
		};
	}
	return { spec, error: null };
}

/** parseProperty — minimal property:/forall:/holds: parser. PURE. Mirrors ParseProperty. */
export function parseProperty(source: string): ParseResult {
	const spec: ParsedSpec = { shape: "property", quantifier: [] };
	for (const raw of source.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const lower = line.toLowerCase();
		if (lower.startsWith("property:"))
			spec.title = line.slice("property:".length).trim();
		else if (lower.startsWith("forall:")) {
			for (const v of line.slice("forall:".length).split(",")) {
				const t = v.trim();
				if (t) spec.quantifier?.push(t);
			}
		} else if (lower.startsWith("holds:"))
			spec.predicate = line.slice("holds:".length).trim();
		else
			return {
				spec: null,
				error: `${ERR_PARSE} (property): unknown line "${line}" (expected property:/forall:/holds:)`,
			};
	}
	if (!spec.title)
		return {
			spec: null,
			error: `${ERR_PARSE} (property): no \`property:\` title`,
		};
	if ((spec.quantifier?.length ?? 0) === 0)
		return {
			spec: null,
			error: `${ERR_PARSE} (property): no \`forall:\` binding — an ∃ is not a ∀ (KRD §8)`,
		};
	if (!spec.predicate)
		return {
			spec: null,
			error: `${ERR_PARSE} (property): no \`holds:\` predicate`,
		};
	return { spec, error: null };
}

/** parseFixture — minimal fixture:/state:/command:/event: parser. PURE. Mirrors ParseFixture. */
export function parseFixture(source: string): ParseResult {
	const spec: ParsedSpec = { shape: "fixture", events: [] };
	for (const raw of source.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const lower = line.toLowerCase();
		if (lower.startsWith("fixture:"))
			spec.title = line.slice("fixture:".length).trim();
		else if (lower.startsWith("state:"))
			spec.state = line.slice("state:".length).trim();
		else if (lower.startsWith("command:"))
			spec.command = line.slice("command:".length).trim();
		else if (lower.startsWith("event:")) {
			const e = line.slice("event:".length).trim();
			if (e) spec.events?.push(e);
		} else
			return {
				spec: null,
				error: `${ERR_PARSE} (fixture): unknown line "${line}" (expected fixture:/state:/command:/event:)`,
			};
	}
	if (!spec.title)
		return {
			spec: null,
			error: `${ERR_PARSE} (fixture): no \`fixture:\` title`,
		};
	if (!spec.state || !spec.command)
		return {
			spec: null,
			error: `${ERR_PARSE} (fixture): a fixture needs a state: and a command:`,
		};
	if ((spec.events?.length ?? 0) === 0)
		return {
			spec: null,
			error: `${ERR_PARSE} (fixture): a fixture needs at least one event:`,
		};
	return { spec, error: null };
}

/** parse — the single entry: parse a source for its shape via the pure parser. PURE. Mirrors Parse. */
export function parse(shape: Shape, source: string): ParseResult {
	if (source.trim() === "")
		return {
			spec: null,
			error: "shapeeditor: mirror source is empty (nothing to author)",
		};
	switch (shape) {
		case "gherkin":
			return parseGherkin(source);
		case "property":
			return parseProperty(source);
		case "fixture":
			return parseFixture(source);
		default:
			return { spec: null, error: `${ERR_PARSE}: unknown shape "${shape}"` };
	}
}

/** Draft — the pre-ChangeSet authoring state of a mirror (twin of shapeeditor.Draft). */
export interface Draft {
	projectId: string;
	reflectsLayer: string;
	reflectsVersion: string;
	nature: TruthNature;
	shape: Shape;
	title: string;
	source: string;
	version: number;
}

/** Edit — one author's proposed change against a base version (undefined field = untouched). */
export interface Edit {
	author: string;
	baseVersion: number;
	title?: string;
	source?: string;
}

export interface EditConflict {
	field: "title" | "source";
	authorA: string;
	valueA: string;
	authorB: string;
	valueB: string;
}

export interface MergeResult {
	merged: Draft;
	conflicts: EditConflict[];
	error: string | null;
}

/**
 * mergeEdits — the DRAFT-LEVEL CONCURRENCY merge (twin of shapeeditor.MergeEdits). PURE, TOTAL.
 * disjoint ⇒ merge; same-field same-value ⇒ merge; same-field clash ⇒ LOCK (ERR_DRAFT_CONFLICT,
 * both candidates surfaced, version NOT advanced) — never last-write-wins; stale base ⇒ rejected.
 */
export function mergeEdits(d: Draft, a: Edit, b: Edit): MergeResult {
	if (a.baseVersion !== d.version || b.baseVersion !== d.version) {
		return { merged: d, conflicts: [], error: ERR_STALE_BASE };
	}
	const merged: Draft = { ...d };
	const conflicts: EditConflict[] = [];

	if (a.title !== undefined && b.title !== undefined && a.title !== b.title) {
		conflicts.push({
			field: "title",
			authorA: a.author,
			valueA: a.title,
			authorB: b.author,
			valueB: b.title,
		});
	} else if (a.title !== undefined) merged.title = a.title;
	else if (b.title !== undefined) merged.title = b.title;

	if (
		a.source !== undefined &&
		b.source !== undefined &&
		a.source !== b.source
	) {
		conflicts.push({
			field: "source",
			authorA: a.author,
			valueA: a.source,
			authorB: b.author,
			valueB: b.source,
		});
	} else if (a.source !== undefined) merged.source = a.source;
	else if (b.source !== undefined) merged.source = b.source;

	conflicts.sort((x, y) =>
		x.field < y.field ? -1 : x.field > y.field ? 1 : 0,
	);
	if (conflicts.length > 0) {
		return { merged: d, conflicts, error: ERR_DRAFT_CONFLICT };
	}
	merged.version = d.version + 1;
	return { merged, conflicts: [], error: null };
}

/** A proposed DRAFT ChangeSet wrapping the red mirror (twin of changeset.ChangeSet). */
export interface ProposedChangeSet {
	ref: string;
	status: "DRAFT";
	target: string;
	label: string;
}

export interface Proposal {
	projectId: string;
	mirrorId: string;
	testKind: string;
	certLanguage: string;
	liveness: "dead";
	red: boolean;
	wroteMirror: false;
	parsed: ParsedSpec;
	changeSet: ProposedChangeSet;
}

export interface ProposeResult {
	result: Proposal | null;
	error: string | null;
}

/**
 * proposeMirror — author a red, project-scoped mirror → a DRAFT ChangeSet proposal (twin of
 * shapeeditor.ProposeMirror). The shape is the draft's derived shape; the source is parsed (an
 * unparseable source is refused); the mirror is born RED (liveness=dead). WRITES NOTHING (the wall).
 * The mirrorId is a stable front handle; the authoritative content address is the Go one.
 */
export function proposeMirror(d: Draft, parentPhase: string): ProposeResult {
	if (!d.projectId)
		return {
			result: null,
			error:
				"shapeeditor: draft has no project id (mirrors are project-scoped, S55)",
		};
	if (!d.reflectsLayer)
		return { result: null, error: "shapeeditor: mirror reflects no layer" };
	const der = deriveShape(d.nature);
	if (der === null) return { result: null, error: ERR_UNKNOWN_NATURE };
	if (der.shape !== d.shape)
		return {
			result: null,
			error: `${ERR_PARSE}: draft shape "${d.shape}" != derived shape "${der.shape}"`,
		};
	const { spec, error } = parse(d.shape, d.source);
	if (error !== null || spec === null)
		return { result: null, error: error ?? ERR_PARSE };

	const mirrorId = stableMirrorRef(d);
	return {
		result: {
			projectId: d.projectId,
			mirrorId,
			testKind: der.testKind,
			certLanguage: der.certLanguage,
			liveness: "dead",
			red: true,
			wroteMirror: false,
			parsed: spec,
			changeSet: {
				ref: mirrorId,
				status: "DRAFT",
				target: d.reflectsLayer,
				label: `author ${d.shape} mirror reflecting ${d.reflectsLayer}@${d.reflectsVersion} (project ${d.projectId})`,
			},
		},
		error: null,
	};
}

/**
 * stableMirrorRef is a deterministic front handle for the proposed mirror (project + reflects +
 * shape + source). The AUTHORITATIVE content address is the Go one (records.Hash, computed
 * server-side at persistence); this is a stable preview key, never the truth's id.
 */
function stableMirrorRef(d: Draft): string {
	const body = `${d.projectId}|${d.reflectsLayer}@${d.reflectsVersion}|${d.shape}|${d.source}`;
	let h = 0;
	for (let i = 0; i < body.length; i++) {
		h = (Math.imul(31, h) + body.charCodeAt(i)) | 0;
	}
	return `draft-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** openDraft — create a fresh draft for a (project, layer, nature). PURE. Mirrors OpenDraft. */
export function openDraft(
	projectId: string,
	reflectsLayer: string,
	reflectsVersion: string,
	nature: TruthNature,
): { draft: Draft | null; error: string | null } {
	if (!projectId)
		return {
			draft: null,
			error:
				"shapeeditor: draft has no project id (mirrors are project-scoped, S55)",
		};
	if (!reflectsLayer)
		return { draft: null, error: "shapeeditor: mirror reflects no layer" };
	const der = deriveShape(nature);
	if (der === null) return { draft: null, error: ERR_UNKNOWN_NATURE };
	return {
		draft: {
			projectId,
			reflectsLayer,
			reflectsVersion,
			nature,
			shape: der.shape,
			title: "",
			source: "",
			version: 0,
		},
		error: null,
	};
}
