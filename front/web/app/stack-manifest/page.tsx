import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { exampleManifest, newRecord } from "@/lib/stack-manifest";
import { StackManifestPanel } from "./StackManifestPanel";

export const metadata: Metadata = {
	title: "StackManifest — source Kernel (DP02) — AIDOS Workbench",
	description:
		"DP02 : le StackManifest gravé comme source Kernel de premier rang — AST déclaré (app, services à rôle CLOS, ports internes, profils, volumes, réseau, connector_scopes), content-adressé via records.Hash/Canonicalize (S02 réutilisé), append-only, validation pure (UNKNOWN_SERVICE_ROLE, DUPLICATE_INTERNAL_PORT, STACK_HAS_NO_SERVER). LE MUR : graver passe par idée → miroir → /goal.",
};

export const dynamic = "force-dynamic";

/**
 * /stack-manifest — « StackManifest : la SOURCE de la stack » (DP02, roadmap
 * provisioning-deploy EPIC A). The page READS the seeded manifest (the pinned
 * Example — the alphashop-convention minimal stack) and renders the declared
 * topology + its content address. The one control (« valider & hasher »)
 * re-runs the PURE validator + hashing over the editable JSON — proving the
 * closed-set refusals and the round-trip from the screen. It writes NOTHING.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the TS twin (lib/stack-manifest) is
 * byte-parity-pinned to the authoritative Go source (back/kernel/stackmanifest)
 * by the vitest mirror. THE WALL (§2): stack_manifest is above-the-line truth —
 * the agent has no GRANT; engraving flows through idea → mirror → /goal.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function StackManifestPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("stackManifest");
	const manifest = exampleManifest();
	const record = await newRecord(manifest);

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
					<StackManifestPanel
						activeProjectId={ctx.activeId}
						manifest={manifest}
						record={record}
					/>
				</div>
			</main>
		</div>
	);
}
