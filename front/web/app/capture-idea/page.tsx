import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { inboxSnapshot } from "./actions";
import { CaptureIdeaPanel } from "./CaptureIdeaPanel";

export const metadata: Metadata = {
	title: "Capturez votre idée — AIDOS Workbench",
	description:
		"La boîte texte-libre par laquelle vous capturez VOTRE intention (provenance : humain), scopée à votre projet, comme un vrai record d'idée dans le truth-store — l'inbox d'idées par projet qui remplace la fixture /ideas. Une idée est une vérité-CANDIDATE : un corps esquissé (proposes + intent + provenance) SANS gel et SANS miroir. Sous le mur (le schéma ideas est du staging au-dessus de la ligne, jamais le noyau) ; la promotion vers une vérité est /goal, jamais une écriture depuis cet écran.",
};

// Read the live per-project `ideas` inbox on every request so the panel reflects the
// active project's current ideas rather than baking a static snapshot.
export const dynamic = "force-dynamic";

/**
 * /capture-idea — « Capturez votre idée » (S64, app-builder EPIC 4). The free-text
 * human-provenance capture door: you type your own intention, pick the kind it would
 * become, and submit — AIDOS content-addresses the sketch (the pure twin, byte-identical
 * to ideas.Capture) and writes a REAL draft `ideas` row SCOPED to your ACTIVE project
 * (the S57 cookie pins it). The inbox below lists ONLY that project's ideas — the
 * per-project inbox replacing the global /ideas fixture (S27 was read-only).
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): the capture op the step
 * develops has a control bound to it, executable from the screen, proven by the
 * Playwright e2e. THE WALL (§2): the `ideas` schema is staging ABOVE the line — a
 * candidate-truth, written below the wall's write-fence; promotion to a kernel truth is
 * /goal (S65/S66), never a write here. Touches no existing route. Themed (ADR 0010),
 * bilingual via next-intl (ADR 0011).
 */
export default async function CaptureIdeaPage() {
	const snapshot = await inboxSnapshot();
	const t = await getTranslations("captureIdea");

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

				{/* Tutorial — how to read & drive the screen */}
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
					<CaptureIdeaPanel snapshot={snapshot} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
