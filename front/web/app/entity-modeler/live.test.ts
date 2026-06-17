import { describe, expect, it } from "vitest";
import {
	DEMO_DRAFT,
	demoMerge,
	MERGE_BASE,
} from "../../lib/entity-modeler-data";
import { hashDecoder, mergeDecoder, validateDecoder } from "./live";

/**
 * /entity-modeler live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; the ADR 0092
 * batch-4B flip, the entity-modeler PURE/non-DSN/non-RLS server).
 *
 * It proves the THREE TS decoders (validateDecoder / hashDecoder / mergeDecoder) decode a SAMPLE of
 * the Go entitymodelersrv tool outputs — the tools' CONTRACT, NOT a second implementation of the
 * modeler logic (the Go modeler.Validate / .SchemaHash / .MergeDrafts is authoritative; the twin
 * lib/entity-modeler only reproduces it for the demo fallback). The samples are byte-faithful to the
 * Go output shapes:
 *   - validateOutput {ok bool, block?{code,severity,explanation,how_to_fix}}  (entitymodelersrv.go:49)
 *   - hashOutput     {ok bool, hash? string}                                  (entitymodelersrv.go:67)
 *   - modeler.MergeOutcome {merged, added_by_a?, added_by_b?, conflicts?}     (concurrency.go:85; the
 *     arrays carry `omitempty` so a clean/one-sided merge omits them → decoded as []).
 *
 * It pins ONLY that the wire shape decodes faithfully (the `ok` discriminant, the snake_case block
 * fields, the severity normalised to the modeler's only literal "blocking", the merged draft + the
 * three name lists, an omitted/absent list) AND that a malformed payload deterministically returns
 * null so readVia falls back to the demo (source:"demo").
 *
 * schema_propose is NOT flipped (the wall — propose → ChangeSet → approval; its output carries a
 * json.RawMessage ChangeSet body, the S59 scar), so there is no propose decoder to pin here.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): same input → same verdict, zero LLM.
 */

describe("entity-modeler live — validate decoder parity", () => {
	it("decodes a Go-sample validateOutput (a proposable draft → ok)", () => {
		const goSample = { ok: true };
		expect(validateDecoder(goSample)).toEqual({ ok: true });
	});

	it("decodes a Go-sample validateOutput (a refusal carries the block, severity normalised)", () => {
		const goSample = {
			ok: false,
			block: {
				code: "MODELER_INVALID_DRAFT",
				severity: "blocking",
				explanation:
					"entity Order: relation customer targets Ghost which is outside the declared set",
				how_to_fix: [
					"corrigez l'entité ou la relation signalée",
					"toute relation doit cibler une entité déclarée dans le brouillon",
				],
			},
		};
		expect(validateDecoder(goSample)).toEqual({
			ok: false,
			block: {
				code: "MODELER_INVALID_DRAFT",
				severity: "blocking",
				explanation:
					"entity Order: relation customer targets Ghost which is outside the declared set",
				how_to_fix: [
					"corrigez l'entité ou la relation signalée",
					"toute relation doit cibler une entité déclarée dans le brouillon",
				],
			},
		});
	});

	it("tolerates a refusal whose block is malformed (no code) → ok:false, no block", () => {
		// The Go server always sends a well-formed block on ok:false, but a malformed block must
		// NOT crash the panel — the decoder drops it and the panel still shows the refusal state.
		const decoded = validateDecoder({
			ok: false,
			block: { severity: "blocking" },
		});
		expect(decoded).toEqual({ ok: false });
	});

	it("falls back to demo (null) on a malformed validateOutput (no boolean ok)", () => {
		expect(validateDecoder({})).toBeNull();
		expect(validateDecoder({ ok: "yes" })).toBeNull();
		expect(validateDecoder(null)).toBeNull();
		expect(validateDecoder("nope")).toBeNull();
	});
});

describe("entity-modeler live — hash decoder parity", () => {
	it("decodes a Go-sample hashOutput (ok → the content address)", () => {
		const goHash =
			"a91081e16f1c65b806a2b48e09dbf49911ddee1a0dea57dc78f7075b8791c743";
		expect(hashDecoder({ ok: true, hash: goHash })).toBe(goHash);
	});

	it("falls back to demo (null) on ok:false or a malformed hashOutput", () => {
		expect(hashDecoder({ ok: false })).toBeNull();
		expect(hashDecoder({ ok: true })).toBeNull(); // ok but no hash → not decodable
		expect(hashDecoder({ hash: "abc" })).toBeNull(); // no ok discriminant
		expect(hashDecoder(null)).toBeNull();
	});
});

describe("entity-modeler live — merge decoder parity", () => {
	it("decodes a Go-sample MergeOutcome (one-sided add — omitempty arrays → [])", () => {
		// MERGE_BASE has only Customer; the demo Alice merge adds Order. The Go output omits the
		// empty added_by_b / conflicts arrays (json omitempty) — the decoder fills them with [].
		const demo = demoMerge(MERGE_BASE, DEMO_DRAFT, MERGE_BASE);
		const goSample = {
			merged: demo.merged,
			added_by_a: ["Order"],
			// added_by_b omitted (empty), conflicts omitted (clean)
		};
		const decoded = mergeDecoder(goSample);
		expect(decoded).not.toBeNull();
		expect(decoded?.added_by_a).toEqual(["Order"]);
		expect(decoded?.added_by_b).toEqual([]);
		expect(decoded?.conflicts).toEqual([]);
		expect(decoded?.merged.project).toBe(demo.merged.project);
		expect(Array.isArray(decoded?.merged.nodes)).toBe(true);
	});

	it("decodes a Go-sample MergeOutcome with a surfaced conflict (never last-write-wins)", () => {
		const goSample = {
			merged: { project: "shop", nodes: [] },
			added_by_a: [],
			added_by_b: ["Invoice"],
			conflicts: ["Customer"],
		};
		const decoded = mergeDecoder(goSample);
		expect(decoded?.conflicts).toEqual(["Customer"]);
		expect(decoded?.added_by_b).toEqual(["Invoice"]);
	});

	it("falls back to demo (null) on a malformed MergeOutcome", () => {
		expect(mergeDecoder({})).toBeNull(); // no merged
		expect(mergeDecoder({ merged: {} })).toBeNull(); // merged has no project
		expect(mergeDecoder({ merged: { project: "shop" } })).toBeNull(); // merged has no nodes array
		expect(mergeDecoder(null)).toBeNull();
	});
});
