import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { DemoCheckoutPanel } from "./DemoCheckoutPanel";

export const metadata: Metadata = {
	title: "Démo checkout — la verticale complète — AIDOS Workbench",
	description:
		"Le panneau /demo-checkout du Workbench : la tranche de démonstration end-to-end (Idée → Goal → Noyau → Miroir → Src → Stable) pour « un client passe une commande depuis son panier ». Action-capable — le bouton checkout déclenche createOrder. Lecture seule contre la vérité.",
};

/**
 * /demo-checkout — the S46 composition-acceptance panel. It visualizes the WHOLE KRD
 * loop for the checkout slice as a pipeline — the seeded Idea, the kernel ASTs (Order,
 * createOrder), the loop stages each mapped to the tooth they compose — and renders the
 * LIVE cart + checkout button (the emitted projection's twin) that PLACES the order on
 * click (action-capable, ui-completeness): clicking checkout dispatches createOrder and
 * shows the placed order with its line items, capped by a stable / all-green badge.
 *
 * THE WALL (CLAUDE.md §2): read-only over truth. The kernel write is the approved,
 * completeness-gated ChangeSet on the back (S20, the door) — never a screen write.
 * Determinism-first: the verdict is the TS twin lib/demo-checkout, the SAME shape as
 * the Go slice, so the screen agrees with the engine. Themed on ADR 0010; bilingual
 * via next-intl (ADR 0011), français par défaut.
 */
export default async function DemoCheckoutPage() {
	const t = await getTranslations("demoCheckout");

	const tutorialKeys = ["t1", "t2", "t3"] as const;
	const rich = {
		code: (chunks: React.ReactNode) => (
			<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
				{chunks}
			</code>
		),
		strong: (chunks: React.ReactNode) => (
			<strong className="font-semibold text-foreground">{chunks}</strong>
		),
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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial — the concepts before the jargon (ui-completeness). */}
				<section className="mt-10 rounded-xl border border-border bg-card p-5">
					<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
						{t("tutorial.badge")}
					</span>
					<h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
						{t("tutorial.heading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("tutorial.lead")}
					</p>
					<div className="mt-4 grid gap-4 sm:grid-cols-3">
						{tutorialKeys.map((k) => (
							<div
								key={k}
								className="rounded-lg border border-border bg-background p-4"
							>
								<h3 className="text-sm font-semibold text-foreground">
									{t(`tutorial.${k}.title`)}
								</h3>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									{t.rich(`tutorial.${k}.body`, rich)}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* The action-capable loop + cart + checkout. */}
				<section className="mt-10">
					<DemoCheckoutPanel />
				</section>

				{/* Worked example. */}
				<section className="mt-10 rounded-xl border border-border bg-muted/40 p-5">
					<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
						{t("example.badge")}
					</span>
					<h2 className="mt-3 text-base font-semibold tracking-tight text-foreground">
						{t("example.heading")}
					</h2>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{t.rich("example.body", rich)}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
