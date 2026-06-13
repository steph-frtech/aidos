import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { AppDocsPanel } from "./AppDocsPanel";
import { emitAppDocs } from "./actions";

export const metadata: Metadata = {
	title: "Docs de l'app émise (Fumadocs + Scalar + Pagefind) — AIDOS Workbench",
	description:
		"DP30 : les DOCS de l'app construite, émises DÉTERMINISTIQUEMENT depuis le Kernel + l'OpenAPI émis (S90) — un SITE de documentation (Fumadocs, concepts du domaine), une RÉFÉRENCE API (Scalar, consommant l'OpenAPI émis — chaque endpoint présent), une RECHERCHE statique (Pagefind, indexe et trouve). Thème ccup hérité (ADR 0010), bilingue FR (ADR 0011). Les docs sont une PROJECTION (jamais une vérité) — DISTINCTES des docs Mintlify d'AIDOS (le journal de build). LE MUR : aucune écriture-vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /app-docs — « Docs de l'app émise (DP30, piste DP, EPIC G) ».
 * The screen renders the DETERMINISTIC docs PROJECTION the Go emitter
 * (runtime/docsfragments, via cmd/aidosdatafragments -docs) produces for the active
 * project: the THREE docs profile services (Fumadocs site + Scalar API reference +
 * Pagefind static index), the Scalar reference CONSUMING the S90-emitted OpenAPI (every
 * sync endpoint present), the Fumadocs concept pages of the user's domain, and the
 * Pagefind search (a domain term → a result). An indicator surfaces the capital invariant
 * « docs par app ≠ docs AIDOS Mintlify » (the build journal).
 *
 * THE ENV SELECTOR + the SEARCH are the gestures (ui-completeness, §7): switching env
 * re-emits via the authoritative Go; typing a domain term runs the deterministic Pagefind
 * token match over the emitted index.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative (the docs emission is a PURE function
 * of the Kernel + the S90 OpenAPI — same input ⇒ byte-identical docs); the screen only
 * displays its deterministic output. THE WALL (§2): below-the-line projection, no
 * kernel/mirrors/fitness write — the docs are a PROJECTION, never a verity. Themed on ADR
 * 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function AppDocsPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("appDocs");
	// Seed the panel off prod (dev); the docs profile is legal in every env (no docs service
	// is env-gated) so the three fragments + the projection appear on first paint.
	const initial = await emitAppDocs(ctx.activeId, "dev");

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
					<AppDocsPanel activeProjectId={ctx.activeId} initial={initial} />
				</div>
			</main>
		</div>
	);
}
