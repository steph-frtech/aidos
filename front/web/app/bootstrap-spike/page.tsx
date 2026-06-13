import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { decide, harvest, MEASURED } from "@/lib/bootstrap-spike";
import { BootstrapSpikePanel } from "./BootstrapSpikePanel";

export const metadata: Metadata = {
	title: "Spike bootstrap one-shot go/no-go — AIDOS Workbench",
	description:
		"DP10 : SPIKE-gate (ratchet OFF, T0) — prouver par MESURE qu'un bootstrap déterministe one-shot émis (réseaux→ports→start-ordonné→healthchecks→print-URLs) bat l'appel direct de /data/dockers/deploy.sh : 2 runs docker réels reproductibles, résolution de ports pure sur ss+docker ps, jamais un prompt. Verdict = conjonction booléenne, jamais un avis LLM. LE MUR : le spike n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /bootstrap-spike — « SPIKE-gate bootstrap one-shot déterministe » (DP10,
 * roadmap provisioning-deploy EPIC C). READ-ONLY with respect to truth: the
 * page renders the verdict the throwaway probe MEASURED — two REAL docker runs
 * (traefik→datastore→serveur started in order, healthchecks green, URL answered
 * 200 through the spike traefik, identical ordered events + identical resolved
 * port across runs) against deploy.sh's measured bytes (7 interactive prompts,
 * 3 hardcoded /data/dockers refs) — plus the startup event log and the /harvest
 * record.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is re-derived by the PURE TS
 * twin of the authoritative Go spike (spike/bootstrap), parity-pinned to the
 * Go-measured verdict hash by the vitest mirror. The one control (« re-mesurer »)
 * only RE-DECIDES over the pinned measurement — it writes nothing (the wall, §2):
 * /spike zone only, no kernel/mirrors/fitness. Themed on ADR 0010 tokens; strings
 * via next-intl (ADR 0011, FR first).
 */
export default async function BootstrapSpikePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("bootstrapSpike");
	const verdict = await decide(MEASURED);
	const record = await harvest(verdict);

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
					<BootstrapSpikePanel
						activeProjectId={ctx.activeId}
						verdict={verdict}
						record={record}
					/>
				</div>
			</main>
		</div>
	);
}
