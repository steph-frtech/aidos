import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MemoryBackendsPanel } from "@/components/MemoryBackendsPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import type { Kind } from "@/lib/memory";

// Determinism-first: recall (cosine similarity ordered by score desc, kind/branch filters, the
// seeded deterministic embedder) is a pure projection in lib/memory.ts (the twin of
// back/archive/brain/memory), covered by lib/memory.test.ts (fast-check). This Server Component
// renders the intro + tutorial + example; the action-capable panel runs the SAME pure recall the
// Go engine runs — no I/O, no clock, no rng — so the hits on screen match the engine. READ-ONLY
// against truth (the wall): the /brain store is below the waterline; nothing here reaches the
// kernel without a mirror (the MemoryFirewall flow, §119.1, is a separate concern).

export const metadata: Metadata = {
	title: "Memory backends — write + rappel par similarité (AIDOS Workbench)",
	description:
		"L'adaptateur mémoire du store /brain d'AIDOS (KRD §136) : écrire un MemoryItem et le rappeler par similarité sur des embeddings pgvector, à travers les quatre mémoires indexables — épisodique / sémantique / procédurale / structurale. Deux backends injectables derrière une interface (mock déterministe ↔ pgvector réel) : la bascule rend la couture d'injection observable. Carburant de contexte, JAMAIS une vérité — rien ici n'atteint le noyau sans miroir.",
};

/**
 * /memory-backends — the memory adapter panel (S31). It renders the four indexable memory kinds as
 * filter chips, a recall query input, the ranked hits (each with score / kind / branch / taint /
 * provenance — memory is fuel WITH PROVENANCE), and a visible backend toggle (mock ↔ real) that
 * re-runs recall through the other Store (the injection seam, made observable). A banner states
 * "context fuel, never truth — nothing here reaches the kernel without a mirror".
 *
 * READ-ONLY against truth (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens;
 * bilingual (ADR 0011).
 */
export default async function MemoryBackendsPage() {
	const t = await getTranslations("memoryBackends");

	const labels = {
		queryLabel: t("queryLabel"),
		queryPlaceholder: t("queryPlaceholder"),
		recallCta: t("recallCta"),
		allKinds: t("allKinds"),
		backendLabel: t("backendLabel"),
		backendMock: t("backendMock"),
		backendReal: t("backendReal"),
		hitsHeading: t("hitsHeading"),
		scoreLabel: t("scoreLabel"),
		kindLabel: t("kindLabel"),
		branchLabel: t("branchLabel"),
		taintLabel: t("taintLabel"),
		provenanceLabel: t("provenanceLabel"),
		noTaint: t("noTaint"),
		noHits: t("noHits"),
		banner: t("banner"),
		seamNote: t("seamNote"),
	};

	const kindLabels: Record<Kind, string> = {
		episodic: t("kindEpisodic"),
		semantic: t("kindSemantic"),
		procedural: t("kindProcedural"),
		structural: t("kindStructural"),
	};

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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
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
					<MemoryBackendsPanel labels={labels} kindLabels={kindLabels} />
				</div>

				{/* Worked example */}
				<section
					aria-label={t("exampleHeading")}
					data-testid="example"
					className="mt-10 space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
