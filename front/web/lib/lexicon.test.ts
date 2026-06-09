import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	clean,
	type Drift,
	isKnownLayer,
	LAYERS,
	type Layer,
	type LexiconKernel,
	layerIndex,
	lint,
	type Observation,
	serializeBody,
	validate,
} from "./lexicon";

// Reproducibility mirror (∀) for the Lexicon TS twin (FK14). reflects=lib/lexicon ·
// test_kind=property · cert_language=fast-check · liveness=live. It pins the SAME invariants as the
// Go property mirror (back/kernel/lexicon) so the /lexicon panel never drifts from the Go source.

function returnRequest(): LexiconKernel {
	return {
		concept: "ReturnRequest",
		symbols: {
			human: "demande de retour",
			code: "createReturnRequest",
			db: "return_requests",
			event: "ReturnRequestCreated",
			metric: "return_request_created_total",
		},
	};
}

describe("FK14 lexicon — the worked FKE-21 example", () => {
	it("is clean when every observation matches the pinned symbol", () => {
		const k = returnRequest();
		const obs: Observation[] = [
			{ layer: "db", symbol: "return_requests" },
			{ layer: "code", symbol: "createReturnRequest" },
		];
		expect(lint(k, obs)).toEqual([]);
		expect(clean(k, obs)).toBe(true);
	});

	it("FK14 fault-injection: a renamed table → exactly one RENAMED drift (red)", () => {
		const k = returnRequest();
		const obs: Observation[] = [{ layer: "db", symbol: "orders_returns" }];
		const d = lint(k, obs);
		expect(d).toHaveLength(1);
		expect(d[0]).toEqual({
			layer: "db",
			symbol: "orders_returns",
			expected: "return_requests",
			kind: "RENAMED",
		});
		expect(clean(k, obs)).toBe(false);
	});

	it("an unknown layer is itself a drift (UNKNOWN_LAYER)", () => {
		const d = lint(returnRequest(), [{ layer: "frobnicate", symbol: "x" }]);
		expect(d).toHaveLength(1);
		expect(d[0].kind).toBe("UNKNOWN_LAYER");
	});

	it("a layer the lexicon does not pin → UNKNOWN_SYMBOL", () => {
		const d = lint(returnRequest(), [
			{ layer: "log", symbol: "return_request.created" },
		]);
		expect(d).toHaveLength(1);
		expect(d[0].kind).toBe("UNKNOWN_SYMBOL");
		expect(d[0].expected).toBeUndefined();
	});

	it("has exactly 16 closed layers", () => {
		expect(LAYERS).toHaveLength(16);
		expect(new Set(LAYERS).size).toBe(16);
		expect(isKnownLayer("db")).toBe(true);
		expect(isKnownLayer("not-a-layer")).toBe(false);
	});

	it("validate refuses a nameless lexicon, an unknown layer, and an empty symbol", () => {
		expect(validate({ concept: "", symbols: { code: "x" } })).toBe(
			"NO_CONCEPT",
		);
		expect(validate({ concept: "C", symbols: { bogus: "x" } as never })).toBe(
			"UNKNOWN_LAYER",
		);
		expect(validate({ concept: "C", symbols: { code: "" } })).toBe(
			"EMPTY_SYMBOL",
		);
		expect(validate(returnRequest())).toBeNull();
	});

	it("serializeBody is independent of object key order (the storage fork is content-addressed)", () => {
		const a: LexiconKernel = {
			concept: "C",
			symbols: { code: "f", db: "t", api: "r" },
		};
		const b: LexiconKernel = {
			concept: "C",
			symbols: { api: "r", db: "t", code: "f" },
		};
		expect(serializeBody(a)).toBe(serializeBody(b));
	});
});

describe("FK14 lexicon — properties (reproducibility mirror)", () => {
	const genLayer = fc.oneof(
		fc.constantFrom<Layer>(...LAYERS),
		fc.constantFrom("bogus", "frob", "xyz"),
	);
	const genSymbol = fc.constantFrom(
		"a",
		"b",
		"c",
		"return_requests",
		"orders_returns",
	);
	const genObs = fc.array(fc.record({ layer: genLayer, symbol: genSymbol }), {
		maxLength: 6,
	}) as fc.Arbitrary<Observation[]>;
	const genLexicon = fc
		.dictionary(
			fc.constantFrom<Layer>(...LAYERS),
			fc.constantFrom("return_requests", "createReturnRequest", "x"),
		)
		.map((symbols) => ({ concept: "C", symbols }) as LexiconKernel);

	it("property — determinism: same inputs yield identical drifts", () => {
		fc.assert(
			fc.property(genLexicon, genObs, (k, obs) => {
				expect(lint(k, obs)).toEqual(lint(k, obs));
			}),
		);
	});

	it("property — drift is a pure function of the lexicon + symbols (the FK14 done-criterion)", () => {
		fc.assert(
			fc.property(genLexicon, genObs, (k, obs) => {
				const flagged = new Map<string, Drift>();
				for (const d of lint(k, obs)) flagged.set(`${d.layer}::${d.symbol}`, d);
				for (const o of obs) {
					const d = flagged.get(`${o.layer}::${o.symbol}`);
					if (!isKnownLayer(o.layer)) {
						expect(d?.kind).toBe("UNKNOWN_LAYER");
					} else {
						const want = k.symbols[o.layer];
						if (want === undefined) {
							expect(d?.kind).toBe("UNKNOWN_SYMBOL");
						} else if (o.symbol !== want) {
							expect(d?.kind).toBe("RENAMED");
							expect(d?.expected).toBe(want);
						} else {
							expect(d).toBeUndefined();
						}
					}
				}
			}),
		);
	});

	it("property — clean ⇔ no drift", () => {
		fc.assert(
			fc.property(genLexicon, genObs, (k, obs) => {
				expect(clean(k, obs)).toBe(lint(k, obs).length === 0);
			}),
		);
	});

	it("property — drifts come back in a stable order (layer index, then symbol)", () => {
		fc.assert(
			fc.property(genLexicon, genObs, (k, obs) => {
				const d = lint(k, obs);
				for (let i = 1; i < d.length; i++) {
					const li = layerIndex(d[i - 1].layer);
					const lj = layerIndex(d[i].layer);
					expect(li < lj || (li === lj && d[i - 1].symbol <= d[i].symbol)).toBe(
						true,
					);
				}
			}),
		);
	});
});
