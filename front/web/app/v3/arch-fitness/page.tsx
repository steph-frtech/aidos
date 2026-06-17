import { getTranslations } from "next-intl/server";
import { V3ArchFitnessClient } from "./V3ArchFitnessClient";

/**
 * /v3/arch-fitness — LE CLIQUET STRUCTUREL (lentille V3, groupe « Faire évoluer ») : le
 * portage EN PROPRE du concept arch-fitness (S102 · KRD §47) dans la session V3. C'est une
 * LENTILLE NATIVE — elle lit LIVE le moteur Go (serveur arch-fitness dispatché via la
 * passerelle, `readVia(scope, "measure", …)`), JAMAIS un twin réimplémenté : le jumeau pur
 * lib/arch-fitness ne sert que de repli déterministe de démo (source "live" | "demo"), ce qui
 * garde le cliquet T5 (twin-as-live-fitness) VERT.
 *
 * Le SECOND cliquet (§47) : quatre métriques 'lower-is-better' sur le graphe de dépendances
 * inter-cellules (violations de frontière, cycles inter-cellules, arêtes inter-BC, complexité
 * max) ne peuvent que TENIR ou S'AMÉLIORER. Une nouvelle violation OU un nouveau cycle ROUGIT
 * le cliquet et BLOQUE LA COUPE, indépendamment des miroirs comportementaux verts — il empêche
 * « tests verts, système pourri ».
 *
 * QUATRE GESTES ACTION-CAPABLES (ui-completeness, CLAUDE.md §7), tous atteignables ET
 * exécutables depuis l'écran : (1) MESURER (lecture LIVE) ; (2) CLIQUETER la coupe contre
 * elle-même → TENU ; (3) LA PORTE (fault-injection) → BRISÉ + coupe bloquée ; (4) PROPOSER la
 * base structurelle. LE MUR (§2/§9) : lecture/projection ; PROPOSER renvoie un ChangeSet DRAFT
 * (propose → ChangeSet → approbation), l'écran n'écrit JAMAIS la vérité directement.
 *
 * Le SHELL V3 enveloppe automatiquement la route (V3Nav + V3SessionProvider — pas de
 * WorkbenchHeader ici). Réutilise le namespace i18n `archFitness` (déjà bilingue FR+EN, ADR
 * 0011) ; thémé tokens shadcn (ADR 0010, zéro hex/zinc). Le projet actif vient de la session V3.
 */
export default async function V3ArchFitnessScreen() {
	const t = await getTranslations("archFitness");
	return (
		<div
			data-testid="v3-arch-fitness"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("eyebrow")}
				</span>
				<h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<p className="max-w-3xl pt-1 text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>
			</div>
			<V3ArchFitnessClient />
		</div>
	);
}
