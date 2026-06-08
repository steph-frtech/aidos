import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { EnvRollbackPanel } from "./EnvRollbackPanel";

export const metadata: Metadata = {
	title: "Environnements + rollback par ré-projection — AIDOS Workbench",
	description:
		"S98 : promotion d'environnements (preview→staging→prod) + rollback = checkout d'une phase DAG stable antérieure qui RÉ-PROJETTE déterministiquement l'app depuis la phase (S78) ; le code sandbox n'est JAMAIS restauré tel quel (CLAUDE.md §9). Non destructif, append-only, décision provenancée (§9). Done-criteria : promouvoir N en prod → incident → rollback à N-1 → prod sert l'app ré-émise depuis N-1 avec le vert antérieur intact, l'action provenancée, rien supprimé ni restauré comme artefact stale. LE MUR : un rollback n'écrit pas le kernel — l'écran propose la décision comme ChangeSet.",
};

export const dynamic = "force-dynamic";

/**
 * /env-rollback — « environnements + rollback-to-phase (ré-projection, pas checkout d'artefact) »
 * (S98, app-builder EPIC 10, DP28 / ADR 0043). Deux gestes action-capables (ui-completeness,
 * CLAUDE.md §7) : (1) PROMOUVOIR une phase stable dans un environnement (preview→staging→prod) ;
 * une phase non-stable est refusée ENV_PROMOTE_NOT_STABLE ; (2) ROLLBACK un environnement vers une
 * phase ANTÉRIEURE stable = une ré-émission déterministe de N-1 (jamais un artefact sandbox
 * périmé) ; une cible non-antérieure est refusée ROLLBACK_NOT_EARLIER. La décision est provenancée
 * (qui/quoi/pourquoi), append-only. THE WALL (§2/§9) : un rollback n'écrit pas le kernel — la
 * décision est proposée comme ChangeSet. Ne touche aucune route existante. Thème ADR 0010,
 * bilingue ADR 0011.
 */
export default async function EnvRollbackPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("envRollback");

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
					<EnvRollbackPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
