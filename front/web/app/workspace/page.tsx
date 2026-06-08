import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { WorkspacePanel } from "./WorkspacePanel";

export const metadata: Metadata = {
	title: "Bac à sable par projet — AIDOS Workbench",
	description:
		"Le provisioning de bac à sable par projet (S82) : un workspace isolé (conteneur + dépôt git/jj + worktree + limites CPU/mém/disque/temps) par projet où le code généré vit, compile et exécute ses miroirs. Les zones ADR 0001 (/ideas /spike /src /kernel/spec) réalisées comme workspaces runtime réels. Isolation inter-projets (SANDBOX_ESCAPE) et limite de ressources anti noisy-neighbor (SANDBOX_RESOURCE_LIMIT).",
};

export const dynamic = "force-dynamic";

/**
 * /workspace — « Bac à sable par projet » (S82, app-builder EPIC 8). Un workspace isolé par projet
 * (conteneur + dépôt git/jj + worktree + limites CPU/mém/disque/temps) où le code généré vit, compile
 * et exécute ses miroirs ; les zones ADR 0001 (/ideas /spike /src /kernel/spec) réalisées comme
 * workspaces runtime RÉELS, jamais des répertoires de ce repo.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : PROVISION (provisionner un workspace), ACCESS-CHECK
 * (isolation inter-projets — SANDBOX_ESCAPE) et RESOURCE-CHECK (anti noisy-neighbor — SANDBOX_RESOURCE_
 * LIMIT tue un runaway) sont liés au moteur déterministe réel (le twin lib/workspace, byte-identique au
 * paquet Go) et exécutables depuis l'écran. Prouvés par l'e2e Playwright. THE WALL (§2) : les actions
 * sont des calculs de valeur DRY-RUN ; le truth-store est HORS de tout workspace. Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function WorkspacePage() {
	const t = await getTranslations("workspace");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1
						data-testid="workspace-title"
						className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
					>
						{t("title")}
					</h1>
					<p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
						{t("lede")}
					</p>
				</header>

				<WorkspacePanel />
			</main>
		</div>
	);
}
