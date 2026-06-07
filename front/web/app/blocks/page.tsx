import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BlocksPanel } from "./BlocksPanel";

export const metadata: Metadata = {
	title: "Refus (BlockReason) — AIDOS Workbench",
	description:
		"S60 — le panneau global des refus : tout refus d'écriture porte un BlockReason actionnable (code, sévérité, explication, comment-réparer, KRD §44.5). Déclencher une écriture-vérité (kernel_write / mirror_write / fitness_write) la fait refuser par le mur et fait surface son BlockReason réel en toast inline.",
};

export const dynamic = "force-dynamic";

/**
 * /blocks — the S60 global BlockReason panel (app-builder EPIC 2). It renders the closed
 * catalog of declared refusal codes (wall S55 / gateway S58 / goal S29) and is
 * action-capable (ui-completeness): the "attempt the write" control EXECUTES a truth-zone
 * write through the gateway router (the same server-side wall the live HTTP server
 * applies) and surfaces the REAL actionable BlockReason as an inline toast. It writes NO
 * truth — the wall refuses (CLAUDE.md §2). Touches no existing route. Themed (ADR 0010) +
 * bilingual (ADR 0011).
 */
export default async function BlocksPage() {
	const t = await getTranslations("blocks");

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
					<BlocksPanel />
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
