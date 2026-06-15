import { getTranslations } from "next-intl/server";
import { EmetteursClient } from "./EmetteursClient";

/**
 * /v3/emetteurs — LES ÉMETTEURS (lentille V3, la 10e — « tout est dans v3 ») : le
 * portage du dernier écran V2 non porté (/v2/emetteurs) dans la session V3. L'écran
 * montre L'ÉMISSION DEPUIS LES ENTITÉS — à partir d'une source d'entité (nom +
 * attributs ORDONNÉS, typés sur le jeu scalaire fermé), AIDOS rend
 * DÉTERMINISTIQUEMENT ses trois projections : le DDL Postgres (CREATE TABLE), le
 * struct Go (sqlc) et le type TypeScript — plus le CONTRAT partagé. Une seule source
 * → N projections, jamais doublement typée.
 *
 * RÉUTILISATION (pas de fork, ADR 0007 / déterminisme-first §8) : TOUT est délégué au
 * TWIN PUR lib/v2/emetteurs.ts (emitView / reEmitStable / appPreview — eux-mêmes
 * réexportant emit/project de S35, byte-identiques au Go back/kernel/entities). Cette
 * lentille ne ré-implémente AUCUNE logique d'émission ; elle PROJETTE depuis le
 * registre clos ENTITY_CASES (les vraies sources d'entité que le Go pinne) + montre, en
 * contexte, les entités émises par l'app COURANTE de la session (emitApp(state)).
 *
 * Le serveur ne porte que le titre + l'intro ; tout le contenu (les onglets DDL/Go/TS,
 * l'aperçu, la re-émission) est projeté côté client (EmetteursClient ← useV3Session,
 * strings depuis le layout). Themed (tokens shadcn ADR 0010) + bilingue (next-intl, FR
 * par défaut, ADR 0011). LE MUR (§2) : lecture + projection, AUCUNE écriture de vérité.
 */
export default async function V3EmetteursScreen() {
	const t = await getTranslations("v3");
	return (
		<div
			data-testid="v3-emetteurs"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("emetteursTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("emetteursIntro")}
				</p>
			</div>
			<EmetteursClient />
		</div>
	);
}
