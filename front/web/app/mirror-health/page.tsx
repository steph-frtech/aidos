import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the completeness law + the demo cut are a pure, declared
// dataset in lib/mirror-health.ts (a port of the Go core
// back/kernel/mirror/records/records.go), covered by lib/mirror-health.test.ts.
// This Server Component renders the inventory + tutorial; the HealthRunner client
// island computes the law over a declared cut via the computeHealth Server Action
// — so /mirror-health computes exactly what the Go predicates compute. No drift.
import { HealthRunner } from "./HealthRunner";

export const metadata: Metadata = {
	title: "Santé du miroir — AIDOS Workbench",
	description:
		"Action-capable panel of the completeness law: the typed Mirror inventory (reflects, test_kind, cert_language, authority, liveness), the monster set (a truth without a living mirror; an orphan mirror), and the completeness verdict (COMPLETE / RED — MONSTER). Reads mirrors ⋈ kernel, writes nothing.",
};

/**
 * /mirror-health — the completeness-law panel (S06). The bicephalous body made
 * checkable (KRD §29, §33, §34): a truth without a living mirror, or a mirror
 * reflecting nothing, is a MONSTER — and a monster is red.
 *
 * ACTION-CAPABLE (ui-completeness, CLAUDE.md §6): the capability the step develops
 * (compute the completeness law → monster set + verdict) is reachable AND
 * executable from the screen via the HealthRunner controls, not just displayed.
 * THE WALL (§2): computing completeness reads mirrors ⋈ kernel (above the line)
 * and writes NOTHING — it is a read-only verdict, so the action is legal. Themed
 * on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function MirrorHealthPage() {
	const t = await getTranslations("mirrorHealth");

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
						<span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
							{t("lawBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("badge")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Self-teaching tutorial: the concepts before the jargon */}
				<section
					data-testid="mirror-health-tutorial"
					aria-label={t("tutorial.heading")}
					className="mt-10 space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-8"
				>
					<div className="space-y-2">
						<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
							{t("tutorial.badge")}
						</span>
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("tutorial.heading")}
						</h2>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{t("tutorial.lead")}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{(["t1", "t2", "t3", "t4"] as const).map((k) => (
							<article
								key={k}
								className="space-y-1.5 rounded-xl border border-border bg-background p-4"
							>
								<h3 className="text-sm font-semibold text-foreground">
									{t(`tutorial.${k}.title`)}
								</h3>
								<p className="text-sm leading-relaxed text-muted-foreground">
									{t(`tutorial.${k}.body`)}
								</p>
							</article>
						))}
					</div>

					{/* A worked example: the five typed fields on one mirror record. */}
					<div
						data-testid="mirror-health-example"
						className="space-y-2 rounded-xl border border-border bg-background p-4"
					>
						<h3 className="text-sm font-semibold text-foreground">
							{t("example.heading")}
						</h3>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("example.lead")}
						</p>
						<pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed text-foreground">
							{`mirror checkout-button.fixture {
  reflects:       checkout-button @v1   # the kernel layer it proves
  test_kind:      fixture               # KRD §90 profile for a control
  cert_language:  fixture               # executable → counts toward completeness
  authority:      above                 # test-as-goal (human-anchored)
  liveness:       alive                 # reflects a real layer + runs as a sensor
}`}
						</pre>
					</div>
				</section>

				{/* The action-capable runner: compute the law over a declared cut. */}
				<HealthRunner />

				{/* The wall note: this panel computes, it never writes truth. */}
				<p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</main>
		</div>
	);
}
