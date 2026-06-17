import { getTranslations } from "next-intl/server";
import { PolicyClient } from "./PolicyClient";

/**
 * /v3/policy — LA LENTILLE POLICY (un écran conceptuel KRD porté EN PROPRE dans la
 * session V3, parcours « Concevoir ») : l'AUTORISATION COMME ARTEFACT (KRD §24.4,
 * §93). À partir de la policy d'ancrage canPlaceOrder, l'écran montre son scope/effet,
 * son arbre de règles TYPÉ (combinateurs all/any/not, comparaisons eq/gt/lt, prédicats
 * exists/matches sur un sélecteur $-enraciné), son adresse de contenu (id == version)
 * et, en bas, un atelier « essayer un contexte » qui évalue la décision totale
 * ALLOW/DENY — exactement ce que le miroir de fixture prouve.
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il N'EXISTE PAS de serveur MCP
 * d'ÉVALUATION de policy dispatché par la passerelle (grilling-loop expose grill_route,
 * pas une évaluation ALLOW/DENY). La logique — la forme de l'AST, le jeu clos des
 * scopes/types, l'ancre §93 canPlaceOrder, le sérialiseur canonique et l'évaluateur pur
 * — est un TWIN PUR AUTORITATIF (lib/policy.ts), byte-identique à back/kernel/policy et
 * couvert par son miroir de parité lib/policy.test.ts. On PORTE donc cette logique UX
 * pure (légitime, ADR 0092 §2), thémée V3, SANS ré-implémenter le Go ni inventer une
 * lecture « live » fantôme : un branchement live deviendra possible le jour où un outil
 * d'évaluation de policy sera dispatché.
 *
 * Le serveur ne porte que le titre + l'intro ; tout le contenu (l'ancre, l'arbre, les
 * scopes/types, l'atelier ALLOW/DENY) est projeté côté client (PolicyClient ←
 * useV3Session pour les strings, lib/policy pour la logique). Themed (tokens shadcn ADR
 * 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011).
 *
 * LE MUR (§2) : l'écran LIT l'AST de policy et REND ses verdicts ; il n'écrit AUCUNE
 * vérité. Une policy est une vérité SOURCE au-dessus de la ligne de flottaison, écrite
 * uniquement via la CLI aidos à travers un ChangeSet approuvé — modifier une policy
 * PROPOSE → idée → miroir → /goal → approbation, jamais une écriture directe d'écran.
 */
export default async function V3PolicyScreen() {
	const t = await getTranslations("v3");
	return (
		<div data-testid="v3-policy" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("policyTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("policyIntro")}
				</p>
			</div>
			<PolicyClient />
		</div>
	);
}
