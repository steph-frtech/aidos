import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { curated } from "@/lib/templates";
import { FirstAppFunnel, type FunnelLabels } from "./FirstAppFunnel";

export const metadata: Metadata = {
	title: "Votre première application — AIDOS Workbench",
	description:
		"Un funnel d'onboarding guidé-mais-RÉEL : signup → projet (template-first par défaut) → première modification → grill → goal → miroir → build au vert → preview/deploy. Chaque étape écrit de la vraie vérité, aucune simulation.",
};

/**
 * /first-app — the S115 guided-but-REAL onboarding funnel. The star is FirstAppFunnel: an
 * action-capable form that runs the PURE funnel state machine (lib/first-app-funnel) through
 * the real deterministic twins — TEMPLATE-FIRST by default (a newcomer instantiates a green
 * S81 starter, then modifies it) and BLANK-IDEA as the advanced path. Each step produces a
 * REAL artefact (a content-addressed starterId / ideaId, a computed red set, a non-gameable
 * build verdict, a content-addressed deploy subdomain); the checklist is tied to those
 * artefacts, never confetti. The retired local simulation (FirstAppBuilder) is gone.
 *
 * Server Component (strings via next-intl, ADR 0011; design tokens, ADR 0010). The funnel
 * action writes no truth (the wall, §2) — it is a dry-run value computation over the twins.
 */
export default async function FirstAppPage() {
	const t = await getTranslations("firstApp");

	const stepNames: Record<string, string> = {
		signup: t("funnel.stepNames.signup"),
		project: t("funnel.stepNames.project"),
		idea: t("funnel.stepNames.idea"),
		grill: t("funnel.stepNames.grill"),
		goal: t("funnel.stepNames.goal"),
		build: t("funnel.stepNames.build"),
		deploy: t("funnel.stepNames.deploy"),
	};

	const funnelLabels: FunnelLabels = {
		pathLabel: t("funnel.pathLabel"),
		pathTemplate: t("funnel.pathTemplate"),
		pathTemplateHint: t("funnel.pathTemplateHint"),
		pathBlank: t("funnel.pathBlank"),
		pathBlankHint: t("funnel.pathBlankHint"),
		emailLabel: t("funnel.emailLabel"),
		templateLabel: t("funnel.templateLabel"),
		slugLabel: t("funnel.slugLabel"),
		intentLabel: t("funnel.intentLabel"),
		intentTemplateHint: t("funnel.intentTemplateHint"),
		intentBlankHint: t("funnel.intentBlankHint"),
		verdictLabel: t("funnel.verdictLabel"),
		verdictSharp: t("funnel.verdictSharp"),
		verdictFuzzy: t("funnel.verdictFuzzy"),
		verdictBad: t("funnel.verdictBad"),
		buildLabel: t("funnel.buildLabel"),
		buildGreen: t("funnel.buildGreen"),
		buildRed: t("funnel.buildRed"),
		buildLowMutation: t("funnel.buildLowMutation"),
		run: t("funnel.run"),
		reset: t("funnel.reset"),
		checklistHeading: t("funnel.checklistHeading"),
		artefactsHeading: t("funnel.artefactsHeading"),
		deployedTitle: t("funnel.deployedTitle"),
		deployedBody: t("funnel.deployedBody"),
		notDeployedTitle: t("funnel.notDeployedTitle"),
		notDeployedBody: t("funnel.notDeployedBody"),
		stepNames,
		artefactStarter: "",
		artefactIdea: "",
		artefactRedSet: "",
		artefactBuild: "",
		artefactSubdomain: "",
		previewCta: t("funnel.previewCta"),
		deployCta: t("funnel.deployCta"),
	};

	const templates = curated().map((b) => ({
		id: b.id,
		label: b.labels.fr ?? b.id,
	}));

	// The eight teeth deep-linked to the real Workbench panels ("le faire pour de vrai").
	const panels = [
		{ k: "s1", href: "/ideas" },
		{ k: "s2", href: "/exploration" },
		{ k: "s3", href: "/goal" },
		{ k: "s4", href: "/mirrors" },
		{ k: "s5", href: "/changeset" },
		{ k: "s6", href: "/sensors" },
		{ k: "s7", href: "/emitters" },
		{ k: "s8", href: "/phase-stable" },
	];

	const moreLinks = [
		{
			href: "https://aidos.mintlify.app/concepts/proof-levels",
			label: t("more.proofLevels"),
		},
		{
			href: "https://aidos.mintlify.app/concepts/certification-languages",
			label: t("more.certLanguages"),
		},
		{
			href: "https://aidos.mintlify.app/guide/getting-started",
			label: t("more.guide"),
		},
	];

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				{/* Hero */}
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("eyebrow")}
					</span>
					<h1 className="max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
						{t("subtitle")}
					</p>
				</header>

				{/* What you'll build + the golden rule */}
				<div className="mt-10 grid gap-6 lg:grid-cols-2">
					<section
						data-testid="build"
						aria-label={t("build.heading")}
						className="rounded-xl border border-border bg-card p-5"
					>
						<h2 className="text-base font-semibold text-card-foreground">
							{t("build.heading")}
						</h2>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{t("build.body")}
						</p>
					</section>

					<section
						data-testid="rule"
						aria-label={t("rule.heading")}
						className="rounded-xl border border-border bg-muted/40 p-5"
					>
						<h2 className="text-base font-semibold text-card-foreground">
							{t("rule.heading")}
						</h2>
						<p className="mt-3 rounded-lg bg-background px-3 py-2 text-center font-mono text-xs text-foreground">
							{t("rule.loop")}
						</p>
					</section>
				</div>

				{/* The REAL funnel — the star (action-capable, drives real artefacts) */}
				<section className="mt-12 space-y-4" aria-label={t("funnel.title")}>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("funnel.title")}
						</h2>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{t("funnel.lead")}
						</p>
					</div>
					<FirstAppFunnel labels={funnelLabels} templates={templates} />
				</section>

				{/* Do it for real — deep links to the actual panels */}
				<section
					data-testid="panels"
					aria-label={t("panels.heading")}
					className="mt-12 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-base font-semibold text-card-foreground">
						{t("panels.heading")}
					</h2>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{t("panels.lead")}
					</p>
					<ol className="mt-4 grid gap-2 sm:grid-cols-2">
						{panels.map((p, i) => (
							<li key={p.href}>
								<Link
									href={p.href}
									data-testid={`panel-link-${i + 1}`}
									className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
										{i + 1}
									</span>
									<span className="flex-1">{t(`steps.${p.k}.panelLabel`)}</span>
									<span aria-hidden="true">→</span>
								</Link>
							</li>
						))}
					</ol>
				</section>

				{/* See the canonical slice green, end to end */}
				<section
					data-testid="see"
					aria-label={t("see.heading")}
					className="mt-10 rounded-xl border border-primary/40 bg-primary/5 p-6"
				>
					<h2 className="text-base font-semibold text-card-foreground">
						{t("see.heading")}
					</h2>
					<p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("see.body")}
					</p>
					<Link
						href="/demo-checkout"
						data-testid="see-cta"
						className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
					>
						{t("see.cta")}
						<span aria-hidden="true">→</span>
					</Link>
				</section>

				{/* Go further — the public docs */}
				<section
					data-testid="more"
					aria-label={t("more.heading")}
					className="mt-10 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-base font-semibold text-card-foreground">
						{t("more.heading")}
					</h2>
					<ul className="mt-3 flex flex-wrap gap-2">
						{moreLinks.map((l) => (
							<li key={l.href}>
								<a
									href={l.href}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									{l.label}
									<span aria-hidden="true">↗</span>
								</a>
							</li>
						))}
					</ul>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
