import { getTranslations } from "next-intl/server";
import { WhyTreePanel } from "@/components/WhyTreePanel";

/**
 * /v3/why-tree — L'ARBRE DES POURQUOI (lentille V3 « Comprendre », le geste /why, FK13) :
 * le portage EN PROPRE du concept why-tree dans la session V3 (ADR 0060). L'écran lit le
 * WhyTree LIVE depuis le serveur MCP Go why-tree à travers la passerelle
 * (buildAction → readVia(scope, "build", …) → la lecture sous-la-ligne dispatchée du
 * graphe-de-causes FK13) — JAMAIS un twin réimplémenté : le moteur Go est la SEULE source
 * vivante (ADR 0092). Le twin pur lib/why-tree est conservé UNIQUEMENT comme repli demo
 * déterministe ; un badge `source` dit à l'opérateur si l'instantané est « live » (Go) ou
 * « demo » (le repli déterministe).
 *
 * RÉUTILISATION (pas de fork, ADR 0007 / déterminisme-first §6/§8) : cette lentille
 * RÉUTILISE le composant action-capable partagé components/WhyTreePanel (la même Server
 * Action buildAction de app/why-tree, le même décodeur pur live.ts, le même registre clos
 * WHY_TREE_CASES) — elle ne ré-implémente AUCUNE logique de construction d'arbre. Seul le
 * SHELL diffère : ici, le chrome de la session V3 (V3Nav, V3SessionProvider) hérité du
 * layout, sans le WorkbenchHeader V1.
 *
 * LE GESTE, exécutable depuis l'écran (CLAUDE.md §7 ui-completeness) : choisir un scénario
 * canonique (l'incident → arbre → miroir terminal, ou l'un des trois refus) et LANCER /why
 * (un vrai submit de form) ; l'écran rend les causes reproduites ordonnées, la cause RACINE
 * et le miroir terminal d'anti-récurrence — OU le refus fermé (WHYTREE_NO_MIRROR /
 * WHYTREE_CAUSE_NOT_REPRODUCED / CAUSED_BY_CYCLE).
 *
 * LE MUR (CLAUDE.md §2/§7) : LECTURE seule — `build` est une lecture sous-la-ligne, l'écran
 * n'écrit AUCUNE vérité ; figer le miroir terminal d'anti-récurrence passe par
 * propose → /learn → /goal → approbation, jamais d'écriture ici. Thémé (tokens shadcn
 * ADR 0010, 0 hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011).
 */
export default async function V3WhyTreeScreen() {
	const t = await getTranslations("whyTree");

	const labels = {
		pickLabel: t("pickLabel"),
		buildLabel: t("buildLabel"),
		awaiting: t("awaiting"),
		symptomLabel: t("symptomLabel"),
		provenanceLabel: t("provenanceLabel"),
		causesHeading: t("causesHeading"),
		rootLabel: t("rootLabel"),
		leafNote: t("leafNote"),
		terminalHeading: t("terminalHeading"),
		terminalNote: t("terminalNote"),
		redWaveNote: t("redWaveNote"),
		refusedLabel: t("refusedLabel"),
		bodyLabel: t("bodyLabel"),
		sourceLive: t("sourceLive"),
		sourceDemo: t("sourceDemo"),
		caseNames: {
			caseIncident: t("caseIncident"),
			caseNoMirror: t("caseNoMirror"),
			caseNotReproduced: t("caseNotReproduced"),
			caseCyclic: t("caseCyclic"),
		},
		errorNames: {
			WHYTREE_NO_MIRROR: t("errNoMirror"),
			WHYTREE_CAUSE_NOT_REPRODUCED: t("errNotReproduced"),
			CAUSED_BY_CYCLE: t("errCycle"),
			WHYTREE_TERMINAL_MISMATCH: t("errMismatch"),
			UNKNOWN_PROVENANCE: t("errProvenance"),
		},
	};

	return (
		<div
			data-testid="v3-why-tree"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
				<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					{t("subtitle")}
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					{t("readOnly")}
				</span>
			</div>
			<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
				{t("intro")}
			</p>

			<section
				aria-label={t("tutorialHeading")}
				data-testid="tutorial"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("tutorialHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("tutorialBody")}
				</p>
			</section>

			<WhyTreePanel labels={labels} />
		</div>
	);
}
