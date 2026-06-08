import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { FrontEmitterPanel } from "./FrontEmitterPanel";

export const metadata: Metadata = {
	title: "Front-end émis — AIDOS Workbench",
	description:
		"S93 : émetteur UI déterministe produisant le front-end de l'app construite — pages/navigation/forms sur les entités (scalaires + relations + blobs), la verticale control+action rendue en vrais boutons, chaque bouton portant sa fixture control-spec comme senseur, héritant le thème ccup (ADR 0010) + i18n bilingue (ADR 0011), câblé sur l'API émise. Cible : Hono JSX/SSR (OQ-0040-front tranchée). Déterministe : même Kernel → bundle byte-identique. LE MUR : émettre n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /front-emitter — « front-end de l'app émise » (S93, app-builder EPIC 9, ADR 0040,
 * OQ-0040-front DÉCIDÉE = Hono JSX/SSR). L'émetteur PROJETTE le front de l'app construite :
 * l'index de navigation, un formulaire de création par entité (scalaires + uploads blob +
 * selects de relation), et la verticale control+action rendue en VRAIS boutons, chacun portant
 * sa fixture control-spec comme SENSEUR (data-aidos-fixture).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : DEUX surfaces exécutables depuis l'écran —
 * (1) ÉMETTRE le front déterministiquement (basculer blob/relation → bundle byte-identique +
 * source du formulaire + boutons-senseurs) ; (2) SOUMETTRE le formulaire généré (texte +
 * checkbox + upload de fichier + select de relation) contre le datastore (une vraie operation,
 * upload blob inclus). THE WALL (§2) : émettre n'écrit AUCUNE vérité — le front est une
 * projection ; la soumission écrit dans un datastore sous la ligne (jamais le kernel). Ne
 * touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function FrontEmitterPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("frontEmitter");

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
					<FrontEmitterPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
