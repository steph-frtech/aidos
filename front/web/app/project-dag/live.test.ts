import { describe, expect, it } from "vitest";
import { DEMO_HEADS, headsDecoder } from "./live";

/**
 * /project-dag live read — the PARITY MIRROR (Vitest, the frozen front N1 slot).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go dag server `dag_heads` output
 * (dagsrv.headsOutput: `{ heads: string[] }`) — the tool's CONTRACT, NOT a second
 * implementation of the version-space logic. The heads are computed by the Go dag store
 * (authoritative); this test pins only that the wire shape decodes faithfully and that a
 * malformed payload deterministically falls back to the demo heads.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("project-dag live — dag_heads decoder parity", () => {
	it("decodes a Go-sample headsOutput faithfully", () => {
		// A byte-faithful sample of dagsrv.headsOutput JSON (several parallel lines, §125).
		const goSample = { heads: ["genesis", "tva-eu-variant"] };
		expect(headsDecoder(goSample)).toEqual({
			heads: ["genesis", "tva-eu-variant"],
		});
	});

	it("decodes an empty heads set", () => {
		expect(headsDecoder({ heads: [] })).toEqual({ heads: [] });
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(headsDecoder(null)).toBeNull();
		expect(headsDecoder({})).toBeNull(); // missing heads
		expect(headsDecoder({ heads: "genesis" })).toBeNull(); // not an array
		expect(headsDecoder({ heads: ["genesis", 42] })).toBeNull(); // non-string element
	});

	it("the demo heads are the deterministic genesis baseline", () => {
		expect(DEMO_HEADS).toEqual({ heads: ["genesis"] });
	});
});
