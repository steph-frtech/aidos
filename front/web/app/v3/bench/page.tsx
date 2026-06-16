import { getTranslations } from "next-intl/server";
import { BenchClient } from "./BenchClient";

/**
 * /v3/bench — LE BENCH DE COMPLÉTUDE (lentille V3, DG06, ADR 0079 / 0088) : la section
 * « Bench de complétude » du Workbench. L'écran montre, par spec, le `match%` (barre de
 * progression), les TYPES de requirement MANQUANTS, et le différentiel par modèle
 * (single vs A∪B) — la preuve visuelle du GAIN du bench différentiel multi-LLM.
 *
 * PROJECTION PURE (déterminisme-first §6/§8) : TOUT est délégué au TWIN PUR
 * lib/v3/bench-view.ts (deriveBenchReport / deriveModelDiffs / runCanonical —
 * byte-cohérent avec le Go back/runtime/requirementbench, miroir fast-check). Cette
 * lentille ne ré-implémente AUCUNE logique de dérivation ; elle PROJETTE le run
 * canonique HERMÉTIQUE (aucun réseau, l'IA reste côté Go derrière le port). Le JUGE
 * est le miroir déterministe : un type manquant est une PROPOSITION, jamais une vérité.
 *
 * Le serveur ne porte que le titre + l'intro ; tout le contenu (les specs, les match%,
 * les types manquants, le bouton de bench) est projeté côté client (BenchClient ←
 * useV3Session, strings depuis le layout). Themed (tokens shadcn ADR 0010) + bilingue
 * (next-intl, FR par défaut, ADR 0011). LE MUR (§2) : lecture + projection + un bouton
 * qui ENVOIE un geste au chat (send) — AUCUNE écriture de vérité.
 */
export default async function V3BenchScreen() {
	const t = await getTranslations("v3");
	return (
		<div data-testid="v3-bench" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("benchTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("benchIntro")}
				</p>
			</div>
			<BenchClient />
		</div>
	);
}
