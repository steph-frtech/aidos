/**
 * The Tech-Spec projection — the Workbench /tech-spec source (AIDOS step FK15 part (b)).
 *
 * KRD FKE-20.1 / ROADMAP FK15 part (b): the TWO ASSEMBLED PROJECTIONS per kernel — the Fiche de
 * Spécification Technique (Contrat F5 + Modèle F4 + the OSI stack + facet specs S1/B1/R1/V1/M1 +
 * linked ADRs) and the Suite de Tests Techniques (N4/N5 + per-OSI-layer tests + facet tests
 * S3/B3/R3/M3). They are ASSEMBLED VIEWS — never the truth (zero double-typing), never hand-edited
 * (hash-protected, drift by source-hash).
 *
 * This module is the DECLARED projection of the Go package back/runtime/generators/techspec — the
 * SAME four closed OSI layers, the SAME five technical facets, the SAME seven test kinds, the SAME
 * two projections, the SAME three drift kinds, the SAME deterministic assembly — so the /tech-spec
 * panel assembles exactly as the Go Assemble computes. One source, no drift.
 *
 * ZERO NEW TRUTH (the load-bearing FK15 done-criterion): declaredRefs(k) === assembledRefs(k) — every
 * assembled ref traces to an input declaration (no fabrication) and every declared ref is assembled
 * (no loss). The panel demonstrates this set-equality live.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O,
 * NO LLM — so the same kernel always yields byte-identical files. The reproducibility mirror
 * lib/tech-spec.test.ts (fast-check) pins: same kernel → byte-identical files, input-order
 * invariance, zero-new-truth, drift ⇔ a hand-edit.
 *
 * NOTE on the source-hash: the panel uses a deterministic in-browser digest (FNV-1a over the
 * canonical body); the AUTHORITATIVE hash is the Go SHA-256. READ-ONLY (the wall): /tech-spec
 * ASSEMBLES + DETECTS DRIFT; it never writes truth (freezing goes via propose → /goal → approval).
 */

/** The techspec link-kind discriminator (mirrors the Go body's link_kind:"techspec"). */
export const TECHSPEC_KIND = "techspec" as const;

/** The four closed OSI layers, in canonical top-down (L7→L4) order. */
export const OSI_LAYERS = [
	"L7-application",
	"L6-presentation",
	"L5-session",
	"L4-transport",
] as const;
export type OSILayer = (typeof OSI_LAYERS)[number];
export function isKnownOSILayer(l: string): l is OSILayer {
	return (OSI_LAYERS as readonly string[]).includes(l);
}
function osiRank(l: string): number {
	const i = (OSI_LAYERS as readonly string[]).indexOf(l);
	return i === -1 ? OSI_LAYERS.length : i;
}

/** The five technical (non-functional) facets, in canonical order (S/B/R/V/M). */
export const SPEC_FACETS = ["S", "B", "R", "V", "M"] as const;
export type SpecFacet = (typeof SPEC_FACETS)[number];
export function isKnownFacet(f: string): f is SpecFacet {
	return (SPEC_FACETS as readonly string[]).includes(f);
}
function facetRank(f: string): number {
	const i = (SPEC_FACETS as readonly string[]).indexOf(f);
	return i === -1 ? SPEC_FACETS.length : i;
}
const FACET_LABEL: Record<SpecFacet, string> = {
	S: "Sécurité (S)",
	B: "Budgets / Performance (B)",
	R: "Fiabilité / Résilience (R)",
	V: "Évolutivité / Migration (V)",
	M: "Maintenabilité & Architecture (M)",
};

/** The seven closed test kinds, in canonical order (N4→M3). */
export const TEST_KINDS = [
	"N4-unit",
	"N4-integration",
	"N5-infra",
	"S3-security",
	"B3-perf",
	"R3-chaos",
	"M3-arch",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];
export function isKnownTestKind(t: string): t is TestKind {
	return (TEST_KINDS as readonly string[]).includes(t);
}
function testKindRank(t: string): number {
	const i = (TEST_KINDS as readonly string[]).indexOf(t);
	return i === -1 ? TEST_KINDS.length : i;
}
const TEST_LABEL: Record<TestKind, string> = {
	"N4-unit": "Tests unitaires (N4)",
	"N4-integration": "Tests d'intégration (N4)",
	"N5-infra": "Tests d'infra (N5)",
	"S3-security": "Tests de sécurité (S3)",
	"B3-perf": "Tests de performance (B3)",
	"R3-chaos": "Tests de chaos / résilience (R3)",
	"M3-arch": "Tests d'architecture (M3)",
};

/** The two closed projections, in canonical order. */
export const PROJECTIONS = [
	"fiche-specification-technique",
	"suite-tests-techniques",
] as const;
export type Projection = (typeof PROJECTIONS)[number];

/** A Decl is one ALREADY-DECLARED technical element the projection assembles verbatim. */
export type Decl = { ref: string; title: string; body: string };
export type OSISpec = { layer: OSILayer; specs: Decl[]; tests: Decl[] };
export type FacetSpec = { facet: SpecFacet; specs: Decl[]; tests: Decl[] };
export type TestGroup = { kind: TestKind; tests: Decl[] };

/** A TechKernel is the input bundle both projections are assembled from. */
export type TechKernel = {
	kernelId: string;
	networked: boolean;
	contract?: Decl;
	model?: Decl;
	osi?: OSISpec[];
	facets?: FacetSpec[];
	adrs?: Decl[];
	testGroups?: TestGroup[];
};

/** The closed reason an on-disk projection is out of assembly. */
export type DriftKind = "HAND_EDITED" | "MISSING_MARKER" | "STALE_HASH";
export type Drift = {
	projection: Projection;
	kind: DriftKind;
	expected?: string;
};

/** A validation refusal (mirrors techspec.Err*). */
export type ValidateError =
	| "NO_KERNEL_ID"
	| "UNKNOWN_OSI_LAYER"
	| "UNKNOWN_FACET"
	| "UNKNOWN_TEST_KIND"
	| "EMPTY_REF"
	| "OSI_ON_PURE_FUNCTION"
	| null;

function declMissingRef(ds: Decl[]): boolean {
	return ds.some((d) => !d.ref.trim());
}

/** validate checks a TechKernel's shape; returns null when valid, else the closed refusal code. */
export function validate(k: TechKernel): ValidateError {
	if (!k.kernelId.trim()) return "NO_KERNEL_ID";
	if (!k.networked && (k.osi?.length ?? 0) > 0) return "OSI_ON_PURE_FUNCTION";
	if (
		k.contract &&
		(k.contract.ref || k.contract.title || k.contract.body) &&
		!k.contract.ref.trim()
	)
		return "EMPTY_REF";
	if (
		k.model &&
		(k.model.ref || k.model.title || k.model.body) &&
		!k.model.ref.trim()
	)
		return "EMPTY_REF";
	for (const o of k.osi ?? []) {
		if (!isKnownOSILayer(o.layer)) return "UNKNOWN_OSI_LAYER";
		if (declMissingRef(o.specs) || declMissingRef(o.tests)) return "EMPTY_REF";
	}
	for (const f of k.facets ?? []) {
		if (!isKnownFacet(f.facet)) return "UNKNOWN_FACET";
		if (declMissingRef(f.specs) || declMissingRef(f.tests)) return "EMPTY_REF";
	}
	if (declMissingRef(k.adrs ?? [])) return "EMPTY_REF";
	for (const g of k.testGroups ?? []) {
		if (!isKnownTestKind(g.kind)) return "UNKNOWN_TEST_KIND";
		if (declMissingRef(g.tests)) return "EMPTY_REF";
	}
	return null;
}

/** declLess is the TOTAL order over declarations (by ref, then title, then body). */
function declLess(a: Decl, b: Decl): number {
	if (a.ref !== b.ref) return a.ref < b.ref ? -1 : 1;
	if (a.title !== b.title) return a.title < b.title ? -1 : 1;
	return a.body < b.body ? -1 : a.body > b.body ? 1 : 0;
}
function sortedDecls(ds: Decl[]): Decl[] {
	return [...ds].sort(declLess);
}
function sortedOSI(os: OSISpec[]): OSISpec[] {
	return [...os].sort((a, b) => osiRank(a.layer) - osiRank(b.layer));
}
function sortedFacets(fs: FacetSpec[]): FacetSpec[] {
	return [...fs].sort((a, b) => facetRank(a.facet) - facetRank(b.facet));
}
function sortedGroups(gs: TestGroup[]): TestGroup[] {
	return [...gs].sort((a, b) => testKindRank(a.kind) - testKindRank(b.kind));
}

/** renderDecls renders a titled list of declarations as markdown bullets (empty when none). */
function renderDecls(heading: string, ds: Decl[]): string {
	const sorted = sortedDecls(ds);
	if (sorted.length === 0) return "";
	let out = `\n### ${heading}\n\n`;
	for (const d of sorted) out += `- **${d.title}** (\`${d.ref}\`): ${d.body}\n`;
	return out;
}

const MARKER_PREFIX = "<!-- AIDOS-TECHSPEC-SOURCE-HASH: ";
const hasRef = (d?: Decl): boolean => !!d && !!d.ref;

/** serializeBody renders the content-addressed kernel.link body (storage fork: link_kind:"techspec"). */
export function serializeBody(k: TechKernel): string {
	const osi = sortedOSI(k.osi ?? []).map((o) => ({
		layer: o.layer,
		specs: sortedDecls(o.specs),
		tests: sortedDecls(o.tests),
	}));
	const facets = sortedFacets(k.facets ?? []).map((f) => ({
		facet: f.facet,
		specs: sortedDecls(f.specs),
		tests: sortedDecls(f.tests),
	}));
	const groups = sortedGroups(k.testGroups ?? []).map((g) => ({
		kind: g.kind,
		tests: sortedDecls(g.tests),
	}));
	const empty = { ref: "", title: "", body: "" };
	return JSON.stringify({
		kind: "link",
		link_kind: TECHSPEC_KIND,
		kernel_id: k.kernelId,
		networked: k.networked,
		contract: k.contract ?? empty,
		model: k.model ?? empty,
		osi,
		facets,
		adrs: sortedDecls(k.adrs ?? []),
		test_groups: groups,
	});
}

/** sourceHash is a deterministic FNV-1a digest of the canonical body (panel self-consistent). */
export function sourceHash(k: TechKernel): string {
	const body = serializeBody(k);
	let h = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** assembleBody renders the markdown BODY of a projection (without the footer). */
function assembleBody(k: TechKernel, p: Projection): string {
	if (p === "fiche-specification-technique") {
		let out =
			`# Fiche de Spécification Technique — ${k.kernelId}\n` +
			`\n> Projection assemblée depuis le kernel (FKE-20.1). Zéro nouvelle vérité ; ne pas hand-éditer (hash-protégée, FK15).\n`;
		if (hasRef(k.contract))
			out += renderDecls("Contrat (F5)", [k.contract as Decl]);
		if (hasRef(k.model)) out += renderDecls("Modèle (F4)", [k.model as Decl]);
		if (k.networked) {
			out += `\n## Pile de communication (OSI)\n`;
			for (const o of sortedOSI(k.osi ?? []))
				out += renderDecls(`Couche ${o.layer}`, o.specs);
		}
		out += `\n## Specs des facettes (qualité)\n`;
		for (const f of sortedFacets(k.facets ?? []))
			out += renderDecls(FACET_LABEL[f.facet], f.specs);
		out += renderDecls("ADR liés", k.adrs ?? []);
		return out;
	}
	// suite-tests-techniques
	let out =
		`# Suite de Tests Techniques — ${k.kernelId}\n` +
		`\n> Projection assemblée depuis le kernel (FKE-20.1). Distincte des scénarios d'acceptance métier (N0). Ne pas hand-éditer (hash-protégée, FK15).\n`;
	out += `\n## Tests unitaires / intégration / infra (N4/N5)\n`;
	for (const g of sortedGroups(k.testGroups ?? []))
		out += renderDecls(TEST_LABEL[g.kind], g.tests);
	if (k.networked) {
		out += `\n## Tests par couche OSI\n`;
		for (const o of sortedOSI(k.osi ?? []))
			out += renderDecls(`Couche ${o.layer}`, o.tests);
	}
	out += `\n## Tests des facettes (sécu/perf/chaos/arch)\n`;
	for (const f of sortedFacets(k.facets ?? []))
		out += renderDecls(FACET_LABEL[f.facet], f.tests);
	return out;
}

/** assemble renders ONE projection with the hash-protection footer (null on invalid). */
export function assemble(k: TechKernel, p: Projection): string | null {
	if (validate(k) !== null) return null;
	const body = assembleBody(k, p);
	const h = sourceHash(k);
	return `${body}\n${MARKER_PREFIX}${h} — DO NOT EDIT; regenerate via /tech-spec (FK15) -->\n`;
}

/** assembleAll renders BOTH projections, keyed by projection (null on invalid). */
export function assembleAll(k: TechKernel): Record<Projection, string> | null {
	if (validate(k) !== null) return null;
	const out = {} as Record<Projection, string>;
	for (const p of PROJECTIONS) {
		const f = assemble(k, p);
		if (f === null) return null;
		out[p] = f;
	}
	return out;
}

/** declaredRefs returns the SORTED set of every declaration ref the kernel declares. */
export function declaredRefs(k: TechKernel): string[] {
	const s = new Set<string>();
	if (hasRef(k.contract)) s.add((k.contract as Decl).ref);
	if (hasRef(k.model)) s.add((k.model as Decl).ref);
	for (const o of k.osi ?? []) {
		for (const d of o.specs) s.add(d.ref);
		for (const d of o.tests) s.add(d.ref);
	}
	for (const f of k.facets ?? []) {
		for (const d of f.specs) s.add(d.ref);
		for (const d of f.tests) s.add(d.ref);
	}
	for (const d of k.adrs ?? []) s.add(d.ref);
	for (const g of k.testGroups ?? []) for (const d of g.tests) s.add(d.ref);
	return [...s].sort();
}

function extractRefs(body: string): string[] {
	const out: string[] = [];
	let rest = body;
	for (;;) {
		const i = rest.indexOf("(`");
		if (i < 0) break;
		rest = rest.slice(i + 2);
		const j = rest.indexOf("`)");
		if (j < 0) break;
		out.push(rest.slice(0, j));
		rest = rest.slice(j + 2);
	}
	return out;
}

/** assembledRefs returns the SORTED set of refs that ACTUALLY appear in the rendered bytes. */
export function assembledRefs(k: TechKernel): string[] {
	const s = new Set<string>();
	for (const p of PROJECTIONS) {
		for (const ref of extractRefs(assembleBody(k, p))) s.add(ref);
	}
	return [...s].sort();
}

/** markerHash extracts the source-hash recorded in a file's protection marker (null when absent). */
export function markerHash(file: string): string | null {
	const i = file.lastIndexOf(MARKER_PREFIX);
	if (i < 0) return null;
	const rest = file.slice(i + MARKER_PREFIX.length);
	const m = rest.match(/^[^\s]+/);
	return m ? m[0] : null;
}

/** detectDrift is the PURE hash-protection check (null clean, else the closed drift kind). */
export function detectDrift(
	k: TechKernel,
	p: Projection,
	onDisk: string,
): Drift | null {
	const want = assemble(k, p);
	if (want === null) return null;
	if (onDisk === want) return null;
	const cur = sourceHash(k);
	const mh = markerHash(onDisk);
	if (mh === null)
		return { projection: p, kind: "MISSING_MARKER", expected: cur };
	if (mh !== cur) return { projection: p, kind: "STALE_HASH", expected: cur };
	return { projection: p, kind: "HAND_EDITED", expected: cur };
}
