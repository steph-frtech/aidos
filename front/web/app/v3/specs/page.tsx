import { getTranslations } from "next-intl/server";
import { SpecsClient } from "./SpecsClient";

/**
 * /v3/specs — LES SPÉCIFICATIONS (lentille V3, ADR 0062) : LA GRILLE niveau ×
 * facette (le twin specsOf/gridOf — comptes conservés, impacts du dernier tour
 * allumés en ambre) + la LISTE des specs (statut amical, coordonnée, scénario
 * replié). Le serveur ne porte que le titre ; tout le contenu est projeté du
 * rejeu côté client (SpecsClient ← useV3Session).
 */
export default async function V3SpecsScreen() {
	const t = await getTranslations("v3");
	return (
		<div data-testid="v3-specs" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("specsTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("specsIntro")}
				</p>
			</div>
			<SpecsClient />
		</div>
	);
}
