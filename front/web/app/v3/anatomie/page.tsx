import { getTranslations } from "next-intl/server";
import { AnatomyClient } from "./AnatomyClient";
import { loadAnatomyAction } from "./actions";

/**
 * /v3/anatomie — LA LENTILLE ANATOMIE (un écran conceptuel KRD porté EN PROPRE dans la
 * session V3, parcours « Comprendre ») : l'ANATOMIE 1-pour-1 d'un kernel, les SIX PAIRES-MIROIR
 * autour du MUR (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection ·
 * Contrat↔Code · Evidence-attendue↔Evidence-observée). AU-DESSUS du mur = DÉCLARÉ (humain) ;
 * EN DESSOUS = PROUVÉ (machine, read-only). Un voyant 🟢/🔴/🟡 par paire, COMPUTÉ par le moteur
 * Go, jamais déclaré (CLAUDE.md §8).
 *
 * CHEMIN VIVANT (ADR 0092 — le moteur Go est l'UNIQUE source vivante). L'anatomie d'un kernel —
 * le jeu CLOS des six paires-miroir, la table de vérité du voyant (§8 « le juge est un calcul »),
 * la composition ordonnée + le voyant global — est un CALCUL PUR que le noyau Go possède
 * (back/kernel/mirror/anatomy), exposé par l'outil MCP `anatomy_build` (serveur `anatomy`
 * dispatché par la passerelle). La lentille le lit EN DIRECT via la Server Action loadAnatomyAction
 * (lib/gateway-sdk.readVia). Le twin lib/v2/anatomy n'est PLUS le chemin live : il ne sert que de
 * repli-démo déterministe (lib/v2/anatomy-data), derrière la frontière readVia, quand la passerelle
 * est injoignable. Le §2 « client-UX légitime » ne couvre PAS un calcul pur byte-identique au Go —
 * c'était un twin, désormais flipé.
 *
 * Le serveur fait la PREMIÈRE lecture (SSR) pour le kernel par défaut puis porte le titre + l'intro
 * + les chaînes ; tout le contenu (l'atelier de saisie, le mur dessiné, les six paires, le détail,
 * le badge live|demo) est rendu côté client (AnatomyClient), la frappe relançant la lecture live.
 * Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011).
 *
 * LE MUR (§2) : l'écran LIT une projection (anatomy_build est below-the-line) et REND ses voyants ;
 * il n'écrit AUCUNE vérité. En dessous du mur, tout est read-only (la machine prouve) — aucune
 * écriture kernel/mirrors/fitness ; la promotion reste idée → miroir → /goal → approbation.
 */
export default async function V3AnatomyScreen() {
	const t = await getTranslations("v3");

	// La PREMIÈRE lecture (SSR) pour le kernel d'exemple — l'écran n'est jamais vide ; readVia
	// retombe sur l'anatomie-démo si la passerelle est injoignable (source:"demo").
	const initial = await loadAnatomyAction("truth-checkout-authz");

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
		sourceLive: t("anatomieSourceLive"),
		sourceDemo: t("anatomieSourceDemo"),
		sourceLiveTitle: t("anatomieSourceLiveTitle"),
		sourceDemoTitle: t("anatomieSourceDemoTitle"),
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
			<AnatomyClient t={strings} initial={initial} />
		</div>
	);
}
