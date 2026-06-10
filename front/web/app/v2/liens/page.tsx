import { getTranslations } from "next-intl/server";
import { LINK_KINDS } from "@/lib/v2/links";
import { LinksClient } from "./LinksClient";

/**
 * WB2-08 — /v2/liens : LES SIX LIENS (KRD §17/§41). Un kernel ne flotte jamais seul : il est relié
 * aux autres par six familles de liens TYPÉS (composes verticaux · depends_on horizontaux ·
 * supersedes généalogiques · provenance · triggers/binds · mirrors), et chaque lien pointe une
 * VERSION (id@version), JAMAIS une identité nue — c'est l'enjeu §41 (la vague de rouge §42). Rendu
 * en React Flow (ADR 0053), avec un FILTRE par famille de lien (le critère de done : filtrer par
 * type d'arête).
 *
 * ACTION-CAPABLE (ui-completeness) : le filtre par famille EST une action exécutable (clic →
 * change les arêtes affichées) ; cliquer un lien l'ouvre (son détail : famille, from, cible pinnée).
 * Pan/zoom activé. Themed + bilingue (FR d'abord, ADR 0010/0011, namespace v2Liens). Le mur intact :
 * projection de lecture, aucune écriture-vérité — la promotion d'un lien reste idée → miroir → /goal.
 */
export default async function V2LiensPage() {
	const t = await getTranslations("v2Liens");

	const strings: Record<string, string> = {
		links: t("links"),
		kernels: t("kernels"),
		filterLabel: t("filterLabel"),
		all: t("all"),
		canvasLabel: t("canvasLabel"),
		detailKind: t("detailKind"),
		detailFrom: t("detailFrom"),
		detailTo: t("detailTo"),
		detailCanon: t("detailCanon"),
		pinnedNote: t("pinnedNote"),
		readOnlyNote: t("readOnlyNote"),
	};
	// Le libellé localisé de chaque famille (le jeu clos LINK_KINDS).
	const kindLabels = Object.fromEntries(
		LINK_KINDS.map((k) => [k, t(k)]),
	) as Record<string, string>;

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6">
			<section className="space-y-3">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</p>
				<h1
					data-testid="v2-liens-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-liens-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<LinksClient t={strings} kindLabels={kindLabels} />
		</div>
	);
}
