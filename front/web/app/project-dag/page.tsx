import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { blockCodes } from "./actions";
import { ProjectDagPanel } from "./ProjectDagPanel";

export const metadata: Metadata = {
	title: "DAG par projet — AIDOS Workbench",
	description:
		"S56 — chaque projet a sa genèse DAG et son namespace content-adressé ; branch/checkout/rebranch/merge restent dans la frontière du projet. Un merge inter-projets est refusé (CROSS_PROJECT_MERGE) ; duplicate forke une racine isolée ; archive masque sans détruire.",
};

export const dynamic = "force-dynamic";

/**
 * /project-dag — the S56 panel (app-builder EPIC 1). It surfaces the per-project version
 * space: a per-project DAG genesis + content namespace, in-frontier moves, the
 * cross-project merge refusal (CROSS_PROJECT_MERGE), the isolated duplicate-from-template
 * fork, and archive/restore (mask without destroying). Action-capable (ui-completeness):
 * every gesture has a control bound to it that EXECUTES the deterministic projectDag twin
 * (byte-identical to back/archive/projectdag). Writes NO truth — recording a node rides
 * the S24 dag MCP (CLAUDE.md §2). Touches no existing route. Themed (ADR 0010) + bilingual
 * (ADR 0011).
 */
export default async function ProjectDagPage() {
	const codes = await blockCodes();
	const t = await getTranslations("projectDag");

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
					<ProjectDagPanel codes={codes} />
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
