import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmittersPanel, type EntityView } from "@/components/EmittersPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import {
	type Artifact,
	isBlocked,
	project,
	sourceHash,
	TARGETS,
} from "@/lib/emitters";
import {
	EMITTED_FUNCTIONAL_GO,
	ENTITIES,
	ENTITY_ORDER,
	ENTITY_ORDER_CHANGED,
} from "@/lib/emitters-data";

// Determinism-first: the emitters (the deterministic, LLM-free codegen) are a pure projection in
// lib/emitters.ts (the byte-identical twin of back/runtime/generators.{Emit,Project}), covered by
// lib/emitters.test.ts (fast-check). This Server Component computes the projections (node:crypto
// runs server-side) and renders the intro + tutorial + worked example; the action-capable panel
// re-emits the SAME pure twin — no I/O, no clock, no LLM — so what is on screen matches the engine.
// READ-ONLY (the wall): the emitter reads the entity AST; gen/ is never hand-edited; the ledger is
// written by the aidos role, never the agent. Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Emitters — projections déterministes (go-sqlc · pg-ddl · ts-types) | AIDOS Workbench",
	description:
		"Les emitters d'AIDOS (KRD LIVRE V/VII) : un générateur déterministe par kind × target qui lit un AST d'entité depuis le kernel (S02) et émet structs Go (sqlc), DDL Postgres et types TS — une source, N projections, jamais double-typé. La même source donne une sortie byte-identique ; chaque artefact porte son source_hash et un header protégé ; gen/ n'est jamais édité à la main ; la staleness est calculée et alimente la vague de rouge (S22). Lecture seule.",
};

/** Build the per-entity view the panel renders: the source AST + its three projections, each
 *  carrying source_hash / output_hash / the protected header preview. Computed by the pure twin. */
function entityView(entity: (typeof ENTITIES)[number]): EntityView {
	const arts = project([entity], TARGETS);
	const projections: Artifact[] = isBlocked(arts) ? [] : arts;
	return {
		id: entity.id,
		name: entity.name,
		fields: entity.fields.map((f) => `${f.name}: ${f.type}`),
		headSourceHash: sourceHash(entity),
		source: entity,
		projections: projections.map((a) => ({
			target: a.target,
			path: a.path,
			sourceHash: a.source_hash,
			outputHash: a.output_hash,
			header: a.bytes.split("\n")[0],
			body: a.bytes,
		})),
	};
}

/**
 * /emitters — the action-capable emitters panel (S34). Per entity (read SELECT-only over kernel +
 * the emit ledger), it renders the THREE emitted projections (go-sqlc · pg-ddl · ts-types), each as
 * a card showing its target, its source_hash, its output_hash, the protected-header preview, and a
 * deterministic / stale badge. The byte-identical check is action-capable: RE-EMIT runs the same
 * pure twin and shows the SAME output_hash (the determinism contract, the done criterion, visible).
 * MOVE THE HEAD (remove discount) flips the prior Order artifact to STALE while keeping it listed
 * (append-only ledger). READ-ONLY against truth (the wall). Themed + bilingual.
 */
export default async function EmittersPage() {
	const t = await getTranslations("emitters");

	const views = ENTITIES.map(entityView);
	// The "moved head" of Order — used by the STALE demo: the prior artifact's source_hash no longer
	// equals this new head (discount removed). Computed by the pure twin, server-side.
	const orderHeadAfterChange = sourceHash(ENTITY_ORDER_CHANGED);

	const labels = {
		entityLabel: t("entityLabel"),
		reemitCta: t("reemitCta"),
		moveHeadCta: t("moveHeadCta"),
		resetCta: t("resetCta"),
		sourceHashLabel: t("sourceHashLabel"),
		outputHashLabel: t("outputHashLabel"),
		headerPreviewLabel: t("headerPreviewLabel"),
		deterministicBadge: t("deterministicBadge"),
		staleBadge: t("staleBadge"),
		byteIdenticalOk: t("byteIdenticalOk"),
		byteIdenticalLabel: t("byteIdenticalLabel"),
		pathLabel: t("pathLabel"),
		targetGoSqlc: t("targetGoSqlc"),
		targetPgDdl: t("targetPgDdl"),
		targetTsTypes: t("targetTsTypes"),
		provePurityCta: t("provePurityCta"),
		purityOk: t("purityOk"),
		purityFail: t("purityFail"),
		archFitnessCta: t("archFitnessCta"),
		archFitnessOk: t("archFitnessOk"),
		archFitnessFail: t("archFitnessFail"),
		callGraphCta: t("callGraphCta"),
		callGraphNodes: t("callGraphNodes"),
		callGraphHashLabel: t("callGraphHashLabel"),
		callGraphAffectedLabel: t("callGraphAffectedLabel"),
		callGraphEmpty: t("callGraphEmpty"),
		graphVizHeading: t("graphVizHeading"),
		graphVizIntro: t("graphVizIntro"),
		graphVizCta: t("graphVizCta"),
		graphVizAffectedCta: t("graphVizAffectedCta"),
		graphVizLegendNode: t("graphVizLegendNode"),
		graphVizLegendAffected: t("graphVizLegendAffected"),
		graphVizHashLabel: t("graphVizHashLabel"),
		graphVizAffectedLabel: t("graphVizAffectedLabel"),
		graphVizEmpty: t("graphVizEmpty"),
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("heading")}
				</h1>
				<p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>

				<section className="mt-8 rounded-lg border border-border bg-card p-5">
					<h2 className="text-sm font-semibold text-card-foreground">
						{t("tutorialHeading")}
					</h2>
					<ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				<section className="mt-6 rounded-lg border border-border bg-card p-5">
					<h2 className="text-sm font-semibold text-card-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<div className="mt-8">
					<EmittersPanel
						views={views}
						orderId={ENTITY_ORDER.id}
						orderHeadAfterChange={orderHeadAfterChange}
						functionalGo={EMITTED_FUNCTIONAL_GO}
						labels={labels}
					/>
				</div>

				<p className="mt-8 max-w-3xl rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</main>
		</div>
	);
}
