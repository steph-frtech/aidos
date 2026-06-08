/**
 * The relation-aware emitter twin — the Workbench /relation-emitter source (AIDOS S74).
 *
 * The DECLARED projection of the Go package back/kernel/entities/relemit: the
 * RELATION-AWARE, MULTI-ENTITY emitter that projects a whole schema cut (entities + their
 * relations S71 + their async ops S73) into the emitted app's targets (ADR 0040):
 *   - DDL  → FK columns (1-1/1-N), a JOIN TABLE per N-N, an OUTBOX table when async; every
 *            FK REFERENCES a real declared table.
 *   - TS   → typed associations + a navigation SDK.
 *   - Worker → the async worker (TS) draining the outbox.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every emit is a PURE function of its input — no
 * clock, no rng, no I/O, no LLM — and CANONICALISES (entities by name) before rendering,
 * so the SAME schema → byte-identical output, INVARIANT to input order. The Go output is
 * the AUTHORITATIVE truth; this twin reproduces it for the screen so the panel can show a
 * live, deterministic preview. The reproducibility mirror lib/relation-emitter.test.ts
 * (fast-check) pins determinism, the input-order invariance, the N-N join table, and the
 * FK-references-a-real-table honesty.
 *
 * READ-ONLY (the wall): /relation-emitter PROJECTS; it never writes truth. The emitted
 * bytes are a projection (S78 owns regeneration), never a kernel write.
 */

export type ScalarType = "string" | "int" | "decimal" | "bool" | "timestamptz";

export type Cardinality = "1-1" | "1-N" | "N-N";

export interface Attribute {
	name: string;
	type: ScalarType;
	required?: boolean;
	identifier?: boolean;
}

export interface Relation {
	name: string;
	target: string;
	cardinality: Cardinality;
	required?: boolean;
}

export interface EntityRelations {
	name: string;
	attributes: Attribute[];
	relations?: Relation[];
}

export interface AsyncOp {
	name: string;
	/** the cron echeance (RFC3339) for a cron op; empty otherwise. */
	at?: string;
	kind: "cron" | "queue" | "webhook_out" | "notification";
}

export interface Schema {
	project: string;
	entities: EntityRelations[];
	asyncOps?: AsyncOp[];
}

/** The closed scalar→DDL mapping (reused from S35, never widened). */
const SCALAR_DDL: Record<ScalarType, string> = {
	string: "TEXT",
	int: "BIGINT",
	decimal: "NUMERIC",
	bool: "BOOLEAN",
	timestamptz: "TIMESTAMPTZ",
};

/** The closed scalar→TS mapping (reused from S35). */
const SCALAR_TS: Record<ScalarType, string> = {
	string: "string",
	int: "number",
	decimal: "string",
	bool: "boolean",
	timestamptz: "string",
};

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

function lower(s: string): string {
	return s.toLowerCase();
}

function tsName(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** identifierOf returns an entity's identifier attribute name, or null. */
function identifierOf(e: EntityRelations): string | null {
	const id = e.attributes.find((a) => a.identifier);
	return id ? id.name : null;
}

/** canonicalEntities sorts entities by lowercased name (the canonical emit order). */
function canonicalEntities(s: Schema): EntityRelations[] {
	return [...s.entities].sort((a, b) =>
		lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : 0,
	);
}

function canonicalAsync(s: Schema): AsyncOp[] {
	return [...(s.asyncOps ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
}

const HOW_TO_FIX = [
	"pin_an_identifier : chaque cible de FK (1-1/1-N) et chaque bout d'un N-N porte exactement un attribut identifier.",
	"declare_the_target : une relation ne référence qu'une entité du jeu déclaré (S70) ; un target hors-jeu est UNKNOWN_RELATION_TARGET.",
	"name_the_async : chaque opération async porte un nom.",
];

/** Validate checks the whole schema is projectable (mirrors Go relemit.Validate). */
export function validate(s: Schema): BlockReason | null {
	const fail = (msg: string): BlockReason => ({
		code: "UNKNOWN_RELATION_TARGET",
		severity: "blocking",
		explanation: `Émission multi-entités refusée : ${msg}. L'émetteur n'invente jamais une table, une colonne ni une FK.`,
		how_to_fix: HOW_TO_FIX,
	});
	if (!s.project) return fail("le schéma n'épingle aucun projet");
	if (!s.entities || s.entities.length === 0)
		return fail("le schéma n'épingle aucune entité");
	const known = new Set<string>();
	const hasId = new Set<string>();
	for (const e of s.entities) {
		if (!e.name) return fail("une entité n'épingle aucun nom");
		if (!e.attributes || e.attributes.length === 0)
			return fail(`l'entité ${e.name} n'a aucun attribut`);
		known.add(lower(e.name));
		if (identifierOf(e)) hasId.add(lower(e.name));
	}
	for (const e of s.entities) {
		for (const r of e.relations ?? []) {
			if (!known.has(lower(r.target)))
				return fail(`la relation ${r.name} cible ${r.target} (non déclarée)`);
			if (r.cardinality !== "N-N" && !hasId.has(lower(r.target)))
				return fail(
					`la relation ${r.name} cible ${r.target} qui n'a pas d'identifier`,
				);
			if (
				r.cardinality === "N-N" &&
				(!hasId.has(lower(e.name)) || !hasId.has(lower(r.target)))
			)
				return fail(
					`la relation N-N ${r.name} requiert un identifier sur ${e.name} et ${r.target}`,
				);
		}
	}
	for (const ao of s.asyncOps ?? []) {
		if (!ao.name) return fail("une opération async n'épingle aucun nom");
		if (ao.kind === "cron" && !ao.at)
			return fail(`l'op cron ${ao.name} n'a pas d'échéance`);
	}
	return null;
}

export function isBlocked<T>(v: T | BlockReason): v is BlockReason {
	return (
		typeof v === "object" && v !== null && "code" in v && "how_to_fix" in v
	);
}

const MARKER = "CODE GENERATED BY AIDOS — DO NOT EDIT";

/** emitDDL renders the multi-entity Postgres DDL (mirrors Go relemit.EmitDDL). */
export function emitDDL(s: Schema): string | BlockReason {
	const bad = validate(s);
	if (bad) return bad;
	const ents = canonicalEntities(s);
	const idCol = new Map<string, string>();
	for (const e of ents) {
		const id = identifierOf(e);
		if (id) idCol.set(lower(e.name), id);
	}
	const out: string[] = [
		`-- ${MARKER}.`,
		"-- S74 relation-aware multi-entity DDL: FK columns, N-N join tables, async outbox.",
		"",
	];
	for (const e of ents) {
		const table = lower(e.name);
		out.push(`CREATE TABLE "${table}" (`);
		const lines: string[] = [];
		const id = identifierOf(e);
		for (const a of e.attributes) {
			let line = `    "${a.name}" ${SCALAR_DDL[a.type]}`;
			if (id && a.name === id) line += " PRIMARY KEY";
			if (a.required) line += " NOT NULL";
			lines.push(line);
		}
		for (const r of e.relations ?? []) {
			if (r.cardinality === "N-N") continue;
			const fkCol = `${lower(r.name)}_id`;
			const targetTable = lower(r.target);
			let line = `    "${fkCol}" BIGINT`;
			if (r.required) line += " NOT NULL";
			if (r.cardinality === "1-1") line += " UNIQUE";
			line += ` REFERENCES "${targetTable}"("${idCol.get(targetTable)}")`;
			lines.push(line);
		}
		out.push(lines.join(",\n"));
		out.push(");", "");
	}
	for (const e of ents) {
		const owner = lower(e.name);
		for (const r of e.relations ?? []) {
			if (r.cardinality !== "N-N") continue;
			const target = lower(r.target);
			const join = `${owner}_${lower(r.name)}`;
			out.push(`CREATE TABLE "${join}" (`);
			out.push(
				`    "${owner}_id" BIGINT NOT NULL REFERENCES "${owner}"("${idCol.get(owner)}"),`,
			);
			out.push(
				`    "${target}_id" BIGINT NOT NULL REFERENCES "${target}"("${idCol.get(target)}"),`,
			);
			out.push(`    PRIMARY KEY ("${owner}_id", "${target}_id")`);
			out.push(");", "");
		}
	}
	if ((s.asyncOps ?? []).length > 0) {
		out.push(
			"-- async outbox (S73): the at-least-once delivery log the worker drains.",
		);
		out.push(
			'CREATE TABLE "outbox" (',
			'    "effect_id" TEXT PRIMARY KEY,',
			'    "operation" TEXT NOT NULL,',
			'    "kind" TEXT NOT NULL,',
			'    "target" TEXT NOT NULL,',
			'    "payload" JSONB NOT NULL,',
			'    "dispatched" BOOLEAN NOT NULL DEFAULT FALSE,',
			'    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()',
			");",
			"",
		);
	}
	return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** emitTS renders the typed model + navigation SDK (mirrors Go relemit.EmitTS). */
export function emitTS(s: Schema): string | BlockReason {
	const bad = validate(s);
	if (bad) return bad;
	const ents = canonicalEntities(s);
	const out: string[] = [
		`// ${MARKER}.`,
		"// S74 relation-aware multi-entity model: typed associations + navigation SDK (Hono/TS, ADR 0040).",
		"",
	];
	for (const e of ents) {
		out.push(`export type ${tsName(e.name)} = {`);
		for (const a of e.attributes)
			out.push(`\t${a.name}${a.required ? "" : "?"}: ${SCALAR_TS[a.type]};`);
		for (const r of e.relations ?? []) {
			if (r.cardinality === "N-N")
				out.push(`\t${r.name}?: ${tsName(r.target)}[];`);
			else {
				out.push(`\t${r.name}_id${r.required ? "" : "?"}: number;`);
				out.push(`\t${r.name}?: ${tsName(r.target)};`);
			}
		}
		out.push("};", "");
	}
	out.push(
		"// Navigation SDK — typed graph traversal (one loader per relation).",
	);
	for (const e of ents) {
		const owner = tsName(e.name);
		for (const r of e.relations ?? []) {
			const loader = `load${owner}${tsName(r.name)}`;
			const target = tsName(r.target);
			if (r.cardinality === "N-N")
				out.push(
					`export async function ${loader}(owner: ${owner}): Promise<${target}[]>;`,
				);
			else
				out.push(
					`export async function ${loader}(owner: ${owner}): Promise<${target} | undefined>;`,
				);
		}
	}
	return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** emitWorker renders the async worker (mirrors Go relemit.EmitWorker). Refuses no-async. */
export function emitWorker(s: Schema): string | BlockReason {
	const bad = validate(s);
	if (bad) return bad;
	if ((s.asyncOps ?? []).length === 0)
		return {
			code: "UNKNOWN_RELATION_TARGET",
			severity: "blocking",
			explanation: "Aucune opération async : il n'y a pas de worker à émettre.",
			how_to_fix: HOW_TO_FIX,
		};
	const out: string[] = [
		`// ${MARKER}.`,
		"// S74 async worker: drains the outbox, dispatches typed effects (Hono/TS, ADR 0040).",
		"",
	];
	for (const ao of canonicalAsync(s)) {
		const opConst = tsName(ao.name);
		if (ao.kind === "cron")
			out.push(
				`export const ${ao.name.toUpperCase()}_SCHEDULED_AT = ${JSON.stringify(ao.at ?? "")};`,
			);
		out.push(`export async function dispatch${opConst}(): Promise<number>;`);
	}
	return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** A canonical demo schema (author 1-N book, book N-N tag, one cron async). */
export const DEMO_SCHEMA: Schema = {
	project: "library",
	entities: [
		{
			name: "author",
			attributes: [
				{ name: "id", type: "int", required: true, identifier: true },
				{ name: "name", type: "string", required: true },
			],
		},
		{
			name: "book",
			attributes: [
				{ name: "id", type: "int", required: true, identifier: true },
				{ name: "title", type: "string", required: true },
			],
			relations: [
				{
					name: "author",
					target: "author",
					cardinality: "1-N",
					required: true,
				},
				{ name: "tags", target: "tag", cardinality: "N-N" },
			],
		},
		{
			name: "tag",
			attributes: [
				{ name: "id", type: "int", required: true, identifier: true },
				{ name: "label", type: "string", required: true },
			],
		},
	],
	asyncOps: [
		{ name: "sendReminder", kind: "cron", at: "2026-06-08T09:00:00Z" },
	],
};
