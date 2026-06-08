import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { AppAuthPanel } from "./AppAuthPanel";

export const metadata: Metadata = {
	title: "Auth & rôles de l'app émise — AIDOS Workbench",
	description:
		"Le behavior-macro `app-auth` (S80) : l'auth & les rôles de l'application que VOUS construisez (ses propres User/Role/Session, login/logout, policies authz par rôle), distinct des utilisateurs d'AIDOS. Il s'expanse déterministiquement et mappe l'AuthorityGraph DU RUNTIME de l'app émise — jamais les approbateurs AIDOS. La porte d'accès au runtime refuse un rôle insuffisant ; attacher prévisualise le sous-système et l'atterrit via un ChangeSet APPROUVÉ (le mur).",
};

export const dynamic = "force-dynamic";

/**
 * /app-auth — « Behavior-macro auth & rôles de l'app ÉMISE » (S80, app-builder EPIC 7). Le sous-
 * système d'authentification + autorisation par rôle de l'application que l'utilisateur CONSTRUIT :
 * ses propres entités User/Role/Session, operations login/logout, et la bande de policies authz par
 * rôle. Il mappe l'AuthorityGraph DU RUNTIME de l'app émise (pas les approbateurs AIDOS, E3).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : CHECK ACCESS (la porte runtime — refuse un rôle
 * insuffisant) et ATTACH (preview du sous-système + atterrissage via la porte légale) sont liés au
 * moteur déterministe réel et exécutables depuis l'écran. Prouvés par l'e2e Playwright. THE WALL
 * (§2) : check-access est une simulation runtime en lecture seule ; attacher atterrit une VALEUR de
 * ChangeSet — la porte légale (propose → approve), jamais une écriture directe du kernel. Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function AppAuthPage() {
	const t = await getTranslations("appAuth");

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

				<section className="mt-12">
					<AppAuthPanel />
				</section>
			</main>
		</div>
	);
}
