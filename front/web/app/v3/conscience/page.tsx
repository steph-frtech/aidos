import { getTranslations } from "next-intl/server";
import { ConsciencePanel } from "@/app/conscience/ConsciencePanel";

/**
 * /v3/conscience — LA CONSCIENCE (lentille V3, parcours « Comprendre ») : le portage NATIF
 * dans la session V3 du concept FK09 (piste FKE). La conscience est un AGRÉGATEUR
 * DÉTERMINISTE (KRD FKE-6.3) : une fonction pure qui COMPOSE les verdicts des juges
 * EXISTANTS (runner de miroirs, complétude/monstre, facettes S/R/V/M/X, SemanticDiff,
 * RealityMirror, senseurs, ledger) en un ConsciousnessReport par kernel + les decision cards
 * (§FKE-31). AUCUN nouveau juge — elle LIT des verdicts sourcés et les ROUTE ; une divergence
 * produit sa decision card actionnable ; la facette molle X reste advisory (§13.6).
 *
 * RÉUTILISATION (pas de fork, ADR 0007 / déterminisme-first §8 ; « twins must die ») : la
 * lentille NE RÉIMPLÉMENTE RIEN. Elle réutilise TELLE QUELLE la chaîne LIVE déjà prouvée du
 * concept top-level — le panneau action-capable `app/conscience/ConsciencePanel`, son Server
 * Action `reconcileAction` (S59/ADR 0092 : `readVia(scope, "reconcile", …)` lit le serveur Go
 * `conscience` DISPATCHÉ par la passerelle, le twin pur `demoReport` n'étant que le repli
 * déterministe `source:"live"|"demo"`), le décodeur pur `reportDecoder` (parité épinglée par
 * `app/conscience/live.test.ts`) et les scénarios `conscience-data`. Le moteur Go reste la
 * SEULE source vivante ; le front DÉCODE une lecture sous-la-ligne, il ne calcule pas la
 * réconciliation. Le badge de source affiché par le panneau est donc honnête (live/demo).
 *
 * Le SHELL V3 (app/v3/layout.tsx) fournit déjà la nav + la V3SessionProvider ; cette page n'a
 * donc pas de WorkbenchHeader (motif /v3/emetteurs). Themed (tokens shadcn ADR 0010, 0 hex) +
 * bilingue (next-intl, FR par défaut, ADR 0011 — le panneau lit le namespace `conscience`,
 * complet en FR+EN). LE MUR (§2) : lecture + projection seulement ; le rapport et les cartes
 * sont des SIGNAUX — agir sur une carte passe par idea → mirror → /goal → décision humaine,
 * jamais une écriture depuis l'écran. Cliquet T5 vert (le twin reste derrière le repli demo).
 */
export default async function V3ConscienceScreen() {
	const t = await getTranslations("conscience");
	return (
		<div
			data-testid="v3-conscience"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<header className="space-y-3">
				<span className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("eyebrow")}
				</span>
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
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
				data-testid="v3-conscience-tutorial"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("tutorialHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("tutorialBody")}
				</p>
			</section>

			<ConsciencePanel />
		</div>
	);
}
