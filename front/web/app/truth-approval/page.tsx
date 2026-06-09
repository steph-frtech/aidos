import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { TruthApprovalPanel } from "./TruthApprovalPanel";

export const metadata: Metadata = {
	title:
		"Approbation vérité multi-humains + concurrence content-adressée — propose → ChangeSet → approbation (AIDOS Workbench)",
	description:
		"S110 (E3) : toute écriture-vérité via le cockpit passe propose → ChangeSet → approbation gatée par l'AuthorityGraph lié (approver/veto/escalation, S63) au bon TruthScope ; un override est une décision enregistrée (provenance + ADR, §8). La concurrence est un optimistic-lock content-adressé sur le head : deux applies concurrents → le second refusé STALE_HEAD, jamais last-write-wins (anti-overwrite §9) ; un conflit se résout en re-rejouant les miroirs (merge-semantic, S25). LE MUR : le cockpit n'écrit AUCUNE vérité — il décide l'admission et renvoie l'enveloppe que la CLI appliquerait. Tout est déterministe : le juge est la porte + le head adressé par contenu, jamais un LLM.",
};

export const dynamic = "force-dynamic";

/**
 * /truth-approval — le cockpit « approbation vérité multi-humains + concurrence » (S110, app-builder
 * EPIC 3 auth, KRD §8/§13.8/§44/§122). Il COMPOSE trois moteurs déjà verts : la porte d'autorité
 * (authority.Decide, S63), l'enveloppe ChangeSet (S20) et un optimistic-lock content-adressé sur le
 * head — décidé d'un côté par l'AuthorityGraph (approver/veto/escalation) et de l'autre par
 * l'adresse-contenu du head (jamais last-write-wins).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : trois contrôles liés aux twins purs RÉELS
 * (lib/truth-approval), exécutables depuis l'écran — (1) la porte : proposer+approuver une
 * écriture-vérité (un veto bloque, un override enregistré l'admet) ; (2) la concurrence : deux
 * propositions au même head → exactement une atterrit, l'autre STALE_HEAD ; (3) la résolution : le
 * membre périmé re-rejoue ses miroirs contre le nouveau head. Prouvé par l'e2e Playwright. THE WALL
 * (§2) : le cockpit n'écrit AUCUNE vérité — il décide l'admission et renvoie l'enveloppe que la CLI
 * appliquerait. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function TruthApprovalPage() {
	const t = await getTranslations("truthApproval");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("subtitle")}
						</span>
					</div>
					<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<TruthApprovalPanel />
				</div>
			</main>
		</div>
	);
}
