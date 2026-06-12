import { EnvsClient } from "./EnvsClient";

/**
 * /v3/environnements — LES ENVIRONNEMENTS : l'échelle de la session partagée (ADR 0060).
 * Tout vient de la session du layout (useV3Session) — la page est une lentille pure.
 */
export default function V3EnvsScreen() {
	return <EnvsClient />;
}
