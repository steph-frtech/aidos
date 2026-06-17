import { getTranslations } from "next-intl/server";
import { loadCellulesAction } from "./actions";
import { CellulesClient } from "./CellulesClient";

/**
 * /v3/cellules — LA LENTILLE DE LA FÉDÉRATION DES CELLULES (portée EN PROPRE dans le shell V3,
 * groupe « Comprendre » de la nav coordonnée — ADR 0060/0092). Le SHELL V3 (V3Nav +
 * V3SessionProvider) enveloppe automatiquement cette route ; on ne rend ICI que l'intro + la
 * lentille.
 *
 * L'écran montre, EN DIRECT, le concept §49/§51 : une grosse app est une FÉDÉRATION de cellules
 * (bounded contexts) reliées par des contrats, et une policy globale exprimée UNE FOIS « fan-out »
 * vers une RedWorkQueue PAR cellule — chaque cellule qui la viole rougit, les autres restent vertes
 * et continuent de livrer. La vague de rouge est lue par le tool Go `fan_out` (le serveur
 * `federation` dispatché, S103/§51).
 *
 * LECTURE LIVE DU MOTEUR, JAMAIS UN JUMEAU (ADR 0092) : la vague passe par la passerelle
 * (`fan_out` via le SDK S59, readVia) ; le décodeur (live.ts) + l'instantané pur (assembleSnapshot,
 * lib/federation-cockpit) sont purs et pinnés par leur miroir de parité, aucune logique de fan-out
 * ré-implémentée. La composition vit dans back/runtime/federation (autoritaire).
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — `fan_out` renvoie les vagues par cellule comme une VALEUR ;
 * l'INSERT dans runtime.red_work_queue est le travail du hook S22, geler un contrat passe par
 * idée → miroir → /goal, jamais une écriture depuis l'écran. Thémé (tokens ADR 0010, 0 hex/zinc) ;
 * bilingue (next-intl, FR par défaut, ADR 0011).
 */

// Lit la vague de rouge transverse du projet actif à CHAQUE requête (lecture en direct via la
// passerelle) — jamais figé dans une page statique.
export const dynamic = "force-dynamic";

export default async function V3CellulesScreen() {
	const t = await getTranslations("v3cellules");
	const { snapshot, source, error } = await loadCellulesAction();

	return (
		<div
			data-testid="v3-cellules-screen"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>
				<div
					data-testid="v3-cellules-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</div>
			<CellulesClient
				snapshot={snapshot}
				source={source}
				error={error}
				labels={{
					cells: t("cells"),
					contracts: t("contracts"),
					globalStable: t("globalStable"),
					globalUnstable: t("globalUnstable"),
					cellsHeading: t("cellsHeading"),
					cellsIntro: t("cellsIntro"),
					contractsHeading: t("contractsHeading"),
					contractsIntro: t("contractsIntro"),
					noContracts: t("noContracts"),
					honored: t("honored"),
					dishonored: t("dishonored"),
					ships: t("ships"),
					doesNotShip: t("doesNotShip"),
					reddened: t("reddened"),
					green: t("green"),
					queueHeading: t("queueHeading"),
					queueEmpty: t("queueEmpty"),
					structuralHeading: t("structuralHeading"),
					structuralState: t("structuralState"),
					live: t("live"),
					demo: t("demo"),
					liveTitle: t("liveTitle"),
					demoTitle: t("demoTitle"),
					error: t("loadError"),
				}}
			/>
		</div>
	);
}
