import { getTranslations } from "next-intl/server";
import { LiensClient } from "./LiensClient";

/**
 * /v3/liens — LA LENTILLE DES SIX LIENS (un écran conceptuel KRD §17/§41 porté EN PROPRE
 * dans la session V3, parcours « Comprendre » de la nav coordonnée — ADR 0060/0092). Le
 * SHELL V3 (V3Nav + V3SessionProvider) enveloppe automatiquement cette route ; on ne rend
 * ICI que l'intro + la lentille.
 *
 * L'écran montre les SIX FAMILLES de liens TYPÉS entre kernels (composes · depends_on ·
 * supersedes · provenance · triggers_binds · mirrors), rendues en React Flow (ADR 0053),
 * avec un FILTRE par famille (le critère de done) et le détail d'un lien cliqué : sa cible
 * PINNÉE `id@version`, jamais une identité nue (§41 — la vague de rouge §42).
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il N'EXISTE PAS de serveur MCP des
 * liens dispatché par la passerelle. La logique (le jeu CLOS des familles, le graphe
 * synthétique canonique, le filtre, le pinning, le mapping vers le jeu canonique S17) est
 * un TWIN PUR AUTORITATIF (lib/v2/links.ts), couvert par son miroir de parité
 * lib/v2/links.test.ts. On PORTE cette logique UX pure (légitime, ADR 0092 §2), thémée V3,
 * SANS ré-implémenter le Go ni inventer une lecture « live » fantôme.
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — projection des liens, aucune écriture-vérité ; la
 * promotion d'un lien reste propose → idée → miroir → /goal → approbation, jamais une
 * écriture depuis l'écran. Thémé (tokens shadcn ADR 0010, 0 hex/zinc) ; bilingue (next-intl,
 * FR par défaut, ADR 0011).
 */
export default async function V3LiensScreen() {
	const t = await getTranslations("v3");
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
			<LiensClient />
		</div>
	);
}
