import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { blockCode } from "./actions";
import { ProjectWallPanel } from "./ProjectWallPanel";

export const metadata: Metadata = {
	title: "Mur project-aware — AIDOS Workbench",
	description:
		"S55 — le mur project-aware deux couches (hook PreToolUse + RLS keyée identité) : l'agent ne lit/écrit below-the-line que pour le projet courant, sous son identité propagée (S61). Une écriture croisée ou une identité forgée est refusée (AGENT_CROSS_PROJECT_WRITE).",
};

export const dynamic = "force-dynamic";

/**
 * /project-wall — the S55 panel (app-builder EPIC 1). It surfaces the project-aware
 * wall: the two-layer defense-in-depth (PreToolUse hook + Postgres RLS keyed on the
 * propagated identity) that fences a below-the-line op to the current project. It is
 * action-capable (ui-completeness): the "classify" control EXECUTES projectwall.
 * Classify (the same predicate the RLS enforces) over a (identity, active project) ×
 * (target project, claimed identity) input and renders the verdict + BlockReason. It
 * writes NO truth — this wall only judges scope (CLAUDE.md §2). Touches no existing
 * route. Themed (ADR 0010) + bilingual (ADR 0011).
 */
export default async function ProjectWallPage() {
	const code = await blockCode();
	const t = await getTranslations("projectWall");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<ProjectWallPanel code={code} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
