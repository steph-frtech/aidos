import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EntityMapPanel } from "@/components/EntityMapPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { ENTITY_ORDER, ENTITY_ORDER_CHANGED } from "@/lib/entity-source-data";

// Determinism-first: the entity emitters (the deterministic, LLM-free codegen) are a pure
// projection in lib/entity-source.ts (the byte-identical twin of back/kernel/entities.{EmitGo,
// EmitTS,EmitDDL}), covered by lib/entity-source.test.ts (fast-check). The action-capable panel
// re-emits the SAME pure twin — no I/O, no clock, no LLM — so what is on screen matches the
// engine. READ-ONLY (the wall): an entity is a SOURCE above the line (the agent reads it
// SELECT-only); gen/ is never hand-edited; truth-writes go via propose → ChangeSet → approval.
// Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Entity source — une source, trois projections (Go · TS · DDL) | AIDOS Workbench",
	description:
		"La source entity d'AIDOS (KRD §23) : un AST en Postgres (kernel, content-addressed, append-only, au-dessus de la ligne) d'où émanent trois projections déterministes — une struct Go (sqlc), un type TS, le DDL Postgres — jamais double-typé. L'entité Order : ordre source préservé, identifier → PRIMARY KEY, required → NOT NULL / non-optionnel, discount → NULLABLE / optionnel. Lecture seule.",
};

export default async function EntityMapPage() {
	const t = await getTranslations("entityMap");
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

				{/* Worked example — the Order entity. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<EntityMapPanel
						order={ENTITY_ORDER}
						orderChanged={ENTITY_ORDER_CHANGED}
						labels={{
							sourceTitle: t("sourceTitle"),
							projectionsTitle: t("projectionsTitle"),
							derivedBadge: t("derivedBadge"),
							requiredBadge: t("requiredBadge"),
							optionalBadge: t("optionalBadge"),
							identifierBadge: t("identifierBadge"),
							reemitCta: t("reemitCta"),
							moveHeadCta: t("moveHeadCta"),
							resetCta: t("resetCta"),
							headHashLabel: t("headHashLabel"),
							sourceHashLabel: t("sourceHashLabel"),
							outputHashLabel: t("outputHashLabel"),
							deterministicBadge: t("deterministicBadge"),
							staleBadge: t("staleBadge"),
							byteIdenticalOk: t("byteIdenticalOk"),
							attributesLabel: t("attributesLabel"),
							pathLabel: t("pathLabel"),
							targetGo: t("targetGo"),
							targetTs: t("targetTs"),
							targetDdl: t("targetDdl"),
						}}
					/>
				</section>
			</main>
		</>
	);
}
