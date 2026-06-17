import { describe, expect, it } from "vitest";
import {
	canonicalBody,
	hashBody,
	KERNEL_TRUTHS,
} from "../../../lib/v3/kernels-data";
import { decodeBody, storeGetArgs, storeGetDecoder } from "./live";

/**
 * /v3/kernels live read — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot kill-twins
 * ADR 0092).
 *
 * Il prouve que le `storeGetDecoder` TS décode un ÉCHANTILLON de la sortie du tool Go `store_get`
 * (storesrv.getOutput : `{ data_base64 }`, snake_case) — le CONTRAT du tool, PAS une seconde
 * implémentation du content-store (contentstore.Get reste la source unique). Il pinne aussi que
 * `storeGetArgs` projette un hash vers l'objet d'arguments exact (getInput : `{ hash }`), un objet
 * SIMPLE (pas de json.RawMessage — le garde du scar S59).
 *
 * Et il prouve l'ADRESSAGE PAR CONTENU (le cœur de la lentille) : pour chaque vérité connue, le
 * hash déclaré reproduit `hashBody(corps canonique)` (la même image que contentstore.Hash), et la
 * base64 du corps se redécode exactement en ce corps (decodeBody ∘ base64 == identité).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM. Un payload malformé renvoie
 * null déterministiquement, pour que readVia retombe sur le repli-démo (source:"demo").
 */

describe("kernels live — store_get decoder parity", () => {
	it("décode un getOutput Go (les octets base64 sous un hash)", () => {
		const body = canonicalBody({ kind: "truth", statement: "x" });
		const goSample = {
			data_base64: Buffer.from(body, "utf8").toString("base64"),
		};
		const decoded = storeGetDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decodeBody(decoded?.dataBase64 ?? "")).toBe(body);
	});

	it("rejette un payload malformé (→ null → repli démo)", () => {
		expect(storeGetDecoder(null)).toBeNull();
		expect(storeGetDecoder({})).toBeNull();
		expect(storeGetDecoder({ data_base64: 42 })).toBeNull();
		expect(storeGetDecoder({ hash: "abc" })).toBeNull();
	});

	it("projette un hash vers les args getInput exacts (objet simple)", () => {
		const args = storeGetArgs("deadbeef");
		expect(args).toEqual({ hash: "deadbeef" });
		// un objet simple sérialisable (le garde RawMessage S59)
		expect(JSON.parse(JSON.stringify(args))).toEqual(args);
	});
});

describe("kernels live — content addressing parity", () => {
	it("chaque vérité connue est adressée par le hash de son corps canonique", () => {
		expect(KERNEL_TRUTHS.length).toBeGreaterThan(0);
		for (const truth of KERNEL_TRUTHS) {
			// Le corps stocké est la forme canonique ; son hash doit reproduire l'adresse déclarée.
			const recomputed = hashBody(
				JSON.parse(truth.body) as Record<string, unknown>,
			);
			expect(truth.hash).toBe(recomputed);
			// Round-trip des octets : base64(corps) → decodeBody → le corps exact (parité de lecture).
			const bytes = Buffer.from(truth.body, "utf8").toString("base64");
			expect(decodeBody(bytes)).toBe(truth.body);
		}
	});

	it("le hash est déterministe (même corps → même hash)", () => {
		const a = hashBody({ kind: "truth", statement: "même", scope: "x" });
		const b = hashBody({ scope: "x", statement: "même", kind: "truth" });
		// Indépendant de l'ordre d'insertion (sérialisation canonique, clés triées).
		expect(a).toBe(b);
	});
});
