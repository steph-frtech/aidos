import { getTranslations } from "next-intl/server";
import { loadIdeeAction } from "./actions";
import { IdeeClient } from "./IdeeClient";

/**
 * /v3/idée (idea capture) — LA LENTILLE DE L'ÉTAGE D'ENTRÉE (portée EN PROPRE dans le shell V3,
 * groupe « Concevoir » de la nav coordonnée — ADR 0060/0092). Le SHELL V3 (V3Nav + V3SessionProvider)
 * enveloppe automatiquement cette route ; on ne rend ICI que l'intro + la lentille.
 *
 * L'écran montre, EN DIRECT, où en est le BESOIN du projet actif : au-dessus du mur (§2), un besoin
 * devient une idée — un candidat-vérité (§115) — rung par rung le long de la verticale (§23). On lit
 * l'état du BesoinGraph via le tool Go `besoin_graph_state` (le serveur `besoin-intake` dispatché,
 * EL15) : le niveau ENTRABLE (EL07), le nombre de rungs capturés, si le besoin est résolu, les
 * verdicts par rung ; puis la GRAMMAIRE fermée des niveaux (champs requis + « capturer ici émet-il
 * une idée ? », la décision EL05). Un badge de source honnête (en direct / démo, ADR 0074).
 *
 * LECTURE LIVE DU MOTEUR, JAMAIS UN JUMEAU (ADR 0092) : la lecture passe par la passerelle
 * (`besoin_graph_state` via readVia, le décodeur réexporté de /besoin-intake) ; la grammaire fermée
 * est une fonction pure du twin (reproduite byte-à-byte par le Go `besoin_level_schema`), calculée
 * côté serveur derrière la frontière readVia (le cliquet T5 reste vert). Le besoin persisté vit dans
 * le schéma `besoin` de Postgres, scopé par projet (RLS S55) — le moteur Go est autoritaire.
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — capturer une idée passe par la porte gouvernée
 * idea_capture (EL05, atteignable via /besoin-intake), geler une vérité par idée → miroir → /goal →
 * approbation, jamais une écriture depuis l'écran. Thémé (tokens ADR 0010, 0 hex/zinc) ; bilingue
 * (next-intl, FR par défaut, ADR 0011).
 */

// Lit l'état du besoin du projet actif à CHAQUE requête (lecture en direct via la passerelle) —
// jamais figé dans une page statique.
export const dynamic = "force-dynamic";

export default async function V3IdeeScreen() {
	const t = await getTranslations("v3");
	const { state, schemas, source } = await loadIdeeAction();

	return (
		<div data-testid="v3-idee" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("ideeTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("ideeIntro")}
				</p>
			</div>
			<IdeeClient
				state={state}
				schemas={schemas}
				source={source}
				labels={{
					listHeading: t("ideeStateHeading"),
					listIntro: t("ideeStateIntro"),
					enterableLabel: t("ideeEnterableLabel"),
					graphComplete: t("ideeGraphComplete"),
					rowCountLabel: t("ideeRowCountLabel"),
					doneLabel: t("ideeDoneLabel"),
					doneYes: t("ideeDoneYes"),
					doneNo: t("ideeDoneNo"),
					verdictsHeading: t("ideeVerdictsHeading"),
					verdictsEmpty: t("ideeVerdictsEmpty"),
					verdictEnough: t("ideeVerdictEnough"),
					verdictMissing: t("ideeVerdictMissing"),
					grammarHeading: t("ideeGrammarHeading"),
					grammarIntro: t("ideeGrammarIntro"),
					levelLabel: t("ideeLevelLabel"),
					requiredLabel: t("ideeRequiredLabel"),
					emitsLabel: t("ideeEmitsLabel"),
					emitsYes: t("ideeEmitsYes"),
					emitsNo: t("ideeEmitsNo"),
					proposesLabel: t("ideeProposesLabel"),
					live: t("ideeLive"),
					demo: t("ideeDemo"),
					liveTitle: t("ideeLiveTitle"),
					demoTitle: t("ideeDemoTitle"),
					wallNote: t("ideeWallNote"),
					captureBtn: t("ideeCaptureBtn"),
					captureHint: t("ideeCaptureHint"),
				}}
			/>
		</div>
	);
}
