import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinMetadataPanel } from "@/components/BesoinMetadataPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL04 attaches the FOUR per-truth metadata to every LevelNode, REUSING the three
// kernel packages truthtyping/scope/authority (the canonical truth_kind is truthtyping's — one enum
// source). The verdict is computed by lib/besoin-metadata.ts (the byte-for-byte twin of
// back/runtime/besoin/metadata.go), covered by lib/besoin-metadata.test.ts (vitest + fast-check).
// This Server Component renders intro + tutorial; the action-capable panel RUNS the SAME pure
// certification the Go authority runs — no I/O, no clock, no LLM. ABOVE the wall: EL04 qualifies a
// NEED node, it writes no kernel/mirrors/fitness; the /spike routing it shows is advisory
// (idea_capture → idea_grill → idea_spike).

export const metadata: Metadata = {
	title:
		"Métadonnées du besoin — les 4 métadonnées par-vérité attachées à chaque nœud (AIDOS Workbench)",
	description:
		"EL04 : attacher les 4 métadonnées par-vérité (truth_kind, verifiability, scope, authority) à chaque LevelNode, en réutilisant les trois packages distincts truthtyping/scope/authority. Le truth_kind canonique est celui de truthtyping (une seule source d'enum) ; authority délègue sa connaissance à truthtyping.IsKnownKind. Un nœud sans truth_kind est incomplet ; verifiability=unverifiable route vers /spike ; un nœud actif sans scope (ni global) est incomplet ; un nœud réglementaire sans autorité juridique est incomplet. Tout est fonction pure (déterminisme), au-dessus du mur (aucune écriture vérité).",
};

/**
 * /compound-besoin-metadata — the EL04 per-truth-metadata panel. The human EXECUTES the certification
 * FROM THE SCREEN: choose a node status + its four metadata, certify, watch the gaps (one per missing
 * metadata) and the /spike routing, and prove truth_kind is a single enum source. ui-completeness
 * (CLAUDE.md §7): no headless capability. ABOVE the wall, read-only. Themed (ADR 0010), bilingual
 * (ADR 0011).
 */
export default async function BesoinMetadataPage() {
	const t = await getTranslations("besoinMetadata");

	const labels = {
		statusLabel: t("statusLabel"),
		truthKindLabel: t("truthKindLabel"),
		verifiabilityLabel: t("verifiabilityLabel"),
		regionLabel: t("regionLabel"),
		authorityLabel: t("authorityLabel"),
		authNone: t("authNone"),
		authMissingGrant: t("authMissingGrant"),
		authGranted: t("authGranted"),
		certifyCta: t("certifyCta"),
		coherenceCta: t("coherenceCta"),
		resetCta: t("resetCta"),
		verdictHeading: t("verdictHeading"),
		complete: t("complete"),
		incomplete: t("incomplete"),
		gapsHeading: t("gapsHeading"),
		routingHeading: t("routingHeading"),
		routeSpike: t("routeSpike"),
		routeKernel: t("routeKernel"),
		routeOther: t("routeOther"),
		coherenceHeading: t("coherenceHeading"),
		coherenceOk: t("coherenceOk"),
		coherenceFail: t("coherenceFail"),
		pending: t("pending"),
		none: t("none"),
	};

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
					<BesoinMetadataPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
