import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CollabPanel } from "@/components/CollabPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// S113 — COLLABORATION SUBSTRATE + ADOPTION LADDER (per project).
// Determinism-first: every act is computed by a PURE twin of back/runtime/collab
// (lib/collab.ts), covered by fast-check (lib/collab.test.ts) anchored on the Go
// fixtures. The panel re-runs the SAME twin so each op is reachable AND executable from
// the screen (ui-completeness): authorize/comment/invite/approve, presence (two users,
// no overwrite), the activity feed (real actors), and the per-project AdoptionStage
// ladder (current + next dent, gate computed). Every act passes the S62/S110 authority
// gate and is stamped with the REAL user (provenance never a placeholder); a member
// without administer authority cannot approve. The wall (CLAUDE.md §2): all acts are
// below the line — approving a truth stays the propose→ChangeSet path (S110/S85), never a
// direct write from the screen. Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Collaboration & adoption — provenance identifiée, présence temps réel, échelle d'adoption | AIDOS Workbench",
	description:
		"S113 : le substrat de collaboration du projet — adhésion/partage/invites, provenance identifiée (« qui a voulu quoi » avec de vrais users), commentaires sur ideas/miroirs/changesets, feed d'activité, présence/édition concurrente temps réel — et l'échelle d'adoption (§82.5) surfacée par projet (palier courant + prochaine dent). Un membre sans authority ne peut approuver ; l'échelle n'avance que quand la porte du palier est atteinte (done is computed). Tout est pur et déterministe, sous le mur (§2).",
};

export default async function CollabPage() {
	const t = await getTranslations("collab");
	const labels = {
		actorHeading: t("actorHeading"),
		identityLabel: t("identityLabel"),
		identityPlaceholder: t("identityPlaceholder"),
		projectLabel: t("projectLabel"),
		roleLabel: t("roleLabel"),
		nonMember: t("nonMember"),
		commentHeading: t("commentHeading"),
		targetKindLabel: t("targetKindLabel"),
		targetIdLabel: t("targetIdLabel"),
		targetIdPlaceholder: t("targetIdPlaceholder"),
		bodyLabel: t("bodyLabel"),
		bodyPlaceholder: t("bodyPlaceholder"),
		commentSubmit: t("commentSubmit"),
		approveHeading: t("approveHeading"),
		approveHint: t("approveHint"),
		approveSubmit: t("approveSubmit"),
		inviteHeading: t("inviteHeading"),
		inviteeLabel: t("inviteeLabel"),
		inviteePlaceholder: t("inviteePlaceholder"),
		grantLabel: t("grantLabel"),
		inviteSubmit: t("inviteSubmit"),
		presenceHeading: t("presenceHeading"),
		presenceHint: t("presenceHint"),
		joinSubmit: t("joinSubmit"),
		claimSubmit: t("claimSubmit"),
		releaseSubmit: t("releaseSubmit"),
		presentLabel: t("presentLabel"),
		lockHolderLabel: t("lockHolderLabel"),
		noLock: t("noLock"),
		stageHeading: t("stageHeading"),
		stageHint: t("stageHint"),
		currentLabel: t("currentLabel"),
		nextLabel: t("nextLabel"),
		canAdvanceYes: t("canAdvanceYes"),
		canAdvanceNo: t("canAdvanceNo"),
		gapsLabel: t("gapsLabel"),
		advanceSubmit: t("advanceSubmit"),
		capabilitiesLabel: t("capabilitiesLabel"),
		feedHeading: t("feedHeading"),
		feedEmpty: t("feedEmpty"),
		allowed: t("allowed"),
		denied: t("denied"),
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto max-w-5xl px-4 py-8">
				<header className="mb-6">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("eyebrow")}
					</p>
					<h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
					<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
						{t("intro")}
					</p>
				</header>
				<CollabPanel labels={labels} />
				<footer
					className="mt-8 max-w-3xl text-xs text-muted-foreground"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted i18n string with a <code> tag.
					dangerouslySetInnerHTML={{ __html: t("footer") }}
				/>
			</main>
		</div>
	);
}
