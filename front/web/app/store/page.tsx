import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { snapshot } from "@/lib/store-data";
import { StorePanel } from "./StorePanel";

export const metadata: Metadata = {
	title: "Content Store — AIDOS Workbench",
	description:
		"Read-only view of the Archive content-addressed append-only store: objects by hash, head pointer, and head history.",
};

// Read the live Postgres truth-store on every request rather than prerendering a
// snapshot at build time — so the panel reflects the current `archive` schema and
// never bakes the demo fixture into a static page.
export const dynamic = "force-dynamic";

/**
 * /store — the Archive content-store panel. Read-only: lists stored objects by
 * content hash on the left and the selected head's current body + move history on
 * the right. Data is resolved on the server from the store projection (mirroring
 * the `store` MCP server) and never writes truth. Touches no existing route.
 * Themed on the ADR 0010 design tokens; bilingual via next-intl (ADR 0011).
 */
export default async function StorePage() {
	const snap = await snapshot();
	const t = await getTranslations("store");
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
					<StorePanel snapshot={snap} />
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
