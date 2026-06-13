import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	emitAsyncFragments,
	emitFragments,
	emitObservabilityFragments,
} from "./actions";
import { SubstrateScreen } from "./SubstrateScreen";

export const metadata: Metadata = {
	title: "Services de données (fragments StackManifest) — AIDOS Workbench",
	description:
		"DP15 : les FRAGMENTS StackManifest des services de DONNÉES de l'app émise — Postgres (datastore prod, profil core), Doltgres (datastore opt-in HORS PROD), Valkey (cache, core), PgBouncer (pooler, core). Chaque fragment = image + port interne + volume bind + healthcheck + depends_on + profil, isolé par projet. En prod, Doltgres est REFUSÉ (DOLTGRES_NOT_ALLOWED_IN_PROD, règle DP06). LE MUR : aucune écriture-vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /substrate — « Services de données (fragments StackManifest) » (DP15, piste DP).
 * The screen renders the FOUR data-layer service fragments the Go emitter
 * (runtime/datafragments, via cmd/aidosdatafragments) produces for the active
 * project: Postgres (datastore, core, the prod default), Doltgres (datastore,
 * non-prod, OPT-IN — marked « hors prod »), Valkey (cache, core), PgBouncer
 * (pooler, core). Each fragment carries its image, internal port, named bind volume
 * (isolated per project), healthcheck, depends_on and profile.
 *
 * THE ENV SELECTOR is the gesture (ui-completeness, §7): switching to PROD re-emits
 * via the authoritative Go and the DP06 rule REFUSES doltgres
 * (DOLTGRES_NOT_ALLOWED_IN_PROD, surfaced verbatim) — it disappears from the
 * emitted set, leaving the three core services. Off prod the four fragments appear.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative (the fragment emission +
 * the DP06 gate are pure functions); the screen only displays its deterministic
 * output. THE WALL (§2): below-the-line projection, no kernel/mirrors/fitness write.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function SubstratePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("substrate");
	// Seed the panel off prod (dev) so the four fragments — including the opt-in
	// doltgres — are visible on first paint; the selector drives prod from there. The
	// async twin (Windmill + NATS) is seeded for the same env so both slices are in step.
	const [initialData, initialAsync, initialObs] = await Promise.all([
		emitFragments(ctx.activeId, "dev"),
		emitAsyncFragments(ctx.activeId, "dev"),
		emitObservabilityFragments(ctx.activeId, "dev"),
	]);

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
					<SubstrateScreen
						activeProjectId={ctx.activeId}
						initialData={initialData}
						initialAsync={initialAsync}
						initialObs={initialObs}
					/>
				</div>
			</main>
		</div>
	);
}
