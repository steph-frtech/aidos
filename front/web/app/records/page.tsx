import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { snapshot } from "@/lib/records-data";
import { RecordsPanel } from "./RecordsPanel";
import { RecordsTeach } from "./RecordsTeach";

export const metadata: Metadata = {
	title: "Records — AIDOS Workbench",
	description:
		"Read-only view of the seven KRDCore content-addressed record schemas (ideas/kernel/mirrors/changesets/dag), above the wall — with the governed propose → ChangeSet write path (à venir, S20).",
};

// Read the live Postgres truth-store on every request rather than prerendering a
// snapshot at build time — so the panel reflects the current record schemas and
// never bakes the demo fixture into a static page.
export const dynamic = "force-dynamic";

/**
 * /records — the KRDCore record-schemas panel (S02). The RecordsPanel reads the
 * seven content-addressed, append-only record tables (ideas.idea, kernel.truth/
 * layer/link, mirrors.mirror, changesets.changeset, dag.phase): per type a
 * count, a waterline badge, and the head rows with a compact JSONB preview.
 *
 * THE WALL (CLAUDE.md §2). These tables are TRUTH, ABOVE the line; the agent DB
 * role has SELECT only. The screen READS them and NEVER writes. The governed
 * write path — propose → ChangeSet → human approval — is surfaced per type as a
 * control that is PRESENT but disabled and marked « à venir (S20) », because the
 * changeset engine (S20) and idea-intake (S27) are not built yet. See the
 * OpenQuestion recorded for the step. Touches no existing route. Themed on the
 * ADR 0010 design tokens; bilingual via next-intl (ADR 0011).
 */
export default async function RecordsPage() {
	const snap = await snapshot();
	const t = await getTranslations("records");
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
							data-testid="records-source"
							data-source={snap.source}
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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{tc("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<RecordsTeach />
				</div>

				<div className="mt-10">
					<RecordsPanel snapshot={snap} />
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
