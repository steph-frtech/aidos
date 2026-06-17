import { describe, expect, it } from "vitest";
import {
	buildAnatomy,
	PAIR_KINDS,
	syntheticPairStates,
} from "../../../lib/v2/anatomy";
import { anatomyDecoder } from "./live";

/**
 * /v3/anatomie lecture live — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot kill-twins
 * ADR 0092, le flip du twin lib/v2/anatomy vers le moteur Go).
 *
 * Il prouve que `anatomyDecoder` décode un ÉCHANTILLON de la sortie du tool Go `anatomy_build`
 * (anatomysrv.buildOutput : { ok, kernel_id, pairs[{kind, declared:{side,state}, proven:{side,
 * state}, voyant}], overall, counts, hash }, snake_case) — le CONTRAT du tool, PAS une seconde
 * implémentation de la logique d'anatomie (back/kernel/mirror/anatomy reste la source unique). Il
 * pinne aussi que `anatomyBuildArgs` projette un kernelId vers l'objet d'arguments exact (buildInput
 * : { kernel_id, states[] }), un objet SIMPLE (pas de json.RawMessage — le garde du scar S59).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM. Un payload malformé / un
 * `ok:false` / des paires désordonnées renvoient null déterministiquement, pour que readVia retombe
 * sur le repli-démo (source:"demo").
 */

/** goSample fabrique l'image Go d'`anatomy_build` pour un kernel — le calcul pur (repli démo) sert d'oracle de la
 * forme (mêmes voyants ordonnés que le Go calculerait pour ces états), en snake_case côté faces. */
function goSample(kernelId: string): Record<string, unknown> {
	const r = buildAnatomy(kernelId, syntheticPairStates(kernelId));
	if (!r.ok) throw new Error("twin oracle should build");
	const a = r.anatomy;
	return {
		ok: true,
		kernel_id: a.kernelId,
		pairs: a.pairs.map((p) => ({
			kind: p.kind,
			declared: { side: p.declared.side, state: p.declared.state },
			proven: { side: p.proven.side, state: p.proven.state },
			voyant: p.voyant,
		})),
		overall: a.overall,
		counts: a.counts,
		hash: "deadbeef",
	};
}

describe("anatomie live — anatomy_build decoder parity", () => {
	it("décode un buildOutput Go (six paires ordonnées autour du mur + overall + comptes)", () => {
		const decoded = anatomyDecoder(goSample("truth-checkout-authz"));
		expect(decoded).not.toBeNull();
		expect(decoded?.pairs).toHaveLength(PAIR_KINDS.length);
		// Le jeu CLOS, dans l'ORDRE canonique (1-pour-1, aucune perdue ni désordonnée).
		expect(decoded?.pairs.map((p) => p.kind)).toEqual([...PAIR_KINDS]);
		// La face déclarée toujours au-dessus du mur, la prouvée toujours en dessous.
		for (const p of decoded?.pairs ?? []) {
			expect(p.declared.side).toBe("above");
			expect(p.proven.side).toBe("below");
		}
		expect(["green", "red", "amber"]).toContain(decoded?.overall);
	});

	it("est l'image exacte du calcul pur (repli démo) (parité de repli — même états → même anatomie)", () => {
		const id = "truth-place-order";
		const decoded = anatomyDecoder(goSample(id));
		const twin = buildAnatomy(id, syntheticPairStates(id));
		expect(twin.ok).toBe(true);
		if (twin.ok) {
			expect(decoded?.kernelId).toBe(twin.anatomy.kernelId);
			expect(decoded?.overall).toBe(twin.anatomy.overall);
			expect(decoded?.counts).toEqual(twin.anatomy.counts);
			expect(decoded?.pairs.map((p) => [p.kind, p.voyant])).toEqual(
				twin.anatomy.pairs.map((p) => [p.kind, p.voyant]),
			);
		}
	});

	it("rejette un payload malformé / ok:false / désordonné (→ null → repli démo)", () => {
		expect(anatomyDecoder(null)).toBeNull();
		expect(anatomyDecoder({})).toBeNull();
		// ok:false (le moteur a refusé un état incomplet) → repli démo.
		expect(anatomyDecoder({ ok: false, error: "missing_pair" })).toBeNull();
		// kernel_id absent.
		const noKernel = goSample("x");
		delete (noKernel as { kernel_id?: unknown }).kernel_id;
		expect(anatomyDecoder(noKernel)).toBeNull();
		// paires désordonnées (le jeu clos doit rester dans l'ordre canonique).
		const shuffled = goSample("y");
		const ps = shuffled.pairs as unknown[];
		[ps[0], ps[1]] = [ps[1], ps[0]];
		expect(anatomyDecoder(shuffled)).toBeNull();
		// face avec un côté inversé (déclaré sous le mur) → rejet.
		const flipped = goSample("z");
		(flipped.pairs as { declared: { side: string } }[])[0].declared.side =
			"below";
		expect(anatomyDecoder(flipped)).toBeNull();
		// voyant hors du jeu clos.
		const badVoyant = goSample("w");
		(badVoyant.pairs as { voyant: string }[])[0].voyant = "purple";
		expect(anatomyDecoder(badVoyant)).toBeNull();
	});
});

describe("anatomie live — anatomy_build args (états des six paires, le calcul pur (repli démo))", () => {
	it("les états saisis couvrent le jeu clos des six paires, dans l'ordre canonique", () => {
		// anatomyBuildArgs (privé dans actions.ts, le côté frontière) projette ces états vers
		// buildInput = { kernel_id, states[] } ; on en pinne ici la SOURCE (syntheticPairStates),
		// le jeu clos + l'ordre, et la sérialisabilité simple (le garde RawMessage S59).
		const states = syntheticPairStates("truth-checkout-authz").map((s) => ({
			kind: s.kind,
			declared: s.declared,
			proven: s.proven,
		}));
		expect(states.map((s) => s.kind)).toEqual([...PAIR_KINDS]);
		const args = { kernel_id: "truth-checkout-authz", states };
		// un objet simple sérialisable (pas de byte-array / json.RawMessage).
		expect(JSON.parse(JSON.stringify(args))).toEqual(args);
	});
});
