import { GrilleScreen } from "../grille/GrilleScreen";

/**
 * /v2/verticale — le slug du concept « Verticale » du glossaire (l'axe couplant, atteint depuis la
 * carte/nav de /v2). Ce segment statique prime sur /v2/[slug] et rend l'écran de la grille niveau ×
 * facette (WB2-05), conservant le contrat de navigation WB2-02 (v2-concept-title = « Verticale »).
 */
export default function V2VerticaleRoute() {
	return <GrilleScreen />;
}
