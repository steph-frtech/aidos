import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { listTemplates } from "./actions";
import { TemplatesPanel } from "./TemplatesPanel";

export const metadata: Metadata = {
	title: "Catalogue de templates — AIDOS Workbench",
	description:
		"Le catalogue de starters curatés (S81) : e-commerce, CRM, booking packagés comme bundles content-adressés (entités + relations + behaviors dont app-auth + miroirs + operations + sources UI). Instancier un template produit un projet de départ DÉTERMINISTE et VERT (duplicate-from-template, S56) ; « fork this app » duplique un projet à une phase stable.",
};

export const dynamic = "force-dynamic";

/**
 * /templates — « Catalogue de templates / starters instanciables » (S81, app-builder EPIC 7). Des
 * templates curatés (e-commerce, CRM, booking) packagés comme bundles content-adressés. Instancier un
 * template produit un projet de départ déterministe et vert (Kernel vert, miroirs présents, aucun
 * monstre) ; « fork this app » duplique un projet à une phase stable.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : INSTANTIATE (duplicate-from-template) et FORK (fork
 * à une phase stable) sont liés au moteur déterministe réel (le twin lib/templates, byte-identique au
 * paquet Go) et exécutables depuis l'écran. Prouvés par l'e2e Playwright. THE WALL (§2) : les actions
 * sont des calculs de valeur DRY-RUN ; atterrir les vérités d'un starter passe par la porte légale
 * (propose → approve), jamais une écriture directe du kernel. Ne touche aucune route existante. Thème
 * ADR 0010, bilingue ADR 0011.
 */
export default async function TemplatesPage() {
	const t = await getTranslations("templates");
	const templates = await listTemplates();

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

				<section className="mt-12">
					<TemplatesPanel templates={templates} />
				</section>
			</main>
		</div>
	);
}
