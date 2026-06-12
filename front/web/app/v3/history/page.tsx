import { HistoryClient } from "./HistoryClient";

/**
 * /v3/history — L'HISTORIQUE : la timeline de la session partagée (ADR 0060).
 * Tout vient de la session du layout (useV3Session) — la page est une lentille pure.
 */
export default function V3HistoryScreen() {
	return <HistoryClient />;
}
