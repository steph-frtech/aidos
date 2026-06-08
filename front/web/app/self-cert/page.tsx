import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { SelfCertPanel } from "./SelfCertPanel";

export const metadata: Metadata = {
	title: "Auto-certification — AIDOS Workbench",
	description:
		"La console d'auto-certification computationnelle de la boucle de build (S84) : à chaque diff, la boucle s'auto-certifie sur les senseurs RÉELS (types/lint/unit/fixtures/propriétés/contrat Pact/arch-fitness de l'arbre émis via dependency-cruiser), gatant CHAQUE itération. L'itération n'est VERTE que quand tous les senseurs passent ; un diff qui casse une frontière arch ou un contrat Pact rougit son senseur et BLOQUE l'itération avant le vert. Le juge est le miroir déterministe, jamais le LLM.",
};

/**
 * /self-cert — « Auto-certification » (S84, app-builder EPIC 8). La console qui EXÉCUTE le
 * gate d'auto-certification computationnelle : vous marquez, par senseur (types / lint / unit /
 * fixture / property / pact / archfit), s'il passe sur le diff candidat, et AIDOS CALCULE
 * DÉTERMINISTIQUEMENT la batterie gatée — VERTE seulement si tous passent ; un senseur rouge
 * (une frontière arch ou un contrat Pact rompu) lève BUILD_LOOP_SENSOR_RED et BLOQUE l'itération
 * avant le vert.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : l'op du gate a un contrôle lié, exécutable
 * depuis l'écran, prouvé par l'e2e Playwright. THE WALL (§2) : le gate est un read/compute SOUS
 * la ligne — il n'écrit AUCUNE vérité ; les runs de senseurs s'exécutent sur le bac à sable (S82)
 * ; une vérité proposée passe par propose→ChangeSet (S85). Ne touche aucune route existante.
 * Thème ADR 0010, bilingue next-intl ADR 0011.
 */
export default async function SelfCertPage() {
	const t = await getTranslations("selfCert");

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
					<SelfCertPanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
