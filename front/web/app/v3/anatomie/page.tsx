import { getTranslations } from "next-intl/server";
import { AnatomyClient } from "./AnatomyClient";

/**
 * /v3/anatomie — LA LENTILLE ANATOMIE (un écran conceptuel KRD porté EN PROPRE dans la
 * session V3, parcours « Comprendre ») : l'ANATOMIE 1-pour-1 d'un kernel, les SIX PAIRES-MIROIR
 * autour du MUR (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection ·
 * Contrat↔Code · Evidence-attendue↔Evidence-observée). AU-DESSUS du mur = DÉCLARÉ (humain) ;
 * EN DESSOUS = PROUVÉ (machine, read-only). Un voyant 🟢/🔴/🟡 par paire, COMPUTÉ par le twin
 * pur (lib/v2/anatomy), jamais déclaré (CLAUDE.md §8).
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il N'EXISTE PAS de serveur MCP qui expose
 * les voyants RÉELS d'un kernel dispatché par la passerelle (le store de kernels ne projette pas
 * encore ses paires d'anatomie — OpenQuestion documentée). La logique — le jeu CLOS des six
 * paires-miroir, la table de vérité du voyant, la composition ordonnée et la validation — est un
 * TWIN PUR AUTORITATIF (lib/v2/anatomy), couvert par son miroir de parité lib/v2/anatomy.test.ts.
 * On PORTE donc cette logique UX pure (légitime, ADR 0092 §2), thémée V3, en RÉUTILISANT la
 * source V2 (app/v2/anatomie/[kernel]) SANS ré-implémenter le Go ni inventer une lecture « live »
 * fantôme : un branchement live deviendra possible le jour où le store de kernels exposera ses
 * voyants réels.
 *
 * Le serveur ne porte que le titre + l'intro + les chaînes ; tout le contenu (l'atelier de saisie
 * du kernel, le mur dessiné, les six paires, le détail) est projeté côté client (AnatomyClient ←
 * lib/v2/anatomy pour la logique). Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue
 * (next-intl, FR par défaut, ADR 0011).
 *
 * LE MUR (§2) : l'écran COMPOSE une projection de lecture et REND ses voyants ; il n'écrit AUCUNE
 * vérité. En dessous du mur, tout est read-only (la machine prouve) — aucune écriture
 * kernel/mirrors/fitness ; la promotion reste idée → miroir → /goal → approbation.
 */
export default async function V3AnatomyScreen() {
	const t = await getTranslations("v3");

	// Toutes les chaînes que le client rend (faces des six paires + libellés d'état + voyants).
	const strings: Record<string, string> = {
		kernelLabel: t("anatomieKernelLabel"),
		kernelPlaceholder: t("anatomieKernelPlaceholder"),
		emptyHint: t("anatomieEmptyHint"),
		wallNote: t("anatomieWallNote"),
		overall: t("anatomieOverall"),
		aboveWall: t("anatomieAboveWall"),
		belowWall: t("anatomieBelowWall"),
		wall: t("anatomieWall"),
		declaredSide: t("anatomieDeclaredSide"),
		provenSide: t("anatomieProvenSide"),
		readOnlyNote: t("anatomieReadOnlyNote"),
		"voyant.green": t("anatomieVoyantGreen"),
		"voyant.red": t("anatomieVoyantRed"),
		"voyant.amber": t("anatomieVoyantAmber"),
		"declared.declared": t("anatomieDeclaredDeclared"),
		"declared.absent": t("anatomieDeclaredAbsent"),
		"proven.pass": t("anatomieProvenPass"),
		"proven.fail": t("anatomieProvenFail"),
		"proven.pending": t("anatomieProvenPending"),
		"proven.absent": t("anatomieProvenAbsent"),
		"pair.spec_doc": t("anatomiePairSpecDoc"),
		"pair.behavior_results": t("anatomiePairBehaviorResults"),
		"pair.scenarios_tests": t("anatomiePairScenariosTests"),
		"pair.model_projection": t("anatomiePairModelProjection"),
		"pair.contract_code": t("anatomiePairContractCode"),
		"pair.evidence": t("anatomiePairEvidence"),
		"specDoc.above": t("anatomieSpecDocAbove"),
		"specDoc.below": t("anatomieSpecDocBelow"),
		"behaviorResults.above": t("anatomieBehaviorResultsAbove"),
		"behaviorResults.below": t("anatomieBehaviorResultsBelow"),
		"scenariosTests.above": t("anatomieScenariosTestsAbove"),
		"scenariosTests.below": t("anatomieScenariosTestsBelow"),
		"modelProjection.above": t("anatomieModelProjectionAbove"),
		"modelProjection.below": t("anatomieModelProjectionBelow"),
		"contractCode.above": t("anatomieContractCodeAbove"),
		"contractCode.below": t("anatomieContractCodeBelow"),
		"evidence.above": t("anatomieEvidenceAbove"),
		"evidence.below": t("anatomieEvidenceBelow"),
	};

	return (
		<div
			data-testid="v3-anatomie"
			className="mx-auto w-full max-w-4xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("anatomieTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("anatomieIntro")}
				</p>
			</div>
			<AnatomyClient t={strings} />
		</div>
	);
}
