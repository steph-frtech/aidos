import { describe, expect, it } from "vitest";
import { DEMO_RECALL, recallDecoder } from "./live";

/**
 * /memory-firewall live RECALL read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go memory server `memory_recall` output
 * (memorysrv.recallOutput: `{ hits: [{ id, kind, content, provenance, taint[], branch,
 * confidence, score }] }`) — the tool's CONTRACT, NOT a second memory store. The hits are
 * scored by the Go pgvector backend (authoritative); this test pins only that the wire shape
 * decodes faithfully and that a malformed payload deterministically falls back to the demo hits.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("memory-firewall live — memory_recall decoder parity", () => {
	it("decodes a byte-faithful Go-sample recallOutput", () => {
		const goSample = {
			hits: [
				{
					id: "mem-tva-eu",
					kind: "semantic",
					content: "la TVA EU s'applique par pays de livraison",
					provenance: "human",
					taint: ["user_claim", "unverified"],
					branch: "main",
					confidence: 0.7,
					score: 0.92,
				},
			],
		};
		expect(recallDecoder(goSample)).toEqual({
			hits: [
				{
					id: "mem-tva-eu",
					kind: "semantic",
					content: "la TVA EU s'applique par pays de livraison",
					provenance: "human",
					taint: ["user_claim", "unverified"],
					branch: "main",
					confidence: 0.7,
					score: 0.92,
				},
			],
		});
	});

	it("decodes an untainted hit (absent taint → [])", () => {
		const decoded = recallDecoder({
			hits: [
				{
					id: "m",
					kind: "procedural",
					content: "x",
					provenance: "human",
					branch: "main",
					confidence: 1,
					score: 0.5,
				},
			],
		});
		expect(decoded?.hits[0]?.taint).toEqual([]);
	});

	it("decodes an empty recall (absent hits → [])", () => {
		expect(recallDecoder({})).toEqual({ hits: [] });
		expect(recallDecoder({ hits: [] })).toEqual({ hits: [] });
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(recallDecoder(null)).toBeNull();
		expect(recallDecoder({ hits: "x" })).toBeNull();
		// a hit missing confidence (a required number) → null.
		expect(
			recallDecoder({
				hits: [
					{
						id: "m",
						kind: "semantic",
						content: "x",
						provenance: "human",
						branch: "main",
						score: 0.5,
					},
				],
			}),
		).toBeNull();
		// a hit whose score is not a number → null.
		expect(
			recallDecoder({
				hits: [
					{
						id: "m",
						kind: "semantic",
						content: "x",
						provenance: "human",
						branch: "main",
						confidence: 1,
						score: "high",
					},
				],
			}),
		).toBeNull();
	});

	it("the demo hits are the deterministic firewall carburant (tainted, never declared)", () => {
		expect(DEMO_RECALL.hits).toHaveLength(2);
		expect(DEMO_RECALL.hits[0]?.taint).toContain("user_claim");
		expect(DEMO_RECALL.hits[1]?.taint).toContain("incident_derived");
	});
});
