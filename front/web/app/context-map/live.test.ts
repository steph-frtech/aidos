import { describe, expect, it } from "vitest";
import { CODE_CROSS_CELL_NO_CONTRACT } from "../../lib/context-map";
import {
	checkCallArgs,
	demoCheckCall,
	demoMap,
	demoVerifyAll,
	demoVerifyPair,
	verifyAllArgs,
	verifyPairArgs,
} from "../../lib/context-map-data";
import { checkCallDecoder, verifyAllDecoder, verifyPairDecoder } from "./live";

/**
 * /context-map live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; the ADR 0092
 * batch-4B flip — the Go engine is the SINGLE live source).
 *
 * It proves the three TS decoders decode a SAMPLE of the Go context-map MCP tool outputs
 * (contextmapsrv: `verifyPairOutput {ok, verdict}`, `verifyAllOutput {ok, verdicts[]}`,
 * `checkCallOutput {ok, allowed, block{code,message,how_to_fix}}`) — the tools' CONTRACT, NOT a
 * second implementation of the pact-verify logic (the Go contextmap.VerifyPair / VerifyAll /
 * CheckCrossCellCall are authoritative; the verifier is an algorithm, never an LLM). This test pins
 * only that the wire shape decodes faithfully (the `verdict`/`verdicts` wrapper, the PairVerdict
 * snake-case-free fields, the snake_case how_to_fix → camelCase howToFix mapping, the absent block on
 * an allowed call) and that a malformed payload deterministically returns null so readVia falls back
 * to the demo (`source:"demo"`).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM. THE WALL (§2): the reads are
 * below-the-line — they compute VALUES, write no truth (propose is NOT dispatched: its panel keeps
 * the propose → ChangeSet → approval voie propre).
 */

describe("context-map live — verify_pair decoder parity", () => {
	it("decodes a Go-sample verifyPairOutput (HONORED pair)", () => {
		const decoded = verifyPairDecoder({
			ok: true,
			verdict: {
				consumer: "checkout",
				provider: "billing",
				honored: true,
				reason: "HONORED",
			},
		});
		expect(decoded).toEqual({
			consumer: "checkout",
			provider: "billing",
			honored: true,
			reason: "HONORED",
		});
	});

	it("decodes an UNHONORED pair carrying a detail witness", () => {
		const decoded = verifyPairDecoder({
			ok: true,
			verdict: {
				consumer: "checkout",
				provider: "catalog",
				honored: false,
				reason: "CONSUMER_FIELD_UNPUBLISHED",
				detail: 'GET /items requires field "price"',
			},
		});
		expect(decoded).toEqual({
			consumer: "checkout",
			provider: "catalog",
			honored: false,
			reason: "CONSUMER_FIELD_UNPUBLISHED",
			detail: 'GET /items requires field "price"',
		});
	});

	it("rejects a malformed verify_pair payload (→ demo fallback)", () => {
		expect(verifyPairDecoder(null)).toBeNull();
		expect(verifyPairDecoder({})).toBeNull(); // no ok, no verdict
		expect(verifyPairDecoder({ ok: false, verdict: {} })).toBeNull(); // ok:false
		// an out-of-set reason → null (the closed PairReason set).
		expect(
			verifyPairDecoder({
				ok: true,
				verdict: {
					consumer: "checkout",
					provider: "billing",
					honored: true,
					reason: "NOT_A_REASON",
				},
			}),
		).toBeNull();
		// a non-boolean honored → null.
		expect(
			verifyPairDecoder({
				ok: true,
				verdict: {
					consumer: "checkout",
					provider: "billing",
					honored: "yes",
					reason: "HONORED",
				},
			}),
		).toBeNull();
	});
});

describe("context-map live — verify_all decoder parity", () => {
	it("decodes a Go-sample verifyAllOutput (sorted verdict list)", () => {
		const decoded = verifyAllDecoder({
			ok: true,
			verdicts: [
				{
					consumer: "checkout",
					provider: "billing",
					honored: true,
					reason: "HONORED",
				},
				{
					consumer: "checkout",
					provider: "catalog",
					honored: false,
					reason: "CONSUMER_FIELD_UNPUBLISHED",
					detail: 'GET /items requires field "price"',
				},
			],
		});
		expect(decoded).toHaveLength(2);
		expect(decoded?.[0].honored).toBe(true);
		expect(decoded?.[1].reason).toBe("CONSUMER_FIELD_UNPUBLISHED");
	});

	it("decodes an empty verdict list (no pairs designed)", () => {
		expect(verifyAllDecoder({ ok: true, verdicts: [] })).toEqual([]);
	});

	it("rejects a malformed verify_all payload (→ demo fallback)", () => {
		expect(verifyAllDecoder(null)).toBeNull();
		expect(verifyAllDecoder({ ok: false, verdicts: [] })).toBeNull();
		// a single malformed verdict in the list reds the whole decode.
		expect(
			verifyAllDecoder({
				ok: true,
				verdicts: [{ consumer: "checkout", provider: "billing" }],
			}),
		).toBeNull();
	});
});

describe("context-map live — check_call decoder parity", () => {
	it("decodes an ALLOWED cross-cell call (no block)", () => {
		const decoded = checkCallDecoder({ ok: true, allowed: true });
		expect(decoded).toEqual({ allowed: true });
	});

	it("decodes a REFUSED call, mapping how_to_fix → howToFix", () => {
		const decoded = checkCallDecoder({
			ok: true,
			allowed: false,
			block: {
				code: CODE_CROSS_CELL_NO_CONTRACT,
				message:
					'cell "checkout" cannot access cell "catalog": no honored contracts_with link connects them',
				how_to_fix: [
					"design a contracts_with pair between the cells in the Context-Map (S101)",
					"or work inside the cell's own bounded context",
				],
			},
		});
		expect(decoded).toEqual({
			allowed: false,
			block: {
				code: CODE_CROSS_CELL_NO_CONTRACT,
				message:
					'cell "checkout" cannot access cell "catalog": no honored contracts_with link connects them',
				howToFix: [
					"design a contracts_with pair between the cells in the Context-Map (S101)",
					"or work inside the cell's own bounded context",
				],
			},
		});
	});

	it("rejects a malformed check_call payload (→ demo fallback)", () => {
		expect(checkCallDecoder(null)).toBeNull();
		expect(checkCallDecoder({ ok: false, allowed: true })).toBeNull();
		// a non-boolean allowed → null.
		expect(checkCallDecoder({ ok: true, allowed: "no" })).toBeNull();
	});
});

describe("context-map live — twin ≡ the live contract shape (the flip witness)", () => {
	// The demo fixtures are the twin computes the Go contextmap reproduces; round-tripping them
	// through the gateway-arg projection + the decoder yields the SAME verdict shape the live read
	// returns — the twin sits behind source:"demo", identical in shape to the Go-authoritative
	// verdicts. This pins the demo fallback ≡ the decoded live wire, no double-typing.
	const map = demoMap("shop");

	it("the demo verify_pair (billing) ≡ a decoded HONORED Go verdict", () => {
		const demo = demoVerifyPair(map, "billing");
		expect(demo.honored).toBe(true);
		expect(demo.reason).toBe("HONORED");
		const decoded = verifyPairDecoder({ ok: true, verdict: demo });
		expect(decoded).toEqual(demo);
		// the gateway-arg projection carries the map + the pair the live tool verifies.
		const args = verifyPairArgs(map, "billing");
		expect(args.map).toEqual(map);
		expect((args.pair as { provider: string }).provider).toBe("billing");
	});

	it("the demo verify_pair (catalog) ≡ a decoded UNHONORED Go verdict", () => {
		const demo = demoVerifyPair(map, "catalog");
		expect(demo.honored).toBe(false);
		expect(verifyPairDecoder({ ok: true, verdict: demo })).toEqual(demo);
	});

	it("the demo verify_all ≡ the decoded Go verdict list", () => {
		const demo = demoVerifyAll(map);
		const decoded = verifyAllDecoder({ ok: true, verdicts: demo });
		expect(decoded).toEqual(demo);
		expect(verifyAllArgs(map).map).toEqual(map);
	});

	it("the demo check_call (checkout→catalog) ≡ a decoded REFUSED Go verdict", () => {
		const demo = demoCheckCall("checkout", "catalog", map);
		expect(demo.allowed).toBe(false);
		expect(demo.block?.code).toBe(CODE_CROSS_CELL_NO_CONTRACT);
		// re-encode the twin's camelCase BlockReason as the Go snake_case wire, then decode.
		const decoded = checkCallDecoder({
			ok: true,
			allowed: false,
			block: {
				code: demo.block?.code,
				message: demo.block?.message,
				how_to_fix: demo.block?.howToFix,
			},
		});
		expect(decoded).toEqual(demo);
		const args = checkCallArgs("checkout", "catalog", map);
		expect(args).toEqual({ from: "checkout", to: "catalog", map });
	});
});
