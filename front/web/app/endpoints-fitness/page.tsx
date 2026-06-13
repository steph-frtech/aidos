import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { isConnRefusal, type Resolution, resolveFor } from "@/lib/connections";
import { DEMO_EMITTED_TREE, hashVerdict, sense } from "@/lib/endpoint-fitness";
import { EndpointsFitnessPanel } from "./EndpointsFitnessPanel";

export const metadata: Metadata = {
	title:
		"Endpoints — senseur arch-fitness EMITTED_NO_HARDCODED_ENDPOINT (DP08) — AIDOS Workbench",
	description:
		"DP08 : invariant arch-fitness gravé — aucun host/URL/port en dur dans le source émis ; tout endpoint passe par la projection DP07 (resolveConnection → process.env au boot). Détection = passe AST TypeScript déterministe (jamais un LLM-juge), fail-closed, branchée sur le senseur archfit de l'auto-certification S84 : un verdict rouge bloque la coupe.",
};

export const dynamic = "force-dynamic";

/**
 * /endpoints-fitness — « Le senseur des endpoints émis » (DP08, roadmap
 * provisioning-deploy EPIC B). The page lists the DP07-resolved endpoints
 * (references only) and runs the EMITTED_NO_HARDCODED_ENDPOINT sensor over
 * the canonical emitted sandbox tree — with the fault-injection control
 * (inject → red blocks the cut; remove → green) and the reproducibility
 * measure (same tree → same verdict → same Go-pinned address).
 *
 * THE WALL (CLAUDE.md §2): the sensor is a deterministic below-the-line
 * measure; the declared rule is above-the-line (arch-fitness.json — idée →
 * miroir → /goal). Themed on ADR 0010 tokens; strings via next-intl (ADR
 * 0011, FR first).
 */
export default async function EndpointsFitnessPage() {
	const t = await getTranslations("endpointsFitness");

	const rows = resolveFor("prod").filter(
		(r): r is Resolution => !isConnRefusal(r),
	);
	const verdict = sense(DEMO_EMITTED_TREE);

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
					<EndpointsFitnessPanel
						rows={rows}
						initial={{
							injected: false,
							state: verdict.state,
							address: hashVerdict(verdict),
							treeAddress: verdict.tree_address,
							findings: verdict.findings,
							measures: 0,
						}}
					/>
				</div>
			</main>
		</div>
	);
}
