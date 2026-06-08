import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { SecretStorePanel } from "./SecretStorePanel";

export const metadata: Metadata = {
	title: "Secret store par projet — AIDOS Workbench",
	description:
		"S91 : un secret store par projet (credentials DB, clés API tierces, secrets OAuth), chiffré au repos (AES-256-GCM), scopé project_id, JAMAIS dans le truth-store, jamais dans git, jamais dans le source émis. Injection par variables d'env au boot ; rotation qui invalide l'ancien secret ; un secret manquant au boot lève un BlockReason actionnable. Le scan anti-fuite est du CODE déterministe (type-gitleaks), jamais un LLM. LE MUR : un secret est du matériel opérationnel, jamais une vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /secret-store — « Secret store par projet » (S91, app-builder EPIC 9, DP32/ADR 0043).
 * Le store détient les secrets de l'app émise — credentials DB, clés API tierces, secrets
 * OAuth — chiffrés au repos (AES-256-GCM), scopés project_id, JAMAIS dans le truth-store /
 * git / source émis. Injection par variables d'env au boot ; rotation ; un secret manquant
 * au boot lève un BlockReason actionnable (fail-closed) ; le scan anti-fuite est du code.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : chaque op a un contrôle lié au moteur
 * PUR (lib/secret-store), exécutable depuis l'écran — SET, ROTATE, INJECT (boot env), SCAN
 * (fuite). THE WALL (§2) : un secret est du matériel opérationnel, jamais une vérité —
 * l'écran n'affiche JAMAIS une valeur (seulement les noms de clés + les noms de variables
 * d'env). Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function SecretStorePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("secretStore");

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
					<SecretStorePanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
