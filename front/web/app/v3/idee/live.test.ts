import { describe, expect, it } from "vitest";
import { allLevels } from "../../../lib/besoin-grammar";
import {
	besoinLevelSchema,
	captureProjection,
} from "../../../lib/besoin-intake";
import { type IdeeSchemaRow, stateDecoder } from "./live";

/**
 * /v3/idée (idea capture) live read — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot
 * kill-twins ADR 0092).
 *
 * Il prouve que la lentille « idée » V3 lit l'état du BesoinGraph via le MÊME décodeur que
 * /besoin-intake (`stateDecoder`, l'unique déclaration runtime de `besoinintakesrv.stateOutput` :
 * { project, graph_hash, node_row_count, enterable_level?, done, verdicts[] }, snake_case) — le
 * CONTRAT du tool Go `besoin_graph_state`, PAS une seconde implémentation de la logique besoin (le
 * moteur Go reste autoritaire). Un payload malformé → null → repli démo (déterministe).
 *
 * Et il pinne que la projection de la grammaire fermée en lignes d'affichage est PURE et fidèle au
 * twin : pour chaque niveau, les champs requis == le schéma de niveau et le verdict émet/genre ==
 * la projection de capture (EL05) — aucun LLM, même grammaire → mêmes lignes (reproductibilité §8).
 */

/** grammarSchemaRows — réplique locale de la projection de actions.ts (testée en isolation pure). */
function grammarSchemaRows(): IdeeSchemaRow[] {
	const rows: IdeeSchemaRow[] = [];
	for (const level of allLevels()) {
		const schema = besoinLevelSchema(level);
		const projection = captureProjection(level);
		if (schema === null || projection === null) continue;
		rows.push({
			level,
			requiredFields: schema.requiredFields,
			emits: projection.emits,
			proposes: projection.proposes,
		});
	}
	return rows;
}

describe("v3/idee live — besoin_graph_state decoder parity", () => {
	it("décode un stateOutput Go (snake_case) en l'état du graphe", () => {
		const goSample = {
			project: "shop-a",
			graph_hash: "abc123",
			node_row_count: 3,
			enterable_level: "operation",
			done: false,
			verdicts: [
				{
					level: "product",
					enough: true,
					missing: [],
					open_questions: [],
				},
			],
		};
		const decoded = stateDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decoded?.project).toBe("shop-a");
		expect(decoded?.graphHash).toBe("abc123");
		expect(decoded?.nodeRowCount).toBe(3);
		expect(decoded?.enterableLevel).toBe("operation");
		expect(decoded?.done).toBe(false);
		expect(decoded?.verdicts[0]?.level).toBe("product");
		expect(decoded?.verdicts[0]?.openQuestions).toEqual([]);
	});

	it('un graphe complet (enterable_level absent) → enterableLevel = ""', () => {
		const decoded = stateDecoder({
			project: "shop-a",
			graph_hash: "h",
			node_row_count: 8,
			done: true,
			verdicts: [],
		});
		expect(decoded).not.toBeNull();
		expect(decoded?.enterableLevel).toBe("");
		expect(decoded?.done).toBe(true);
	});

	it("rejette un payload malformé (→ null → repli démo)", () => {
		expect(stateDecoder(null)).toBeNull();
		expect(stateDecoder({})).toBeNull();
		// node_row_count manquant → null (un champ requis)
		expect(
			stateDecoder({ project: "a", graph_hash: "h", done: false }),
		).toBeNull();
		// done absent (booléen requis) → null
		expect(
			stateDecoder({ project: "a", graph_hash: "h", node_row_count: 0 }),
		).toBeNull();
	});
});

describe("v3/idee live — grammar schema projection (pure)", () => {
	it("projette chaque niveau fidèlement au schéma + à la projection de capture (EL05)", () => {
		const rows = grammarSchemaRows();
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			const schema = besoinLevelSchema(row.level);
			const projection = captureProjection(row.level);
			expect(schema).not.toBeNull();
			expect(projection).not.toBeNull();
			expect(row.requiredFields).toEqual(schema?.requiredFields);
			expect(row.emits).toBe(projection?.emits);
			expect(row.proposes).toBe(projection?.proposes ?? null);
		}
	});

	it("est déterministe (même grammaire → mêmes lignes)", () => {
		expect(grammarSchemaRows()).toEqual(grammarSchemaRows());
	});

	it("contient des rungs NoEmit (journey/view/invariant n'émettent pas d'idée)", () => {
		const rows = grammarSchemaRows();
		const noEmit = rows.filter((r) => !r.emits).map((r) => r.level);
		// la grammaire fermée garantit au moins ces rungs NoEmit (pas de cast silencieux)
		expect(noEmit).toEqual(expect.arrayContaining(["journey", "view"]));
	});
});
