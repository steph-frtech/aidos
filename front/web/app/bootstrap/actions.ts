"use server";

import {
	CLEAN_HOST,
	emitBootstrapSequence,
	NO_SECRETS,
	NOMINAL_BUNDLE,
	PRESENT_SECRETS,
	sequenceHash,
} from "@/lib/bootstrap";
import type { BootstrapRunView } from "./view";

/**
 * Server Action de l'écran /bootstrap (DP12 — émetteur bootstrap one-shot
 * déterministe, sur le GO mesuré DP10 + ADR 0067, réutilise DP04/S91/DP02/DP07).
 *
 * LE GESTE (ROADMAP-provisioning-deploy DP12). « Amorcer la stack » émet la
 * SÉQUENCE déterministe d'amorçage one-shot d'un bundle émis : une projection
 * pure d'events ordonnés (network-created → … → urls-printed) + le port résolu
 * depuis l'état hôte observé, OU un BlockReason fail-closed (MISSING_SECRET_AT_BOOT
 * quand un secret requis manque). C'est un JUMEAU pur du Go autoritaire
 * (back/runtime/bootstrap.EmitBootstrapSequence) — résolution de ports, ordre,
 * merge-env = fonctions pures ; le contrôle des secrets est un scan, jamais un LLM.
 *
 * LE MUR (CLAUDE.md §2). L'action n'écrit AUCUNE vérité : pas de kernel/mirrors/
 * fitness, aucune persistance. Le .env concret + les secrets vivent dans
 * l'appliance au boot (chmod 600, gitignored), JAMAIS dans le source émis / le
 * truth-store / git (below the line). AUCUN docker réel n'est lancé : l'exécution
 * reste GATÉE (comme le spike DP10) — l'écran montre la séquence ÉMISE, pas un run.
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
	const result = emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, secrets);

	if (result.block !== undefined) {
		return { ok: true, block: result.block, secretMissing };
	}
	const seq = result.sequence;
	return {
		ok: true,
		sequence: seq,
		sequenceHash: seq !== undefined ? sequenceHash(seq) : undefined,
		secretMissing,
	};
}
