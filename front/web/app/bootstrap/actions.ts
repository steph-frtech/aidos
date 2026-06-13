"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	CLEAN_HOST,
	NO_SECRETS,
	NOMINAL_BUNDLE,
	PRESENT_SECRETS,
} from "@/lib/bootstrap";
import type { Scope } from "@/lib/projectWall";
import { runBootstrapViaMcp } from "./mcp";
import type { BootstrapRunView } from "./view";

/**
 * Server Action de l'écran /bootstrap (DP13 — l'amorçage passe par la PORTE MCP
 * `stack.bootstrap` de la passerelle S58, ROADMAP-provisioning-deploy EPIC C,
 * ADR 0009 ; émetteur DP12 sous-jacent sur le GO mesuré DP10 + ADR 0067).
 *
 * LE GESTE (DP13). « Amorcer la stack » émet la SÉQUENCE déterministe d'amorçage
 * one-shot d'un bundle émis EN APPELANT L'OUTIL MCP `stack.bootstrap` (un `tools/call`
 * project-scopé vers la passerelle, via lib/gateway-sdk) : une projection pure d'events
 * ordonnés (network-created → … → urls-printed) + le port résolu depuis l'état hôte
 * observé, OU un BlockReason fail-closed (MISSING_SECRET_AT_BOOT quand un secret requis
 * manque). Le serveur applique le mur côté serveur (scope d'abord, puis below-the-line).
 *
 * LE FALLBACK DÉTERMINISTE (CLAUDE.md §6/§8). Quand le seam Go n'est pas joignable
 * depuis Next (dev, e2e, build local : AIDOS_GATEWAY_HTTP_URL absent), l'action retombe
 * sur le JUMEAU TS PUR DP12 (back/runtime/bootstrap byte-identique) — la source
 * CONCEPTUELLE reste l'outil `stack.bootstrap`, seul le transport diffère (`viaMcp` =
 * `live` ou `twin-fallback`). Même (bundle, hôte, secrets) → même séquence.
 *
 * LE MUR (CLAUDE.md §2). L'action n'écrit AUCUNE vérité : l'outil MCP est below-the-line
 * (il projette/émet sur le StackManifest AST + l'état hôte observé). Le .env concret +
 * les secrets vivent dans l'appliance au boot (chmod 600, gitignored), JAMAIS dans le
 * source émis / le truth-store / git. AUCUN docker réel n'est lancé : l'exécution reste
 * GATÉE (comme le spike DP10) — l'écran montre la séquence ÉMISE, pas un run.
 *
 * Deux scénarios sont jouables depuis l'écran (ui-completeness §7) : le scénario
 * nominal (les secrets présents → la séquence complète) et le scénario « secret
 * manquant » (le mur en action → MISSING_SECRET_AT_BOOT). Le scénario est porté
 * par le champ caché `scenario`.
 */
export async function bootstrapRunAction(
	_prev: BootstrapRunView,
	formData: FormData,
): Promise<BootstrapRunView> {
	const secretMissing =
		String(formData.get("scenario") ?? "") === "secret-missing";
	const secrets = secretMissing ? NO_SECRETS : PRESENT_SECRETS;

	// La porte project-scopée : l'identité workbench + le projet actif (S57/S61).
	const ctx = await activeProjectContext();
	const scope: Scope = {
		identity: "workbench-human",
		activeProject: ctx.activeId ?? "",
	};

	// L'amorçage passe par l'outil MCP `stack.bootstrap` (live si la passerelle répond,
	// sinon le jumeau TS pur re-dérive la MÊME séquence — la porte reste la même).
	const result = await runBootstrapViaMcp(
		scope,
		NOMINAL_BUNDLE,
		CLEAN_HOST,
		secrets,
	);

	if (result.block !== undefined) {
		return {
			ok: true,
			block: result.block,
			secretMissing,
			viaMcp: result.source,
		};
	}
	return {
		ok: true,
		sequence: result.sequence,
		sequenceHash: result.sequenceHash,
		secretMissing,
		viaMcp: result.source,
	};
}
