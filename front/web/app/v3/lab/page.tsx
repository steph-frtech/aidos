import { LabClient } from "./LabClient";

/**
 * /v3/lab — L'AI LAB : LE chat (façon GPT) de la session partagée V3 (ADR 0060).
 * Tout vient de la session du layout (useV3Session) — la page est une lentille pure.
 */
export default function V3LabScreen() {
	return <LabClient />;
}
