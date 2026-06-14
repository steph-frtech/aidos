import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { AppOpsScreen } from "./AppOpsScreen";
import { seedBackups } from "./actions";

export const metadata: Metadata = {
	title: "Opérations de l'app — Sauvegardes déterministes — AIDOS Workbench",
	description:
		"DP31 : la STRATÉGIE DE BACKUP DÉTERMINISTE des volumes nommés bind (APP_DATA_PATH) ET du datastore (dump Postgres / snapshot Doltgres non-prod) de l'app émise. Planifiée (horloge INJECTÉE côté twin, jamais time.Now), append-only, scopée project_id. Un backup produit un artefact RESTAURABLE ; une restauration round-trip la donnée SANS PERTE ; le backup ne porte AUCUN secret en clair (S91 ScanEmission) ; isolation par projet (DP15). DISTINCT du rollback-par-phase (DP28) : le backup protège la DONNÉE, le rollback ré-émet le CODE. LE MUR : aucune écriture-vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /app-ops — « Opérations de l'app » (DP31, piste DP, EPIC G). The screen renders the DP31
 * DATA-BACKUP cockpit for the active project: plan + realise a deterministic backup of the
 * named bind volumes (${APP_DATA_PATH}) + the datastore (Postgres dump / Doltgres snapshot
 * non-prod), produce a content-addressed RESTORABLE artefact scoped to project_id, list the
 * append-only ledger, restore round-trip without loss, with the S91 no-secret indicator +
 * the per-project isolation indicator.
 *
 * THE GESTURE is action-capable (ui-completeness §7): PLANIFIER realises a backup on the
 * INJECTED clock and the artefact appears ; RESTAURER round-trips the data and shows the
 * no-loss verdict — reachable AND executable from the screen.
 *
 * DETERMINISM-FIRST (§6/§8): the pure twin lib/backup is authoritative (the schedule is
 * code on an injected clock, the content address is a hash, the secret scan is S91, the
 * isolation is the DP15 token); the screen only displays its deterministic output. THE WALL
 * (§2): below-the-line, no kernel/mirrors/fitness write — a backup is operational material
 * (bytes), a restoration is a recorded decision (§9). DISTINCT du rollback-par-phase (DP28).
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function AppOpsPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("appOps");
	const initialBackups = await seedBackups(ctx.activeId);

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
					<AppOpsScreen
						activeProjectId={ctx.activeId}
						initialBackups={initialBackups}
					/>
				</div>
			</main>
		</div>
	);
}
