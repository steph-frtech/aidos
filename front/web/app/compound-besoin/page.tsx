import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinInterviewPanel } from "@/components/BesoinInterviewPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import {
	CompoundBesoinWizard,
	type WizardLabels,
} from "./CompoundBesoinWizard";

// EL19 — the route /compound-besoin: the level-by-level FORCED tunnel (vertical staircase). The user
// EXPLAINS their app rung by rung; step N+1 is LOCKED until canDescend(N).enough (the EL07 gate made
// visible). It RÉUTILISE the /first-app wizard shell idiom, drives the pure TS twins (the byte-
// equivalent authority of back/runtime/besoin), surfaces the ShrinkOptionSpace compounding integer
// (EL08), and at the bottom PROJECTS the Ideas (EmitRequirementsDoc → EL16/EL17) — the wall: PROPOSE,
// never write the kernel (HasMirror false). The EL13 interview panel is kept below (non-destructive).
// Determinism-first: the step lock reads the pure verdict; the doc render is a pure function, never an
// LLM. Themed (ADR 0010), bilingual FR-default (ADR 0011).

export const metadata: Metadata = {
	title:
		"/compound-besoin — le wizard tunnel niveau par niveau (AIDOS Workbench)",
	description:
		"EL19 : le wizard tunnel du besoin niveau par niveau. Une étape N+1 est verrouillée tant que CanDescend(N) n'est pas enough (la gate EL07 rendue visible) ; un niveau qui parse mais ne contraint rien (anti-vacuité) ne débloque pas. « Projeter vers idea-intake » fait surgir les vraies Ideas (ordre topologique, NoEmit exclus) ; « Ouvrir comme goals » est refusé tant que le graphe n'est pas complet (gate EL09). Above le mur : PROPOSE, n'écrit jamais le Kernel.",
};

export default async function CompoundBesoinWizardPage() {
	const t = await getTranslations("besoinWizard");
	const ti = await getTranslations("besoinInterview");

	const labels: WizardLabels = {
		intentionLabel: t("intentionLabel"),
		intention: t("intention"),
		progress: t("progress"),
		completeStep: t("completeStep"),
		makeVacant: t("makeVacant"),
		resetCta: t("resetCta"),
		lockedNote: t("lockedNote"),
		enoughNote: t("enoughNote"),
		notEnoughNote: t("notEnoughNote"),
		missingHeading: t("missingHeading"),
		openQuestionsHeading: t("openQuestionsHeading"),
		blockReasonsHeading: t("blockReasonsHeading"),
		anchorsHeading: t("anchorsHeading"),
		noEmitAnchorNote: t("noEmitAnchorNote"),
		metadataHeading: t("metadataHeading"),
		metadataComplete: t("metadataComplete"),
		metadataIncomplete: t("metadataIncomplete"),
		compoundingHeading: t("compoundingHeading"),
		shrinkLabel: t("shrinkLabel"),
		reuseHeading: t("reuseHeading"),
		reuseOpenQuestion: t("reuseOpenQuestion"),
		projectCta: t("projectCta"),
		openGoalsCta: t("openGoalsCta"),
		openGoalsRefused: t("openGoalsRefused"),
		openGoalsOk: t("openGoalsOk"),
		ideasHeading: t("ideasHeading"),
		ideaCountLabel: t("ideaCountLabel"),
		docHeading: t("docHeading"),
		docLink: t("docLink"),
		wallNote: t("wallNote"),
		rungNames: {
			product: t("rungNames.product"),
			journey: t("rungNames.journey"),
			view: t("rungNames.view"),
			control: t("rungNames.control"),
			action: t("rungNames.action"),
			operation: t("rungNames.operation"),
			entity: t("rungNames.entity"),
			invariant: t("rungNames.invariant"),
			policy: t("rungNames.policy"),
		},
	};

	const interviewLabels = {
		recordCta: ti("recordCta"),
		enterableCta: ti("enterableCta"),
		resetCta: ti("resetCta"),
		caseLabel: ti("caseLabel"),
		caseProductSharp: ti("caseProductSharp"),
		caseProductFuzzy: ti("caseProductFuzzy"),
		caseEntityAtProduct: ti("caseEntityAtProduct"),
		caseProductVacant: ti("caseProductVacant"),
		routingHeading: ti("routingHeading"),
		routingRecord: ti("routingRecord"),
		routingOffAltitude: ti("routingOffAltitude"),
		routingSpike: ti("routingSpike"),
		resolvedTrue: ti("resolvedTrue"),
		resolvedFalse: ti("resolvedFalse"),
		spikeRouteHeading: ti("spikeRouteHeading"),
		blockReasonHeading: ti("blockReasonHeading"),
		openBranchesHeading: ti("openBranchesHeading"),
		branchClosed: ti("branchClosed"),
		branchOpen: ti("branchOpen"),
		enterableHeading: ti("enterableHeading"),
		enterableLabel: ti("enterableLabel"),
		gestureLabel: ti("gestureLabel"),
		dispatchHeading: ti("dispatchHeading"),
		pending: ti("pending"),
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
					<CompoundBesoinWizard labels={labels} />
				</div>

				{/* The EL13 interview panel, kept below (non-destructive, additive). */}
				<section
					aria-label="interview"
					className="mt-16 border-t border-border pt-10"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{ti("title")}
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{ti("intro")}
					</p>
					<div className="mt-6">
						<BesoinInterviewPanel labels={interviewLabels} />
					</div>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
