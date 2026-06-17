import { describe, expect, it } from "vitest";
import { fanOutDecoder } from "./live";

/**
 * /v3/cellules live read — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot kill-twins
 * ADR 0092).
 *
 * Il prouve que le `fanOutDecoder` TS décode un ÉCHANTILLON de la sortie du tool Go `fan_out`
 * (federationsrv.fanOutOutput : `{ waves: CellRedWave[], affected }`, snake_case) — le CONTRAT du
 * tool, PAS une seconde implémentation du fan-out (back/runtime/federation.FanOut reste la source
 * unique). Une cellule rougie (reddened:true) ⇒ violates:true dans le FanOutSpec ; une cellule
 * verte ⇒ violates:false. L'id de vague est lu sur la première ligne de queue rougie.
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM. Un payload malformé renvoie
 * null déterministiquement, pour que readVia retombe sur la vague-démo (source:"demo").
 */

describe("cellules live — fan_out decoder parity", () => {
	it("décode un fanOutOutput Go (reddened → violates ; id de vague depuis la queue)", () => {
		const goSample = {
			waves: [
				{ cell: "order", reddened: false, queue: [] },
				{
					cell: "payment",
					reddened: true,
					queue: [
						{ target: "PaymentPII", wave_id: "wave-pii-1", reason: "policy" },
					],
				},
			],
			affected: ["payment"],
		};
		const decoded = fanOutDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decoded?.policyWaveId).toBe("wave-pii-1");
		expect(decoded?.cells).toEqual([
			{ cell: "order", violates: false },
			{ cell: "payment", violates: true },
		]);
	});

	it("un fan-out sans cellule rougie → aucune violation, id de vague vide (vague nulle légale)", () => {
		const decoded = fanOutDecoder({ waves: [], affected: [] });
		expect(decoded).not.toBeNull();
		expect(decoded?.cells).toEqual([]);
		expect(decoded?.policyWaveId).toBe("");
	});

	it("rejette un payload malformé (→ null → repli vague-démo)", () => {
		expect(fanOutDecoder(null)).toBeNull();
		expect(fanOutDecoder({})).toBeNull();
		// `waves` présent mais une cellule de vague malformée (reddened manquant) → null.
		expect(fanOutDecoder({ waves: [{ cell: "order" }] })).toBeNull();
		expect(fanOutDecoder({ waves: [{ cell: 42, reddened: true }] })).toBeNull();
	});
});
