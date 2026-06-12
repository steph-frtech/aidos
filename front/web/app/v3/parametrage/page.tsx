import { ParamsClient } from "./ParamsClient";

/**
 * /v3/parametrage — LES PARAMÈTRES : les vérités déclarées de la session (ADR 0060).
 * Tout vient de la session du layout (useV3Session) — la page est une lentille pure.
 */
export default function V3ParamsScreen() {
	return <ParamsClient />;
}
