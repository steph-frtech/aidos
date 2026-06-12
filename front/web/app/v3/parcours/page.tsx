import { ParcoursClient } from "./ParcoursClient";

/**
 * /v3/parcours — « Parcours produit » : les parcours dessinés en GRAPHES (React Flow,
 * ADR 0053) sur la session partagée V3 (ADR 0060). La page est une LENTILLE PURE :
 * tout vient de la session du layout (useV3Session) — une greffe faite dans le chat
 * apparaît ici en direct, sans aucun état propre.
 */
export default function V3ParcoursScreen() {
	return <ParcoursClient />;
}
