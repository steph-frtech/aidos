import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { FirstAppGuide, type GuideStep } from "./FirstAppGuide";

export const metadata: Metadata = {
	title: "Votre première application — AIDOS Workbench",
	description:
		"Un tutoriel guidé pas à pas pour construire votre première application avec AIDOS : la boucle KRD de l'intention au bouton cliquable, sans jamais aller du prompt au code.",
};

/**
 * /first-app — the guided onboarding tutorial: how to build your FIRST application with
 * AIDOS. It walks the whole KRD verticale (Idea → grill → Goal/red set → mirror → kernel
 * via an approved ChangeSet → green → projections → stable phase → clickable button) as an
 * interactive, checkable guide, each step deep-linking to the real Workbench panel where
 * you do it. It composes existing routes; it authors no new capability, truth or kernel
 * write. Server Component (strings via next-intl, ADR 0011; design tokens, ADR 0010); the
 * interactive checklist is the FirstAppGuide client component. Read-only; the wall is
 * untouched.
 */
export default async function FirstAppPage() {
	const t = await getTranslations("firstApp");

	// The eight teeth of the verticale, each bound to the panel where you act it out.
	const stepDefs: { key: string; href: string }[] = [
		{ key: "s1", href: "/ideas" },
		{ key: "s2", href: "/exploration" },
		{ key: "s3", href: "/goal" },
		{ key: "s4", href: "/mirrors" },
		{ key: "s5", href: "/changeset" },
		{ key: "s6", href: "/sensors" },
		{ key: "s7", href: "/emitters" },
		{ key: "s8", href: "/phase-stable" },
	];

	const steps: GuideStep[] = stepDefs.map((d, i) => ({
		n: i + 1,
		href: d.href,
		title: t(`steps.${d.key}.title`),
		body: t(`steps.${d.key}.body`),
		gesture: t(`steps.${d.key}.gesture`),
		doneWhen: t(`steps.${d.key}.doneWhen`),
		panelLabel: t(`steps.${d.key}.panelLabel`),
	}));

	const labels = {
		progress: t("guide.progress"),
		open: t("guide.open"),
		gestureLabel: t("guide.gestureLabel"),
		doneWhenLabel: t("guide.doneWhenLabel"),
		reset: t("guide.reset"),
		complete: t("guide.complete"),
		completeBody: t("guide.completeBody"),
	};

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
						<Link
							href="/demo-checkout"
							data-testid="build-cta"
							className="mt-4 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
						>
							{t("build.cta")}
							<span aria-hidden="true">→</span>
						</Link>
					</section>

					<section
						data-testid="rule"
						aria-label={t("rule.heading")}
						className="rounded-xl border border-border bg-muted/40 p-5"
					>
						<h2 className="text-base font-semibold text-card-foreground">
							{t("rule.heading")}
						</h2>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{t("rule.body")}
						</p>
						<p className="mt-3 rounded-lg bg-background px-3 py-2 text-center font-mono text-xs text-foreground">
							{t("rule.loop")}
						</p>
					</section>
				</div>

				{/* The guided, interactive walkthrough */}
				<section className="mt-12 space-y-4" aria-label={t("guide.heading")}>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("guide.heading")}
						</h2>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{t("guide.lead")}
						</p>
					</div>
					<FirstAppGuide steps={steps} labels={labels} />
				</section>

				{/* See it green, for real */}
				<section
					data-testid="see"
					aria-label={t("see.heading")}
					className="mt-12 rounded-xl border border-primary/40 bg-primary/5 p-6"
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
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{t("more.body")}
					</p>
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
