import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { DomainBindPanel } from "./DomainBindPanel";

export const metadata: Metadata = {
	title: "Domaines custom + TLS pour l'app déployée — AIDOS Workbench",
	description:
		"S97 : binder un domaine custom + certificats TLS + DNS pour l'app déployée (comme le Workbench derrière Traefik, mais pour les apps émises) — labels Traefik posés par le provider Docker Pulumi (DP27, ADR 0043). Un domaine appartient à EXACTEMENT UN projet (DOMAIN_ALREADY_BOUND sinon) ; un domaine custom sert l'app en HTTPS via un router websecure + TLS + certresolver ACME ; le binding domaine→projet est INJECTIF. LE MUR : planifier n'écrit aucune vérité, et aucun appel DNS/ACME live.",
};

export const dynamic = "force-dynamic";

/**
 * /domain-bind — « domaines custom + TLS pour l'app déployée » (S97, app-builder EPIC 10,
 * DP27 / ADR 0043). Pour le projet actif, domainbind calcule un BindPlan DÉTERMINISTE : une URL
 * HTTPS sur le domaine custom, les labels Traefik (router websecure + TLS + certresolver ACME,
 * comme /data/dockers) qui font servir l'app par Traefik, et l'instruction DNS (un CNAME du
 * domaine vers l'host de déploiement).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : UNE surface exécutable depuis l'écran — BINDER
 * le domaine (URL HTTPS + labels Traefik + DNS, content-adressé). Un toggle « conflit » (le
 * domaine déjà lié à un autre projet) prouve le refus DOMAIN_ALREADY_BOUND (binding injectif).
 * Deux badges jugés par le CODE : « sert en HTTPS » et « binding injectif ». THE WALL (§2) :
 * planifier n'écrit AUCUNE vérité, et aucun appel DNS/ACME live — enregistrer le binding comme
 * décision DAG passe par propose → ChangeSet → approbation. Ne touche aucune route existante.
 * Thème ADR 0010, bilingue ADR 0011.
 */
export default async function DomainBindPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("domainBind");

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
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-10 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10">
					<DomainBindPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
