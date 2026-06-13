import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { MEASURED_MATRIX } from "@/lib/connector-governance";
import { ConnectorsSpikePanel } from "./ConnectorsSpikePanel";

export const metadata: Metadata = {
	title: "Spike gouvernance des connecteurs — AIDOS Workbench",
	description:
		"DP19 : SPIKE-gate (ratchet OFF, T0, ouvre EPIC E) — prouver PAR MESURE que la gouvernance des connecteurs (Connector / Skill / MCP-server = sources déclarées) TIENT AVEC LE MUR EXISTANT, avant de la graver. Elle réutilise les 5 enforcers fail-closed (agentimpl) + le ledger Merkle (agentrun) et n'ajoute que les gardes runtime A2 (approbation HITL) + A3 (IA-jamais-direct-DB). Chaque verdict = une MESURE, jamais un avis. Le mur : zone /spike, aucune écriture-vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /connectors-spike — « SPIKE-gate gouvernance des connecteurs » (DP19, piste DP,
 * préambule EPIC E). READ-ONLY with respect to truth: the page renders the MATRICE
 * the throwaway probe MEASURED — six measures over the two disposable probed
 * connectors (Postgres-RO + Slack-RW) and the AI-direct-DB attempt, each carried
 * with its scope, its plane, its required runtime approval (A2), its expected and
 * measured admission, the disposable refusal code, and its verifiable Merkle ledger
 * entry. The GLOBAL verdict is the deterministic conjunction (every row passes ∧ the
 * ledger Verify().OK), COMPUTED at the spike, never an LLM opinion.
 *
 * THE THREE PROVEN INVARIANTS (the load-bearing answer to the gate): an RW write
 * needs a fresh runtime approval (A2 HITL, NOT authority.Decide) ; the AI never
 * reaches the DB directly (A3, AI_DIRECT_DB_ACCESS_FORBIDDEN by set-membership) ;
 * every connector action — admitted OR refused — produces one verifiable Merkle
 * ledger entry. The verdict is GO: the governance HOLDS with the existing wall,
 * adding only the §5 guards, no new single point of trust.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the matrice + verdict were produced by the
 * pure fail-closed enforcers at the spike; this screen renders the graven DATA
 * (lib/connector-governance MEASURED_MATRIX) — never a UI opinion. THE WALL (§2):
 * /spike zone only, ratchet OFF, no kernel/mirrors/fitness write; the spike's
 * refusal codes are disposable constants, never promoted out of idée→miroir→/goal.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function ConnectorsSpikePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("connectorsSpike");

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
					<ConnectorsSpikePanel
						activeProjectId={ctx.activeId}
						matrix={MEASURED_MATRIX}
					/>
				</div>
			</main>
		</div>
	);
}
