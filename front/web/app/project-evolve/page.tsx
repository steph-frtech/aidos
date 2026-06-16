import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { LiveBacktest } from "./LiveBacktest";
import { liveBacktest } from "./liveActions";
import { ProjectEvolvePanel } from "./ProjectEvolvePanel";

export const metadata: Metadata = {
	title:
		"Boucle médiane par projet — /evolve + QD depuis un miroir fixe (AIDOS Workbench)",
	description:
		"S108 (E12) : depuis un miroir FIXE du user, l'EvolutionSandbox génère des variantes d'implémentation qui ne peuvent écrire QUE branches/reports/ideas (jamais le Kernel) ; le miroir déterministe + property test TUENT les variantes qui cassent la vérité ; les élites Pareto (rapide/cheap/simple) survivent dans des niches QD project-scopées ; la promotion est gatée par l'autorité (∧ out-of-sample vert). Le Juge est le miroir, jamais un LLM. L'évolution explore, elle ne gouverne pas — la promotion est une PROPOSITION que le /goal humain gèle.",
};

/**
 * /project-evolve — la BOUCLE MÉDIANE par projet (S108, app-builder EPIC 12 / E12, KRD §62/§64/§66).
 * Depuis un miroir FIXE du user, la sandbox cherche une MEILLEURE IMPLÉMENTATION d'une vérité déjà
 * gelée — jamais une vérité nouvelle. Le miroir déterministe TUE les variantes qui cassent la
 * vérité ; les élites Pareto survivent dans des niches QD project-scopées ; la promotion exige
 * l'autorité (∧ out-of-sample vert).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : des contrôles liés au moteur réel (le twin pur
 * lib/project-evolve), exécutables depuis l'écran — (1) « casser le miroir » d'une variante → elle
 * est tuée, jamais une élite, quel que soit son score (anti-Goodhart) ; (2) « accorder l'autorité »
 * + « promouvoir » une élite verte → une PROPOSITION (writesTruth=false). Prouvé par l'e2e
 * Playwright. THE WALL (§2) : la sandbox n'écrit AUCUNE vérité — le freeze est le /goal humain.
 * Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function ProjectEvolvePage() {
	const t = await getTranslations("projectEvolve");
	const backtestView = await liveBacktest();

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
					<ProjectEvolvePanel />
				</div>

				{/* The LIVE out-of-sample evaluation, read cheaply through the gateway (backtest_get). */}
				<LiveBacktest
					view={backtestView}
					labels={{
						heading: t("live.heading"),
						intro: t("live.intro"),
						green: t("live.green"),
						red: t("live.red"),
						notEvaluated: t("live.notEvaluated"),
						variantLabel: t("live.variantLabel"),
						scoreLabel: t("live.scoreLabel"),
						barLabel: t("live.barLabel"),
						live: t("live.live"),
						demo: t("live.demo"),
						liveTitle: t("live.liveTitle"),
						demoTitle: t("live.demoTitle"),
					}}
				/>
			</main>
		</div>
	);
}
