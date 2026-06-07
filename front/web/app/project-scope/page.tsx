import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { snapshot } from "./actions";
import { ProjectScopePanel } from "./ProjectScopePanel";

export const metadata: Metadata = {
	title: "Scope projet — AIDOS Workbench",
	description:
		"S54 — le project_id traversant chaque vérité (kernel·mirrors·ideas·changesets·dag·brain·context), le seed __system__ qui adopte le graphe singleton (la démo Order), et la lecture scopée déterministe (WHERE project_id = $1).",
};

export const dynamic = "force-dynamic";

/**
 * /project-scope — the S54 panel (app-builder EPIC 1). It surfaces the
 * project-scope migration of the truth-store: the __system__ seed that adopts the
 * pre-S54 singleton graph (the Order demo), the nine project-scoped tables with
 * their FK + index, and the deterministic scoped-read SQL. Action-capable
 * (ui-completeness): the "build scoped read" control EXECUTES projectscope.
 * ScopedSelect for any table (always `WHERE project_id = $1`, refusing an off-set
 * table). It writes NO truth — project_id is a scope column, the wall is unchanged
 * (CLAUDE.md §2). Touches no existing route. Themed (ADR 0010) + bilingual (ADR 0011).
 */
export default async function ProjectScopePage() {
	const snap = await snapshot();
	const t = await getTranslations("projectScope");

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
					<ProjectScopePanel snapshot={snap} />
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
