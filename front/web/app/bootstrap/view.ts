import type { BlockReason, BootstrapSequence } from "@/lib/bootstrap";

/**
 * Les types de vue partagés par le Server Action de /bootstrap et le panneau
 * (DP12 — émetteur bootstrap one-shot déterministe). Un module « use server » ne
 * peut exporter que des fonctions async, donc ces types vivent ici.
 *
 * L'action « amorcer la stack » émet la séquence DÉTERMINISTE (jumeau pur de
 * back/runtime/bootstrap) — soit la séquence ordonnée d'events, soit un
 * BlockReason fail-closed (MISSING_SECRET_AT_BOOT). Aucun docker réel n'est lancé :
 * l'exécution reste GATÉE (comme le spike DP10).
 */
export interface BootstrapRunView {
	ok: boolean;
	/** la séquence émise (events ordonnés + port résolu), si l'amorçage est passé. */
	sequence?: BootstrapSequence;
	/** le BlockReason fail-closed (MISSING_SECRET_AT_BOOT…), si l'amorçage est refusé. */
	block?: BlockReason;
	/** l'empreinte content-adressée de la séquence (replay byte-stable), si émise. */
	sequenceHash?: string;
	/** vrai ssi le scénario lancé est le scénario « secret manquant » (démo du mur). */
	secretMissing?: boolean;
}

export const BOOTSTRAP_INITIAL: BootstrapRunView = { ok: false };
