import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DbProjectionPanel } from "@/components/DbProjectionPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the db-projection emitter + the §44.3 guard (the deterministic,
// LLM-free codegen + the pure RequireMigration rule) are a pure projection in
// lib/db-projection.ts (the byte-identical twin of back/gen/db.{EmitMigration,
// RequireMigration,DataTruthScope}), covered by lib/db-projection.test.ts (fast-check,
// anchored on the Go output hashes). The action-capable panel re-emits + evaluates the
// SAME pure twin — no I/O, no clock, no LLM — so what is on screen matches the engine.
// READ-ONLY (the wall): the entity is a SOURCE above the line; back/gen/db is never
// hand-edited; a DataTruthScope is written via propose → ChangeSet → approval. Themed
// (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"DB projection — la migration expand-contract projetée depuis l'entité + DataTruthScope | AIDOS Workbench",
	description:
		"La projection DB d'AIDOS (KRD ligne 532) : la migration Atlas expand-contract / forward-only émise depuis l'entité (un ajout de colonne est une étape EXPAND additive ; un changement restrictif est découpé EXPAND → BACKFILL → CONTRACT). DataTruthScope (§44.3) déclare ce que la nouvelle vérité fait aux données historiques : un changement à impact historique exige une migration déclarée (HISTORICAL_IMPACT_REQUIRES_MIGRATION). La migration dry-run valide sur Postgres (Testcontainers) sans perte de données. Lecture seule.",
};

export default async function DbProjectionPage() {
	const t = await getTranslations("dbProjection");
	return (
		<>
			<WorkbenchHeader />
			<main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					{t("title")}
				</h1>
				<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
					{t("intro")}
				</p>

				{/* Tutorial — how to read this panel. */}
				<section className="mt-6 rounded-lg border border-border bg-card p-5">
					<h2 className="text-base font-semibold text-foreground">
						{t("tutorialTitle")}
					</h2>
					<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				{/* Worked example — the Order entity migration + DataTruthScope verdicts. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<DbProjectionPanel
						labels={{
							migrationTitle: t("migrationTitle"),
							derivedBadge: t("derivedBadge"),
							protectedBadge: t("protectedBadge"),
							expandBadge: t("expandBadge"),
							contractBadge: t("contractBadge"),
							sourceHashLabel: t("sourceHashLabel"),
							pathLabel: t("pathLabel"),
							reemitCta: t("reemitCta"),
							dryrunCta: t("dryrunCta"),
							byteIdenticalOk: t("byteIdenticalOk"),
							dryRunValid: t("dryRunValid"),
							scopeTitle: t("scopeTitle"),
							additiveLabel: t("additiveLabel"),
							narrowingLabel: t("narrowingLabel"),
							historicalLabel: t("historicalLabel"),
							declaredLabel: t("declaredLabel"),
							newOnlyLabel: t("newOnlyLabel"),
							appliesToLabel: t("appliesToLabel"),
							strategyLabel: t("strategyLabel"),
							preserveLabel: t("preserveLabel"),
							requiresBadge: t("requiresBadge"),
							allowedBadge: t("allowedBadge"),
							noMigrationBadge: t("noMigrationBadge"),
							verdictTitle: t("verdictTitle"),
						}}
					/>
				</section>
			</main>
		</>
	);
}
