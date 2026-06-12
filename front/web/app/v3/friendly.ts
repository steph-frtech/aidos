import type { BuilderEvent } from "@/lib/v2/builder";

/**
 * V3 — la COPIE AMICALE partagée (ADR 0060, le mandat « end-user friendly total ») :
 * le libellé SANS JARGON par genre d'événement (clé i18n « v3 »), réutilisé par toutes
 * les lentilles de la session (/v3/lab, /v3/history, /v3/environnements, …). Le détail
 * technique vit TOUJOURS replié dans « Détails techniques » — jamais en copie primaire.
 */

export type Strings = Record<string, string>;

/**
 * FRIENDLY_TEMPLATES — le gabarit amical par genre d'événement (clé i18n « v3 ») :
 * la copie primaire sans jargon ; %env% et %detail% sont interpolés à l'affichage.
 */
export const FRIENDLY_TEMPLATES: Record<BuilderEvent["kind"], string> = {
	idee_capturee: "tplIdeeCapturee",
	arbre_greffe: "tplArbreGreffe",
	kernel_propose: "tplKernelPropose",
	app_generee: "tplAppGeneree",
	deploiement: "tplDeploiement",
	delta_calcule: "tplDeltaCalcule",
	impact_calcule: "tplImpactCalcule",
	ecran_ouvert: "tplEcranOuvert",
	etat_lu: "tplEtatLu",
	refus: "tplRefus",
};

/** Simplifie un détail technique pour la copie amicale (coupe la parenthèse technique). */
export function simplify(detail: string): string {
	const cut = detail.split("(")[0].trim();
	return cut === "" ? detail : cut;
}

/** La ligne AMICALE d'un événement : le gabarit i18n interpolé (%env%, %detail%). */
export function friendlyLine(t: Strings, e: BuilderEvent): string {
	const raw = t[FRIENDLY_TEMPLATES[e.kind]] ?? e.detail;
	return raw
		.replace("%env%", e.env ?? "dev")
		.replace("%detail%", simplify(e.detail));
}
