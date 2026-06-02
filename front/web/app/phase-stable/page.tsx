import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PhaseStablePanel } from "@/components/PhaseStablePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the stable-phase verdict is a pure projection in lib/phase-stable.ts (mirroring
// back/archive/phases), covered by lib/phase-stable.test.ts (fast-check). This Server Component
// renders the intro + tutorial + example; the action-capable panel runs the same pure `isStable` the
// Go phases.IsStable / `aidos stable` emit — no I/O, no clock, no rng — so the verdict shown is
// computed exactly as Go IsStable computes it. READ-ONLY (the wall): the screen projects the verdict;
// recording a phase node into dag.stable_phase goes via the `aidos` writer role inside a ChangeSet,
// never a write here.

export const metadata: Metadata = {
	title: "Phase stable — AIDOS Workbench",
	description:
		"Panneau en lecture seule de la phase stable d'AIDOS (KRD §43) : une coupe cohérente du DAG de versions — une version par contrainte telle que TOUT lien resout (S17 vert) ET TOUT senseur est vert, à la fois — le lockfile du noyau. La coupe vide est STABLE par vacuité ; un seul miroir rouge (un senseur rouge OU un lien périmé/absent) rend la coupe INSTABLE et est nommé dans les reasons.",
};

/**
 * /phase-stable — the stable-phase panel (S23). It renders the KRD §43 coherent-cut decision: pick
 * one of the canonical cuts (empty / all-green / one-red-sensor / one-stale-link) and EVALUATE its
 * stability (the action), then read the cut — the constraint→version selection, each link coloured by
 * its resolved status, each sensor green/red — with a top-level STABLE/UNSTABLE badge and the reasons
 * when unstable. The done criteria, executable from the screen: the EMPTY cut is STABLE; a cut with
 * one red mirror is UNSTABLE and names the offender.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the verdict is computed + projected; recording a
 * node is the `aidos` writer role inside a ChangeSet. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function PhaseStablePage() {
	const t = await getTranslations("phaseStable");

	const labels = {
		pickLabel: t("pickLabel"),
		evaluateLabel: t("evaluateLabel"),
		awaiting: t("awaiting"),
		stableBadge: t("stableBadge"),
		unstableBadge: t("unstableBadge"),
		cutHeading: t("cutHeading"),
		linksHeading: t("linksHeading"),
		sensorsHeading: t("sensorsHeading"),
		reasonsHeading: t("reasonsHeading"),
		noConstraints: t("noConstraints"),
		noLinks: t("noLinks"),
		noSensors: t("noSensors"),
		statusGreen: t("statusGreen"),
		statusStale: t("statusStale"),
		statusAbsent: t("statusAbsent"),
		sensorGreen: t("sensorGreen"),
		sensorRed: t("sensorRed"),
		cutNames: {
			cutEmpty: t("cutEmpty"),
			cutGreen: t("cutGreen"),
			cutRedSensor: t("cutRedSensor"),
			cutStaleLink: t("cutStaleLink"),
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

				{/* Tutorial — how to read the screen */}
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
					<PhaseStablePanel labels={labels} />
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
