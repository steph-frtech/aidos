/**
 * provision — the TS twin of back/runtime/provision (S89, app-builder EPIC 9,
 * ADR 0006/0047, ADR 0043 DP15). DETERMINISM-FIRST (CLAUDE.md §6/§8): the per-app
 * provisioning plan is a PURE function — target resolution is a membership check,
 * per-project isolation is a hash, the sidecar is a boolean, NEVER an LLM. Same
 * Spec → byte-identical Plan (same content-addressed id). The Vitest mirror
 * (provision.test.ts) pins same-input→same-output and the gating invariants; the
 * authoritative engine is the Go package (this twin lets the Workbench plan a
 * datastore from the screen without a backend round-trip).
 *
 * THE WALL (CLAUDE.md §2): pure planning over a supplied spec — writes NOTHING. The
 * emitted-app DEFAULT target is ALWAYS plain-postgres (the escape hatch by
 * construction); Doltgres is opt-in iff the S88 Decision is Go; a historical-impact
 * migration is human-gated via a declared DataTruthScope (the plan refuses it,
 * never bypasses the gate).
 */

import type { Decision, Target } from "./doltgres-spike";

export type { Target } from "./doltgres-spike";

/** the DECLARED per-target container images (above the line, never learned). */
export const DECLARED_IMAGES = {
	"plain-postgres": "postgres:16-alpine",
	pgvector: "pgvector/pgvector:pg16",
	doltgres: "dolthub/doltgresql:latest",
} as const;

export interface Sidecar {
	kind: string;
	image: string;
}

/** an entity AST (the part the DDL projection consumes). */
export interface Entity {
	name: string;
	fields: { name: string; type: string }[];
}

/** the §44.3 change descriptor — historical impact requires a declared scope. */
export interface Change {
	entity: string;
	/** "new_records" alone = no historical impact; existing/historical = impact. */
	appliesTo: ("new_records" | "existing_records" | "historical_records")[];
	/** whether a DataTruthScope migration is declared for the change. */
	migrationDeclared: boolean;
}

export interface Spec {
	projectId: string;
	/** "" ⇒ plain-postgres (the default by construction). */
	target: Target | "";
	decision: Decision;
	entities: Entity[];
	needsVector: boolean;
	change?: Change;
}

export interface KV {
	key: string;
	value: string;
}

export interface PulumiResource {
	type: string;
	name: string;
	image: string;
	database: string;
	env: KV[];
}

export interface Plan {
	id: string;
	projectId: string;
	target: Target;
	image: string;
	database: string;
	namespace: string;
	sidecars: Sidecar[];
	ddl: string;
	supportsAsOf: boolean;
	migrationRequired: boolean;
	resource: PulumiResource;
	reasons: string[];
}

export interface PlanResult {
	ok: boolean;
	plan?: Plan;
	/** the BlockReason code when refused (gate / unknown target / human-gate). */
	blockCode?: string;
}

/** whether a target is in the Decision's legal opt-in set. */
export function optInAllowed(d: Decision, t: Target): boolean {
	return d.optInTargets.includes(t);
}

/** whether the change touches data already produced (historical impact, §44.3). */
function touchesHistorical(c: Change | undefined): boolean {
	if (!c) return false;
	return c.appliesTo.some(
		(a) => a === "existing_records" || a === "historical_records",
	);
}

const PG_TYPE: Record<string, string> = {
	text: "TEXT",
	numeric: "NUMERIC",
	int: "BIGINT",
	bool: "BOOLEAN",
	timestamptz: "TIMESTAMPTZ",
};

/**
 * renderDDL renders the CREATE-TABLE DDL for the entities in sorted (by name)
 * order — the same shape as the OS emitter (a stable mirror of gen/db). Pure and
 * order-stable. The authoritative DDL is the Go emitter; this is the screen twin.
 */
function renderDDL(entities: Entity[]): string {
	const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
	return sorted
		.map((e) => {
			const cols = [...e.fields]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((f) => `  "${f.name}" ${PG_TYPE[f.type] ?? "TEXT"}`)
				.join(",\n");
			return `CREATE TABLE IF NOT EXISTS "${e.name.toLowerCase()}" (\n${cols}\n);`;
		})
		.join("\n");
}

/** the canonical bytes hashed into the plan id (resolution-only, derived reasons excluded). */
export function canonicalPayload(p: Omit<Plan, "id" | "reasons">): string {
	return JSON.stringify({
		projectId: p.projectId,
		target: p.target,
		image: p.image,
		database: p.database,
		namespace: p.namespace,
		sidecars: p.sidecars,
		ddl: p.ddl,
		supportsAsOf: p.supportsAsOf,
		migrationRequired: p.migrationRequired,
		resource: p.resource,
	});
}

/**
 * buildPlan is the authoritative pure planner: Spec → PlanResult. Total,
 * deterministic, side-effect-free. It refuses (blockCode) for:
 *   - a doltgres opt-in under a no-go/absent S88 Decision (OUT_OF_SCOPE);
 *   - an unknown target (OUT_OF_SCOPE);
 *   - a missing project id (OUT_OF_SCOPE);
 *   - a historical-impact migration without a declared DataTruthScope
 *     (HISTORICAL_IMPACT_REQUIRES_MIGRATION).
 *
 * The sha256 is imported LAZILY (dynamic node:crypto) so this module stays
 * client-bundle-safe — buildPlan runs server-side (Server Action) or in Node
 * (Vitest), never in the browser.
 */
export async function buildPlan(s: Spec): Promise<PlanResult> {
	if (!s.projectId.trim()) {
		return { ok: false, blockCode: "OUT_OF_SCOPE" };
	}

	const resolved: Target = s.target === "" ? "plain-postgres" : s.target;
	const reasons: string[] = [];
	if (resolved === "plain-postgres") {
		reasons.push(
			"target plain-postgres (the default by construction; escape hatch always available)",
		);
	} else if (resolved === "doltgres") {
		if (!optInAllowed(s.decision, "doltgres")) {
			return { ok: false, blockCode: "OUT_OF_SCOPE" };
		}
		reasons.push(
			`target doltgres (opt-in, legal under S88 Decision ${s.decision.id.slice(0, 12)} = ${s.decision.verdict}; default stays plain-postgres)`,
		);
	} else {
		return { ok: false, blockCode: "OUT_OF_SCOPE" };
	}

	// Per-project isolation: a deterministic database + namespace from the project id.
	const { createHash } = await import("node:crypto");
	const token = createHash("sha256")
		.update(`provision/v1:${s.projectId}`)
		.digest("hex")
		.slice(0, 12);
	const database = `app_${token}`;
	const namespace = `proj_${token}`;

	let image: string = DECLARED_IMAGES["plain-postgres"];
	const sidecars: Sidecar[] = [];
	let supportsAsOf = false;
	if (resolved === "plain-postgres") {
		if (s.needsVector) {
			image = DECLARED_IMAGES.pgvector;
			sidecars.push({ kind: "pgvector", image: DECLARED_IMAGES.pgvector });
			reasons.push("pgvector sidecar added (app needs vector search)");
		}
	} else {
		image = DECLARED_IMAGES.doltgres;
		supportsAsOf = true;
		reasons.push(
			"doltgres supports `as of` time-travel (branch/merge/diff/as-of)",
		);
		if (s.needsVector) {
			reasons.push(
				"note: vector search requested but pgvector sidecar is plain-postgres only — not added on doltgres",
			);
		}
	}

	// Human-gate the migration: a historical-impact change needs a declared scope.
	let migrationRequired = false;
	if (touchesHistorical(s.change)) {
		if (!s.change?.migrationDeclared) {
			return { ok: false, blockCode: "HISTORICAL_IMPACT_REQUIRES_MIGRATION" };
		}
		migrationRequired = true;
		reasons.push(
			"migration human-gated via declared DataTruthScope (expand-contract, forward-only)",
		);
	}

	const ddl = renderDDL(s.entities);
	const resource: PulumiResource = {
		type: `aidos:datastore:${resolved}`,
		name: database,
		image,
		database,
		env: [
			{ key: "AIDOS_NAMESPACE", value: namespace },
			{ key: "AIDOS_TARGET", value: resolved },
			{ key: "POSTGRES_DB", value: database },
		],
	};

	const base: Omit<Plan, "id" | "reasons"> = {
		projectId: s.projectId,
		target: resolved,
		image,
		database,
		namespace,
		sidecars,
		ddl,
		supportsAsOf,
		migrationRequired,
		resource,
	};
	const id = createHash("sha256").update(canonicalPayload(base)).digest("hex");

	return { ok: true, plan: { ...base, id, reasons } };
}

/**
 * The measured S88 Go Decision (2026-06-08, 7395fa69…): doltgres is in the opt-in
 * set, so the screen can demonstrate a legal doltgres opt-in. Re-derived here so
 * the panel is reachable AND executable without a backend round-trip.
 */
export const SAMPLE_GO_DECISION: Decision = {
	id: "7395fa69c2d7000000000000000000000000000000000000000000000000aaaa",
	verdict: "go",
	defaultTarget: "plain-postgres",
	optInTargets: ["doltgres", "plain-postgres"],
	measurement: {
		driver: "pgx",
		conns: 64,
		failedConns: 0,
		perfRatio: 0.3,
		reproducible: true,
	},
	thresholds: { maxPerfRatio: 6.0, maxFailedConns: 0 },
	reasons: ["go (S88 measured run)"],
};

/** A sample entity so the screen has something to provision out of the box. */
export const SAMPLE_ENTITY: Entity = {
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
	],
};
