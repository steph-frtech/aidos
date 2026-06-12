import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assembleGraph, extractFromSource } from "./code-extract";
import { validateCodeGraph } from "./code-graph";

/**
 * WB2-26 — le MIROIR de l'EXTRACTEUR (ADR 0056) : du TEXTE SOURCE au graphe de code,
 * DÉTERMINISTIQUEMENT (l'API compilateur TypeScript — un parseur, jamais un LLM).
 *
 * « Pré-intégré dès la rédaction du code » : le graphe n'est pas déclaré à la main, il
 * est EXTRAIT du source réel — même texte → même graphe (reproductibilité) ; modifier
 * le corps d'une fonction change SA version (content-adressée) et celle-là seulement.
 */

const SAMPLE = `import { helper } from "./util";

export function alpha(x: number): number {
	return beta(x) + helper(x);
}

function beta(x: number): number {
	return x * 2;
}

export class Caisse {
	solde = 0;

	debiter(montant: number): void {
		this.solde -= montant;
		journaliser(montant);
	}
}

const journaliser = (montant: number): void => {
	console.log(montant);
};
`;

const UTIL = `export function helper(x: number): number {
	return x + 1;
}
`;

describe("extractFromSource — du texte au graphe, déterministe", () => {
	it("extrait fichier, fonctions, classe, méthode, arrow const — avec genres et spans", () => {
		const ex = extractFromSource("src/caisse.ts", SAMPLE);
		const byName = new Map(ex.symbols.map((s) => [s.name, s]));

		const file = ex.symbols.find((s) => s.kind === "file");
		expect(file).toBeDefined();
		expect(file?.name).toBe("src/caisse.ts");

		expect(byName.get("alpha")?.kind).toBe("function");
		expect(byName.get("beta")?.kind).toBe("function");
		expect(byName.get("Caisse")?.kind).toBe("class");
		expect(byName.get("debiter")?.kind).toBe("method");
		expect(byName.get("journaliser")?.kind).toBe("function");

		// les spans pointent les bonnes lignes (1-based) : alpha démarre ligne 3.
		expect(byName.get("alpha")?.span.start).toBe(3);
		// la contenance : la méthode est DANS la classe, la classe DANS le fichier.
		expect(byName.get("debiter")?.parentId).toBe(byName.get("Caisse")?.id);
		expect(byName.get("Caisse")?.parentId).toBe(file?.id);
	});

	it("extrait les arêtes d'appel INTRA-fichier (extracted) : alpha→beta, debiter→journaliser", () => {
		const ex = extractFromSource("src/caisse.ts", SAMPLE);
		const byName = new Map(ex.symbols.map((s) => [s.name, s]));
		const has = (a: string, b: string) =>
			ex.edges.some(
				(e) =>
					e.from === byName.get(a)?.id &&
					e.to === byName.get(b)?.id &&
					e.confidence === "extracted",
			);
		expect(has("alpha", "beta")).toBe(true);
		expect(has("debiter", "journaliser")).toBe(true);
	});

	it("enregistre les imports (module + noms) pour la résolution inter-fichiers", () => {
		const ex = extractFromSource("src/caisse.ts", SAMPLE);
		expect(ex.imports).toEqual([{ module: "./util", names: ["helper"] }]);
	});

	it("REPRODUCTIBLE : même texte → même extraction (versions incluses)", () => {
		const a = extractFromSource("src/caisse.ts", SAMPLE);
		const b = extractFromSource("src/caisse.ts", SAMPLE);
		expect(a).toEqual(b);
	});

	it("CONTENT-ADRESSÉ : modifier le corps de beta change SA version, pas celle d'alpha", () => {
		const before = extractFromSource("src/caisse.ts", SAMPLE);
		const after = extractFromSource(
			"src/caisse.ts",
			SAMPLE.replace("return x * 2;", "return x * 3;"),
		);
		const v = (ex: ReturnType<typeof extractFromSource>, name: string) =>
			ex.symbols.find((s) => s.name === name)?.version;
		expect(v(after, "beta")).not.toBe(v(before, "beta"));
		expect(v(after, "alpha")).toBe(v(before, "alpha"));
		expect(v(after, "journaliser")).toBe(v(before, "journaliser"));
	});

	it("TOTAL : un source vide ou invalide ne jette pas (fail-closed : le fichier seul)", () => {
		expect(() => extractFromSource("x.ts", "")).not.toThrow();
		expect(() => extractFromSource("x.ts", "@@@ pas du ts @@@")).not.toThrow();
		const ex = extractFromSource("x.ts", "");
		expect(ex.symbols.filter((s) => s.kind === "file")).toHaveLength(1);
	});

	it("∀ : l'extraction est déterministe sur du source arbitraire (jamais une exception)", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 200 }), (txt) => {
				const a = extractFromSource("f.ts", txt);
				const b = extractFromSource("f.ts", txt);
				expect(a).toEqual(b);
			}),
		);
	});
});

describe("assembleGraph — la résolution inter-fichiers (inferred)", () => {
	it("relie l'appel à un import par une arête INFÉRÉE : alpha → util#helper", () => {
		const g = assembleGraph([
			extractFromSource("src/caisse.ts", SAMPLE),
			extractFromSource("src/util.ts", UTIL),
		]);
		expect(validateCodeGraph(g.nodes, g.edges)).toEqual([]);
		const byName = new Map(g.nodes.map((n) => [`${n.file}#${n.name}`, n]));
		const alpha = byName.get("src/caisse.ts#alpha");
		const helper = byName.get("src/util.ts#helper");
		expect(alpha).toBeDefined();
		expect(helper).toBeDefined();
		const edge = g.edges.find(
			(e) => e.from === alpha?.id && e.to === helper?.id,
		);
		expect(edge?.confidence).toBe("inferred");
	});

	it("un import vers un fichier ABSENT ne produit AUCUNE arête pendante (fail-closed)", () => {
		const g = assembleGraph([extractFromSource("src/caisse.ts", SAMPLE)]);
		expect(validateCodeGraph(g.nodes, g.edges)).toEqual([]);
	});

	it("REPRODUCTIBLE : mêmes fichiers → même graphe assemblé", () => {
		const files = () => [
			extractFromSource("src/caisse.ts", SAMPLE),
			extractFromSource("src/util.ts", UTIL),
		];
		expect(assembleGraph(files())).toEqual(assembleGraph(files()));
	});
});
