import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WebPreviewPanel } from "@/components/WebPreviewPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the web emitter (the deterministic, LLM-free codegen) is a pure
// projection in lib/web-projection.ts (the byte-identical twin of
// back/runtime/generators/webcomponent.Emit), with the embedded EvalState in
// lib/aidos-expr.ts (the twin of back/kernel/control.EvalState + back/kernel/expr).
// Both are covered by fast-check mirrors anchored on the Go source/output hashes
// (8ebfb46f… / 5b428d00…). The action-capable panel re-emits the SAME pure twin and
// renders the EMITTED component (imported from _generated/) live against the S11 state
// fixture — what is on screen is what the engine emits. READ-ONLY (the wall): the
// control + action are SOURCES above the line (read SELECT-only); _generated/ is never
// hand-edited; a ledger row is written via propose → ChangeSet → approval. Themed
// (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Web projection — un composant Next.js projeté depuis un control-spec + action-spec | AIDOS Workbench",
	description:
		"La projection web d'AIDOS (S38, KRD LIVRE V) : un composant Next.js émis depuis un control-spec (le bouton-comme-source, S11) + l'action qu'il lie. Le bouton rendu est une PROJECTION de la vérité — son visible/enabled sont EvalState(control, given) embarqué comme les ASTs Expr du control, et son clic déclare l'opération liée (Plan(action, click).invoke == createOrder) sans l'exécuter. Même source donne un .tsx octet-pour-octet identique. Lecture seule.",
};

export default async function WebPreviewPage() {
	const t = await getTranslations("webPreview");
	const labels = {
		sourcesTitle: t("sourcesTitle"),
		controlLabel: t("controlLabel"),
		actionLabel: t("actionLabel"),
		triggersLabel: t("triggersLabel"),
		invokeLabel: t("invokeLabel"),
		fixtureTitle: t("fixtureTitle"),
		givenLabel: t("givenLabel"),
		expectVisibleLabel: t("expectVisibleLabel"),
		expectEnabledLabel: t("expectEnabledLabel"),
		renderTitle: t("renderTitle"),
		liveVisibleLabel: t("liveVisibleLabel"),
		liveEnabledLabel: t("liveEnabledLabel"),
		respectsOk: t("respectsOk"),
		respectsFail: t("respectsFail"),
		hiddenLabel: t("hiddenLabel"),
		sourceHashLabel: t("sourceHashLabel"),
		pathLabel: t("pathLabel"),
		derivedBadge: t("derivedBadge"),
		protectedBadge: t("protectedBadge"),
		staleOk: t("staleOk"),
		staleFail: t("staleFail"),
		reemitCta: t("reemitCta"),
		clickCta: t("clickCta"),
		byteIdenticalOk: t("byteIdenticalOk"),
		byteIdenticalFail: t("byteIdenticalFail"),
		invokeDeclared: t("invokeDeclared"),
		invokeNone: t("invokeNone"),
		yes: t("yes"),
		no: t("no"),
	};
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

				{/* Worked example — the checkout-button → createOrder projection. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<WebPreviewPanel labels={labels} />
				</section>
			</main>
		</>
	);
}
