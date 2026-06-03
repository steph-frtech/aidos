import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { type BuilderStage, FirstAppBuilder } from "./FirstAppBuilder";

export const metadata: Metadata = {
	title: "Votre première application — AIDOS Workbench",
	description:
		"Un tutoriel guidé, interactif : suivez les flèches et construisez votre première capacité, de l'intention au bouton cliquable, en suivant la boucle KRD.",
};

/**
 * /first-app — the guided, HANDS-ON onboarding. The star is FirstAppBuilder: an
 * interactive coach-mark walkthrough where the user clicks the highlighted button at each
 * stage (arrow → "Cliquez ici"), the pipeline fills idea→…→button, and the last stage is
 * the real checkout button they just built. Below it, the same eight teeth deep-link to
 * the real Workbench panels ("le faire pour de vrai"). Server Component (strings via
 * next-intl, ADR 0011; tokens, ADR 0010); read-only, the wall is untouched.
 */
export default async function FirstAppPage() {
	const t = await getTranslations("firstApp");

	const builderStages: BuilderStage[] = Array.from({ length: 8 }, (_, i) => {
		const n = i + 1;
		return {
			n,
			action: t(`builder.stages.s${n}.action`),
			active: t(`builder.stages.s${n}.active`),
			done: t(`builder.stages.s${n}.done`),
			node: t(`builder.stages.s${n}.node`),
		};
	});

	const builderLabels = {
		arrow: t("builder.arrow"),
		restart: t("builder.restart"),
		progress: t("builder.progress"),
		intentionLabel: t("builder.intentionLabel"),
		intention: t("builder.intention"),
		complete: t("builder.complete"),
		completeBody: t("builder.completeBody"),
		orderPlaced: t("builder.orderPlaced"),
	};

	// The eight teeth deep-linked to the real Workbench panels.
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

				{/* The interactive, hands-on builder — the star */}
				<section className="mt-12 space-y-4" aria-label={t("builder.title")}>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("builder.title")}
						</h2>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{t("builder.lead")}
						</p>
					</div>
					<FirstAppBuilder stages={builderStages} labels={builderLabels} />
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
