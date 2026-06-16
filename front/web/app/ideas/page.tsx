import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { IdeasPanel } from "@/components/IdeasPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { liveIdeas } from "./actions";
import { LiveIdeas } from "./LiveIdeas";

// Read the live candidate-truth board of the active project on every request (the S59 cutover):
// the live idea list is read through the gateway (idea_list), never baked into a static page.
export const dynamic = "force-dynamic";

// Determinism-first: the lifecycle + the promotion gate are pure projections in lib/ideas.ts (the
// twin of back/kernel/ideas), covered by lib/ideas.test.ts (fast-check). This Server Component
// renders the intro + tutorial + example; the action-capable panel runs the SAME pure promote() the
// Go ideas.Promote runs — no I/O, no clock, no rng — so the gate verdict on screen matches the
// engine. READ-ONLY (the wall): capture/advance rides the idea-intake MCP (ideas schema, above the
// wall); a promotion writes the kernel via the S20 ChangeSet path under the aidos writer role.

export const metadata: Metadata = {
	title: "Idées — cycle de vie (AIDOS Workbench)",
	description:
		"Le tableau des idées d'AIDOS (KRD §115/§116/§118/§119) : une idée est une vérité-CANDIDATE mise en scène AU-DESSUS du produit mais SOUS le gel — un corps esquissé (proposes + intent + provenance) SANS gel de version et SANS miroir. Cette double absence est EXACTEMENT ce qui en fait une idée et non une vérité. Le cycle de vie va de draft → grilled → {spiking → harvested | harvested}, avec une voie rejected (tracée, conservée). « Promouvoir » n'est PAS un statut : c'est l'ACTE d'écrire le miroir de l'idée, qui EST le /goal, qui EST le gel dans /kernel. Une idée sans miroir ne peut JAMAIS entrer dans le noyau (NO_MIRROR_NO_KERNEL). Lecture seule (le mur).",
};

/**
 * /ideas — the idea board + the promotion gate (S27). It renders one card per idea (proposes /
 * intent / provenance / status) grouped into the five lifecycle lanes, each with the explicit "no
 * mirror yet" marker, and lets the human RUN both promotion paths from the screen: WITHOUT a mirror
 * ⇒ a red NO_MIRROR_NO_KERNEL row (the idea stays harvested, no kernel write — THE done criterion);
 * WITH a mirror ⇒ the Promoted → /goal → frozen-truth path with the provenance back-link.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the lifecycle + gate verdict are RENDERED,
 * never re-implemented as truth here. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function IdeasPage() {
	const t = await getTranslations("ideas");
	const tc = await getTranslations("common");
	const live = await liveIdeas();

	const labels = {
		laneNames: {
			draft: t("statusDraft"),
			grilled: t("statusGrilled"),
			spiking: t("statusSpiking"),
			harvested: t("statusHarvested"),
			rejected: t("statusRejected"),
		},
		proposesLabel: t("proposesLabel"),
		intentLabel: t("intentLabel"),
		provenanceLabel: t("provenanceLabel"),
		noMirrorMarker: t("noMirrorMarker"),
		promoteHeading: t("promoteHeading"),
		promoteWithoutMirror: t("promoteWithoutMirror"),
		promoteWithMirror: t("promoteWithMirror"),
		blockedHeading: t("blockedHeading"),
		promotedHeading: t("promotedHeading"),
		howToFixLabel: t("howToFixLabel"),
		provenanceLinkLabel: t("provenanceLinkLabel"),
		staysHarvestedNote: t("staysHarvestedNote"),
		sourceNames: {
			human: t("sourceHuman"),
			incident: t("sourceIncident"),
		},
	};

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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial — how to read & drive the screen */}
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
					<IdeasPanel labels={labels} />
				</div>

				{/* Live idea board — read through the gateway (idea_list), demo fallback */}
				<div className="mt-10">
					<LiveIdeas
						view={live}
						labels={{
							heading: t("liveHeading"),
							intro: t("liveIntro"),
							empty: t("liveEmpty"),
							live: tc("live"),
							demo: tc("demo"),
							liveTitle: t("liveTitle"),
							demoTitle: t("demoTitle"),
							idLabel: t("liveIdLabel"),
							statusLabel: t("liveStatusLabel"),
							proposesLabel: t("proposesLabel"),
							intentLabel: t("intentLabel"),
							provenanceLabel: t("provenanceLabel"),
							laneNames: labels.laneNames,
							sourceNames: labels.sourceNames,
						}}
					/>
				</div>

				{/* Worked example */}
				<section
					aria-label={t("exampleHeading")}
					data-testid="example"
					className="mt-10 space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
