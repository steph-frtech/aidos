import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { BlobAttributePanel } from "./BlobAttributePanel";

export const metadata: Metadata = {
	title: "Type blob/fichier de l'Entity AST — AIDOS Workbench",
	description:
		"Étendre le système de types des entités avec un nœud blob/fichier DISTINCT (un upload — image/document/file), SANS élargir l'ensemble scalaire clos (S72, EPIC 6). Un blob round-trip comme AST content-adressé et émet un handler d'upload déterministe (URLs signées) ; un upload hors-MIME (BLOB_MIME_REFUSED) ou hors-taille (BLOB_SIZE_REFUSED) est refusé ; un blob du projet A est inaccessible depuis le projet B (BLOB_CROSS_PROJECT). LE MUR : valider, scoper et émettre n'écrit aucune vérité ; les octets ne touchent jamais le truth-store ni git.",
};

export const dynamic = "force-dynamic";

/**
 * /blob-attribute — « le type blob/fichier + stockage objet par projet » (S72, EPIC 6).
 * Le système de types des entités gagne un troisième nœud DISTINCT — un blob/fichier (un
 * upload : image/document/file) — sans toucher à l'ensemble scalaire clos de S35 ni au
 * nœud de relation de S71. Un blob round-trip comme AST content-adressé et émet un handler
 * d'upload/download DÉTERMINISTE (URLs signées, validation MIME + taille). Les octets
 * vivent dans le stockage objet PAR PROJET (scopé project_id) — jamais dans le truth-store,
 * jamais dans git ; un blob du projet A est inaccessible depuis le projet B.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable
 * depuis l'écran (épingler un upload → le valider, mint la clé scopée, émettre le handler),
 * prouvé par l'e2e Playwright. THE WALL (§2) : exécuter n'écrit AUCUNE vérité. Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function BlobAttributePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("blobAttribute");

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
					<BlobAttributePanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
