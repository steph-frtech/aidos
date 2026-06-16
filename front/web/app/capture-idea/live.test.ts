import { describe, expect, it } from "vitest";
import { inboxDecoder } from "./live";

/**
 * /capture-idea live INBOX read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go idea-intake `idea_list` output
 * (ideaintakesrv.listOutput: `{ ideas: [{ id, proposes, intent, source, detail, status,
 * project_id? }] }`) — the tool's CONTRACT, NOT a second ideas store. The inbox is served by the
 * Go store (authoritative); this test pins only that the wire shape decodes faithfully (replacing
 * the DELETED direct-Postgres SELECT) and that a malformed payload deterministically falls back
 * to the demo rows.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("capture-idea live — idea_list decoder parity", () => {
	it("decodes a byte-faithful Go-sample listOutput", () => {
		const goSample = {
			ideas: [
				{
					id: "idea-abc",
					proposes: "operation",
					intent: "je veux une remise au panier",
					source: "human",
					detail: "humain: l'utilisateur",
					status: "draft",
					project_id: "shop",
				},
			],
		};
		expect(inboxDecoder(goSample)).toEqual({
			rows: [
				{
					id: "idea-abc",
					proposes: "operation",
					intent: "je veux une remise au panier",
					provenance: { source: "human", detail: "humain: l'utilisateur" },
					status: "draft",
					projectId: "shop",
				},
			],
		});
	});

	it("decodes an incident-provenance idea (the __system__ seed, absent project_id → '')", () => {
		const decoded = inboxDecoder({
			ideas: [
				{
					id: "idea-incident",
					proposes: "policy",
					intent: "le total a doublé la remise (#42)",
					source: "incident",
					detail: "#42",
					status: "spiking",
				},
			],
		});
		expect(decoded?.rows[0]?.provenance.source).toBe("incident");
		expect(decoded?.rows[0]?.projectId).toBe("");
	});

	it("decodes an empty inbox (absent ideas → [])", () => {
		expect(inboxDecoder({})).toEqual({ rows: [] });
		expect(inboxDecoder({ ideas: [] })).toEqual({ rows: [] });
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(inboxDecoder(null)).toBeNull();
		expect(inboxDecoder({ ideas: "x" })).toBeNull();
		// an idea with an out-of-set proposes → null (the closed set is the contract).
		expect(
			inboxDecoder({
				ideas: [
					{
						id: "i",
						proposes: "monster",
						intent: "x",
						source: "human",
						detail: "d",
						status: "draft",
					},
				],
			}),
		).toBeNull();
		// an idea with an out-of-set status → null.
		expect(
			inboxDecoder({
				ideas: [
					{
						id: "i",
						proposes: "entity",
						intent: "x",
						source: "human",
						detail: "d",
						status: "frozen",
					},
				],
			}),
		).toBeNull();
	});
});
