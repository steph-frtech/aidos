/**
 * WB2-08 — le MIROIR DE REPRODUCTIBILITÉ du twin des SIX LIENS §17/§41 (lib/v2/links).
 * mirror record: reflects=WB2-08-links, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) épinglent les critères de done :
 *   - PINNING (le critère cardinal §41) : TOUT lien pointe une VERSION (`id@version`), JAMAIS une
 *     identité nue — `validate` accepte ssi (kind ∈ jeu clos ∧ from,to pinnés), refuse un `to` nu ;
 *   - le graphe canonique est TOTALEMENT pinné (allLinksPinned) — aucun lien vers une identité ;
 *   - FILTRE par type : un sous-ensemble EXACT du graphe (tous les liens du filtre, eux seuls) ;
 *   - le jeu de familles est CLOS (six familles), le filtre d'un kind inconnu rend zéro lien ;
 *   - DÉTERMINISME : même graphe → même graphe (sérialisation stable), même filtre, même compte.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	allLinksPinned,
	countByKind,
	filterByKind,
	isPinned,
	kindToCanon,
	LINK_KINDS,
	type Link,
	type Ref,
	refString,
	syntheticLinkGraph,
	validate,
} from "./links";

/** Un générateur de refs : id/version éventuellement vides (pour sonder le pinning). */
const arbRef: fc.Arbitrary<Ref> = fc.record({
	id: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 6 })),
	version: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 4 })),
});

/** Un générateur de liens : kind éventuellement hors jeu clos, refs éventuellement non pinnées. */
const arbLink: fc.Arbitrary<Link> = fc.record({
	kind: fc.oneof(
		fc.constantFrom(...LINK_KINDS),
		fc.string({ minLength: 1, maxLength: 8 }),
	),
	from: arbRef,
	to: arbRef,
});

describe("WB2-08 · twin des six liens §17/§41 — miroir de reproductibilité", () => {
	it("PINNING (§41) : validate accepte un lien ssi kind ∈ jeu clos ∧ from,to pinnés ; un to nu est refusé", () => {
		fc.assert(
			fc.property(arbLink, (l) => {
				const err = validate(l);
				const known = (LINK_KINDS as readonly string[]).includes(l.kind);
				const ok = known && isPinned(l.from) && isPinned(l.to);
				if (ok) {
					expect(err).toBe("");
				} else {
					expect(err).not.toBe("");
				}
			}),
		);
	});

	it("un lien vers une identité NUE (to sans version) est TOUJOURS refusé — jamais évalué comme valide", () => {
		fc.assert(
			fc.property(fc.constantFrom(...LINK_KINDS), (kind) => {
				const l: Link = {
					kind,
					from: { id: "k", version: "v1" },
					to: { id: "cible", version: "" }, // identité nue : pas de @version
				};
				expect(validate(l)).not.toBe("");
			}),
		);
	});

	it("le graphe canonique est TOTALEMENT pinné : tout lien pointe une version, jamais une identité", () => {
		const g = syntheticLinkGraph();
		expect(allLinksPinned(g)).toBe(true);
		// chaque lien valide selon la règle §41
		for (const l of g.links) {
			expect(validate(l)).toBe("");
		}
		// au moins une famille de chaque type présente (les six familles existent)
		const counts = countByKind(g);
		for (const k of LINK_KINDS) {
			expect(counts[k]).toBeGreaterThan(0);
		}
	});

	it("FILTRE par type : un sous-ensemble EXACT — tous les liens du filtre, eux seuls", () => {
		const g = syntheticLinkGraph();
		for (const k of LINK_KINDS) {
			const sub = filterByKind(g, k);
			// tous les liens du sous-graphe sont de la famille k
			expect(sub.links.every((l) => l.kind === k)).toBe(true);
			// aucun lien de la famille k n'est perdu
			expect(sub.links.length).toBe(g.links.filter((l) => l.kind === k).length);
			// les nœuds (le repère) sont conservés
			expect(sub.nodes).toEqual(g.nodes);
		}
		// la somme des filtres = tous les liens (partition exacte, aucune perte/duplication)
		const reassembled = LINK_KINDS.flatMap((k) => filterByKind(g, k).links);
		expect(reassembled.length).toBe(g.links.length);
	});

	it("le jeu de familles est CLOS : filtrer un kind inconnu rend zéro lien (jamais une erreur)", () => {
		const g = syntheticLinkGraph();
		expect(filterByKind(g, "depends-on-typo").links).toEqual([]);
		expect(filterByKind(g, "").links).toEqual([]);
	});

	it("DÉTERMINISME : même graphe → même sérialisation, même filtre, même compte à chaque appel", () => {
		const a = syntheticLinkGraph();
		const b = syntheticLinkGraph();
		expect(JSON.stringify(b)).toBe(JSON.stringify(a));
		for (const k of LINK_KINDS) {
			expect(JSON.stringify(filterByKind(b, k))).toBe(
				JSON.stringify(filterByKind(a, k)),
			);
		}
		expect(countByKind(b)).toEqual(countByKind(a));
	});

	it("kindToCanon : chaque famille V2 mappe ≥1 kind canonique S17 (le jeu reste clos)", () => {
		for (const k of LINK_KINDS) {
			const canon = kindToCanon(k);
			expect(canon.length).toBeGreaterThan(0);
		}
		// triggers_binds mappe les deux kinds canoniques triggers + binds
		expect(kindToCanon("triggers_binds")).toEqual(["triggers", "binds"]);
	});

	it("refString : la forme canonique id@version", () => {
		expect(refString({ id: "create-order", version: "v3" })).toBe(
			"create-order@v3",
		);
	});
});
