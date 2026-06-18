import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { snapshot } from "./actions";
import { ProjectsPanel } from "./ProjectsPanel";

export const metadata: Metadata = {
	title: "Projets — AIDOS Workbench",
	description:
		"Le scope racine multi-tenant : chaque vérité appartient à un projet. Créer, archiver, restaurer, supprimer (soft) un projet — sous le mur, append-only.",
};

// Read the live Postgres `projects` schema on every request so the panel reflects
// the current head projects rather than baking a static snapshot.
export const dynamic = "force-dynamic";

/**
 * /projects — the multi-tenant root-scope panel (S53, app-builder EPIC 1). A project
 * is the first-rank Kernel concept that scopes every truth: two users (or two apps)
 * never collide in the singleton truth-store. The panel is action-capable
 * (ui-completeness): it creates a content-addressed project (+ its per-project DAG
 * root), and archives / restores / soft-deletes it — all BELOW the wall, via Server
 * Actions writing the `projects` schema directly (append-only; soft delete only —
 * the hard GDPR delete is S116). Truth (kernel/mirrors/fitness) is never written
 * from the screen (CLAUDE.md §2). Touches no existing route. Themed on the ADR 0010
 * tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ProjectsPage() {
	const snap = await snapshot();
	const t = await getTranslations("projects");
	const tc = await getTranslations("common");
	const isLive = snap.source === "live";

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
						<span
							className={
								isLive
									? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
							title={isLive ? t("liveTitle") : t("demoTitle")}
						>
							<span
								aria-hidden="true"
								className={
									isLive
										? "size-1.5 rounded-full bg-primary"
										: "size-1.5 rounded-full bg-muted-foreground"
								}
							/>
							{isLive ? tc("live") : tc("demo")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<ProjectsPanel snapshot={snap} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
						em: (chunks) => <em className="italic">{chunks}</em>,
					})}
				</footer>
			</main>
		</div>
	);
}
