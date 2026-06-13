import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { NOMINAL_BUNDLE } from "@/lib/bootstrap";
import { BootstrapPanel } from "./BootstrapPanel";

export const metadata: Metadata = {
	title: "Bootstrap one-shot déterministe — AIDOS Workbench",
	description:
		"DP12 : émettre déterministiquement la séquence d'amorçage one-shot d'un bundle émis — une projection pure d'events ordonnés (network-created → … → urls-printed) + le port résolu depuis l'état hôte observé (ss ∪ docker ps, fonction pure, jamais un prompt). Un secret requis manquant → MISSING_SECRET_AT_BOOT (actionnable). Le mur : le .env + secrets vivent dans l'appliance au boot (chmod 600, gitignored), jamais dans le source émis. L'exécution docker réelle reste gatée (comme le spike DP10).",
};

export const dynamic = "force-dynamic";

/**
 * /bootstrap — « émetteur bootstrap one-shot déterministe » (DP12, ROADMAP
 * provisioning-deploy, sur le GO mesuré DP10 + ADR 0067). L'écran émet et rend la
 * SÉQUENCE déterministe d'amorçage one-shot d'un bundle émis : un ensemble CLOS,
 * ORDONNÉ d'events (network-created → volumes-created → env-materialized →
 * secrets-checked → ports-resolved → traefik-up → datastore-up → server-up →
 * healthy → urls-printed), le port résolu depuis l'état hôte observé, et — sur le
 * scénario « secret manquant » — le BlockReason fail-closed MISSING_SECRET_AT_BOOT.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8). Le moteur AUTORITAIRE est le Go
 * (back/runtime/bootstrap.EmitBootstrapSequence, 11/11 verts) ; l'écran re-dérive
 * la séquence par le jumeau TS pur (lib/bootstrap) — résolution de ports / ordre /
 * merge-env = fonctions pures, secrets-check = scan, jamais un LLM. Même
 * (bundle, hôte, secrets) → même séquence (sequenceHash byte-stable).
 *
 * LE MUR (CLAUDE.md §2). L'écran n'écrit AUCUNE vérité ; le .env concret + les
 * secrets vivent dans l'appliance au boot (chmod 600, gitignored), JAMAIS dans le
 * source émis / le truth-store / git (below the line) — la projection ne porte que
 * des NOMS et des réfs ${VAR}. NOTE HONNÊTE : l'exécution docker réelle est gatée
 * (comme le spike DP10) ; l'écran montre la séquence ÉMISE, pas un run docker live.
 * Thème ADR 0010 ; strings via next-intl (ADR 0011, FR d'abord).
 */
export default async function BootstrapPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("bootstrap");

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
					<BootstrapPanel
						activeProjectId={ctx.activeId}
						bundle={NOMINAL_BUNDLE}
					/>
				</div>
			</main>
		</div>
	);
}
