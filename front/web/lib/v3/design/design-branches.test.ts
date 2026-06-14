/**
 * Design Lab — le MIROIR DE REPRODUCTIBILITÉ des BRANCHES DE DESIGN (Tranche 5, ADR 0071 §5) : les
 * branches/checkpoints Onlook MAPPÉS sur le VERSION DAG S24 (KRD §120-§125).
 *   reflects: front.v3.design.design-branches (le twin des branches de design = délégation au DAG S24)
 *   · test_kind: property · cert_language: fast-check/vitest · authority: below (projection, le mur intact)
 *   · liveness: live
 *
 * Le twin est PUR & DÉTERMINISTE & TOTAL : il DÉLÈGUE au twin S24 (lib/v2/version-dag) — il ne
 * réinvente NI la navigation NI la propagation NI le merge (CLAUDE.md §6, réutilise ne réinvente pas).
 * Ces propriétés (fast-check) épinglent les critères de done :
 *   (a) SEED déterministe : même seed → même DAG, même rootId content-adressé (versionHash) ;
 *   (b) FOLD append-only : plier N captures → N nœuds de plus (la ligne avance), aucune supprimée ;
 *       même (captures) → même DAG (déterminisme) ; la tête est la dernière capture ;
 *   (c) BRANCH : ouvre une ligne alternative (un nœud de plus, append-only), `fromId` jamais supprimé ;
 *   (d) FORK = checkout(ancêtre) + rebranch : l'ancienne ligne RESTE (append-only §123), un nœud de
 *       plus, et la tête revient sur la nouvelle ligne forkée depuis l'ancêtre ;
 *   (e) RESTORE = checkout : un simple head-flag move ARRIÈRE — AUCUN nœud/arête supprimé, la tête
 *       devient le checkpoint restauré ;
 *   (f) TOTALITÉ : un mouvement sur une ref inconnue → DAG inchangé (jamais un crash, jamais un faux) ;
 *   (g) le DAG reste ACYCLIQUE et TOPO-cohérent pour toute séquence (le twin S24 le garantit) ;
 *   (h) mergeReadiness : ≥2 têtes (deux lignes parallèles) ⟺ canMerge (la lisibilité du §122).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type VersionDag,
	validateDag,
	versionHash,
} from "../../v2/version-dag";
import {
	applyDesignMove,
	buildDesignDag,
	captureStepLabel,
	currentHead,
	DESIGN_BRANCH_MOVES,
	DESIGN_ROOT_LABEL,
	type DesignCapture,
	forkFromPoint,
	listCheckpoints,
	mergeReadiness,
	openDesignBranch,
	restoreCheckpoint,
	seedDesignDag,
} from "./design-branches";

function serialize(dag: VersionDag): string {
	return JSON.stringify(dag);
}

/** Une capture de design arbitraire (id content-adressé + libellé) — l'entrée du pli. */
function captureArb(): fc.Arbitrary<DesignCapture> {
	return fc.record({
		captureId: fc.string({ minLength: 1, maxLength: 12 }).map((h) => `sd:${h}`),
		label: fc.string({ minLength: 1, maxLength: 12 }),
	});
}

describe("(a) seedDesignDag — le seed déterministe (la maître = la racine content-adressée)", () => {
	it("seed un unique nœud racine, head, above, sans parent — content-adressé (versionHash)", () => {
		const { dag, rootId } = seedDesignDag();
		expect(dag.nodes).toHaveLength(1);
		expect(dag.edges).toHaveLength(0);
		const root = dag.nodes[0];
		expect(root.id).toBe(versionHash(DESIGN_ROOT_LABEL, [], "above"));
		expect(root.id).toBe(rootId);
		expect(root.label).toBe(DESIGN_ROOT_LABEL);
		expect(root.parentIds).toHaveLength(0);
		expect(root.head).toBe(true);
		expect(root.stratum).toBe("above");
	});

	it("le seed est DÉTERMINISTE (même seed → même DAG byte-pour-byte)", () => {
		expect(serialize(seedDesignDag().dag)).toBe(serialize(seedDesignDag().dag));
	});

	it("le seed est un DAG VALIDE (acyclique, ≥1 tête, aucune erreur)", () => {
		expect(validateDag(seedDesignDag().dag)).toEqual([]);
	});
});

describe("(b) foldCaptures / buildDesignDag — le pli append-only (la ligne avance, déterministe)", () => {
	it("∀ captures — plier N captures ajoute EXACTEMENT N nœuds + N arêtes (append-only, croît)", () => {
		fc.assert(
			fc.property(fc.array(captureArb(), { maxLength: 10 }), (captures) => {
				const { dag } = buildDesignDag(captures);
				// 1 racine + N pas ; N arêtes (chaque capture = un ChangeSet S20).
				expect(dag.nodes.length).toBe(1 + captures.length);
				expect(dag.edges.length).toBe(captures.length);
				// chaque arête réutilise l'id de la capture (le ChangeSet = la capture, S20).
				const changesets = dag.edges.map((e) => e.changeset);
				for (const c of captures) expect(changesets).toContain(c.captureId);
			}),
		);
	});

	it("∀ captures — le DAG plié reste VALIDE (acyclique, ≥1 tête)", () => {
		fc.assert(
			fc.property(fc.array(captureArb(), { maxLength: 10 }), (captures) => {
				expect(validateDag(buildDesignDag(captures).dag)).toEqual([]);
			}),
		);
	});

	it("∀ captures — le pli est DÉTERMINISTE (même captures → même DAG)", () => {
		fc.assert(
			fc.property(fc.array(captureArb(), { maxLength: 8 }), (captures) => {
				expect(serialize(buildDesignDag(captures).dag)).toBe(
					serialize(buildDesignDag(captures).dag),
				);
			}),
		);
	});

	it("∀ captures non vides — la TÊTE est le DERNIER pas (la ligne courante avance)", () => {
		fc.assert(
			fc.property(
				fc.array(captureArb(), { minLength: 1, maxLength: 8 }),
				(captures) => {
					const { dag } = buildDesignDag(captures);
					const head = currentHead(dag);
					expect(head).not.toBeNull();
					expect(head?.label).toBe(captureStepLabel(captures.length));
				},
			),
		);
	});

	it("la RACINE n'est jamais supprimée par le pli (append-only §120)", () => {
		fc.assert(
			fc.property(fc.array(captureArb(), { maxLength: 8 }), (captures) => {
				const { dag, rootId } = buildDesignDag(captures);
				expect(dag.nodes.some((n) => n.id === rootId)).toBe(true);
			}),
		);
	});
});

describe("(c) openDesignBranch — une ligne alternative (append-only, fromId jamais supprimé)", () => {
	it("ouvre une branche depuis la racine : un nœud de plus, la racine reste, la tête bouge", () => {
		const { dag, rootId } = seedDesignDag();
		const branched = openDesignBranch(dag, rootId, "variante-a", "cs:1");
		expect(branched.nodes.length).toBe(dag.nodes.length + 1);
		expect(branched.nodes.some((n) => n.id === rootId)).toBe(true); // append-only
		// la nouvelle ligne est la tête ; la racine n'est plus la tête (le head a bougé).
		const head = currentHead(branched);
		expect(head?.label).toBe("variante-a");
	});

	it("brancher reste un DAG VALIDE", () => {
		const { dag, rootId } = seedDesignDag();
		expect(validateDag(openDesignBranch(dag, rootId, "v", "cs:1"))).toEqual([]);
	});
});

describe("(d) forkFromPoint — checkout(ancêtre) + rebranch : l'ancienne ligne RESTE (§121/§123)", () => {
	it("forker depuis un ANCIEN point : l'ancienne ligne reste, une nouvelle ligne forkée naît", () => {
		// design-base → design-1 → design-2 ; on forke depuis design-1 (un ancien point).
		const captures: DesignCapture[] = [
			{ captureId: "sd:aaaa", label: "c1" },
			{ captureId: "sd:bbbb", label: "c2" },
		];
		const { dag } = buildDesignDag(captures);
		const ancestor = dag.nodes.find((n) => n.label === captureStepLabel(1));
		expect(ancestor).toBeDefined();
		const beforeCount = dag.nodes.length;

		const forked = forkFromPoint(
			dag,
			ancestor?.id ?? "",
			"variante-depuis-1",
			"cs:fork",
		);
		// APPEND-ONLY : l'ancienne ligne (design-2) reste DESSINÉE, jamais supprimée.
		expect(forked.nodes.length).toBe(beforeCount + 1);
		expect(forked.nodes.some((n) => n.label === captureStepLabel(2))).toBe(
			true,
		);
		// la TÊTE est la nouvelle ligne forkée depuis l'ancêtre.
		const head = currentHead(forked);
		expect(head?.label).toBe("variante-depuis-1");
		expect(head?.parentIds).toContain(ancestor?.id);
		// reste un DAG valide (acyclique).
		expect(validateDag(forked)).toEqual([]);
	});
});

describe("(e) restoreCheckpoint — un head-flag move ARRIÈRE (rien supprimé, §120)", () => {
	it("restaurer un ancien checkpoint : la tête y revient, AUCUN nœud/arête supprimé", () => {
		const captures: DesignCapture[] = [
			{ captureId: "sd:1111", label: "c1" },
			{ captureId: "sd:2222", label: "c2" },
		];
		const { dag } = buildDesignDag(captures);
		const cp1 = dag.nodes.find((n) => n.label === captureStepLabel(1));
		const restored = restoreCheckpoint(dag, cp1?.id ?? "");
		// head-flag move : AUCUN nœud ni arête supprimé (append-only).
		expect(restored.nodes.length).toBe(dag.nodes.length);
		expect(restored.edges.length).toBe(dag.edges.length);
		// la tête est le checkpoint restauré ; exactement UNE tête (un restore, pas un fork).
		expect(currentHead(restored)?.id).toBe(cp1?.id);
		expect(restored.nodes.filter((n) => n.head).length).toBe(1);
	});
});

describe("(f) totalité — un mouvement sur une ref INCONNUE → DAG inchangé (fail-closed, jamais crash)", () => {
	it("∀ mouvement, ref inconnue → DAG byte-identique (totalité)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...DESIGN_BRANCH_MOVES),
				fc.string({ maxLength: 8 }),
				(move, label) => {
					const { dag } = buildDesignDag([{ captureId: "sd:x", label: "c" }]);
					const out = applyDesignMove(
						dag,
						move,
						"ref-inexistante",
						label,
						"cs",
					);
					expect(serialize(out)).toBe(serialize(dag));
				},
			),
		);
	});
});

describe("(g) listCheckpoints — la projection topo-triée (un parent précède son enfant)", () => {
	it("∀ captures — listCheckpoints expose 1+N checkpoints, la racine en premier, rang croissant", () => {
		fc.assert(
			fc.property(
				fc.array(captureArb(), { minLength: 1, maxLength: 8 }),
				(captures) => {
					const { dag, rootId } = buildDesignDag(captures);
					const cps = listCheckpoints(dag);
					expect(cps.length).toBe(1 + captures.length);
					// la racine est le premier (rang 0) checkpoint topologique.
					expect(cps[0].id).toBe(rootId);
					expect(cps[0].isRoot).toBe(true);
					// rangs croissants (0,1,2,…) — l'ordre déterministe de pose à l'écran.
					for (let i = 0; i < cps.length; i++) expect(cps[i].rank).toBe(i);
					// EXACTEMENT un checkpoint « head » (une seule ligne après un pli pur).
					expect(cps.filter((c) => c.head).length).toBe(1);
				},
			),
		);
	});
});

describe("(h) mergeReadiness — ≥2 POINTES divergentes ⟺ canMerge (la lisibilité §122, jamais l'auto-merge)", () => {
	it("une seule ligne → PAS de merge ; un FORK crée 2 pointes divergentes → canMerge", () => {
		// design-base → design-1 → design-2 : UNE seule pointe (design-2), rien à merger.
		const { dag } = buildDesignDag([
			{ captureId: "sd:1", label: "c1" },
			{ captureId: "sd:2", label: "c2" },
		]);
		expect(mergeReadiness(dag).canMerge).toBe(false);

		// On FORKE depuis design-1 (un ancien point) : l'ancienne ligne (design-2) reste une POINTE,
		// la nouvelle ligne forkée en est une AUTRE — deux lignes de design divergentes à réconcilier.
		const ancestor = dag.nodes.find((n) => n.label === captureStepLabel(1));
		const forked = forkFromPoint(
			dag,
			ancestor?.id ?? "",
			"variante",
			"cs:fork",
		);
		const mr = mergeReadiness(forked);
		expect(mr.tips.length).toBeGreaterThanOrEqual(2);
		expect(mr.canMerge).toBe(true);
		// design-2 (l'ancienne pointe) ET la variante forkée sont toutes deux des pointes.
		const tipLabels = mr.tips.map((t) => t.label);
		expect(tipLabels).toContain(captureStepLabel(2));
		expect(tipLabels).toContain("variante");
	});
});
