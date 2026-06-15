import { describe, expect, it } from "vitest";
import { applyIntent, initBuilderState } from "../v2/builder";
import { bareTree } from "../v2/composition";
import { gridOf, STACK_SPECS, specsOf, specsWithStack } from "./specs";

/**
 * V3 — le MIROIR de la VUE SPÉCIFICATIONS (ADR 0062) : « une vue où on voit les
 * spec » + « voir dans la GRILLE les impacts, les contrôler, voir les scénarios ».
 * Les specs du projet (idées + kernels + leur statut de déploiement) projetées
 * sur la grille niveau × facette — une PROJECTION PURE, comptes conservés.
 */

function richState() {
	let st = initBuilderState([], bareTree());
	st = applyIntent(st, "greffe le paiement sous app").state;
	st = applyIntent(
		st,
		"capture l'idée : au paiement, débiter une seule fois",
	).state;
	st = applyIntent(st, "promeus la dernière idée").state;
	st = applyIntent(
		st,
		"capture l'idée : lister les produits du catalogue",
	).state;
	return st;
}

describe("specsOf — chaque vérité du projet, avec son statut calculé", () => {
	it("une ligne par idée ; le statut suit le cycle (idee → kernel → l'env le plus haut)", () => {
		let st = richState();
		const before = specsOf(st);
		expect(before).toHaveLength(2);
		const promoted = before.find((s) => s.status === "kernel");
		const pending = before.find((s) => s.status === "idee");
		expect(promoted).toBeDefined();
		expect(pending).toBeDefined();
		expect(promoted?.mirrorForm).not.toBeNull();
		// après dev+staging+prod, la spec promue est « prod »
		st = applyIntent(st, "déploie l'application en dev").state;
		st = applyIntent(st, "déploie l'application en staging").state;
		st = applyIntent(st, "déploie l'application en prod").state;
		const after = specsOf(st);
		expect(after.find((s) => s.id === promoted?.id)?.status).toBe("prod");
		expect(after.find((s) => s.id === pending?.id)?.status).toBe("idee");
	});

	it("DÉTERMINISTE : même état → mêmes lignes", () => {
		const st = richState();
		expect(specsOf(st)).toEqual(specsOf(st));
	});
});

describe("ADR 0076 — le SUBSTRAT GELÉ est une spec dès la création", () => {
	it("un projet NEUF (transcript vide) a déjà ses specs de pile, jamais 0", () => {
		const fresh = initBuilderState([], bareTree());
		expect(specsOf(fresh)).toHaveLength(0); // aucune idée encore
		const withStack = specsWithStack(fresh);
		expect(withStack.length).toBe(STACK_SPECS.length); // … mais la pile gelée est là
		expect(withStack.length).toBeGreaterThanOrEqual(9);
		// la grille d'un projet neuf est DÉJÀ peuplée (plus de « 0 partout »).
		const grid = gridOf(withStack);
		expect(grid.reduce((n, c) => n + c.specIds.length, 0)).toBe(
			STACK_SPECS.length,
		);
		// les composants clés du substrat gelé (ADR 0003) sont présents.
		const keys = STACK_SPECS.map((s) => s.id);
		for (const k of [
			"stack:app",
			"stack:api",
			"stack:db",
			"stack:auth",
			"stack:telemetry",
		]) {
			expect(keys).toContain(k);
		}
	});

	it("specsWithStack PRÉFIXE le substrat aux specs de conversation (additif, déterministe)", () => {
		const st = richState();
		const ws = specsWithStack(st);
		expect(ws).toEqual([...STACK_SPECS, ...specsOf(st)]);
		expect(specsWithStack(st)).toEqual(specsWithStack(st)); // déterministe
		// chaque spec de pile a une coordonnée valide + statut kernel (gelé).
		for (const s of STACK_SPECS) {
			expect(s.status).toBe("kernel");
			expect(s.level.length).toBeGreaterThan(0);
			expect(s.facet.length).toBe(1);
		}
	});
});

describe("gridOf — la grille niveau × facette, comptes CONSERVÉS", () => {
	it("Σ des cellules = le nombre de specs (jamais une perte, jamais une invention)", () => {
		const rows = specsOf(richState());
		const grid = gridOf(rows);
		const total = grid.reduce((n, c) => n + c.specIds.length, 0);
		expect(total).toBe(rows.length);
		for (const c of grid) {
			expect(c.specIds.length).toBeGreaterThan(0);
			for (const id of c.specIds)
				expect(rows.some((r) => r.id === id)).toBe(true);
		}
	});

	it("les cellules IMPACTÉES par un tour se retrouvent (l'id de spec suffit)", () => {
		const st = richState();
		const r = applyIntent(st, "promeus la dernière idée");
		const touched = r.impacts
			.filter((i) => i.type === "idee")
			.map((i) => i.cible);
		const grid = gridOf(specsOf(r.state));
		for (const id of touched)
			expect(grid.some((c) => c.specIds.includes(id))).toBe(true);
	});
});
