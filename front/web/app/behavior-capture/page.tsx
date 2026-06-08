import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { surfacedLibrary } from "./actions";
import { BehaviorCapturePanel } from "./BehaviorCapturePanel";

export const metadata: Metadata = {
	title: "Behavior à la capture — AIDOS Workbench",
	description:
		"Attacher un behavior-macro à la capture (S67, KRD §24.6). À la capture d'une idée, la librairie de behaviours réutilisables (S79) est surfacée ; attacher une behavior la DRY-RUN-EXPANSE en attributs/relations/operations/policies/fixtures comme proposition DRAFT, en appelant l'UNIQUE Expand de S76 (jamais une 2ᵉ implémentation). L'expansion attachée est byte-identique à celle de S76 ; elle est une FONCTION PURE, jamais un LLM. L'écran PROPOSE un ChangeSet DRAFT, n'écrit JAMAIS le Kernel (le mur).",
};

export const dynamic = "force-dynamic";

/**
 * /behavior-capture — « attacher un behavior à la capture » (S67, app-builder EPIC 4). À la capture
 * d'une idée, vous voyez la librairie de behaviours réutilisables et attachez une behavior : AIDOS
 * DRY-RUN-EXPANSE la behavior (attributs/relations/operations/policies/fixtures) via l'UNIQUE Expand
 * de S76 (jamais une 2ᵉ implémentation) et la rend comme un ChangeSet DRAFT proposé. L'expansion est
 * byte-identique à celle de S76 — une seule fonction, un seul résultat — et c'est une FONCTION PURE,
 * jamais un LLM (déterminisme).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis
 * l'écran (attacher une behavior → expansion + ChangeSet DRAFT proposé), prouvé par l'e2e Playwright.
 * THE WALL (§2) : l'attachement n'écrit AUCUNE vérité — le dry-run et le DRAFT PROPOSENT ; le gel
 * passe par le mur (idée → miroir → /goal → approbation humaine, porte changeset S20). Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function BehaviorCapturePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("behaviorCapture");
	const libraryKinds = await surfacedLibrary();

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
					<BehaviorCapturePanel
						activeProjectId={ctx.activeId}
						libraryKinds={libraryKinds}
					/>
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
