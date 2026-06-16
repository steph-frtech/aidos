import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { LiveTelemetry } from "./LiveTelemetry";
import { liveTelemetry } from "./liveActions";
import { OpsObservabilityPanel } from "./OpsObservabilityPanel";

export const metadata: Metadata = {
	title: "Observabilité d'exploitation — AIDOS Workbench",
	description:
		"S92 : l'observabilité d'exploitation de l'app émise (DISTINCTE de la boucle de réalité / E12). L'app émise est instrumentée OpenTelemetry (JS/TS) ; ses signaux — logs, traces de requêtes, événements d'erreur — alimentent un panneau d'ops PAR APP (latence p50/p95/p99, taux d'erreur, logs, error feed) pour opérer l'app au quotidien. LE MUR : l'ops-observabilité n'écrit AUCUNE vérité — le RealityMirror (E12) reste le seul on-ramp Kernel. Substrat DP17 : OTel → SigNoz/GlitchTip.",
};

export const dynamic = "force-dynamic";

/**
 * /ops-observability — « Observabilité d'exploitation » (S92, app-builder EPIC 9 / E12,
 * DP17/ADR 0043). L'app émise, une fois en service, doit être OPÉRÉE au quotidien : voir
 * ses logs, ses traces de requêtes, ses erreurs, et un dashboard de latence + taux
 * d'erreur. Instrumentation OpenTelemetry (JS/TS) ; les signaux alimentent un panneau
 * d'ops PAR APP (un panneau par projet).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : chaque op a un contrôle lié au moteur
 * PUR (lib/ops-observability), exécutable depuis l'écran — ÉMETTRE un signal OTel
 * (log/span/error) et CONSTRUIRE le dashboard d'ops. THE WALL (§2) : l'ops-observabilité
 * est une couche de RENDU, jamais un on-ramp Kernel (le RealityMirror E12 est le seul
 * on-ramp) — chaque construction écrit ZÉRO vérité (wroteKernel === false). Un secret
 * loggué par une app négligente est REDACTÉ avant rendu. Ne touche aucune route
 * existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function OpsObservabilityPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("opsObservability");
	const tc = await getTranslations("common");
	const live = await liveTelemetry();

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

				<div className="mt-10">
					<OpsObservabilityPanel activeProjectId={ctx.activeId} />
				</div>

				{/* Live OpenTelemetry — read through the gateway (telemetry_query), demo fallback */}
				<LiveTelemetry
					view={live}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						empty: t("liveEmpty"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("demoTitle"),
						spansHeading: t("liveSpansHeading"),
						metricsHeading: t("liveMetricsHeading"),
						nameLabel: t("liveNameLabel"),
						statusLabel: t("liveStatusLabel"),
						traceLabel: t("liveTraceLabel"),
						valueLabel: t("liveValueLabel"),
					}}
				/>
			</main>
		</div>
	);
}
