import type { BlockReason, BootstrapSequence } from "@/lib/bootstrap";
import type { BootstrapMcpSource } from "./mcp";

/**
 * Les types de vue partagés par le Server Action de /bootstrap et le panneau
 * (DP12 — émetteur bootstrap one-shot déterministe). Un module « use server » ne
 * peut exporter que des fonctions async, donc ces types vivent ici.
 *
 * L'action « amorcer la stack » émet la séquence DÉTERMINISTE en passant par la
 * PORTE MCP `stack.bootstrap` (DP13, passerelle S58) — soit la séquence ordonnée
 * d'events, soit un BlockReason fail-closed (MISSING_SECRET_AT_BOOT). Aucun docker
 * réel n'est lancé : l'exécution reste GATÉE (comme le spike DP10).
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
	/**
	 * la source de la séquence quand l'amorçage est passé par la porte MCP DP13 :
	 * `live` = la passerelle S58 a répondu ; `twin-fallback` = le jumeau TS pur a
	 * re-dérivé la MÊME séquence (le seam Go injoignable). Toujours défini après une
	 * action — l'outil conceptuel reste `stack.bootstrap` (la porte empruntée).
	 */
	viaMcp?: BootstrapMcpSource;
}

export const BOOTSTRAP_INITIAL: BootstrapRunView = { ok: false };
