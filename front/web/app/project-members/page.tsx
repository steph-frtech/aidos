import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { snapshot } from "./actions";
import { ProjectMembersPanel } from "./ProjectMembersPanel";

export const metadata: Metadata = {
	title: "Adhésions de projet — AIDOS Workbench",
	description:
		"La jointure (identité × projet × rôle owner/editor/viewer) : inviter, changer un rôle, retirer un membre — sous le mur, gradient owner ⊃ editor ⊃ viewer, append-only.",
};

// Read the live `accounts.project_members` on every request so the panel reflects the
// current non-revoked members rather than a static snapshot.
export const dynamic = "force-dynamic";

/**
 * /project-members — the project MEMBERSHIP & OWNERSHIP panel (S62, app-builder
 * EPIC 3). The third layer (CLAUDE.md §2, ROADMAP S55⇄S61⇄S62): authentication
 * (S61) proves WHO; the project-scope wall + RLS (S55) prove the active project;
 * S62 adds the MEMBERSHIP predicate — a VALID identity holding no membership row in
 * the project is a NON-MEMBER, refused NOT_A_MEMBER. The panel is action-capable
 * (ui-completeness): invite / change-role / remove, each gated by the role gradient
 * (only an OWNER administers; a viewer cannot mutate) — all BELOW the wall, via
 * Server Actions writing `accounts.project_members` directly (append-only; soft
 * delete only — the hard GDPR delete is S116). Truth (kernel/mirrors/fitness) is
 * never written from the screen. Touches no existing route. Themed on the ADR 0010
 * tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ProjectMembersPage() {
	const snap = await snapshot();
	const t = await getTranslations("projectMembers");
	const tc = await getTranslations("common");
	const isLive = snap.source === "live";

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
						<span
							className={
								isLive
									? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
							title={isLive ? t("liveTitle") : t("demoTitle")}
						>
							<span
								aria-hidden="true"
								className={
									isLive
										? "size-1.5 rounded-full bg-primary"
										: "size-1.5 rounded-full bg-muted-foreground"
								}
							/>
							{isLive ? tc("live") : tc("demo")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<ProjectMembersPanel snapshot={snap} />
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
