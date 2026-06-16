import { getTranslations } from "next-intl/server";
import { EvolveClient } from "./EvolveClient";

/**
 * /v3/evolve — LE GÉNÉRATEUR D'ÉVOLUTION (lentille V3, EG05, ADR 0089) : la section
 * « Générateur d'évolution » du Workbench. L'écran montre, sur une cellule, les VARIANTES
 * que le générateur propose — par AUTO-JEU (self-play, seedé) ou par le SAMPLER
 * DÉTERMINISTE (le repli figé du seam) — avec, pour chacune, sa NICHE et le VERDICT DU
 * GATE : promue (niche gagnée) ou refusée, avec son motif (miroir rouge · out-of-sample
 * rouge · autorité non approuvée). Les NICHES GAGNÉES et la COUVERTURE rendent visible le
 * gain EG04 : le self-play out-couvre le déterministe.
 *
 * PROJECTION PURE (déterminisme-first §6/§8) : TOUT est délégué au TWIN PUR
 * lib/v3/evolve-view.ts (projectCellRun / runCanonical — byte-cohérent avec le Go
 * back/runtime/evolve, miroir fast-check). Cette lentille ne ré-implémente AUCUNE logique
 * de dérivation ni de gate ; elle PROJETTE le run canonique HERMÉTIQUE (aucun réseau,
 * l'IA reste côté Go derrière le seam). Le JUGE est le miroir déterministe : une variante
 * au miroir rouge n'est JAMAIS promue.
 *
 * Le serveur ne porte que le titre + l'intro ; tout le contenu (le choix de générateur,
 * les variantes, les verdicts, le bouton d'exploration) est projeté côté client
 * (EvolveClient ← useV3Session, strings depuis le layout). Themed (tokens shadcn ADR 0010)
 * + bilingue (next-intl, FR par défaut, ADR 0011). LE MUR (§2) : lecture + projection +
 * un bouton qui ENVOIE un geste au chat (send) — AUCUNE écriture de vérité.
 */
export default async function V3EvolveScreen() {
	const t = await getTranslations("v3");
	return (
		<div data-testid="v3-evolve" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("evolveTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("evolveIntro")}
				</p>
			</div>
			<EvolveClient />
		</div>
	);
}
