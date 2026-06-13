"use server";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { type Environment, isKnownEnvironment } from "@/lib/environments";

const execFileP = promisify(execFile);

/** The AIDOS repo root (the Go module lives in <repo>/back). Overridable. */
const APP_REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

/**
 * The Go binary the emitter runs under. The go.mod pins go >= 1.25.5, so the
 * system `go` (often older) would refuse under GOTOOLCHAIN=local; we prefer an
 * explicit AIDOS_GO_BIN, then the cached 1.25.10 toolchain binary, and finally a
 * plain `go` (with GOTOOLCHAIN=auto so it resolves the right toolchain itself).
 */
const PINNED_GO =
	"/home/stevig/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.10.linux-amd64/bin/go";
function resolveGo(): { bin: string; toolchain: string } {
	if (process.env.AIDOS_GO_BIN) {
		return { bin: process.env.AIDOS_GO_BIN, toolchain: "local" };
	}
	if (existsSync(PINNED_GO)) {
		return { bin: PINNED_GO, toolchain: "local" };
	}
	// Fall back to PATH go and let GOTOOLCHAIN=auto download/select the pinned one.
	return { bin: "go", toolchain: "auto" };
}

/**
 * DocsServiceFragmentView is the twin of the Go docsfragments.ServiceFragment + its
 * content address AND the wall oracle — the per-service row the DP30 /app-docs panel
 * renders. `writes_truth` is ALWAYS false (a docs service — site / API reference /
 * search index — is a PROJECTION of the BUILT app, never an AIDOS truth write) and
 * `capabilities` is a below-the-line closed set (docs:*), the data behind the
 * « docs par app ≠ docs AIDOS Mintlify » indicator (the wall §2).
 */
export interface DocsServiceFragmentView {
	key: string;
	project_id: string;
	service: {
		name: string;
		role: string;
		image: string;
		internal_port: number;
		profile: string;
		healthcheck?: string;
		depends_on?: string[];
	};
	volumes: { name: string; device_var: string }[];
	hash: string;
	writes_truth: boolean;
	capabilities: string[];
}

/** ScalarEndpointView is one S90 sync endpoint Scalar renders (the twin of ScalarEndpoint). */
export interface ScalarEndpointView {
	operation_id: string;
	method: string;
	path: string;
	authorize: boolean;
}

/** ScalarConfigView is the twin of the Go docsfragments.ScalarConfig. */
export interface ScalarConfigView {
	openapi_path: string;
	theme: string;
	endpoints: ScalarEndpointView[];
}

/** FumadocsPageView is the twin of the Go docsfragments.FumadocsPage. */
export interface FumadocsPageView {
	path: string;
	title: string;
	locale: string;
	terms: string[];
}

/** FumadocsSiteView is the twin of the Go docsfragments.FumadocsSite. */
export interface FumadocsSiteView {
	pages: FumadocsPageView[];
}

/** PagefindRecordView is the twin of the Go docsfragments.PagefindRecord. */
export interface PagefindRecordView {
	page_path: string;
	title: string;
	terms: string[];
}

/** PagefindIndexView is the twin of the Go docsfragments.PagefindIndex. */
export interface PagefindIndexView {
	records: PagefindRecordView[];
}

/**
 * DocsProjectionView is the twin of the Go docsfragments.DocsProjection — the WHOLE
 * deterministic docs projection of the emitted app: the Scalar API reference (consuming
 * the S90 OpenAPI), the Fumadocs concept site, the Pagefind static index, the inherited
 * ccup theme (ADR 0010) and the bilingual FR-default locale set (ADR 0011). It is a
 * PROJECTION (is_projection always true), byte-stable + content-addressed (docs_id), and
 * it WRITES NO truth (wrote_kernel always false).
 */
export interface DocsProjectionView {
	project: string;
	source_hash: string;
	scalar: ScalarConfigView;
	fumadocs: FumadocsSiteView;
	pagefind: PagefindIndexView;
	theme: string;
	default_locale: string;
	locales: string[];
	is_projection: boolean;
	docs_id: string;
	wrote_kernel: boolean;
}

/**
 * AppDocsView is the full DP30 docs-substrate emission for one (project, env) — the THREE
 * docs profile fragments (Fumadocs site + Scalar reference + Pagefind index), the
 * deterministic docs PROJECTION (Scalar consuming the S90 OpenAPI, the Fumadocs concept
 * pages, the Pagefind static index), the closed palette key set, the demo Pagefind search
 * (a domain term → a hit), and the CAPITAL indicator `docs_not_aidos` (docs per app are a
 * projection of the BUILT app, DISTINCT from the AIDOS Mintlify build journal — and nothing
 * writes AIDOS truth). The /app-docs screen renders this single source.
 */
export interface AppDocsView {
	ok: boolean;
	project_id: string;
	env: Environment;
	docs: DocsServiceFragmentView[];
	projection: DocsProjectionView | null;
	keys: string[];
	search_query: string;
	search_hits: string[];
	/** docs_not_aidos is the deterministic indicator: NO fragment / NOT the projection
	 * writes truth AND no capability is a truth-write scope (computed by the Go oracle). */
	docs_not_aidos: boolean;
	/** error carries any execution-level failure (the Go cmd refused / crashed). */
	error?: string;
}

interface RawAppDocsOutput {
	project_id: string;
	env: string;
	docs?: DocsServiceFragmentView[];
	projection?: DocsProjectionView | null;
	keys?: string[];
	search_query?: string;
	search_hits?: string[];
	docs_not_aidos?: boolean;
}

/**
 * emitAppDocs — the DP30 /app-docs gesture (ui-completeness, CLAUDE.md §7): run the
 * AUTHORITATIVE Go emitter (cmd/aidosdatafragments -docs, the fifth twin of the
 * data/async/observability/app-service doors — never a forked TS palette) for the active
 * project + the SELECTED environment, and surface the THREE docs fragments (Fumadocs +
 * Scalar + Pagefind), the deterministic docs projection (Scalar consuming the S90-emitted
 * OpenAPI — every sync endpoint present — + the Fumadocs concept pages + the Pagefind
 * index), the demo search hit, and the CAPITAL indicator `docs_not_aidos`.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative; the env is VALIDATED against the
 * closed set before it ever reaches the process. THE WALL (§2): a below-the-line projection
 * — it WRITES NO truth (no kernel/mirrors/fitness, no gen/ file); the docs are a PROJECTION
 * (is_projection=true), never a verity; docs PER APP are DISTINCT from the AIDOS Mintlify
 * docs. Same (project, env) ⇒ byte-identical fragments + projection.
 */
export async function emitAppDocs(
	projectId: string | null,
	env: string,
): Promise<AppDocsView> {
	// Fail-closed env validation BEFORE the process — env is one of five literals.
	const safeEnv: Environment = isKnownEnvironment(env) ? env : "dev";
	// A project is always isolated; an absent active project uses a stable seed so the
	// screen still demonstrates the docs (the volume name carries the id).
	const project = projectId?.trim() ? projectId.trim() : "__demo__";

	try {
		const go = resolveGo();
		const { stdout } = await execFileP(
			go.bin,
			[
				"run",
				"./cmd/aidosdatafragments",
				"-project",
				project,
				"-env",
				safeEnv,
				"-docs",
			],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 120_000,
				maxBuffer: 8 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: go.toolchain },
			},
		);
		const raw = JSON.parse(stdout) as RawAppDocsOutput;
		return {
			ok: true,
			project_id: raw.project_id,
			env: safeEnv,
			docs: raw.docs ?? [],
			projection: raw.projection ?? null,
			keys: raw.keys ?? [],
			search_query: raw.search_query ?? "",
			search_hits: raw.search_hits ?? [],
			docs_not_aidos: raw.docs_not_aidos ?? false,
		};
	} catch (e) {
		return {
			ok: false,
			project_id: project,
			env: safeEnv,
			docs: [],
			projection: null,
			keys: [],
			search_query: "",
			search_hits: [],
			docs_not_aidos: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/**
 * searchAppDocs — the Pagefind « trouve » gesture (ui-completeness, CLAUDE.md §7): the user
 * types a domain term, and the AUTHORITATIVE Go index lookup (the docsfragments.SearchIndex
 * token match, surfaced via the search the CLI already runs over the same projection) finds
 * the matching pages. DETERMINISM-FIRST: the search is a pure token match in the Go (never an
 * LLM); the screen only displays its deterministic output. The TS twin here is a faithful
 * re-derivation of the SAME deterministic rule over the projection the Go already emitted —
 * so the screen need not spawn a second process per keystroke; the property mirror (Go) is
 * the authority for byte-identity.
 */
export async function searchAppDocs(
	projection: DocsProjectionView | null,
	query: string,
): Promise<string[]> {
	const q = query.trim().toLowerCase();
	if (!q || !projection) return [];
	const hits = new Set<string>();
	for (const rec of projection.pagefind.records) {
		for (const t of rec.terms) {
			if (t.toLowerCase().includes(q)) {
				hits.add(rec.page_path);
				break;
			}
		}
	}
	return Array.from(hits).sort();
}
