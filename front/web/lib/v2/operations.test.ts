/**
 * WB2-12 — le MIROIR DE REPRODUCTIBILITÉ du twin des fixtures Operation DSL (Vitest + fast-check).
 *
 * Critère de done WB2-12 : « twin — l'interpréteur de fixture est PUR (mêmes commandes → mêmes events) ».
 * Ce miroir l'épingle par property + fixtures :
 *   - rejeu DÉTERMINISTE : frames(fixture) deux fois → frames byte-identiques (events, kinds, ordre) ;
 *   - la dernière frame porte EXACTEMENT les events attendus (createOrder/happy → [OrderCreated, CartCleared]) ;
 *   - un authorize DENY court-circuite : aucune frame n'émet d'event, la frame du authorize est `denied`,
 *     c'est la dernière (createOrder/denied → []) ;
 *   - les events sont CUMULATIFS et MONOTONES le long des frames (jamais un event ne disparaît) ;
 *   - le graphe d'états est déterministe & cohérent (|nodes| = |frames|, |edges| = |frames|−1, ids stables) ;
 *   - le verdict est CALCULÉ (pass ssi events == expected dans l'ordre) ;
 *   - le routage slug↔id est une bijection (fixtureSlug ∘ fixtureBySlug = id ; pas de « / » dans le slug).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — tout est pur.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CREATE_ORDER_DENIED,
	CREATE_ORDER_HAPPY,
	FIXTURES,
	fixtureBySlug,
	fixtureSlug,
	fixtureSlugs,
	frames,
	type OperationFixture,
	stateGraph,
	verdict,
} from "./operations";

const ALL: OperationFixture[] = Object.values(FIXTURES);

describe("WB2-12 frames — rejeu pas-à-pas pur & déterministe", () => {
	it("rejouer deux fois donne la MÊME suite de frames (déterminisme — mêmes commandes → mêmes events)", () => {
		for (const f of ALL) {
			expect(frames(f)).toEqual(frames(f));
		}
	});

	it("la première frame est l'état initial (idle, aucun event, index −1)", () => {
		for (const f of ALL) {
			const fs = frames(f);
			expect(fs[0]).toMatchObject({ index: -1, kind: "idle", events: [] });
		}
	});

	it("createOrder/happy émet, dans l'ordre, [OrderCreated, CartCleared] à la dernière frame", () => {
		const fs = frames(CREATE_ORDER_HAPPY);
		const last = fs[fs.length - 1];
		expect(last.done).toBe(true);
		expect(last.kind).toBe("done");
		expect(last.events).toEqual(["OrderCreated", "CartCleared"]);
	});

	it("un authorize DENY court-circuite : aucun event, la frame authorize est `denied` et c'est la dernière", () => {
		const fs = frames(CREATE_ORDER_DENIED);
		const last = fs[fs.length - 1];
		expect(last.kind).toBe("denied");
		expect(last.done).toBe(true);
		expect(last.command).toContain("authorize");
		// aucune frame n'émet d'event sur le chemin refusé.
		for (const fr of fs) expect(fr.events).toEqual([]);
	});

	it("les events sont CUMULATIFS et MONOTONES le long des frames (jamais un event ne disparaît)", () => {
		for (const f of ALL) {
			const fs = frames(f);
			for (let i = 1; i < fs.length; i++) {
				const prev = fs[i - 1].events;
				const cur = fs[i].events;
				expect(cur.length).toBeGreaterThanOrEqual(prev.length);
				// le préfixe est conservé (cumul, jamais une réécriture).
				expect(cur.slice(0, prev.length)).toEqual(prev);
			}
		}
	});

	it("PROPERTY : pour toute fixture du registre, le rejeu est idempotent (frame-par-frame identique)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...ALL), (f) => {
				const a = frames(f);
				const b = frames(f);
				return JSON.stringify(a) === JSON.stringify(b);
			}),
		);
	});
});

describe("WB2-12 stateGraph — graphe d'états React Flow, pur & cohérent", () => {
	it("|nodes| = |frames| et |edges| = |frames|−1 (une arête par transition)", () => {
		for (const f of ALL) {
			const fs = frames(f);
			const g = stateGraph(f);
			expect(g.nodes.length).toBe(fs.length);
			expect(g.edges.length).toBe(fs.length - 1);
		}
	});

	it("les ids de nœuds sont stables & déterministes (s-1, s0, …) ; les arêtes relient des nœuds existants", () => {
		for (const f of ALL) {
			const g = stateGraph(f);
			expect(g).toEqual(stateGraph(f)); // déterministe
			const ids = new Set(g.nodes.map((n) => n.id));
			expect(g.nodes[0].id).toBe("s-1");
			for (const e of g.edges) {
				expect(ids.has(e.source)).toBe(true);
				expect(ids.has(e.target)).toBe(true);
			}
		}
	});

	it("le dernier nœud reflète le verdict de la fixture (done pour happy, denied pour denied)", () => {
		expect(stateGraph(CREATE_ORDER_HAPPY).nodes.at(-1)?.kind).toBe("done");
		expect(stateGraph(CREATE_ORDER_DENIED).nodes.at(-1)?.kind).toBe("denied");
	});
});

describe("WB2-12 verdict — calculé, jamais déclaré", () => {
	it("createOrder/happy PASSE (events == expected dans l'ordre)", () => {
		const v = verdict(CREATE_ORDER_HAPPY);
		expect(v.pass).toBe(true);
		expect(v.events).toEqual(["OrderCreated", "CartCleared"]);
	});

	it("createOrder/denied PASSE aussi (le refus est le comportement attendu : aucun event)", () => {
		const v = verdict(CREATE_ORDER_DENIED);
		expect(v.pass).toBe(true);
		expect(v.events).toEqual([]);
	});
});

describe("WB2-12 routage slug ↔ id — bijection, totalité", () => {
	it("fixtureBySlug ∘ fixtureSlug = la fixture (round-trip)", () => {
		for (const f of ALL) {
			expect(fixtureBySlug(fixtureSlug(f.id))?.id).toBe(f.id);
		}
	});

	it("aucun slug ne contient « / » (un « / » casse le segment de route)", () => {
		for (const s of fixtureSlugs()) expect(s.includes("/")).toBe(false);
	});

	it("un slug inconnu → undefined (totalité : seules les fixtures déclarées existent)", () => {
		expect(fixtureBySlug("inconnu--fixture")).toBeUndefined();
	});
});
