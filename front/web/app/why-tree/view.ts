import type { Source } from "@/lib/gateway-sdk";
import type { BuildResult } from "@/lib/why-tree";

/**
 * La VUE du panneau /why-tree (FK13 — le geste `/why`), extraite hors de actions.ts.
 *
 * POURQUOI ICI ET PAS DANS actions.ts (la contrainte Next « use server ») : un module
 * « use server » ne peut EXPORTER que des fonctions async — exporter un type/une const
 * (BuildView, EMPTY_BUILD_VIEW) y fait 500 le re-render RSC de la Server Action
 * (« A "use server" file can only export async functions, found object. »), ce qui
 * empêchait l'arbre de se monter sur submit (le panneau partagé, top-level ET /v3). On
 * isole donc la forme + l'état initial dans ce module pur, importé par actions.ts (la
 * Server Action) ET par le composant client WhyTreePanel.
 *
 * LECTURE seule / projection (le mur, §2) : ces types décrivent un instantané LU
 * (live via la passerelle, ou le repli demo déterministe) ; aucune vérité touchée.
 */

export interface BuildView {
	ok: boolean;
	/** the picked scenario id (echoed so the panel can show the symptom/provenance). */
	caseId: string;
	/** the symptom + provenance of the picked scenario (echoed for the header). */
	symptom: string;
	provenance: string;
	/** the built WhyTree or the closed refusal (the live read, or the demo fallback). */
	result: BuildResult | null;
	/** the content-addressed kernel.link body of a built tree (empty on a refusal). */
	body: string;
	/** whether the snapshot came from the live gateway or the demo fixture. */
	source: Source;
}

export const EMPTY_BUILD_VIEW: BuildView = {
	ok: false,
	caseId: "",
	symptom: "",
	provenance: "",
	result: null,
	body: "",
	source: "demo",
};
