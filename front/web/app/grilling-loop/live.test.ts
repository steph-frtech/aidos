import { describe, expect, it } from "vitest";
import { demoRoute, routeArgs } from "../../lib/grilling-loop-data";
import { routeDecoder } from "./live";

/**
 * /grilling-loop live grill_route read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch-4B flip).
 *
 * It proves the TS `routeDecoder` decodes a SAMPLE of the Go grilling-loop MCP `grill_route` tool
 * output (grillingloopsrv.routeOutput: the FLAT {id, proposes, intent, source, detail, status,
 * verdict, reason}) — the tool's CONTRACT, NOT a second implementation of the routing logic (the
 * Go grillingloop.Route is authoritative; the routing is deterministic, the LLM is the barricaded
 * re-verify exception). This test pins only that the flat wire shape decodes faithfully into the
 * twin's NESTED VerdictRecord (reconstructing idea.provenance{source,detail} + idea.rejectReason
 * from the flat Go fields) and that a malformed payload deterministically falls back to the demo.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same VerdictRecord, zero LLM. THE WALL (§2): the routed
 * idea is a CANDIDATE-truth (no version, no mirror) — promotion stays the /goal flow.
 */

describe("grilling-loop live — grill_route decoder parity", () => {
	it("decodes a Go-sample routeOutput for a sharp verdict (→ grilled)", () => {
		const goSample = {
			id: "idea-abc123",
			proposes: "policy",
			intent: "je veux un code promo pour les habitués",
			source: "human",
			detail: "humain: « je veux un code promo pour les habitués »",
			status: "grilled",
			verdict: "sharp",
			reason: "",
		};
		const decoded = routeDecoder(goSample);
		expect(decoded).toEqual({
			idea: {
				id: "idea-abc123",
				proposes: "policy",
				intent: "je veux un code promo pour les habitués",
				provenance: {
					source: "human",
					detail: "humain: « je veux un code promo pour les habitués »",
				},
				status: "grilled",
			},
			verdict: "sharp",
		});
	});

	it("decodes a fuzzy verdict (→ spiking), no reject reason", () => {
		const decoded = routeDecoder({
			id: "idea-fuzzy",
			proposes: "operation",
			intent: "quelque chose autour de retries plus malins",
			source: "human",
			detail: "humain: démo",
			status: "spiking",
			verdict: "fuzzy",
			reason: "",
		});
		expect(decoded?.idea.status).toBe("spiking");
		expect(decoded?.verdict).toBe("fuzzy");
		expect(decoded?.idea.rejectReason).toBeUndefined();
		expect(decoded?.reason).toBeUndefined();
	});

	it("decodes a bad verdict (→ rejected) carrying the traced reject reason", () => {
		const decoded = routeDecoder({
			id: "idea-bad",
			proposes: "policy",
			intent: "réécrire tout le panier en une nuit",
			source: "human",
			detail: "humain: démo",
			status: "rejected",
			verdict: "bad",
			reason: "hors périmètre, doublon d'une policy existante",
		});
		expect(decoded?.idea.status).toBe("rejected");
		expect(decoded?.verdict).toBe("bad");
		// the traced reason is reconstructed on BOTH the idea.rejectReason and the record.reason.
		expect(decoded?.idea.rejectReason).toBe(
			"hors périmètre, doublon d'une policy existante",
		);
		expect(decoded?.reason).toBe(
			"hors périmètre, doublon d'une policy existante",
		);
	});

	it("maps an unknown provenance source to `human` (the closed two-value set)", () => {
		const decoded = routeDecoder({
			id: "idea-x",
			proposes: "operation",
			intent: "x",
			source: "from-the-void",
			detail: "",
			status: "grilled",
			verdict: "sharp",
		});
		expect(decoded?.idea.provenance.source).toBe("human");
	});

	it("preserves an `incident` provenance source", () => {
		const decoded = routeDecoder({
			id: "idea-i",
			proposes: "operation",
			intent: "x",
			source: "incident",
			detail: "",
			status: "spiking",
			verdict: "fuzzy",
		});
		expect(decoded?.idea.provenance.source).toBe("incident");
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(routeDecoder(null)).toBeNull();
		expect(routeDecoder({})).toBeNull(); // no required fields
		// a missing required field (intent) → null.
		expect(
			routeDecoder({
				id: "idea-x",
				proposes: "policy",
				status: "grilled",
				verdict: "sharp",
			}),
		).toBeNull();
		// an off-schema status → null (the closed Status set is authoritative).
		expect(
			routeDecoder({
				id: "idea-x",
				proposes: "policy",
				intent: "x",
				status: "approved",
				verdict: "sharp",
			}),
		).toBeNull();
		// an off-schema verdict → null (the closed three-value set is authoritative).
		expect(
			routeDecoder({
				id: "idea-x",
				proposes: "policy",
				intent: "x",
				status: "grilled",
				verdict: "yes",
			}),
		).toBeNull();
	});

	it("the demo route matches the decoded shape (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin route() of an intention; it has the SAME nested VerdictRecord
		// shape the live read returns — the twin sits behind source:"demo", identical in shape to the
		// Go-authoritative live VerdictRecord.
		const demo = demoRoute(
			"policy",
			{ intent: "je veux un code promo", scenarios: [] },
			"sharp",
			"humain: « je veux un code promo »",
			"",
		);
		expect(demo.idea.status).toBe("grilled");
		expect(demo.verdict).toBe("sharp");
		expect(typeof demo.idea.id).toBe("string");
		expect(demo.idea.id.length).toBeGreaterThan(0);
		// the gateway-arg projection carries the verbatim intention + verdict the live read sends.
		const args = routeArgs(
			"policy",
			{ intent: "je veux un code promo", scenarios: ["s1", "s2"] },
			"sharp",
			"d",
			"",
		);
		expect(args).toEqual({
			proposes: "policy",
			intent: "je veux un code promo",
			scenarios: ["s1", "s2"],
			verdict: "sharp",
			detail: "d",
			reason: "",
		});
	});
});
