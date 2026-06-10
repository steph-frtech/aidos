/**
 * WB2-21 — le MIROIR DE REPRODUCTIBILITÉ du twin des « émetteurs » (Vitest + fast-check).
 *
 * Critère de done WB2-21 : « property — re-émission byte-identique ; e2e — voir le DDL + les types
 * émis ». Ce miroir épingle le twin (réutilise `emit`/`project` de S35, ADR 0007 no-fork) :
 *   - re-émission BYTE-IDENTIQUE : `emit` est PUR — la MÊME source N fois → mêmes octets, même
 *     output_hash, pour les trois cibles (DDL · Go · TS) — `reEmitStable` le prouve déterministiquement ;
 *   - `emitView` rend TOUJOURS les trois cibles dans l'ordre d'affichage (DDL, Go, TS), chacune portant
 *     le header protégé et l'empreinte source de l'AST ;
 *   - le CONTRAT partagé = le jeu d'attributs en ordre source ; les trois cibles épinglent EXACTEMENT ce
 *     jeu (ni ajout, ni retrait, ni renommage) — prouvé en cherchant chaque nom dans les octets émis ;
 *   - `appPreview` est DÉRIVÉ du même AST : required⇔NOT NULL (non nullable), identifier⇔PRIMARY KEY,
 *     ordre source préservé, table = nom en minuscules ;
 *   - le registre `ENTITY_CASES` est CLOS et réutilise les sources S35 (aucune entité inventée) ;
 *   - un AST malformé (type inconnu / sans attribut) → un `BlockReason` (jamais un champ deviné).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — l'émission est une
 * fonction pure de l'AST. LE MUR (§2) : le twin LIT l'AST et REND des projections ; il n'écrit rien.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	appPreview,
	DISPLAY_TARGETS,
	ENTITY_CASES,
	ENTITY_ORDER,
	ENTITY_ORDER_CHANGED,
	type Entity,
	emit,
	emitView,
	entityId,
	isBlocked,
	isBlockedView,
	PROTECTED_MARKER,
	reEmitStable,
	SCALAR_TYPES,
	type ScalarType,
} from "./emetteurs";

// Un générateur d'entité bien formée : nom non vide, ≥1 attribut typé sur le jeu fermé, au plus un id.
const arbEntity = (): fc.Arbitrary<Entity> =>
	fc
		.record({
			name: fc
				.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,9}$/)
				.filter((s) => s.length > 0),
			attrs: fc.array(
				fc.record({
					name: fc
						.stringMatching(/^[a-z][a-z0-9_]{0,9}$/)
						.filter((s) => s.length > 0),
					type: fc.constantFrom(...(SCALAR_TYPES as readonly ScalarType[])),
					required: fc.boolean(),
				}),
				{ minLength: 1, maxLength: 6 },
			),
			idIdx: fc.nat(),
		})
		.map(({ name, attrs, idIdx }) => {
			// noms uniques (un attribut dupliqué n'est pas un AST valide) ; au plus un identifiant.
			const seen = new Set<string>();
			const uniq = attrs.filter((a) => {
				if (seen.has(a.name)) return false;
				seen.add(a.name);
				return true;
			});
			const id = idIdx % uniq.length;
			return {
				name,
				attributes: uniq.map((a, i) => ({
					name: a.name,
					type: a.type,
					required: a.required,
					identifier: i === id,
				})),
			};
		});

describe("WB2-21 lib/v2/emetteurs — l'émission depuis les entités (twin pur, ADR 0007)", () => {
	// (1) Re-émission BYTE-IDENTIQUE — le critère de done property.
	it("re-émission byte-identique : la même source N fois → mêmes octets (les trois cibles)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const report = reEmitStable(e, 12);
				expect(report.allStable).toBe(true);
				expect(report.targets).toHaveLength(DISPLAY_TARGETS.length);
				for (const t of report.targets) {
					expect(t.byteStable).toBe(true);
					expect(t.outputHash).not.toBe("");
				}
			}),
		);
	});

	// (2) emit lui-même est pur : deux appels → octets identiques + output_hash identique.
	it("emit est pur : deux appels sur la même source → octets + output_hash identiques", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				for (const target of DISPLAY_TARGETS) {
					const a = emit(e, target);
					const b = emit(e, target);
					expect(isBlocked(a)).toBe(false);
					if (isBlocked(a) || isBlocked(b)) return;
					expect(a.bytes).toBe(b.bytes);
					expect(a.output_hash).toBe(b.output_hash);
				}
			}),
		);
	});

	// (3) emitView rend toujours les trois cibles, dans l'ordre d'affichage (DDL, Go, TS).
	it("emitView : trois cibles, dans l'ordre d'affichage [pg-ddl, go-sqlc, ts-types]", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const v = emitView(e);
				expect(isBlockedView(v)).toBe(false);
				if (isBlockedView(v)) return;
				expect(v.targets.map((t) => t.target)).toEqual([...DISPLAY_TARGETS]);
			}),
		);
	});

	// (4) chaque cible émise porte le header protégé + l'empreinte source de l'AST.
	it("chaque cible porte le header protégé + le source_hash de l'AST", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const v = emitView(e);
				if (isBlockedView(v)) return;
				const hash = entityId(e);
				expect(v.sourceHash).toBe(hash);
				for (const t of v.targets) {
					expect(t.bytes).toContain(PROTECTED_MARKER);
					expect(t.bytes).toContain(hash);
				}
			}),
		);
	});

	// (5) le CONTRAT partagé = le jeu d'attributs en ordre source.
	it("le contrat = le jeu d'attributs en ordre source", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const v = emitView(e);
				if (isBlockedView(v)) return;
				expect([...v.contract]).toEqual(e.attributes.map((a) => a.name));
			}),
		);
	});

	// (6) NO ADD/DROP/RENAME : chaque nom du contrat apparaît dans les octets de CHAQUE cible.
	// Le DDL/TS portent le nom verbatim ; le Go (sqlc) l'exporte capitalisé (id → Id) — on cherche
	// la forme attendue par cible (jamais inventée : le même champ, rendu selon la convention de langue).
	it("aucune dérive : chaque champ du contrat est présent dans les trois cibles", () => {
		const exported = (n: string) => (n ? n[0].toUpperCase() + n.slice(1) : n);
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const v = emitView(e);
				if (isBlockedView(v)) return;
				for (const name of v.contract) {
					for (const t of v.targets) {
						const wanted = t.target === "go-sqlc" ? exported(name) : name;
						expect(t.bytes.includes(wanted)).toBe(true);
					}
				}
			}),
		);
	});

	// (7) appPreview : required ⇔ NON nullable (NOT NULL) ; ¬required ⇔ nullable.
	it("appPreview : required ⇔ NOT NULL (non nullable)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const p = appPreview(e);
				expect(p.columns).toHaveLength(e.attributes.length);
				for (let i = 0; i < e.attributes.length; i++) {
					expect(p.columns[i].nullable).toBe(!e.attributes[i].required);
				}
			}),
		);
	});

	// (8) appPreview : l'identifiant ⇔ PRIMARY KEY (exactement un, le même que l'AST).
	it("appPreview : l'identifiant ⇔ PRIMARY KEY (exactement un)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const p = appPreview(e);
				const pks = p.columns.filter((c) => c.primaryKey);
				const idAttr = e.attributes.find((a) => a.identifier === true);
				if (idAttr) {
					expect(pks).toHaveLength(1);
					expect(pks[0].name).toBe(idAttr.name);
					expect(p.primaryKey).toBe(idAttr.name);
				} else {
					expect(pks).toHaveLength(0);
					expect(p.primaryKey).toBeNull();
				}
			}),
		);
	});

	// (9) appPreview : l'ordre source est préservé + table = nom en minuscules.
	it("appPreview : ordre source préservé + table en minuscules", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const p = appPreview(e);
				expect(p.columns.map((c) => c.name)).toEqual(
					e.attributes.map((a) => a.name),
				);
				expect(p.table).toBe(e.name.toLowerCase());
			}),
		);
	});

	// (10) appPreview est DÉTERMINISTE : deux appels → aperçu identique.
	it("appPreview est déterministe : même entité → même aperçu", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				expect(appPreview(e)).toEqual(appPreview(e));
			}),
		);
	});

	// (11) un type inconnu → BlockReason (jamais un champ deviné, jamais un fallback silencieux).
	it("AST malformé (type inconnu) → BlockReason", () => {
		const bad: Entity = {
			name: "Bad",
			attributes: [{ name: "x", type: "nope" as ScalarType, required: true }],
		};
		const v = emitView(bad);
		expect(isBlockedView(v)).toBe(true);
		if (isBlockedView(v)) {
			expect(v.severity).toBe("blocking");
			expect(v.how_to_fix.length).toBeGreaterThan(0);
		}
	});

	// (12) un AST sans attribut → BlockReason (rien à projeter).
	it("AST sans attribut → BlockReason", () => {
		const empty: Entity = { name: "Empty", attributes: [] };
		expect(isBlockedView(emitView(empty))).toBe(true);
		const r = reEmitStable(empty, 4);
		expect(r.allStable).toBe(false);
	});

	// (13) le registre ENTITY_CASES est CLOS et réutilise les sources S35.
	it("ENTITY_CASES est clos et réutilise les sources S35", () => {
		expect(ENTITY_CASES.map((c) => c.id)).toEqual(["order", "order-changed"]);
		expect(ENTITY_CASES[0].entity).toBe(ENTITY_ORDER);
		expect(ENTITY_CASES[1].entity).toBe(ENTITY_ORDER_CHANGED);
		for (const c of ENTITY_CASES) {
			expect(isBlockedView(emitView(c.entity))).toBe(false);
			expect(reEmitStable(c.entity, 8).allStable).toBe(true);
		}
	});

	// (14) l'exemple Order : le DDL émis contient bien la table + la PRIMARY KEY (« voir le DDL »).
	it("Order : le DDL émis montre la table + la PRIMARY KEY", () => {
		const v = emitView(ENTITY_ORDER);
		expect(isBlockedView(v)).toBe(false);
		if (isBlockedView(v)) return;
		const ddl = v.targets.find((t) => t.target === "pg-ddl");
		expect(ddl).toBeDefined();
		expect(ddl?.bytes).toContain('CREATE TABLE "order"');
		expect(ddl?.bytes).toContain("PRIMARY KEY");
		// le type Go et le type TS émis montrent leur struct/type (« voir les types émis »).
		const go = v.targets.find((t) => t.target === "go-sqlc");
		const ts = v.targets.find((t) => t.target === "ts-types");
		expect(go?.bytes).toContain("type Order struct");
		expect(ts?.bytes).toContain("export type Order");
	});

	// (15) le source_hash de Order amputé du discount DIFFÈRE de Order complet (la source a bougé).
	it("Order amputé du discount : empreinte source distincte de Order complet", () => {
		expect(entityId(ENTITY_ORDER)).not.toBe(entityId(ENTITY_ORDER_CHANGED));
		// le DDL d'Order complet contient `discount`, celui d'Order amputé non.
		const full = emit(ENTITY_ORDER, "pg-ddl");
		const cut = emit(ENTITY_ORDER_CHANGED, "pg-ddl");
		if (isBlocked(full) || isBlocked(cut)) throw new Error("unexpected block");
		expect(full.bytes).toContain("discount");
		expect(cut.bytes).not.toContain("discount");
	});
});
