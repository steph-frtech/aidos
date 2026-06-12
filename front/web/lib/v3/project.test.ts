import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bareTree } from "../v2/composition";
import {
	type ProjectRecord,
	parseProject,
	projectSlug,
	serializeProject,
	sortProjects,
} from "./project";
import { replayTo } from "./session";

/**
 * V3 — le MIROIR du PROJET PERSISTANT (ADR 0061) : « créer une app crée un PROJET
 * qu'on rouvre avec tout l'historique, partout, même état ».
 *
 * Le projet ne stocke JAMAIS l'état : il stocke le TRANSCRIPT (la seule vérité,
 * event-sourcing) + les réponses conversationnelles (décoration). Rouvrir = parser
 * puis REJOUER — le même état partout est une CONSÉQUENCE (replayTo est déjà prouvé
 * déterministe), pas une synchronisation. Lois : aller-retour sans perte, parse
 * fail-closed (jamais une invention), slug stable, tri déterministe.
 */

const recordArb: fc.Arbitrary<ProjectRecord> = fc.record({
	id: fc.stringMatching(/^[a-z0-9-]{1,24}$/),
	name: fc.string({ minLength: 1, maxLength: 40 }),
	transcript: fc.array(fc.string({ maxLength: 60 }), { maxLength: 10 }),
	replies: fc.dictionary(
		fc.nat({ max: 9 }).map(String),
		fc.string({ maxLength: 80 }),
		{ maxKeys: 4 },
	),
	savedAt: fc.nat({ max: 2_000_000_000 }),
});

describe("serializeProject / parseProject — l'aller-retour SANS PERTE", () => {
	it("∀ projet : parse(serialize(p)) ≡ p (le transcript, les réponses, tout)", () => {
		fc.assert(
			fc.property(recordArb, (p) => {
				expect(parseProject(serializeProject(p))).toEqual(p);
			}),
		);
	});

	it("∀ projet : ROUVRIR = REJOUER LE MÊME ÉTAT (la composition avec replayTo)", () => {
		fc.assert(
			fc.property(recordArb, (p) => {
				const back = parseProject(serializeProject(p));
				expect(back).not.toBeNull();
				if (back === null) throw new Error("unreachable");
				expect(
					replayTo(back.transcript, back.transcript.length, [], bareTree()),
				).toEqual(replayTo(p.transcript, p.transcript.length, [], bareTree()));
			}),
		);
	});

	it("parse est TOTAL et FAIL-CLOSED : du bruit → null, jamais une invention", () => {
		expect(parseProject("")).toBeNull();
		expect(parseProject("@@@")).toBeNull();
		expect(parseProject("{}")).toBeNull();
		expect(parseProject('{"id":3}')).toBeNull();
		expect(
			parseProject('{"id":"x","name":"n","transcript":["a",5]}'),
		).toBeNull(); // un transcript non-textuel est refusé
	});
});

describe("projectSlug / sortProjects — identité et ordre déterministes", () => {
	it("le slug est stable, ascii, non vide pour un nom non vide", () => {
		expect(projectSlug("Ma boutique en ligne !")).toBe("ma-boutique-en-ligne");
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 40 }), (n) => {
				const s = projectSlug(n);
				expect(s).toMatch(/^[a-z0-9-]*$/);
				expect(projectSlug(n)).toBe(s);
			}),
		);
	});

	it("le tri est déterministe : le plus récemment sauvé d'abord, départage par id", () => {
		fc.assert(
			fc.property(fc.array(recordArb, { maxLength: 6 }), (ps) => {
				const a = sortProjects(ps);
				expect(a).toEqual(sortProjects([...ps].reverse()));
				for (let i = 1; i < a.length; i++) {
					const prev = a[i - 1];
					const cur = a[i];
					expect(
						prev.savedAt > cur.savedAt ||
							(prev.savedAt === cur.savedAt && prev.id <= cur.id),
					).toBe(true);
				}
			}),
		);
	});
});
