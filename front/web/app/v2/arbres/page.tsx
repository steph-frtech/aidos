import { KernelsScreen } from "../kernels/KernelsScreen";

/**
 * /v2/arbres — le slug du concept « Arbres » du glossaire (atteint depuis la carte/nav de /v2).
 * Ce segment statique prime sur /v2/[slug] et rend l'écran de l'arbre de composition (WB2-04),
 * conservant le contrat de navigation WB2-02 (v2-concept-title = « Arbres » + v2-concept-def).
 */
export default function V2ArbresRoute() {
	return <KernelsScreen />;
}
