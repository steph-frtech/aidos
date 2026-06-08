/**
 * The DATA-MIGRATION-OF-THE-EMITTED-APP twin — the Workbench /data-migrate source (AIDOS S95).
 *
 * The DECLARED projection of the Go package back/runtime/datamigrate: the deterministic
 * planner that turns a BREAKING schema change of a DEPLOYED emitted app (one carrying REAL
 * rows) into a content-addressed, expand-contract + backfill migration plan, DataTruthScope-
 * gated. It proves the hard cases — RENAME-WITH-BACKFILL (no row loses its value), ENTITY
 * SPLIT (rows ventilated into the new table), 1-N→N-N CARDINALITY (FK backfilled into a join
 * table) — each non-destructive until the contract step, forward-only.
 *
 * THE GATE (§44.3): a breaking change with NO declared backfill is REFUSED with
 * BREAKING_MIGRATION_NO_BACKFILL — never a silent DROP. The breaking-ness is COMPUTED, never
 * an LLM judgment (determinism-first, §6/§8).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan is a PURE function of its input — no clock,
 * no rng, no I/O, no LLM. Same change → byte-identical plan (same id, same steps, same
 * backfill SQL). The Go output is the AUTHORITATIVE truth; this twin reproduces the structure
 * for the screen. DRIVER-NEUTRAL: the plan is emitted SQL + a content address. The
 * reproducibility mirror lib/datamigrate.test.ts (fast-check) pins it.
 *
 * READ-ONLY (the wall): /data-migrate PLANS; it writes no truth.
 */

export type ChangeKind = "rename" | "split" | "cardinality";
export const CHANGE_KINDS: ChangeKind[] = ["rename", "split", "cardinality"];

export interface DataTruthScope {
	appliesTo: string[];
	migrationRequired: boolean;
	strategy: string;
	preserveOldTruth: boolean;
}

export interface RenameChange {
	entity: string;
	from: string;
	to: string;
	type: string;
}
export interface SplitChange {
	source: string;
	newEntity: string;
	column: string;
	type: string;
}
export interface CardinalityChange {
	source: string;
	target: string;
	relation: string;
	from: string; // "1-N"
	to: string; // "N-N"
}

export interface Change {
	project: string;
	kind: ChangeKind;
	rename?: RenameChange;
	split?: SplitChange;
	cardinality?: CardinalityChange;
	scope?: DataTruthScope;
}

export interface Step {
	stage: "expand" | "backfill" | "contract";
	sql: string;
	note: string;
}

export interface Plan {
	id: string;
	project: string;
	kind: ChangeKind;
	description: string;
	steps: Step[];
	migrationRequired: boolean;
	preservesAllData: boolean;
}

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

const SCALARS = new Set(["text", "numeric", "int", "bool", "timestamptz"]);

/** A deterministic FNV-1a digest (display content address — the Go records.Hash is
 * authoritative). Same bytes → same digest, no clock/rng. */
export function digest(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

function inputFail(msg: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Data-migration refused: ${msg}`,
		how_to_fix: [
			"Provide a project, a known change kind, and the matching change body.",
			"Use only the closed scalar type set for renamed/moved columns.",
			"A cardinality change must widen 1-N → N-N.",
		],
	};
}

/** The S95 breaking-no-backfill refusal — the canonical registry shape, FR prose mirrors the Go. */
export function breakingFail(): BlockReason {
	return {
		code: "BREAKING_MIGRATION_NO_BACKFILL",
		severity: "blocking",
		explanation:
			"La migration de donnée de l'app émise est REFUSÉE : le changement de schéma est BREAKING pour les données déjà produites (rename, split ou cardinalité 1-N→N-N) et AUCUN BACKFILL n'est déclaré. Refusée AVANT tout DROP, jamais exécutée en silence sur une app déployée avec de vraies lignes (§44.3, §9 anti-overwrite).",
		how_to_fix: [
			"declare_the_backfill : déclarez une DataTruthScope dont migration.required:true, une strategy connue et audit.preserve_old_truth:true.",
			"use_expand_contract : étalez le changement en EXPAND → BACKFILL → CONTRACT, jamais un DROP destructif unique.",
			"prove_no_data_loss : rejouez la migration sur un Postgres réel ensemencé et assertez que toute ligne survit.",
		],
	};
}

const KNOWN_STRATEGIES = new Set([
	"expand_contract",
	"backfill",
	"dual_read",
	"dual_write",
]);

/** hasValidBackfill — the §44.3 gate: required:true, a KNOWN strategy, preserve_old_truth:true.
 * Returns the strategy refusal when the declaration is malformed, else null when valid, and a
 * sentinel when the declaration is simply absent/insufficient (the breaking refusal). */
function gate(scope?: DataTruthScope): { ok: boolean; block?: BlockReason } {
	if (scope && !KNOWN_STRATEGIES.has(scope.strategy)) {
		return {
			ok: false,
			block: {
				code: "UNKNOWN_MIGRATION_STRATEGY",
				severity: "blocking",
				explanation: `Une DataTruthScope déclare une migration.strategy "${scope.strategy}" hors de l'ensemble fermé §44.3.`,
				how_to_fix: [
					"Choisissez une strategy dans {expand_contract, backfill, dual_read, dual_write}.",
				],
			},
		};
	}
	if (!scope || !scope.migrationRequired || !scope.preserveOldTruth) {
		return { ok: false }; // breaking refusal (no/insufficient backfill)
	}
	return { ok: true };
}

function ddlType(t: string): string {
	switch (t) {
		case "text":
			return "TEXT";
		case "numeric":
			return "NUMERIC";
		case "int":
			return "BIGINT";
		case "bool":
			return "BOOLEAN";
		case "timestamptz":
			return "TIMESTAMPTZ";
		default:
			return "TEXT";
	}
}

const q = (s: string) => `"${s.toLowerCase()}"`;

function validateBody(c: Change): BlockReason | null {
	if (c.kind === "rename") {
		const r = c.rename;
		if (!r) return inputFail("rename change has no rename body");
		if (!r.entity || !r.from || !r.to)
			return inputFail("a required name is empty");
		if (!SCALARS.has(r.type))
			return inputFail("column type outside the closed scalar set");
	} else if (c.kind === "split") {
		const s = c.split;
		if (!s) return inputFail("split change has no split body");
		if (!s.source || !s.newEntity || !s.column)
			return inputFail("a required name is empty");
		if (!SCALARS.has(s.type))
			return inputFail("column type outside the closed scalar set");
	} else if (c.kind === "cardinality") {
		const cc = c.cardinality;
		if (!cc) return inputFail("cardinality change has no body");
		if (!cc.source || !cc.target || !cc.relation)
			return inputFail("a required name is empty");
		if (cc.from !== "1-N" || cc.to !== "N-N")
			return inputFail("cardinality change must widen 1-N → N-N");
	}
	return null;
}

function stage(c: Change): { steps: Step[]; description: string } {
	if (c.kind === "rename") {
		const r = c.rename as RenameChange;
		const t = q(r.entity);
		return {
			steps: [
				{
					stage: "expand",
					sql: `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${q(r.to)} ${ddlType(r.type)};`,
					note: "additive: the new column is added NULLable, no historical row rewritten",
				},
				{
					stage: "backfill",
					sql: `UPDATE ${t} SET ${q(r.to)} = ${q(r.from)} WHERE ${q(r.to)} IS NULL;`,
					note: "recopy every existing row's value old→new — no value lost",
				},
				{
					stage: "contract",
					sql: `ALTER TABLE ${t} DROP COLUMN IF EXISTS ${q(r.from)};`,
					note: "drop the old column in a SEPARATE forward step, AFTER backfill",
				},
			],
			description: `rename ${r.entity.toLowerCase()}.${r.from.toLowerCase()} → ${r.entity.toLowerCase()}.${r.to.toLowerCase()} with backfill`,
		};
	}
	if (c.kind === "split") {
		const s = c.split as SplitChange;
		const src = q(s.source);
		const ne = q(s.newEntity);
		return {
			steps: [
				{
					stage: "expand",
					sql: `CREATE TABLE IF NOT EXISTS ${ne} (id TEXT PRIMARY KEY, ${q(s.column)} ${ddlType(s.type)});`,
					note: "additive: the new entity's table is created, the source table untouched",
				},
				{
					stage: "backfill",
					sql: `INSERT INTO ${ne} (id, ${q(s.column)}) SELECT id, ${q(s.column)} FROM ${src} ON CONFLICT (id) DO NOTHING;`,
					note: "ventilate every source row's column into the new table — every row preserved",
				},
				{
					stage: "contract",
					sql: `ALTER TABLE ${src} DROP COLUMN IF EXISTS ${q(s.column)};`,
					note: "drop the moved column from the source in a SEPARATE forward step, AFTER backfill",
				},
			],
			description: `split ${s.source.toLowerCase()} → ${s.newEntity.toLowerCase()} (move column ${s.column.toLowerCase()}) with backfill`,
		};
	}
	const cc = c.cardinality as CardinalityChange;
	const src = cc.source.toLowerCase();
	const tgt = cc.target.toLowerCase();
	const rel = cc.relation.toLowerCase();
	const join = q(`${src}_${tgt}`);
	const srcID = q(`${src}_id`);
	const tgtID = q(`${tgt}_id`);
	const srcTable = q(src);
	const fkCol = q(`${rel}_id`);
	return {
		steps: [
			{
				stage: "expand",
				sql: `CREATE TABLE IF NOT EXISTS ${join} (${srcID} TEXT, ${tgtID} TEXT, PRIMARY KEY (${srcID}, ${tgtID}));`,
				note: "additive: the N-N join table is created, the source FK column untouched",
			},
			{
				stage: "backfill",
				sql: `INSERT INTO ${join} (${srcID}, ${tgtID}) SELECT id, ${fkCol} FROM ${srcTable} WHERE ${fkCol} IS NOT NULL ON CONFLICT DO NOTHING;`,
				note: "backfill the join table from every existing 1-N FK value — no relation lost",
			},
			{
				stage: "contract",
				sql: `ALTER TABLE ${srcTable} DROP COLUMN IF EXISTS ${fkCol};`,
				note: "drop the inline FK column in a SEPARATE forward step, AFTER backfill",
			},
		],
		description: `cardinality ${src}→${tgt} relation ${rel}: 1-N → N-N with backfill`,
	};
}

/** preservesAllData — the COMPUTED no-loss guarantee: every contract step is preceded by a
 * backfill step. A pure check — code judges no-loss, never an agent. */
export function preservesAllData(steps: Step[]): boolean {
	let seenBackfill = false;
	for (const s of steps) {
		if (s.stage === "backfill") seenBackfill = true;
		if (s.stage === "contract" && !seenBackfill) return false;
	}
	return seenBackfill;
}

/** buildPlan — the deterministic, content-addressed data-migration plan. Same change →
 * byte-identical plan (same id, same steps). A breaking change with no backfill is REFUSED.
 * Writes nothing (the wall). */
export function buildPlan(c: Change): Plan | BlockReason {
	if (!c.project)
		return inputFail(
			"change has no project (the migration is per deployed app)",
		);
	if (!CHANGE_KINDS.includes(c.kind))
		return inputFail("unknown change kind (the set is closed)");
	const bodyErr = validateBody(c);
	if (bodyErr) return bodyErr;

	const g = gate(c.scope);
	if (!g.ok) return g.block ?? breakingFail();

	const { steps, description } = stage(c);
	const preserves = preservesAllData(steps);
	const idBody = JSON.stringify({
		description,
		kind: c.kind,
		migration_required: true,
		preserves_all_data: preserves,
		project: c.project,
		steps: steps.map((s) => ({ note: s.note, sql: s.sql, stage: s.stage })),
	});
	return {
		id: digest(idBody),
		project: c.project,
		kind: c.kind,
		description,
		steps,
		migrationRequired: true,
		preservesAllData: preserves,
	};
}

/** isBlock — narrow a buildPlan result. */
export function isBlock(r: Plan | BlockReason): r is BlockReason {
	return (r as BlockReason).code !== undefined;
}
