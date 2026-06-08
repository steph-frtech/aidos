import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { AuthorityBindingPanel } from "./AuthorityBindingPanel";

export const metadata: Metadata = {
	title: "Liaison autorité & provenance — AIDOS Workbench",
	description:
		"S63 : un user réel (via son rôle d'adhésion) lié à une autorité par scope ; une proposition d'écriture-vérité exige l'autorité du scope, sinon INSUFFICIENT_AUTHORITY ; un override = décision enregistrée (ChangeSet + ADR + provenance).",
};

export const dynamic = "force-dynamic";

/**
 * /authority-binding — the S63 KERNEL/AUTH binding panel. A real user (via their membership
 * role, S62) is bound to a scope authority (S16 AuthorityGraph); a truth-write proposal
 * requires APPROVAL FROM A USER HOLDING THE SCOPE'S AUTHORITY, else INSUFFICIENT_AUTHORITY.
 * Every Idea/ChangeSet records the acting human as provenance — never a placeholder. The
 * panel is action-capable (ui-completeness): propose (decide) + override (record). The
 * decision is DETERMINISTIC (the judge is code, not an LLM — CLAUDE.md §8). No truth is
 * written from the screen (the wall, §2); an override is a propose→ChangeSet recorded
 * decision. Touches no existing route. Themed on ADR 0010; bilingual via next-intl (0011).
 */
export default async function AuthorityBindingPage() {
	const t = await getTranslations("authorityBinding");

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
					<AuthorityBindingPanel />
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
