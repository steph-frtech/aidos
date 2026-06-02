import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ApiProjectionPanel } from "@/components/ApiProjectionPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CREATE_ORDER_OP, ORDER_ENTITY } from "@/lib/api-projection-data";

// Determinism-first: the API emitter + Pact verifier (the deterministic, LLM-free codegen +
// provider verification) are a pure projection in lib/api-projection.ts (the byte-identical
// twin of back/runtime/generators.{EmitAPI,EmitContract,VerifyContract}), covered by
// lib/api-projection.test.ts (fast-check, anchored on the Go source hash 1c249219…). The
// action-capable panel re-emits + verifies the SAME pure twin — no I/O, no clock, no LLM —
// so what is on screen matches the engine. READ-ONLY (the wall): the operation + entity are
// SOURCES above the line (the agent reads them SELECT-only); back/gen/api is never hand-edited;
// a contract row is written via propose → ChangeSet → approval. Themed (ADR 0010), bilingual
// (ADR 0011).

export const metadata: Metadata = {
	title:
		"API projection — un handler REST/JSON projeté depuis une opération + une entité | AIDOS Workbench",
	description:
		"La projection API d'AIDOS (KRD §23) : un handler Go REST/JSON émis depuis DEUX sources — une opération (le workflow N2, S10) et l'entité qu'elle touche (la source N3, S35). Le handler EXPOSE l'opération sur HTTP (createOrder → POST /orders, jamais inventé), réutilise la forme de champs de l'entité (jamais re-typé), et délègue le corps à l'interpréteur d'opération (jamais ré-implémenté). La forme requête/réponse est figée en contrat Pact et vérifiée par le MCP pact-verifier — la route createOrder passe son contract test. Lecture seule.",
};

export default async function ApiProjectionPage() {
	const t = await getTranslations("apiProjection");
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

				{/* Worked example — the createOrder route. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<ApiProjectionPanel
						operation={CREATE_ORDER_OP}
						entity={ORDER_ENTITY}
						labels={{
							sourcesTitle: t("sourcesTitle"),
							operationLabel: t("operationLabel"),
							entityLabel: t("entityLabel"),
							emitsLabel: t("emitsLabel"),
							stepsLabel: t("stepsLabel"),
							handlerTitle: t("handlerTitle"),
							contractTitle: t("contractTitle"),
							methodRouteLabel: t("methodRouteLabel"),
							requestLabel: t("requestLabel"),
							responseLabel: t("responseLabel"),
							sourceHashLabel: t("sourceHashLabel"),
							outputHashLabel: t("outputHashLabel"),
							derivedBadge: t("derivedBadge"),
							protectedBadge: t("protectedBadge"),
							reemitCta: t("reemitCta"),
							verifyCta: t("verifyCta"),
							byteIdenticalOk: t("byteIdenticalOk"),
							passBadge: t("passBadge"),
							failBadge: t("failBadge"),
							notVerifiedBadge: t("notVerifiedBadge"),
							contractBodyLabel: t("contractBodyLabel"),
							pathLabel: t("pathLabel"),
						}}
					/>
				</section>
			</main>
		</>
	);
}
