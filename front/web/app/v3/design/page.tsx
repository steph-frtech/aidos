import { getTranslations } from "next-intl/server";
import { DesignClient } from "./DesignClient";

/**
 * /v3/design — LE STUDIO DE DESIGN (lentille V3, ADR 0071 — Onlook INVERSÉ). La 9e lentille
 * de la session partagée. Le geste de design ne s'écrit JAMAIS dans le code : il devient un
 * ScreenDesign requirement content-adressé (le twin lib/v3/design), et le compilateur reproduit
 * l'écran byte-stable sur les 3 enfants. Le serveur ne porte que le titre amical ; tout le
 * contenu vit côté client (DesignClient ← useV3Session). Créer ce dossier rend la lentille
 * auto-couverte par coverage.test.ts (v3Dirs).
 */
export default async function V3DesignScreen() {
	const t = await getTranslations("v3");
	return (
		<div data-testid="v3-design" className="mx-auto w-full max-w-6xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("designTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("designIntro")}
				</p>
			</div>
			<DesignClient />
		</div>
	);
}
