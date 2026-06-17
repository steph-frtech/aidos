import { getTranslations } from "next-intl/server";
import { linksGraphAction } from "./actions";
import { LiensClient } from "./LiensClient";

/**
 * /v3/liens — LA LENTILLE DES SIX LIENS (un écran conceptuel KRD §17/§41 porté EN PROPRE
 * dans la session V3, parcours « Comprendre » de la nav coordonnée — ADR 0060/0092). Le
 * SHELL V3 (V3Nav + V3SessionProvider) enveloppe automatiquement cette route ; on ne rend
 * ICI que l'intro + la lentille.
 *
 * L'écran montre les SIX FAMILLES de liens TYPÉS entre kernels (projects_to · derives_from ·
 * contracts_with · triggers · binds · mirrors), rendues en React Flow (ADR 0053), avec un
 * FILTRE par famille (le critère de done) et le détail d'un lien cliqué : sa cible PINNÉE
 * `id@version`, jamais une identité nue (§41 — la vague de rouge §42).
 *
 * LENTILLE NATIVE LIVE (ADR 0092 — le moteur Go est la SEULE source live des liens). Le graphe
 * + le statut PAR LIEN (green|stale|absent §41–§42) sont LUS EN DIRECT par la passerelle, via
 * l'outil Go `links_graph` (back/mcp/links/linksrv → back/kernel/links.Validate/Resolve). Le
 * CALCUL des liens était un TWIN PUR « byte-identique au Go » (lib/v2/links.ts) — pas du
 * client-UX légitime (§2) ; il est SUPPRIMÉ. La fixture synthétique (lib/v3/liens-data) reste
 * UNIQUEMENT le repli déterministe de démo (badge « en direct » / « démo », ADR 0074), jamais
 * « calcul pur (repli démo) ». On lit ici côté serveur (linksGraphAction) et on passe la vue à la lentille.
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — projection des liens, aucune écriture-vérité ; la
 * promotion d'un lien reste propose → idée → miroir → /goal → approbation, jamais une
 * écriture depuis l'écran. Thémé (tokens shadcn ADR 0010, 0 hex/zinc) ; bilingue (next-intl,
 * FR par défaut, ADR 0011).
 */
export default async function V3LiensScreen() {
	const t = await getTranslations("v3");
	const { view, source } = await linksGraphAction();
	return (
		<div data-testid="v3-liens" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("liensTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("liensIntro")}
				</p>
				<div
					data-testid="v3-liens-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("liensWallNote")}
				</div>
			</div>
			<LiensClient view={view} source={source} />
		</div>
	);
}
