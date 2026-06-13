import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	AI_FORBIDDEN_DATASTORE_EGRESS,
	DEMO_CONNECTORS,
} from "@/lib/connector-source";
import { ConnectorsPanel } from "./ConnectorsPanel";

export const metadata: Metadata = {
	title: "Connecteurs déclarés — AIDOS Workbench",
	description:
		"DP20 : Connector / Skill / MCP-server = des SOURCES Kernel content-adressées (au-dessus de la ligne), promues du spike DP19. Cet écran liste les connecteurs DÉCLARÉS avec leur classification (interne/externe/IA/cloud), leur scope (RO/RW), leurs egress_hosts et leur cible. L'invariant porté au niveau SOURCE est visible : un connecteur IA ne porte JAMAIS d'egress vers un datastore (AI-never-direct-to-DB). Le mur : le seed est une fixture/projection sous la ligne, jamais une écriture-vérité ; un vrai connecteur se grave par idée → miroir → /goal → approbation.",
};

export const dynamic = "force-dynamic";

/**
 * /connectors — « Connecteurs déclarés » (DP20, piste DP, EPIC E). The page lists the
 * DECLARED connector SOURCES (Connector / Skill / MCP-server graved as content-addressed
 * Kernel sources above the waterline) with, per row, its kind, classification (badge
 * internal/external/ai/cloud), scope (RO/RW), egress allow-list and bind target — each
 * validated through the SAME pure-total `validate` as the Go kernel/connector (the verdict
 * is COMPUTED per row, never declared). The load-bearing invariant is made visible: an
 * "ai" connector carries NO egress datastore host (AI-never-direct-to-DB), with the
 * counter-fixture showing what the source-level check refuses.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the connector source data + verdicts come from the
 * pure twin (lib/connector-source), the verdict-for-verdict mirror of the authoritative Go
 * package — never a UI opinion. THE WALL (§2): the screen renders a below-the-line
 * SEED/fixture (DEMO_CONNECTORS) and writes NOTHING (no kernel/mirrors/fitness); a real
 * connector INSTANCE is graved only through idée → miroir → /goal → approbation by the
 * aidos CLI writer role. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function ConnectorsPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("connectors");

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
					<ConnectorsPanel
						activeProjectId={ctx.activeId}
						connectors={DEMO_CONNECTORS}
						aiForbiddenFixture={AI_FORBIDDEN_DATASTORE_EGRESS}
					/>
				</div>
			</main>
		</div>
	);
}
