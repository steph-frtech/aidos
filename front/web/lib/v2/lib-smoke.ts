/**
 * WB2-01 — le registre DÉTERMINISTE des librairies V2 (twin pur, déterminisme-first).
 *
 * Une SEULE source de vérité des librairies installées à WB2-01 et de leur sonde (« smoke ») :
 * react-arborist, react-aria-components, xstate (+ @xstate/react), react-hook-form, zod,
 * @xyflow/react. bpmn-js est DIFFÉRÉ (OpenQuestion, ADR 0053) — déclaré ici `deferred:true`,
 * sans composant monté.
 *
 * PUR : aucune dépendance React/DOM, aucun LLM. Les fonctions ci-dessous (registre, lookup,
 * totalité, hash) sont des projections déterministes — même entrée → même sortie — et portent
 * leur miroir de reproductibilité (lib-smoke.test.ts). Le rendu (un arbre, une machine XState,
 * un React Flow qui montent) est prouvé par l'e2e ; ce twin prouve la table.
 */

/** Une librairie V2 installée + sa sonde. `clientOnly` ⇒ montée via dynamic(ssr:false). */
export type LibSmoke = {
	/** identifiant stable (slug) de la sonde — sert de data-testid `v2-smoke-<id>`. */
	readonly id: string;
	/** le paquet npm installé (clé de dependencies). */
	readonly pkg: string;
	/** le libellé humain de la sonde. */
	readonly label: string;
	/** la sonde monte côté client uniquement (dynamic ssr:false) ? */
	readonly clientOnly: boolean;
	/** différé (déclaré, non monté) — ex. bpmn-js. */
	readonly deferred: boolean;
};

/**
 * Le registre, dans l'ordre canonique. Les six libs montées + bpmn-js différé.
 * react-arborist / @xyflow/react / react-aria(+xstate interactifs) ⇒ client-only.
 * react-hook-form + zod ⇒ un mini formulaire validé, client-only aussi (hooks).
 */
export const LIB_SMOKES: readonly LibSmoke[] = [
	{
		id: "arborist",
		pkg: "react-arborist",
		label: "Arbre (react-arborist)",
		clientOnly: true,
		deferred: false,
	},
	{
		id: "aria",
		pkg: "react-aria-components",
		label: "Bouton accessible (react-aria-components)",
		clientOnly: true,
		deferred: false,
	},
	{
		id: "xstate",
		pkg: "@xstate/react",
		label: "Machine (xstate + @xstate/react)",
		clientOnly: true,
		deferred: false,
	},
	{
		id: "rhf-zod",
		pkg: "react-hook-form",
		label: "Formulaire validé (react-hook-form + zod)",
		clientOnly: true,
		deferred: false,
	},
	{
		id: "flow",
		pkg: "@xyflow/react",
		label: "Diagramme (@xyflow/react)",
		clientOnly: true,
		deferred: false,
	},
	{
		id: "bpmn",
		pkg: "bpmn-js",
		label: "BPMN (bpmn-js) — différé",
		clientOnly: true,
		deferred: true,
	},
] as const;

/** Les sondes RÉELLEMENT montées (non différées) — ce que l'e2e doit voir exécuter. */
export function mountedSmokes(): readonly LibSmoke[] {
	return LIB_SMOKES.filter((s) => !s.deferred);
}

/** Lookup déterministe par id ; undefined si inconnu. */
export function smokeById(id: string): LibSmoke | undefined {
	return LIB_SMOKES.find((s) => s.id === id);
}

/** Totalité : chaque sonde a un id, un pkg et un libellé non vides ; les id sont uniques. */
export function isTotal(): boolean {
	const ids = new Set<string>();
	for (const s of LIB_SMOKES) {
		if (s.id.length === 0 || s.pkg.length === 0 || s.label.length === 0) {
			return false;
		}
		if (ids.has(s.id)) {
			return false;
		}
		ids.add(s.id);
	}
	return true;
}

/**
 * Hash déterministe du registre (FNV-1a 32-bit, hex) — content-addressed.
 * Même registre → même hash ; toute mutation de la table le change.
 */
export function smokeRegistryHash(): string {
	const canonical = LIB_SMOKES.map(
		(s) => `${s.id}|${s.pkg}|${s.label}|${s.clientOnly}|${s.deferred}`,
	).join("\n");
	let h = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i++) {
		h ^= canonical.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}
