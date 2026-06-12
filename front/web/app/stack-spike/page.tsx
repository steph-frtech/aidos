import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { decide, harvest } from "@/lib/stack-spike";
import { StackSpikePanel } from "./StackSpikePanel";

export const metadata: Metadata = {
	title: "Spike StackManifest go/no-go — AIDOS Workbench",
	description:
		"DP01 : SPIKE-gate (ratchet OFF, T0) — prouver par MESURE que déclarer la stack comme une SOURCE Kernel content-adressée porte sa valeur face à un template statique /data/dockers : ré-émission byte-identique, round-trip compose, détection de dérive par source-hash. Verdict = mesure de hash, jamais un avis LLM. LE MUR : le spike n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /stack-spike — « SPIKE-gate StackManifest-as-source » (DP01, roadmap
 * provisioning-deploy EPIC A). READ-ONLY with respect to truth: the page renders
 * the verdict the throwaway probe MEASURED — byte-identity over N re-emissions
 * (hash equality), compose round-trip, and the drift-detection asymmetry (the
 * content-addressed source detects a hand-edit; the static template is
 * drift-blind) — plus the compared bytes and the /harvest record.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is computed by the PURE TS
 * twin of the authoritative Go spike (spike/stackmanifest), byte-parity-pinned
 * by the vitest mirror. The one control (« ré-émettre ») only RE-MEASURES — it
 * writes nothing (the wall, §2): /spike zone only, no kernel/mirrors/fitness.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function StackSpikePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("stackSpike");
	const verdict = await decide();
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
					<StackSpikePanel
						activeProjectId={ctx.activeId}
						verdict={verdict}
						record={record}
					/>
				</div>
			</main>
		</div>
	);
}
