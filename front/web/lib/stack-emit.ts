/**
 * stack-emit.ts — the PURE TS twin of the authoritative Go emitter
 * `back/runtime/composeemit` (DP03 — the additive Target docker-compose:
 * Emit(stack_manifest) → docker-compose.yml, /data/dockers conventions).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8, ADR 0036 EMITTED_FUNCTION_PURE): the
 * emission is a pure function of Canonicalize(manifest) — no clock, no RNG,
 * services and volumes in stable (sorted) order, "\n" newlines. THE GO CODE
 * IS AUTHORITATIVE; this twin is byte-parity-pinned to it by the vitest
 * mirror (stack-emit.test.ts pins GO_OUTPUT_HASH — the sha-256 of the full
 * Go-emitted bytes for the seeded Example). Any one-byte divergence reds.
 *
 * The conventions reproduced (boilerplates/{nodejs,payload}, alphashop):
 * container_name ${APP_NAME} (primary server) / ${APP_NAME}-<svc>;
 * env_file .env; restart: unless-stopped; NO published ports (Traefik labels
 * only — HTTPS router websecure/tls + HTTP→HTTPS redirect middleware); named
 * bind volumes driver_opts {type:none, device:${<DEVICE_VAR>}, o:bind};
 * traefik_default external:true except the deployment that OWNS it.
 *
 * THE WALL (CLAUDE.md §2): emitting is a below-the-line projection — this
 * module writes nothing; the /stack-emit route only MEASURES (validate +
 * emit + hash). The StackManifest source stays above the line (DP02).
 *
 * ADR 0043: the PRIMARY infra artifact is the Pulumi/TS program
 * (TargetPulumiProgram); this compose is the /data/dockers-convention
 * projection of the same StackManifest — deployable today, regenerable,
 * never the source of truth.
 */

import { validateDatastore } from "./environments";
import {
	hashManifest,
	PROFILES,
	type Profile,
	type Refusal,
	type Service,
	type StackManifest,
	serviceInProfile,
	validate,
} from "./stack-manifest";

/** The DP03 additive target of the closed kind × target matrix. */
export const TARGET_DOCKER_COMPOSE = "docker-compose";

/** One emitted projection — double content-addressed (source + output). */
export interface ComposeArtifact {
	path: string;
	target: typeof TARGET_DOCKER_COMPOSE;
	kind: "stack_manifest";
	yaml: string;
	sourceHash: string;
	outputHash: string;
	protected: true;
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

function sortedServices(m: StackManifest): Service[] {
	return [...m.services].sort((a, b) => (a.name < b.name ? -1 : 1));
}

function primaryServer(sorted: Service[]): string {
	for (const s of sorted) {
		if (s.role === "server") return s.name;
	}
	return "";
}

/** ${<SERVICE>_IMAGE} — the env-var image reference of an EMITTED service. */
function envVarImage(serviceName: string): string {
	const mapped = serviceName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
	return `\${${mapped}_IMAGE}`;
}

// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal compose ${VAR} placeholders, interpolated by docker compose (the /data/dockers env-var convention — never a hardcoded value)
function renderTraefikLabels(svc: Service, primary: string): string[] {
	const router =
		svc.name === primary ? "${APP_NAME}" : `\${APP_NAME}-${svc.name}`;
	const host =
		svc.name === primary
			? "${APP_SUBDOMAIN}.${DOMAIN}"
			: `${svc.name}.\${APP_SUBDOMAIN}.\${DOMAIN}`;
	return [
		"    labels:",
		'      - "traefik.enable=true"',
		`      - "traefik.http.routers.${router}.rule=Host(\`${host}\`)"`,
		`      - "traefik.http.routers.${router}.entrypoints=websecure"`,
		`      - "traefik.http.routers.${router}.tls=true"`,
		`      - "traefik.http.routers.${router}.tls.certresolver=\${CERT_RESOLVER_NAME}"`,
		`      - "traefik.http.services.${router}.loadbalancer.server.port=${svc.internal_port}"`,
		`      - "traefik.http.routers.${router}-http.rule=Host(\`${host}\`)"`,
		`      - "traefik.http.routers.${router}-http.entrypoints=web"`,
		`      - "traefik.http.routers.${router}-http.middlewares=\${APP_NAME}-https-redirect"`,
		'      - "traefik.http.middlewares.${APP_NAME}-https-redirect.redirectscheme.scheme=https"',
	];
}

function renderHealthcheck(cmd: string): string[] {
	return [
		"    healthcheck:",
		`      test: ["CMD-SHELL", ${JSON.stringify(cmd)}]`,
		"      interval: 30s",
		"      timeout: 3s",
		"      retries: 3",
		"      start_period: 10s",
	];
}

function renderService(
	svc: Service,
	m: StackManifest,
	primary: string,
): string[] {
	const lines = [`  ${svc.name}:`];
	const container =
		svc.name === primary ? "${APP_NAME}" : `\${APP_NAME}-${svc.name}`;
	lines.push(`    container_name: ${container}`);
	const image =
		svc.image && svc.image !== "" ? svc.image : envVarImage(svc.name);
	lines.push(
		`    image: ${image}`,
		"    env_file:",
		"      - .env",
		"    restart: unless-stopped",
	);
	if (svc.profile !== "core") {
		lines.push("    profiles:", `      - ${svc.profile}`);
	}
	if (svc.depends_on && svc.depends_on.length > 0) {
		lines.push("    depends_on:");
		for (const d of svc.depends_on) {
			lines.push(`      - ${d}`);
		}
	}
	lines.push("    networks:", `      - ${m.network.name}`);
	if (svc.healthcheck && svc.healthcheck !== "") {
		lines.push(...renderHealthcheck(svc.healthcheck));
	}
	if (svc.role === "server") {
		lines.push(...renderTraefikLabels(svc, primary));
	}
	return lines;
}

function renderNetworks(m: StackManifest): string[] {
	const lines = ["networks:", `  ${m.network.name}:`];
	if (m.network.external) {
		lines.push("    external: true");
	}
	lines.push("    name: ${TRAEFIK_NETWORK_NAME}");
	return lines;
}

function renderVolumes(m: StackManifest): string[] | null {
	const vols = [...(m.volumes ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	if (vols.length === 0) return null;
	const lines = ["volumes:"];
	for (const v of vols) {
		const name = vols.length > 1 ? `\${APP_NAME}-${v.name}` : "${APP_NAME}";
		lines.push(
			`  ${v.name}:`,
			`    name: ${name}`,
			"    driver: local",
			"    driver_opts:",
			"      type: none",
			`      device: \${${v.device_var}}`,
			"      o: bind",
		);
	}
	return lines;
}

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal compose ${VAR} placeholders

/**
 * renderCompose — the pure renderer (the twin of Go composeemit.render):
 * protected header, services in stable order, networks, volumes.
 * Exported for the ∀ mirror; emitCompose is the validating door.
 */
export function renderCompose(m: StackManifest, sourceHash: string): string {
	const sorted = sortedServices(m);
	const primary = primaryServer(sorted);
	const sections = [
		`# CODE GENERATED BY AIDOS — DO NOT EDIT. source: ${sourceHash}`,
		"services:",
	];
	for (const svc of sorted) {
		sections.push(renderService(svc, m, primary).join("\n"));
	}
	sections.push("", renderNetworks(m).join("\n"));
	const vols = renderVolumes(m);
	if (vols) {
		sections.push("", vols.join("\n"));
	}
	return `${sections.join("\n")}\n`;
}

/**
 * emitCompose — the DP03 pure emitter (twin of Go composeemit.Emit):
 * validate (the DP02 closed codes — an invalid manifest is a Refusal, never
 * a guessed compose), content-address the source (hashManifest — S02
 * reused), render, content-address the output.
 */
export async function emitCompose(
	m: StackManifest,
): Promise<ComposeArtifact | { refusal: Refusal }> {
	const refusal = validate(m);
	if (refusal) {
		return { refusal };
	}
	const sourceHash = await hashManifest(m);
	const yaml = renderCompose(m, sourceHash);
	return {
		path: `back/gen/${m.app}/docker-compose.yml`,
		target: TARGET_DOCKER_COMPOSE,
		kind: "stack_manifest",
		yaml,
		sourceHash,
		outputHash: await sha256hex(yaml),
		protected: true,
	};
}

/**
 * The DP11 BlockReason codes carried by FilterByProfile — the exact twin of the
 * Go back/runtime/blockreason additions (UNKNOWN_PROFILE + the delegated DP06
 * DOLTGRES_NOT_ALLOWED_IN_PROD). A selection outside the closed set is never
 * coerced to the nearest known profile, never silently widened to `full`.
 */
export type ProfileBlockCode =
	| "UNKNOWN_PROFILE"
	| "DOLTGRES_NOT_ALLOWED_IN_PROD";

export interface ProfileBlock {
	code: ProfileBlockCode;
	message: string;
}

/**
 * filterByProfile — the DP11 PURE include/exclude over the CLOSED SPEC-stack-2026
 * profile set, the exact twin of Go composeemit.FilterByProfile. It adds no
 * business rule — it SELECTS which services of an already-declared manifest enter
 * the emission, deterministically:
 *
 *  1. the selection MUST be a member of the closed set (UNKNOWN_PROFILE else —
 *     never guessed, never coerced to `full`);
 *  2. the cross `non-prod` × `prod` is refused via the EXISTING DP06 gate
 *     (validateDatastore(env, "doltgres") reused verbatim, never forked —
 *     DOLTGRES_NOT_ALLOWED_IN_PROD): the `non-prod` profile carries Doltgres and
 *     prod imposes Postgres (ADR 0065);
 *  3. it keeps EXACTLY the services for which serviceInProfile(svc, selection)
 *     holds — `full` keeps every service (the deterministic UNION), any other
 *     profile keeps its declared members plus the always-running core services.
 *
 * The kept services preserve the manifest's declared order; everything else of
 * the manifest is carried through unchanged. PURE: same (manifest, profile, env)
 * → same filtered manifest. THE WALL (§2): the profiles are DECLARED above the
 * line in stack_manifest; the SELECTION is applied below the line at emission —
 * this reads the AST and returns a narrowed AST, it writes no truth.
 */
export function filterByProfile(
	m: StackManifest,
	profile: string,
	env: string,
): StackManifest | { block: ProfileBlock } {
	// (1) the selection is a DECLARED member of the closed set — never guessed.
	if (!(PROFILES as readonly string[]).includes(profile)) {
		return {
			block: {
				code: "UNKNOWN_PROFILE",
				message: `profile "${profile}" is outside the closed set [${PROFILES.join(" ")}] — a selection is declared, never inferred (DP11)`,
			},
		};
	}
	const selection = profile as Profile;

	// (2) the cross non-prod × prod ⇒ Doltgres refused — DELEGATE to the existing
	// DP06 gate (never a forked rule): the `non-prod` profile carries Doltgres,
	// and prod imposes Postgres. Only the non-prod selection bites; any other
	// profile against prod passes (the gate is keyed on the doltgres datastore).
	if (selection === "non-prod") {
		const refusal = validateDatastore(env, "doltgres");
		if (refusal && refusal.code === "DOLTGRES_NOT_ALLOWED_IN_PROD") {
			return {
				block: {
					code: "DOLTGRES_NOT_ALLOWED_IN_PROD",
					message: refusal.message,
				},
			};
		}
	}

	// (3) the pure include/exclude over the closed set — declared order preserved,
	// the caller's slice never mutated (a copy).
	const kept = m.services.filter((svc) => serviceInProfile(svc, selection));
	return { ...m, services: kept };
}

/** isProfileBlock — narrow the filterByProfile result to its DP11 refusal. */
export function isProfileBlock(
	v: StackManifest | { block: ProfileBlock },
): v is { block: ProfileBlock } {
	return "block" in v;
}

/**
 * driftDetected — a hand-edited emission is rejected: the bytes on disk no
 * longer match the recorded output_hash (the gen/ protection, CLAUDE.md §9).
 */
export async function driftDetected(
	ledgerOutputHash: string,
	onDisk: string,
): Promise<boolean> {
	return (await sha256hex(onDisk)) !== ledgerOutputHash;
}
