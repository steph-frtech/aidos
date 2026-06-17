import { describe, expect, it } from "vitest";
import {
	canonGraph,
	demoLinksView,
	gatewayGraphArgs,
} from "../../../lib/v2/links-data";
import { linksGraphDecoder } from "./live";

/**
 * /v3/liens live read — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; lot kill-twins
 * ADR 0092).
 *
 * Il prouve que `linksGraphDecoder` décode un ÉCHANTILLON de la sortie de l'outil Go `links_graph`
 * (linksrv.graphOutput : `{ ok, links:[{kind,from,to,valid,status,error}], all_pinned, green,
 * stale, absent }`, snake_case) — le CONTRAT du tool, PAS une seconde implémentation de la
 * validation/résolution des liens (back/kernel/links.Validate/Resolve reste la source unique : le
 * Go juge le statut green|stale|absent §41–§42). Il pinne aussi que `gatewayGraphArgs` projette le
 * graphe CANONIQUE vers l'objet d'arguments exact (graphInput : `{ links, heads }`), un objet
 * SIMPLE (pas de json.RawMessage — le garde du scar S59).
 *
 * Et il prouve la PARITÉ DU REPLI : `demoLinksView` (le repli-démo, calculé À PARTIR DU TWIN
 * lib/v2/links) rend la MÊME forme + le MÊME critère §41–§42 que ce qu'un links_graph renverrait
 * sur le même graphe — un lien pinné à une version non-tête est STALE, tout le reste GREEN (la
 * vague de rouge §42, rendue hors-ligne).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM ; un payload malformé renvoie
 * null déterministiquement, pour que readVia retombe sur le repli-démo (source:"demo").
 */

describe("liens live — links_graph decoder parity", () => {
	it("décode un graphOutput Go (verdicts par lien + comptes)", () => {
		const goSample = {
			ok: true,
			links: [
				{
					kind: "projects_to",
					from: "checkout-view@v2",
					to: "checkout-submit@v1",
					valid: true,
					status: "green",
				},
				{
					kind: "derives_from",
					from: "create-order@v3",
					to: "create-order@v2",
					valid: true,
					status: "stale",
				},
				{
					kind: "contracts_with",
					from: "x@v1",
					to: "y", // non pinné côté Go → valid:false + error, pas de status
					valid: false,
					error: "links: to is not pinned (id@version required)",
				},
			],
			all_pinned: false,
			green: 1,
			stale: 1,
			absent: 0,
		};
		const decoded = linksGraphDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decoded?.rows).toHaveLength(3);
		expect(decoded?.rows[0]).toEqual({
			kind: "projects_to",
			from: "checkout-view@v2",
			to: "checkout-submit@v1",
			valid: true,
			status: "green",
		});
		expect(decoded?.rows[1].status).toBe("stale");
		expect(decoded?.rows[2].valid).toBe(false);
		expect(decoded?.rows[2].status).toBeUndefined();
		expect(decoded?.rows[2].error).toContain("not pinned");
		expect(decoded?.allPinned).toBe(false);
		expect(decoded?.green).toBe(1);
		expect(decoded?.stale).toBe(1);
		expect(decoded?.absent).toBe(0);
	});

	it("rejette un payload malformé (→ null → repli démo)", () => {
		expect(linksGraphDecoder(null)).toBeNull();
		expect(linksGraphDecoder({})).toBeNull(); // pas de all_pinned
		expect(linksGraphDecoder({ all_pinned: true })).toBeNull(); // pas de comptes
		expect(
			linksGraphDecoder({
				links: [{ kind: "x" }],
				all_pinned: true,
				green: 0,
				stale: 0,
				absent: 0,
			}),
		).toBeNull(); // une ligne incomplète casse tout le décodage
		expect(
			linksGraphDecoder({
				links: [],
				all_pinned: "yes",
				green: 0,
				stale: 0,
				absent: 0,
			}),
		).toBeNull(); // all_pinned mal typé
	});

	it("décode un graphe vide (aucun lien) sans planter", () => {
		const decoded = linksGraphDecoder({
			ok: true,
			links: [],
			all_pinned: true,
			green: 0,
			stale: 0,
			absent: 0,
		});
		expect(decoded).not.toBeNull();
		expect(decoded?.rows).toHaveLength(0);
		expect(decoded?.allPinned).toBe(true);
	});
});

describe("liens live — gatewayGraphArgs (objet simple, garde RawMessage S59)", () => {
	it("projette le graphe canonique vers les args links_graph exacts", () => {
		const graph = canonGraph();
		const args = gatewayGraphArgs(graph);
		// un objet simple sérialisable (le garde RawMessage S59)
		expect(JSON.parse(JSON.stringify(args))).toEqual(args);
		const links = args.links as Array<Record<string, unknown>>;
		expect(links).toHaveLength(graph.links.length);
		// chaque lien porte kind + from{id,version} + to{id,version} (la forme linkIn du Go)
		expect(links[0]).toEqual({
			kind: graph.links[0].kind,
			from: {
				id: graph.links[0].from.id,
				version: graph.links[0].from.version,
			},
			to: { id: graph.links[0].to.id, version: graph.links[0].to.version },
		});
		expect(args.heads).toEqual(graph.heads);
		// les kinds envoyés sont le jeu CANONIQUE §41 (jamais les familles V2 lisibles)
		for (const l of links) {
			expect([
				"projects_to",
				"derives_from",
				"contracts_with",
				"triggers",
				"binds",
				"mirrors",
			]).toContain(l.kind);
		}
	});
});

describe("liens live — demoLinksView (repli-démo construit À PARTIR DU TWIN)", () => {
	it("rend la même forme que le décodeur live (rows + counts + allPinned)", () => {
		const view = demoLinksView();
		// tout lien du graphe synthétique du twin est pinné des deux côtés → all_pinned
		expect(view.allPinned).toBe(true);
		// le graphe synthétique laisse UN supersedes pinné create-order@v2 (tête = v3) → STALE
		expect(view.stale).toBe(1);
		expect(view.absent).toBe(0);
		expect(view.green).toBe(view.rows.length - 1);
		// les comptes recoupent les statuts ligne à ligne (aucun double-compte)
		const tally = { green: 0, stale: 0, absent: 0 } as Record<string, number>;
		for (const r of view.rows) if (r.status) tally[r.status] += 1;
		expect(tally.green).toBe(view.green);
		expect(tally.stale).toBe(view.stale);
		expect(tally.absent).toBe(view.absent);
	});

	it("est déterministe (même graphe → même vue)", () => {
		expect(demoLinksView()).toEqual(demoLinksView());
	});
});
