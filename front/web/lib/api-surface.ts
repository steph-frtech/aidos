/**
 * api-surface — the TS twin of back/runtime/apisurface (S90, app-builder EPIC 9,
 * ADR 0040). DETERMINISM-FIRST (CLAUDE.md §6/§8): the emitted app's COMPLETE API
 * surface — the Hono/TS router, the per-app OpenAPI 3.1 document, and the Pact suite
 * (ONE contract per operation) — is a PURE function of the project's Kernel cut. Same
 * spec → byte-identical surface (same content-addressed hash). The Vitest/fast-check
 * mirror (api-surface.test.ts) pins same-input→same-output + the policy-enforcement
 * verdict; the AUTHORITATIVE engine is the Go package (this twin lets the Workbench
 * render + verify the surface from the screen without a backend round-trip).
 *
 * THE WALL (CLAUDE.md §2): pure emission over a supplied spec — writes NOTHING. The
 * handler reaches the business rule through the Go SIDECAR interpreter callback
 * (ADR 0040 Déc.7); a policy DENY → HTTP 403, never the mutate. The emitter authors
 * no route/path/policy/verb — it reads the operation's two schemas (input + entity).
 */

export type ScalarType = "string" | "int" | "decimal" | "bool" | "timestamptz";

export interface Attribute {
	name: string;
	type: ScalarType;
	required?: boolean;
}

export interface Entity {
	name: string;
	attributes: Attribute[];
}

export type Verb = "POST" | "GET";

export interface Op {
	name: string;
	entity: Entity;
	verb: Verb;
	/** an authorize step → the handler enforces the policy (a DENY → 403). */
	authorize?: boolean;
	/** an async op gets no synchronous HTTP route / Pact interaction (wired in the worker). */
	async?: boolean;
	/** the operation's INPUT schema (the POST request body); distinct from entity (response). */
	input?: Attribute[];
}

export interface ApiSpec {
	project: string;
	ops: Op[];
}

/** the closed validation cause set (a malformed spec is a BlockReason, never a throw). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

function validate(s: ApiSpec): BlockReason | null {
	const fail = (cause: string): BlockReason => ({
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Émission de la surface API refusée : la source est malformée ou vide (${cause}). Un emitter REND exactement ce que la source épingle ; il n'invente jamais une route, un chemin OpenAPI, une policy ni un verbe.`,
		howToFix: [
			"pin_the_source : complétez la source dans le Kernel (operations nommées, chacune liée à une entité typée).",
			"use_a_known_verb : chaque operation porte un verbe du jeu fermé (POST/GET) ; un verbe inconnu n'est jamais deviné.",
			"rerun aidos project : relancez l'émission une fois la source complète.",
		],
	});
	if (!s.project) return fail("spec pins no project");
	if (!s.ops || s.ops.length === 0) return fail("spec pins no operations");
	for (const op of s.ops) {
		if (!op.name) return fail("operation pins no name");
		if (!op.entity?.name) return fail("operation pins no entity");
		if (!op.entity.attributes || op.entity.attributes.length === 0)
			return fail("operation's entity pins no attributes");
		if (op.verb !== "POST" && op.verb !== "GET")
			return fail("operation pins an unknown HTTP verb");
	}
	return null;
}

/** the SYNC operations in canonical name order (input order never leaks). */
export function syncOps(s: ApiSpec): Op[] {
	return s.ops
		.filter((o) => !o.async)
		.slice()
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function pluralize(name: string): string {
	if (!name) return name;
	if (name.endsWith("s")) return name;
	if (name.endsWith("y")) return `${name.slice(0, -1)}ies`;
	return `${name}s`;
}

export function pathOf(op: Op): string {
	return `/${pluralize(op.entity.name.toLowerCase())}`;
}

function inputAttrs(op: Op): Attribute[] {
	if (op.input && op.input.length > 0) return op.input;
	return op.entity.attributes.filter((a) => a.required);
}

function exampleValueOf(t: ScalarType): unknown {
	switch (t) {
		case "int":
			return 1;
		case "decimal":
			return "0";
		case "bool":
			return false;
		case "timestamptz":
			return "1970-01-01T00:00:00Z";
		default:
			return "example";
	}
}

function jsonSchemaType(t: ScalarType): string {
	switch (t) {
		case "int":
			return "integer";
		case "decimal":
			return "number";
		case "bool":
			return "boolean";
		default:
			return "string";
	}
}

/** a stable, recursive key-sort canonicaliser (the TS mirror of records.Canonicalize). */
export function canonicalize(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** a small deterministic 64-bit FNV-1a hex digest (a content address; no crypto import). */
export function hash(s: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0xcbf29ce4;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 ^ (c + 0x9e3779b9), 0x01000193) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function sourceHash(s: ApiSpec): string {
	const ops = s.ops
		.slice()
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((op) => ({
			name: op.name,
			entity: op.entity.name,
			verb: op.verb,
			authorize: !!op.authorize,
			async: !!op.async,
			attrs: op.entity.attributes.map((a) => ({
				name: a.name,
				type: a.type,
				required: !!a.required,
			})),
			input: (op.input ?? []).map((a) => ({
				name: a.name,
				type: a.type,
				required: !!a.required,
			})),
		}));
	return hash(canonicalize({ project: s.project, ops }));
}

export interface Emitted {
	ok: boolean;
	path?: string;
	bytes?: string;
	outputHash?: string;
	block?: BlockReason;
}

// ── The Hono router ─────────────────────────────────────────────────────────────────────

export function emitRouter(s: ApiSpec): Emitted {
	const br = validate(s);
	if (br) return { ok: false, block: br };
	const sh = sourceHash(s);
	const L: string[] = [];
	L.push(`// CODE GENERATED BY AIDOS — DO NOT EDIT. source: ${sh}`);
	L.push(
		"// S90 emitted app API surface (Hono/functional TS, ADR 0040). One route per SYNC operation;",
	);
	L.push(
		"// each handler delegates to the Go SIDECAR interpreter callback (ADR 0040 Déc.7), policy DENY → 403.",
	);
	L.push('import { Hono } from "hono";');
	L.push("export type InterpretResult = { denied: boolean; result: unknown };");
	L.push(
		"export type OperationInterpreter = (operation: string, input: unknown) => Promise<InterpretResult>;",
	);
	L.push("export type Deps = { interpret: OperationInterpreter };");
	L.push("export function createRouter(deps: Deps): Hono {");
	L.push("\tconst app = new Hono();");
	L.push(
		`\tapp.use("*", async (c, next) => { c.header("x-app", ${JSON.stringify(s.project)}); await next(); });`,
	);
	L.push('\tapp.get("/healthz", (c) => c.json({ status: "ok" }, 200));');
	for (const op of syncOps(s)) {
		const path = pathOf(op);
		const method = op.verb.toLowerCase();
		const okStatus = op.verb === "GET" ? 200 : 201;
		L.push(`\tapp.${method}(${JSON.stringify(path)}, async (c) => {`);
		L.push(
			op.verb === "POST"
				? "\t\tconst input = await c.req.json().catch(() => ({}));"
				: "\t\tconst input = c.req.query();",
		);
		L.push(
			`\t\tconst verdict = await deps.interpret(${JSON.stringify(op.name)}, input);`,
		);
		if (op.authorize)
			L.push(
				'\t\tif (verdict.denied) return c.json({ error: "forbidden" }, 403);',
			);
		L.push(`\t\treturn c.json(verdict.result, ${okStatus});`);
		L.push("\t});");
	}
	L.push("\treturn app;");
	L.push("}");
	const bytes = `${L.join("\n")}\n`;
	return {
		ok: true,
		path: `gen/${s.project}/api/router.ts`,
		bytes,
		outputHash: hash(bytes),
	};
}

// ── The OpenAPI 3.1 document ─────────────────────────────────────────────────────────────

function attrsSchema(attrs: Attribute[]): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const a of attrs) {
		properties[a.name] = { type: jsonSchemaType(a.type) };
		if (a.required) required.push(a.name);
	}
	required.sort();
	const schema: Record<string, unknown> = { type: "object", properties };
	if (required.length > 0) schema.required = required;
	return schema;
}

export function emitOpenAPI(s: ApiSpec): Emitted {
	const br = validate(s);
	if (br) return { ok: false, block: br };
	const paths: Record<string, Record<string, unknown>> = {};
	const schemas: Record<string, unknown> = {};
	for (const op of syncOps(s)) {
		const path = pathOf(op);
		schemas[op.entity.name] = attrsSchema(op.entity.attributes);
		const okCode = op.verb === "GET" ? "200" : "201";
		const responses: Record<string, unknown> = {
			[okCode]: {
				description: "ok",
				content: {
					"application/json": {
						schema: { $ref: `#/components/schemas/${op.entity.name}` },
					},
				},
			},
		};
		if (op.authorize)
			responses["403"] = { description: "forbidden (policy DENY)" };
		const operationObj: Record<string, unknown> = {
			operationId: op.name,
			summary: op.name,
			responses,
		};
		if (op.verb === "POST") {
			let ref = op.entity.name;
			if (op.input && op.input.length > 0) {
				const inName = `${op.name}Input`;
				schemas[inName] = attrsSchema(op.input);
				ref = inName;
			}
			operationObj.requestBody = {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: `#/components/schemas/${ref}` },
					},
				},
			};
		}
		paths[path] = paths[path] ?? {};
		paths[path][op.verb.toLowerCase()] = operationObj;
	}
	const doc = {
		openapi: "3.1.0",
		info: { title: `${s.project} API`, version: "1.0.0" },
		paths,
		components: { schemas },
	};
	// canonicalise → parse → pretty (2-space) so the bytes are byte-stable & key-sorted.
	const pretty = `${JSON.stringify(JSON.parse(canonicalize(doc)), null, 2)}\n`;
	return {
		ok: true,
		path: `gen/${s.project}/api/openapi.json`,
		bytes: pretty,
		outputHash: hash(pretty),
	};
}

// ── The Pact suite (one contract per operation) ──────────────────────────────────────────

export interface PactContract {
	op: string;
	consumer: { name: string };
	provider: { name: string };
	interactions: {
		description: string;
		request: { method: string; path: string; body?: Record<string, unknown> };
		response: { status: number; body?: Record<string, unknown> };
	}[];
	metadata: { pactSpecification: { version: string } };
}

export function emitPactSuite(s: ApiSpec): {
	ok: boolean;
	contracts?: PactContract[];
	block?: BlockReason;
} {
	const br = validate(s);
	if (br) return { ok: false, block: br };
	const contracts: PactContract[] = [];
	for (const op of syncOps(s)) {
		const path = pathOf(op);
		const respBody: Record<string, unknown> = {};
		for (const a of op.entity.attributes)
			respBody[a.name] = exampleValueOf(a.type);
		const reqBody: Record<string, unknown> = {};
		if (op.verb === "POST")
			for (const a of inputAttrs(op)) reqBody[a.name] = exampleValueOf(a.type);
		const okStatus = op.verb === "GET" ? 200 : 201;
		const interactions: PactContract["interactions"] = [
			{
				description: `${op.name} honours ${op.entity.name}`,
				request: {
					method: op.verb,
					path,
					body: Object.keys(reqBody).length ? reqBody : undefined,
				},
				response: { status: okStatus, body: respBody },
			},
		];
		if (op.authorize) {
			interactions.push({
				description: `${op.name} denies an unauthorized caller`,
				request: {
					method: op.verb,
					path,
					body: { ...reqBody, __deny__: true },
				},
				response: { status: 403, body: { error: "forbidden" } },
			});
		}
		contracts.push({
			op: op.name,
			consumer: { name: `${s.project}-client` },
			provider: { name: `${op.name}-provider` },
			interactions,
			metadata: { pactSpecification: { version: "3.0.0" } },
		});
	}
	return { ok: true, contracts };
}

// ── Provider verification (the deterministic policy verdict) ─────────────────────────────

/**
 * sidecarVerdict mirrors the Go SidecarVerdict: a DETERMINISTIC, REPRODUCIBLE verdict —
 * DENIED iff the input carries the __deny__ marker AND the op authorizes (the same
 * reproducible policy trigger the Go interpreter enforces). No LLM, no clock.
 */
export function sidecarVerdict(
	op: Op,
	input: Record<string, unknown>,
): { denied: boolean; result: Record<string, unknown> } {
	const denied = !!op.authorize && input.__deny__ === true;
	const result: Record<string, unknown> = {};
	for (const a of op.entity.attributes)
		result[a.name] = a.name in input ? input[a.name] : exampleValueOf(a.type);
	return { denied, result };
}

export interface VerifyResult {
	pass: boolean;
	reason: string;
	interactions: string[];
}

/** verifySuite replays every interaction in the suite through sidecarVerdict (provider verification). */
export function verifySuite(s: ApiSpec): VerifyResult {
	const suite = emitPactSuite(s);
	if (!suite.ok || !suite.contracts)
		return {
			pass: false,
			reason: suite.block?.explanation ?? "blocked",
			interactions: [],
		};
	const byName = new Map(syncOps(s).map((o) => [o.name, o]));
	const verified: string[] = [];
	for (const c of suite.contracts) {
		const op = byName.get(c.op)!;
		for (const it of c.interactions) {
			const verdict = sidecarVerdict(
				op,
				(it.request.body ?? {}) as Record<string, unknown>,
			);
			const wantDeny = it.response.status === 403;
			if (op.authorize && verdict.denied !== wantDeny) {
				return {
					pass: false,
					reason: `operation ${c.op}: ${it.description}: policy verdict mismatch`,
					interactions: verified,
				};
			}
			verified.push(it.description);
		}
	}
	return {
		pass: true,
		reason: "all operations honoured their contracts",
		interactions: verified,
	};
}
