// Determinism-first twin of back/runtime/adoption/accountrelease.Assemble (KRD §S117).
// PURE functions — no clock read (now is passed), no rng, no I/O — so /account-release
// can re-run the per-ACCOUNT release pack assembly on a selected scenario and render the
// EXACT AccountReleasePack shape the Go package computes: the account's projects (each
// with its HONEST demo-vs-real status), the live CLI/Workbench surface, the docs index,
// the test inventory, the changelog, the honest known-limits, plus the adoption ladder
// advising the next smallest ratchet. It GENERALISES the S47 single-project release twin
// (lib/adoption.ts) to a multi-project account. fast-check (lib/account-release.test.ts)
// pins the twin's invariants.
//
// THE WALL (CLAUDE.md §2/§8): the twin ASSEMBLES an inventory + COMPUTES a ladder — it
// installs nothing, ships nothing, writes no truth, opens no ChangeSet. Advising the
// next tier is advice; turning on a capability goes through idea → mirror → /goal →
// human approval. The recorded pack lives in fitness (SELECT-only to the agent).

import { type AdoptionPlan, type Capability, plan } from "./adoption";

// One project's HONEST demo-vs-real classification — CONSUMED, never editorialised.
export type ProjectStatus = "real" | "demo";

export interface ProjectEntry {
	id: string;
	name?: string;
	status: ProjectStatus;
	kernelHead?: string;
}

export interface CLICommand {
	name: string;
	summary?: string;
}
export interface Route {
	path: string;
	title?: string;
}
export interface DocRef {
	slug: string;
	title?: string;
}
export interface MirrorRef {
	id: string;
	reflects?: string;
	testKind?: string;
}
export interface ChangeEntry {
	ref: string;
	summary?: string;
}
export interface Limit {
	ref: string;
	description?: string;
}

// The read-only per-account inventory Assemble reads. All slices may be empty (an empty
// view yields an empty-but-valid pack).
export interface AccountView {
	account: string;
	projects: ProjectEntry[];
	cliSurface: CLICommand[];
	workbenchRoutes: Route[];
	docs: DocRef[];
	mirrors: MirrorRef[];
	changesets: ChangeEntry[];
	declaredLimits: Limit[];
	capabilities: Capability[];
}

export interface AccountReleasePack {
	id: string;
	account: string;
	projects: ProjectEntry[];
	cliSurface: CLICommand[];
	workbenchRoutes: Route[];
	docsIndex: DocRef[];
	testInventory: MirrorRef[];
	changelog: ChangeEntry[];
	knownLimits: Limit[];
	adoptionPlan: AdoptionPlan;
	assembledAt: number;
}

// A stable, deterministic synthetic id for a pack (the Go package content-addresses with
// Hash(Canonicalize(body))). The twin uses a content fingerprint — enough for the panel's
// keys + the assemble-only proof. It is INDEPENDENT of assembledAt (like the Go id) and
// of input order (the slices are sorted before fingerprinting).
function syntheticId(
	p: Omit<AccountReleasePack, "id" | "assembledAt">,
): string {
	const projKey = p.projects.map((x) => `${x.id}:${x.status}`).join(",");
	const limKey = p.knownLimits.map((x) => x.ref).join(",");
	return `apack:${p.account}|${p.projects.length}p[${projKey}]-${p.cliSurface.length}c-${p.workbenchRoutes.length}r-${p.docsIndex.length}d-${p.testInventory.length}m-${p.changelog.length}cl-${p.knownLimits.length}kl[${limKey}]-${p.adoptionPlan.current}`;
}

function sortBy<T>(arr: T[], key: (x: T) => string): T[] {
	return [...arr].sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		return ka < kb ? -1 : ka > kb ? 1 : 0;
	});
}

// assemble inventories ONE account's live view into an AccountReleasePack paired with the
// adoption ladder. Pure; AUTHORS NOTHING (every field is the view's content); installs/
// ships nothing; never mutates the input. An empty view yields an empty-but-valid pack.
export function assemble(view: AccountView, now: number): AccountReleasePack {
	const projects = sortBy(view.projects, (x) => x.id);
	const cli = sortBy(view.cliSurface, (x) => x.name);
	const routes = sortBy(view.workbenchRoutes, (x) => x.path);
	const docs = sortBy(view.docs, (x) => x.slug);
	const mirrors = sortBy(view.mirrors, (x) => x.id);
	const changelog = sortBy(view.changesets, (x) => x.ref);
	const limits = sortBy(view.declaredLimits, (x) => x.ref);
	const adoptionPlan = plan(view.capabilities);

	const partial = {
		account: view.account,
		projects,
		cliSurface: cli,
		workbenchRoutes: routes,
		docsIndex: docs,
		testInventory: mirrors,
		changelog,
		knownLimits: limits,
		adoptionPlan,
	};
	return { ...partial, id: syntheticId(partial), assembledAt: now };
}

// The live CLI surface, honestly classified: the five CORE verbs (S03) + the six S117
// GATEWAY verbs (routed over the passerelle), each naming the below-the-line tool. The
// authoritative, closed surface a release pack inventories (mirrors the Go MCP
// release_cli_surface tool).
export interface VerbInfo {
	name: string;
	kind: "core" | "gateway";
	tool?: string;
}

export const CLI_SURFACE: readonly VerbInfo[] = [
	{ name: "check", kind: "core" },
	{ name: "impact", kind: "core" },
	{ name: "stable", kind: "core" },
	{ name: "diff", kind: "core" },
	{ name: "explain", kind: "core" },
	{ name: "goal", kind: "gateway", tool: "changeset_open" },
	{ name: "grill", kind: "gateway", tool: "idea_grill" },
	{ name: "spike", kind: "gateway", tool: "idea_spike" },
	{ name: "harvest", kind: "gateway", tool: "idea_harvest" },
	{ name: "trim", kind: "gateway", tool: "idea_capture" },
	{ name: "init", kind: "gateway", tool: "project_create" },
] as const;
