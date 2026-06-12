import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { bindings, hashBindings } from "@/lib/environments";
import { EnvironmentsPanel } from "./EnvironmentsPanel";

export const metadata: Metadata = {
	title: "Environnements — bindings par environnement (DP06) — AIDOS Workbench",
	description:
		"DP06 : l'ensemble clos scope.Environment (S15) s'élargit à 5 — prod, staging, dev + local, future_cloud (additif, ADR 0065). Chaque environnement déclare ses bindings de connexion (datastores, motif d'URL en références d'env-var, TLS, réseau) comme projection below-the-line. La porte A1 : prod impose Postgres — DOLTGRES_NOT_ALLOWED_IN_PROD.",
};

export const dynamic = "force-dynamic";

/**
 * /environments — « Les 5 environnements et leurs bindings » (DP06, roadmap
 * provisioning-deploy EPIC B). The page READS the declared bindings projection
 * (the TS twin, byte-parity-pinned to the authoritative Go
 * back/runtime/envbindings) and renders the five closed environments with
 * their connection bindings + the projection's content address. The one
 * control (« tester la liaison ») runs the PURE A1 gate over a picked
 * (environment, datastore) pair — proving the closed-set refusals and the
 * prod-imposes-Postgres rule from the screen. It writes NOTHING.
 *
 * THE WALL (CLAUDE.md §2): widening the closed environment set was the truth
 * change (idea → mirror → /goal, ADR 0065); the bindings are a below-the-line
 * projection. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */
export default async function EnvironmentsPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("environments");
	const all = bindings();
	const seededHash = await hashBindings();

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
					<EnvironmentsPanel
						activeProjectId={ctx.activeId}
						bindings={all}
						seededHash={seededHash}
					/>
				</div>
			</main>
		</div>
	);
}
