import {
	type BlockReason,
	type BootstrapEvent,
	type BootstrapSequence,
	type EventKind,
	emitBootstrapSequence,
	type HostState,
	isKnownKind,
	type SecretsState,
	type StackManifest,
	sequenceHash,
} from "../../lib/bootstrap";
import { callGateway } from "../../lib/gateway-sdk";
import type { Scope } from "../../lib/projectWall";

/**
 * mcp.ts — la PORTE MCP de l'écran /bootstrap (DP13, ROADMAP-provisioning-deploy
 * EPIC C, ADR 0009). L'action « amorcer la stack » passe DÉSORMAIS par la passerelle
 * S58 (back/mcp/gateway → back/mcp/provision, l'outil `stack.bootstrap`) au lieu
 * d'appeler l'émetteur en direct.
 *
 * LE SEAM (CLAUDE.md §6/§7). `stack.bootstrap` est la SEULE porte conceptuelle :
 * l'écran émet la séquence d'amorçage en appelant l'outil MCP project-scopé (un
 * `tools/call` JSON-RPC/HTTP vers la passerelle, via lib/gateway-sdk.callGateway).
 * Le serveur applique le mur côté serveur (scope d'abord, puis below-the-line) et
 * répond la séquence ordonnée DP12 + le sequence_hash + les urls, OU un BlockReason
 * fail-closed (MISSING_SECRET_AT_BOOT) — la MÊME forme que le jumeau TS.
 *
 * LE FALLBACK DÉTERMINISTE (CLAUDE.md §6/§8). Le seam Go n'est pas toujours joignable
 * depuis Next (dev, e2e, build local : AIDOS_GATEWAY_HTTP_URL absent). Dans ce cas
 * l'action retombe sur le JUMEAU TS PUR DP12 (lib/bootstrap.emitBootstrapSequence),
 * byte-identique à l'émetteur Go qui SOUS-TEND l'outil MCP : la source CONCEPTUELLE
 * reste l'outil `stack.bootstrap` (la porte), seul le transport diffère (`live` =
 * le serveur a répondu ; `twin-fallback` = le jumeau a re-dérivé la MÊME séquence).
 * Même (bundle, hôte, secrets) → même séquence, que ce soit live ou twin-fallback.
 *
 * LE MUR (CLAUDE.md §2). L'outil MCP est BELOW THE LINE : il projette/émet sur le
 * StackManifest AST + l'état hôte observé, il n'écrit AUCUNE vérité. Une tentative
 * d'écriture-vérité (stack.engrave_manifest) serait refusée par la passerelle ET le
 * serveur avec GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — l'écran n'emprunte jamais cette
 * porte. AUCUN docker réel : l'outil émet la SÉQUENCE (plan-as-data), pas un run.
 */

/** La source du résultat : l'outil MCP a répondu live, ou le jumeau a re-dérivé. */
export type BootstrapMcpSource = "live" | "twin-fallback";

/** Le résultat de l'amorçage via la porte MCP (séquence OU block) + sa source. */
export interface BootstrapMcpResult {
	/** la séquence émise (events ordonnés + port résolu), si l'amorçage est passé. */
	sequence?: BootstrapSequence;
	/** l'empreinte content-adressée de la séquence (replay byte-stable), si émise. */
	sequenceHash?: string;
	/** le BlockReason fail-closed (MISSING_SECRET_AT_BOOT…), si l'amorçage est refusé. */
	block?: BlockReason;
	/** `live` = la passerelle a répondu ; `twin-fallback` = le jumeau a re-dérivé. */
	source: BootstrapMcpSource;
}

/** L'outil MCP que cet écran emprunte — la source conceptuelle de la séquence. */
export const BOOTSTRAP_MCP_TOOL = "stack.bootstrap" as const;

// ── les décodeurs PURS du payload de l'outil (jamais double-typé, jamais coercé) ──

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** decodeBlock décode la forme blockOut Go (code/severity/explanation/how_to_fix). */
function decodeBlock(raw: unknown): BlockReason | null {
	if (!isObject(raw)) return null;
	const code = raw.code;
	const severity = raw.severity;
	const explanation = raw.explanation;
	const howToFix = raw.how_to_fix;
	if (
		typeof code !== "string" ||
		typeof severity !== "string" ||
		typeof explanation !== "string" ||
		!Array.isArray(howToFix) ||
		!howToFix.every((h): h is string => typeof h === "string")
	) {
		return null;
	}
	return { code, severity, explanation, howToFix };
}

/** decodeEvent décode un cran de la séquence Go (seq/kind/detail), kind dans l'ensemble clos. */
function decodeEvent(raw: unknown): BootstrapEvent | null {
	if (!isObject(raw)) return null;
	const seq = raw.seq;
	const kind = raw.kind;
	const detail = raw.detail;
	if (
		typeof seq !== "number" ||
		!Number.isInteger(seq) ||
		typeof kind !== "string" ||
		!isKnownKind(kind) ||
		typeof detail !== "string"
	) {
		return null;
	}
	return { seq, kind: kind as EventKind, detail };
}

/** decodeSequence décode bootstrap.Sequence Go (Events ordonnés + ResolvedPort). */
function decodeSequence(raw: unknown): BootstrapSequence | null {
	if (!isObject(raw)) return null;
	const events = raw.events;
	const resolvedPort = raw.resolvedPort ?? raw.resolved_port;
	if (
		!Array.isArray(events) ||
		typeof resolvedPort !== "number" ||
		!Number.isInteger(resolvedPort)
	) {
		return null;
	}
	const decoded: BootstrapEvent[] = [];
	for (const e of events) {
		const ev = decodeEvent(e);
		if (ev === null) return null;
		decoded.push(ev);
	}
	return { events: decoded, resolvedPort };
}

/**
 * decodeBootstrapOutput décode le structuredContent de l'outil `stack.bootstrap`
 * (la forme bootstrapOutput Go : ok/sequence/sequence_hash/urls/block). Retourne null
 * sur tout payload malformé → l'appelant retombe alors sur le jumeau déterministe.
 * PUR : même JSON → même verdict, zéro LLM.
 */
export function decodeBootstrapOutput(raw: unknown): {
	sequence?: BootstrapSequence;
	sequenceHash?: string;
	block?: BlockReason;
} | null {
	if (!isObject(raw)) return null;
	if (raw.block !== undefined && raw.block !== null) {
		const block = decodeBlock(raw.block);
		if (block === null) return null;
		return { block };
	}
	const sequence = decodeSequence(raw.sequence);
	if (sequence === null) return null;
	const hash =
		typeof raw.sequence_hash === "string" && raw.sequence_hash !== ""
			? raw.sequence_hash
			: sequenceHash(sequence);
	return { sequence, sequenceHash: hash };
}

/** scope+target wire shape the gateway/provision server expects (S55/S57/S61). */
function targetFor(scope: Scope): { project_id: string } {
	return { project_id: scope.activeProject };
}

/** hostState → la forme wire host (ss + docker ps AS DATA, convention DP10). */
function hostWire(host: HostState): {
	ss_output: string;
	docker_ps_output: string;
} {
	return { ss_output: host.ssOutput, docker_ps_output: host.dockerPsOutput };
}

/**
 * runBootstrapViaMcp ÉMET la séquence d'amorçage en passant par la porte MCP
 * `stack.bootstrap`. Sur une réponse live décodable → source `live`. Sur toute
 * indisponibilité du seam (pas d'endpoint, erreur transport, payload malformé,
 * refus de scope) → le jumeau TS pur re-dérive la MÊME séquence, source
 * `twin-fallback`. NE LANCE JAMAIS : un échec retombe déterministiquement.
 *
 * IMPORTANT (le seam est la source). Même en twin-fallback, l'outil conceptuel reste
 * `stack.bootstrap` — c'est la porte que l'écran emprunte ; le jumeau est l'émetteur
 * autoritaire qui SOUS-TEND cet outil (byte-identique au Go). L'indicateur
 * data-testid="bootstrap-via-mcp" témoigne de cette porte sur l'écran.
 */
export async function runBootstrapViaMcp(
	scope: Scope,
	bundle: StackManifest,
	host: HostState,
	secrets: SecretsState,
	opts: { endpoint?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<BootstrapMcpResult> {
	const res = await callGateway(
		scope,
		BOOTSTRAP_MCP_TOOL,
		{
			target: targetFor(scope),
			bundle,
			host: hostWire(host),
			secrets: { present: secrets.present },
		},
		opts.endpoint,
		opts.fetchImpl,
	);
	if (res.ok) {
		const decoded = decodeBootstrapOutput(res.content);
		if (decoded !== null) {
			return { ...decoded, source: "live" };
		}
	}
	// Fallback déterministe : le jumeau TS re-dérive la MÊME séquence (la porte reste
	// `stack.bootstrap`, seul le transport diffère).
	return {
		...runBootstrapViaTwin(bundle, host, secrets),
		source: "twin-fallback",
	};
}

/**
 * runBootstrapViaTwin re-dérive la séquence par le jumeau TS pur DP12 (l'émetteur
 * autoritaire qui sous-tend l'outil MCP `stack.bootstrap`). Pur, byte-identique au Go.
 */
export function runBootstrapViaTwin(
	bundle: StackManifest,
	host: HostState,
	secrets: SecretsState,
): {
	sequence?: BootstrapSequence;
	sequenceHash?: string;
	block?: BlockReason;
} {
	const result = emitBootstrapSequence(bundle, host, secrets);
	if (result.block !== undefined) {
		return { block: result.block };
	}
	const seq = result.sequence;
	return {
		sequence: seq,
		sequenceHash: seq !== undefined ? sequenceHash(seq) : undefined,
	};
}
