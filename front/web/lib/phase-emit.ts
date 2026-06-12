/**
 * phase-emit.ts — the PURE TS twin of the authoritative Go emitter
 * `back/runtime/stackemit` (DP05 — the COMPLETE stack emission from a
 * content-addressed DAG phase): EmitStack(phase) → {docker-compose.yml,
 * .env.example, start.sh, start_with_rebuild.sh, traefik.dynamic.yml},
 * triple-addressed (phase_version S23 · source_hash S02 · bundle_hash).
 *
 * COMPOSITION, NEVER REINVENTION: the compose is lib/stack-emit (DP03 twin)
 * verbatim; the env bundle is lib/env-emit (DP04 twin) verbatim; only the
 * traefik dynamic config target is new — the file-provider projection of the
 * SAME declared topology the DP03 labels encode (hosts and names stay env-var
 * REFERENCES, never a hardcoded URL — SPEC-stack-2026).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): EmitStack is a pure function of the
 * phase's content address — same phase → same bytes on every machine (the
 * cornerstone mirror of the provisioning epic). THE GO CODE IS AUTHORITATIVE;
 * this twin is byte-parity-pinned to it by the vitest mirror
 * (phase-emit.test.ts pins the Go PHASE_VERSION / TRAEFIK_HASH / BUNDLE_HASH
 * of the seeded Example). Any one-byte divergence reds.
 *
 * THE WALL (CLAUDE.md §2): re-emission is a below-the-line measure — this
 * module writes nothing; the phase (source) is authoritative, the emitted
 * code regenerable, never the reverse. A hand-edited gen/ file blocks the
 * re-emission in Go with the closed code EMITTED_FILE_HAND_EDITED; the twin
 * exposes the same drift law (driftDetected, records.Hash inequality).
 */

import { type EnvBundle, emitEnvBundle } from "./env-emit";
import { type ComposeArtifact, emitCompose } from "./stack-emit";
import {
	hashManifest,
	type Refusal,
	type Service,
	type StackManifest,
} from "./stack-manifest";

/** The DP05 additive target of the closed kind × target matrix. */
export const TARGET_TRAEFIK_DYNAMIC = "traefik-dynamic";

/** One emitted traefik dynamic config — double content-addressed. */
export interface TraefikArtifact {
	path: string;
	target: typeof TARGET_TRAEFIK_DYNAMIC;
	kind: "stack_manifest";
	text: string;
	sourceHash: string;
	outputHash: string;
	protected: true;
}

/**
 * The DP05 bundle: the complete deployable stack of ONE phase — five
 * byte-stable artifacts, triple-addressed.
 */
export interface StackBundle {
	phaseVersion: string;
	sourceHash: string;
	bundleHash: string;
	compose: ComposeArtifact;
	env: EnvBundle;
	traefikDynamic: TraefikArtifact;
}

async function sha256hex(s: string): Promise<string> {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * encodeCanonical — sorted object keys, arrays in order, no whitespace (the
 * records.Canonicalize twin over the phase body's value space).
 */
function encodeCanonical(v: unknown): string {
	if (Array.isArray(v)) {
		return `[${v.map(encodeCanonical).join(",")}]`;
	}
	if (v !== null && typeof v === "object") {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${encodeCanonical(o[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

/**
 * phaseVersionFor — the S23 content address of the MINIMAL stable phase
 * pinning a manifest (the Go stackemit.PhaseFor twin): a one-constraint cut
 * «stack_manifest/<app>» → hashManifest(m), no links, no sensors — vacuously
 * stable. version == Hash(Canonicalize(phase body)) (S02, never forked).
 */
export async function phaseVersionFor(m: StackManifest): Promise<string> {
	const manifestHash = await hashManifest(m);
	const body = {
		kind: "phase",
		cut: { [`stack_manifest/${m.app}`]: manifestHash },
		sensor_status: [],
		stable: true,
		reasons: [],
	};
	return sha256hex(encodeCanonical(body));
}

// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal ${VAR} env references resolved at deploy time (the /data/dockers convention — never a hardcoded value)

/**
 * renderTraefikDynamic — the pure renderer (twin of Go
 * stackemit.renderTraefikDynamic): the file-provider projection of the DP03
 * label topology — one HTTPS router + one HTTP→HTTPS redirect router per
 * role=server service, the shared redirect middleware, docker_internal
 * service URLs (http://<container>:<internal_port>). References, never values.
 */
export function renderTraefikDynamic(
	m: StackManifest,
	sourceHash: string,
): string {
	const sorted: Service[] = [...m.services].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	const servers = sorted.filter((s) => s.role === "server");
	const primary = servers.length > 0 ? servers[0].name : "";

	const routers: string[] = [];
	const services: string[] = [];
	for (const svc of servers) {
		const isPrimary = svc.name === primary;
		const router = isPrimary ? "${APP_NAME}" : `\${APP_NAME}-${svc.name}`;
		const host = isPrimary
			? "${APP_SUBDOMAIN}.${DOMAIN}"
			: `${svc.name}.\${APP_SUBDOMAIN}.\${DOMAIN}`;
		const container = isPrimary ? "${APP_NAME}" : `\${APP_NAME}-${svc.name}`;
		routers.push(
			`    ${router}:`,
			`      rule: Host(\`${host}\`)`,
			"      entryPoints:",
			"        - websecure",
			`      service: ${router}`,
			"      tls:",
			"        certResolver: ${CERT_RESOLVER_NAME}",
			`    ${router}-http:`,
			`      rule: Host(\`${host}\`)`,
			"      entryPoints:",
			"        - web",
			"      middlewares:",
			"        - ${APP_NAME}-https-redirect",
			`      service: ${router}`,
		);
		services.push(
			`    ${router}:`,
			"      loadBalancer:",
			"        servers:",
			`          - url: http://${container}:${svc.internal_port}`,
		);
	}

	const lines = [
		`# CODE GENERATED BY AIDOS — DO NOT EDIT. source: ${sourceHash}`,
		"# Config dynamique Traefik (file provider) — projection des labels DP03 du même manifest.",
		"# Toutes les valeurs sont des références d'environnement résolues au déploiement — jamais en dur.",
		"http:",
		"  routers:",
		...routers,
		"  middlewares:",
		"    ${APP_NAME}-https-redirect:",
		"      redirectScheme:",
		"        scheme: https",
		"  services:",
		...services,
	];
	return `${lines.join("\n")}\n`;
}

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal ${VAR} env references

/**
 * emitStackBundle — the DP05 pure composition (twin of Go
 * stackemit.EmitStack over the seeded PhaseFor phase): DP03 compose + DP04
 * env bundle + the traefik dynamic projection, triple-addressed. The
 * bundle_hash folds «phase:<version>» plus each «path:output_hash» line —
 * the «ré-émettre deux fois, hash égaux» proof is one comparison.
 */
export async function emitStackBundle(
	m: StackManifest,
): Promise<StackBundle | { refusal: Refusal }> {
	const compose = await emitCompose(m);
	if ("refusal" in compose) {
		return { refusal: compose.refusal };
	}
	const env = await emitEnvBundle(m);
	if ("refusal" in env) {
		return { refusal: env.refusal };
	}
	const sourceHash = compose.sourceHash;
	const phaseVersion = await phaseVersionFor(m);
	const traefikText = renderTraefikDynamic(m, sourceHash);
	const traefikDynamic: TraefikArtifact = {
		path: `back/gen/${m.app}/traefik.dynamic.yml`,
		target: TARGET_TRAEFIK_DYNAMIC,
		kind: "stack_manifest",
		text: traefikText,
		sourceHash,
		outputHash: await sha256hex(traefikText),
		protected: true,
	};
	const summary = [
		`phase:${phaseVersion}`,
		`${compose.path}:${compose.outputHash}`,
		`${env.envExample.path}:${env.envExample.outputHash}`,
		`${env.startSh.path}:${env.startSh.outputHash}`,
		`${env.startWithRebuild.path}:${env.startWithRebuild.outputHash}`,
		`${traefikDynamic.path}:${traefikDynamic.outputHash}`,
	];
	const bundleHash = await sha256hex(`${summary.join("\n")}\n`);
	return {
		phaseVersion,
		sourceHash,
		bundleHash,
		compose,
		env,
		traefikDynamic,
	};
}
