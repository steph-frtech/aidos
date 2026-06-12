/**
 * env-emit.ts — the PURE TS twin of the authoritative Go emitter
 * `back/runtime/envemit` (DP04 — the additive Targets env-example +
 * start-scripts: Emit(stack_manifest) → .env.example + start.sh +
 * start_with_rebuild.sh).
 *
 * THE MERGE ORDER IS ENGRAVED: the /data/dockers env merge (global →
 * bp-default → bp-secrets → deploy-time, deploy.sh) is a pure emission
 * template — four declared layers, last write wins (deploy-time APP_NAME
 * replaces the inherited one) — never an interactive sed.
 *
 * ZERO SECRET VALUES (the S91 contract): a secret key is emitted as the
 * reference `<<from-secret-store>>` — the value lives encrypted in the S91
 * secret store and is injected at boot (DP32); it never enters the emitted
 * source. The deterministic gitleaks-like scan (the same CLOSED rule set as
 * Go secretstore.ScanEmission — code, never an LLM) is green by construction.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8, ADR 0036 EMITTED_FUNCTION_PURE): the
 * emission is a pure function of Canonicalize(manifest) — no clock, no RNG,
 * keys in stable (sorted) order inside each layer, "\n" newlines. THE GO CODE
 * IS AUTHORITATIVE; this twin is byte-parity-pinned to it by the vitest
 * mirror (env-emit.test.ts pins GO_ENV_OUTPUT_HASH / GO_START_OUTPUT_HASH /
 * GO_REBUILD_OUTPUT_HASH for the seeded Example). Any one-byte divergence
 * reds.
 *
 * THE WALL (CLAUDE.md §2): emitting is a below-the-line projection — this
 * module writes nothing; the /stack-emit route only MEASURES.
 */

import {
	hashManifest,
	type Refusal,
	type StackManifest,
	validate,
} from "./stack-manifest";

/** The DP04 additive targets of the closed kind × target matrix. */
export const TARGET_ENV_EXAMPLE = "env-example";
export const TARGET_START_SCRIPTS = "start-scripts";

/** The engraved /data/dockers merge order (global → … → deploy-time). */
export const MERGE_ORDER = [
	"global",
	"bp-default",
	"bp-secrets",
	"deploy-time",
] as const;
export type Layer = (typeof MERGE_ORDER)[number];

/** The two placeholder values — a reference, NEVER a secret value. */
export const SECRET_PLACEHOLDER = "<<from-secret-store>>";
export const DEPLOY_TIME_PLACEHOLDER = "<<set-at-deploy-time>>";

const LAYER_SOURCE: Record<Layer, string> = {
	global: "deployments/.env",
	"bp-default": "boilerplates/<bp>/.env",
	"bp-secrets": "boilerplates/<bp>/.secrets",
	"deploy-time": "deploy.sh — APP_NAME remplace la valeur héritée",
};

/** One emitted projection — double content-addressed (source + output). */
export interface EnvArtifact {
	path: string;
	target: typeof TARGET_ENV_EXAMPLE | typeof TARGET_START_SCRIPTS;
	kind: "stack_manifest";
	text: string;
	sourceHash: string;
	outputHash: string;
	protected: true;
}

/** The DP04 emission bundle: the three byte-stable artifacts. */
export interface EnvBundle {
	envExample: EnvArtifact;
	startSh: EnvArtifact;
	startWithRebuild: EnvArtifact;
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The same service-name → env-var fold as Go envemit/composeemit. */
function envVarName(serviceName: string): string {
	return serviceName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** APP_SECRET_<UPPER_SNAKE(name)> — the S91 secretstore.EnvVar twin. */
export function secretEnvVar(name: string): string {
	return `APP_SECRET_${name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
}

interface MergedEntry {
	value: string;
	layer: Layer;
}

/** The engraved merge — for each key, the (value, layer) of its LAST write. */
function mergeEnv(m: StackManifest): Map<string, MergedEntry> {
	const merged = new Map<string, MergedEntry>();
	const write = (layer: Layer, key: string, value: string) =>
		merged.set(key, { value, layer });

	// 1. global — deployments/.env (the documented host-global PAT — reference).
	write("global", "GITHUB_PERSONAL_ACCESS_TOKEN", SECRET_PLACEHOLDER);

	// 2. bp-default — the non-secret defaults every compose ref resolves through.
	write("bp-default", "APP_NAME", DEPLOY_TIME_PLACEHOLDER);
	write("bp-default", "APP_SUBDOMAIN", DEPLOY_TIME_PLACEHOLDER);
	write("bp-default", "DOMAIN", DEPLOY_TIME_PLACEHOLDER);
	write("bp-default", "CERT_RESOLVER_NAME", DEPLOY_TIME_PLACEHOLDER);
	write("bp-default", "TRAEFIK_NETWORK_NAME", DEPLOY_TIME_PLACEHOLDER);
	const volumes = [...(m.volumes ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	for (const v of volumes) {
		write("bp-default", v.device_var, DEPLOY_TIME_PLACEHOLDER);
	}
	const services = [...m.services].sort((a, b) => (a.name < b.name ? -1 : 1));
	for (const s of services) {
		write("bp-default", `${envVarName(s.name)}_PORT`, String(s.internal_port));
	}
	for (const s of services) {
		if (!s.image || s.image === "") {
			write(
				"bp-default",
				`${envVarName(s.name)}_IMAGE`,
				DEPLOY_TIME_PLACEHOLDER,
			);
		}
	}

	// 3. bp-secrets — one S91 reference per declared connector scope.
	const scopes = [...(m.connector_scopes ?? [])].sort();
	for (const scope of scopes) {
		write("bp-secrets", secretEnvVar(scope), SECRET_PLACEHOLDER);
	}

	// 4. deploy-time — APP_NAME=<name> replaces the inherited value.
	write("deploy-time", "APP_NAME", m.app);

	return merged;
}

function header(sourceHash: string): string {
	return `# CODE GENERATED BY AIDOS — DO NOT EDIT. source: ${sourceHash}`;
}

/** renderEnvExample — the twin of Go envemit.renderEnvExample (byte-pinned). */
export function renderEnvExample(m: StackManifest, sourceHash: string): string {
	const merged = mergeEnv(m);
	const lines = [
		header(sourceHash),
		"# .env.example — toutes les clés attendues ; JAMAIS une valeur de secret.",
		"# Ordre de merge /data/dockers (gravé) : global → bp-default → bp-secrets → deploy-time.",
		"# Le .env mergé du déploiement est chmod 600 ; les secrets sont injectés au boot (S91).",
	];
	for (const layer of MERGE_ORDER) {
		const keys = [...merged.entries()]
			.filter(([, e]) => e.layer === layer)
			.map(([k]) => k)
			.sort();
		lines.push("", `# --- ${layer} (${LAYER_SOURCE[layer]}) ---`);
		if (keys.length === 0) {
			lines.push("# (aucune clé pour ce manifest)");
		}
		for (const k of keys) {
			const e = merged.get(k);
			if (e) lines.push(`${k}=${e.value}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

/** The deploy.sh-generated restart script (down → up), byte-pinned. */
export function renderStartSh(sourceHash: string): string {
	return `${[
		"#!/usr/bin/env bash",
		header(sourceHash),
		"# Redémarre l'instance sans reconstruire l'image",
		'cd "$(dirname "$0")"',
		"docker compose down",
		"docker compose up -d",
	].join("\n")}\n`;
}

/** The rebuild script (down → build --no-cache → up), byte-pinned. */
export function renderStartWithRebuildSh(sourceHash: string): string {
	return `${[
		"#!/usr/bin/env bash",
		header(sourceHash),
		"# Reconstruit l'image puis redémarre l'instance",
		'cd "$(dirname "$0")"',
		"docker compose down",
		"docker compose build --no-cache",
		"docker compose up -d",
	].join("\n")}\n`;
}

/**
 * emitEnvBundle — the DP04 pure emitter (twin of Go envemit.Emit): validate
 * (the DP02 closed codes — an invalid manifest is a Refusal, never a guessed
 * emission), content-address the source (hashManifest — S02 reused), render
 * the three artifacts, content-address each output.
 */
export async function emitEnvBundle(
	m: StackManifest,
): Promise<EnvBundle | { refusal: Refusal }> {
	const refusal = validate(m);
	if (refusal) {
		return { refusal };
	}
	const sourceHash = await hashManifest(m);
	const base = `back/gen/${m.app}/`;
	const make = async (
		path: string,
		target: EnvArtifact["target"],
		text: string,
	): Promise<EnvArtifact> => ({
		path,
		target,
		kind: "stack_manifest",
		text,
		sourceHash,
		outputHash: await sha256hex(text),
		protected: true,
	});
	return {
		envExample: await make(
			`${base}.env.example`,
			TARGET_ENV_EXAMPLE,
			renderEnvExample(m, sourceHash),
		),
		startSh: await make(
			`${base}start.sh`,
			TARGET_START_SCRIPTS,
			renderStartSh(sourceHash),
		),
		startWithRebuild: await make(
			`${base}start_with_rebuild.sh`,
			TARGET_START_SCRIPTS,
			renderStartWithRebuildSh(sourceHash),
		),
	};
}

/** One leak finding of the deterministic gitleaks-like scan. */
export interface LeakFinding {
	rule: string;
	line: number;
}

// The CLOSED, declared detector set — the same rules as the authoritative Go
// secretstore.ScanEmission (S91). Never learned, never an LLM.
const LEAK_RULES: Array<{ name: string; re: RegExp }> = [
	{ name: "aws-access-key-id", re: /AKIA[0-9A-Z]{16}/ },
	{
		name: "private-key-header",
		re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
	},
	{ name: "bearer-token", re: /bearer\s+[A-Za-z0-9._-]{20,}/i },
	{
		name: "postgres-uri-password",
		re: /postgres(?:ql)?:\/\/[^:/\s]+:[^@/\s]+@/,
	},
	{
		name: "secret-assignment",
		re: /(?:secret|api[_-]?key|password|passwd|token|client[_-]?secret)["'\s]*[:=]\s*["'][A-Za-z0-9._\-+/]{12,}["']/i,
	},
];

/**
 * scanEmission — the deterministic secret scan over emitted bytes (the S91
 * twin): the closed rules per line, findings in stable (line, rule) order.
 */
export function scanEmission(source: string): LeakFinding[] {
	const findings: LeakFinding[] = [];
	const lines = source.split("\n");
	for (let i = 0; i < lines.length; i++) {
		for (const r of LEAK_RULES) {
			if (r.re.test(lines[i])) {
				findings.push({ rule: r.name, line: i + 1 });
			}
		}
	}
	findings.sort((a, b) => a.line - b.line || (a.rule < b.rule ? -1 : 1));
	return findings;
}

/** isClean — the emission has NO leak findings (the gate the screen shows). */
export function isClean(source: string): boolean {
	return scanEmission(source).length === 0;
}

/** Keys — parse the keys of a rendered .env.example (comments skipped). */
export function envKeys(envExample: string): string[] {
	const keys: string[] = [];
	for (const raw of envExample.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq > 0) keys.push(line.slice(0, eq));
	}
	return keys;
}

/** ComposeEnvRefs — the ${VAR} references of an emitted compose (deduped, sorted). */
export function composeEnvRefs(compose: string): string[] {
	const seen = new Set<string>();
	for (const match of compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
		seen.add(match[1]);
	}
	return [...seen].sort();
}
