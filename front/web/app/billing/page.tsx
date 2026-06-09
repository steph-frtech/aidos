import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BillingPanel } from "@/components/BillingPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// S114 — PLANS, MÉTRAGE DÉTERMINISTE & QUOTAS (la couche économique customer-facing).
// Determinism-first: chaque op est calculée par le twin PUR de back/runtime/billing
// (lib/billing.ts), couvert par fast-check (lib/billing.test.ts) ancré sur les fixtures Go.
// Le panel re-joue le MÊME twin → chaque op est atteignable ET exécutable depuis l'écran
// (ui-completeness) : métrer la consommation (compte + par projet), enforcer le quota (un
// build over-quota → QUOTA_EXCEEDED + chemin d'upgrade, jamais silencieux), ingérer un
// webhook provider (idempotent, S73 run inbound), provider-vérifier le contrat Pact (ADR
// 0049). Le mur (CLAUDE.md §2) : tout est sous la ligne — un plan/quota est de la donnée
// déclarée, le métrage un COMPTE depuis les AgentRun (jamais un LLM). Themed (ADR 0010),
// bilingue (ADR 0011).

export const metadata: Metadata = {
	title:
		"Plans, métrage & quotas — facturation (provider Pact) | AIDOS Workbench",
	description:
		"S114 : la couche économique customer-facing — plans au niveau compte, consommation métrée (tokens LLM / minutes build-loop / heures-sandbox / apps déployées) comptée déterministe depuis les AgentRun enregistrés et attribuée par projet, enforcement quotas/rate-limits (un build over-quota refusé QUOTA_EXCEEDED + chemin d'upgrade, jamais un échec silencieux), et l'intégration de facturation (webhooks entrants en operations async S73 + contrat Pact avec le provider, ADR 0049).",
};

export default async function BillingPage() {
	const store = await cookies();
	const locale = store.get("NEXT_LOCALE")?.value === "en" ? "en" : "fr";
	return (
		<div className="min-h-screen bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto max-w-5xl px-6 py-10">
				<BillingPanel locale={locale} />
			</main>
		</div>
	);
}
