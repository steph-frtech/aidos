import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { AuthPanel } from "./AuthPanel";

export const metadata: Metadata = {
	title: "Authentification & sessions — AIDOS Workbench",
	description:
		"S61 — OAuth/OIDC + sessions (Auth.js, JWT vérifié par la passerelle) + modèle compte (accounts.users : id, email, identity_provider). L'identité résolue se propage dans chaque appel passerelle ET descend jusqu'à la RLS Postgres (S55) — jamais gateway-only. Un appel non authentifié à une écriture-vérité est refusé UNAUTHENTICATED et n'atteint aucune donnée.",
};

export const dynamic = "force-dynamic";

/**
 * /auth — the S61 authentication & session panel (app-builder EPIC 3). Action-capable
 * (ui-completeness): sign in (resolve a verified principal whose identity propagates to
 * BOTH walls), see the session/account model, and EXECUTE an unauthenticated truth-write
 * that is refused UNAUTHENTICATED (reaching no data) with its real BlockReason. Writes NO
 * truth — auth lives outside the Kernel (CLAUDE.md §2). Touches no existing route. Themed
 * (ADR 0010) + bilingual (ADR 0011).
 */
export default async function AuthPage() {
	const t = await getTranslations("auth");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<AuthPanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
