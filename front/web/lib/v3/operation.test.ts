// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD — jamais une thenable.
/**
 * lib/v3/operation.test.ts — le MIROIR de reproductibilité (fast-check + vitest) du
 * socle déterministe d'autoring d'opération V3 (lib/v3/operation.ts). Il re-prouve,
 * sur le front, le contrat de l'autorité Go (back/kernel/operation) :
 *   - buildOperation (B) est PUR & DÉTERMINISTE : mêmes entrées → même AST ;
 *   - les refus sont TYPÉS : un verbe hors grammaire fermée / un mutate op illégal /
 *     un champ requis manquant → un BuildError au bon code, jamais un AST invalide ;
 *   - deriveMirror (C) est cohérent : l'op porte ses Emits ⇒ le Then ne peut référencer
 *     qu'eux (un événement non déclaré est refusé), expectedEvents == op.emits ;
 *   - proposeBody round-trip : le `detail` encodé se réhydrate byte-identique en
 *     {ast, mirror}, et son JSON est canonique (clés triées — records.Canonicalize).
 *
 * determinism-first (CLAUDE.md §6/§8) : tout est pur et total ; AUCUN LLM. Le twin ne
 * fait que CONSTRUIRE/VALIDER la forme — il n'exécute pas la sémantique (interpret.go).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildOperation,
	canonicalJSON,
	deriveMirror,
	isMutateOp,
	isStepKind,
	MUTATE_OPS,
	parseProposeDetail,
	proposeBody,
	STEP_KINDS,
	type StepInput,
	type TypedInputs,
} from "./operation";

// ── Échantillon canonique : l'opération createOrder (le miroir Go createOrder) ──
const CREATE_ORDER: TypedInputs = {
	name: "createOrder",
	input: "CreateOrderInput",
	steps: [
		{ kind: "validate", schema: "CreateOrderInput" },
		{ kind: "authorize", policy: "canPlaceOrder" },
		{
			kind: "read",
			entity: "Cart",
			where: { id: "$.input.cartId" },
			as: "$.cart",
		},
		{
			kind: "mutate",
			entity: "Order",
			op: "create",
			data: { items: "$.cart.items" },
			as: "$.order",
		},
		{
			kind: "mutate",
			entity: "Cart",
			op: "clear",
			where: { id: "$.input.cartId" },
		},
		{ kind: "return", ref: "$.order" },
	],
	emits: ["OrderCreated", "CartCleared"],
};

describe("operation twin V3 — B: buildOperation (déterministe, refus typés)", () => {
	it("construit l'AST canonique createOrder (forme byte-fidèle à l'autorité Go)", () => {
		const r = buildOperation(CREATE_ORDER);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.op.name).toBe("createOrder");
		expect(r.op.input).toBe("CreateOrderInput");
		expect(r.op.steps.map((s) => s.kind)).toEqual([
			"validate",
			"authorize",
			"read",
			"mutate",
			"mutate",
			"return",
		]);
		expect(r.op.emits).toEqual(["OrderCreated", "CartCleared"]);
		// Le mutate create porte bien son op fermé.
		const created = r.op.steps[3];
		expect(created.kind).toBe("mutate");
		if (created.kind === "mutate") {
			expect(created.op).toBe("create");
			expect(created.as).toBe("$.order");
		}
	});

	it("est DÉTERMINISTE : mêmes entrées → AST byte-identique", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 30 }),
				fc.string({ minLength: 1, maxLength: 30 }),
				fc.constantFrom(...STEP_KINDS),
				(name, input, _kind) => {
					const inputs: TypedInputs = {
						name,
						input,
						steps: [{ kind: "return", ref: "$.result" }],
						emits: [],
					};
					const a = buildOperation(inputs);
					const b = buildOperation(inputs);
					expect(canonicalJSON(a)).toBe(canonicalJSON(b));
				},
			),
		);
	});

	it("REFUSE un verbe hors grammaire fermée (UNKNOWN_STEP_KIND)", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 1, maxLength: 12 })
					.filter((s) => !isStepKind(s)),
				(badKind) => {
					const r = buildOperation({
						name: "op",
						input: "In",
						steps: [{ kind: badKind } as StepInput],
						emits: [],
					});
					expect(r.ok).toBe(false);
					if (r.ok) return;
					expect(r.errors.some((e) => e.code === "UNKNOWN_STEP_KIND")).toBe(
						true,
					);
				},
			),
		);
	});

	it("REFUSE un mutate op hors {create, clear} (UNKNOWN_MUTATE_OP)", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 1, maxLength: 12 })
					.filter((s) => !isMutateOp(s)),
				(badOp) => {
					const r = buildOperation({
						name: "op",
						input: "In",
						steps: [{ kind: "mutate", entity: "Order", op: badOp }],
						emits: [],
					});
					expect(r.ok).toBe(false);
					if (r.ok) return;
					expect(r.errors.some((e) => e.code === "UNKNOWN_MUTATE_OP")).toBe(
						true,
					);
				},
			),
		);
	});

	it("REFUSE une entité vide dans read/mutate (hors grammaire d'entité)", () => {
		const rRead = buildOperation({
			name: "op",
			input: "In",
			steps: [{ kind: "read", entity: "", as: "$.x" }],
			emits: [],
		});
		expect(rRead.ok).toBe(false);
		if (!rRead.ok)
			expect(rRead.errors.some((e) => e.code === "EMPTY_READ_ENTITY")).toBe(
				true,
			);

		const rMut = buildOperation({
			name: "op",
			input: "In",
			steps: [{ kind: "mutate", entity: "", op: "create" }],
			emits: [],
		});
		expect(rMut.ok).toBe(false);
		if (!rMut.ok)
			expect(rMut.errors.some((e) => e.code === "EMPTY_MUTATE_ENTITY")).toBe(
				true,
			);
	});

	it("REFUSE une op sans nom / sans input / sans étape (refus de niveau op)", () => {
		const r = buildOperation({ name: " ", input: "", steps: [], emits: [] });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		const codes = r.errors.map((e) => e.code);
		expect(codes).toContain("EMPTY_NAME");
		expect(codes).toContain("EMPTY_INPUT");
		expect(codes).toContain("NO_STEPS");
	});

	it("MUTATE_OPS est l'ensemble fermé {create, clear}", () => {
		expect([...MUTATE_OPS]).toEqual(["create", "clear"]);
	});
});

describe("operation twin V3 — C: deriveMirror (cohérence Emits)", () => {
	const op = (() => {
		const r = buildOperation(CREATE_ORDER);
		if (!r.ok) throw new Error("fixture build failed");
		return r.op;
	})();

	it("dérive la fixture {state→cmd→events} : command = (name, input), expectedEvents = op.emits", () => {
		const r = deriveMirror(
			{
				given: "un panier avec des articles",
				when: "le client place sa commande",
				then: "OrderCreated est émis et CartCleared est émis",
			},
			op,
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.fixture.operation).toBe("createOrder");
		expect(r.fixture.command).toEqual({
			name: "createOrder",
			input: "CreateOrderInput",
		});
		expect(r.fixture.expectedEvents).toEqual(["OrderCreated", "CartCleared"]);
	});

	it("REFUSE un Then référençant un événement NON déclaré (THEN_REFERENCES_UNDECLARED_EVENT)", () => {
		const r = deriveMirror(
			{
				given: "un panier",
				when: "le client paie",
				then: "PaymentCaptured est émis", // jamais dans op.emits
			},
			op,
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(
			r.errors.some((e) => e.code === "THEN_REFERENCES_UNDECLARED_EVENT"),
		).toBe(true);
	});

	it("tout événement nommé dans le Then DOIT être dans op.emits (∀, fast-check)", () => {
		const declared = ["OrderCreated", "CartCleared"];
		fc.assert(
			fc.property(
				fc.subarray(declared, { minLength: 0 }),
				fc.boolean(),
				(picked, addUndeclared) => {
					const events = addUndeclared ? [...picked, "GhostEmitted"] : picked;
					const then = `${events.map((e) => `${e} est émis`).join(", ")} fin.`;
					const r = deriveMirror(
						{
							given: "g",
							when: "w",
							then: then.trim() === "fin." ? "rien n'est émis" : then,
						},
						op,
					);
					if (addUndeclared) {
						// Un événement hors emits ⇒ refus garanti.
						expect(r.ok).toBe(false);
					} else {
						// Tous déclarés (ou aucun) ⇒ accepté.
						expect(r.ok).toBe(true);
					}
				},
			),
		);
	});

	it("REFUSE un Given/When/Then vide", () => {
		const r = deriveMirror({ given: "", when: " ", then: "" }, op);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		const codes = r.errors.map((e) => e.code);
		expect(codes).toContain("EMPTY_GIVEN");
		expect(codes).toContain("EMPTY_WHEN");
		expect(codes).toContain("EMPTY_THEN");
	});
});

describe("operation twin V3 — proposeBody (LA porte de proposition, round-trip)", () => {
	const op = (() => {
		const r = buildOperation(CREATE_ORDER);
		if (!r.ok) throw new Error("fixture build failed");
		return r.op;
	})();
	const fixture = (() => {
		const r = deriveMirror(
			{
				given: "un panier",
				when: "commande",
				then: "OrderCreated et CartCleared émis",
			},
			op,
		);
		if (!r.ok) throw new Error("fixture derive failed");
		return r.fixture;
	})();

	it("propose une idée {proposes:'operation', source:'human'} (jamais une écriture truth)", () => {
		const body = proposeBody(op, fixture);
		expect(body.proposes).toBe("operation");
		expect(body.source).toBe("human");
		expect(body.intent).toContain("createOrder");
	});

	it("round-trip : le detail se réhydrate byte-identique en {ast, mirror}", () => {
		const body = proposeBody(op, fixture);
		const parsed = parseProposeDetail(body.detail);
		expect(parsed.ast).toEqual(op);
		expect(parsed.mirror).toEqual(fixture);
		// Re-proposer le même (op, fixture) donne le MÊME detail (déterministe).
		expect(proposeBody(op, fixture).detail).toBe(body.detail);
	});

	it("le detail est un JSON CANONIQUE (clés triées lex. — records.Canonicalize)", () => {
		const body = proposeBody(op, fixture);
		// Le re-canonicalisé du parsé est identique : invariant de forme canonique.
		expect(canonicalJSON(parseProposeDetail(body.detail))).toBe(body.detail);
		// Au top niveau, "ast" < "mirror" (ordre lex.).
		expect(body.detail.indexOf('"ast"')).toBeLessThan(
			body.detail.indexOf('"mirror"'),
		);
	});

	it("canonicalJSON trie par octet PUR — byte-fidèle à Go sort.Strings (∀, fast-check)", () => {
		fc.assert(
			fc.property(
				fc.dictionary(fc.string({ maxLength: 6 }), fc.integer()),
				(obj) => {
					const out = canonicalJSON(obj);
					// L'ordre des clés DANS LA CHAÎNE émise est le tri lex pur (sort.Strings côté
					// Go) — pas l'ordre JS « index entier d'abord ». On lit les clés dans les
					// octets émis et on vérifie qu'elles sont triées lex.
					const emittedKeys = [...out.matchAll(/"((?:[^"\\]|\\.)*)":/g)].map(
						(m) => JSON.parse(`"${m[1]}"`),
					);
					expect(emittedKeys).toEqual([...emittedKeys].sort());
				},
			),
		);
	});

	it("canonicalJSON met la clé « 0 » APRÈS la clé vide (là où JSON.stringify échouerait)", () => {
		// Le contre-exemple qui a démasqué le bug : JSON.stringify émettrait "0" avant "".
		// Le tri par octet pur (sort.Strings) place "" (rien) avant "0" (0x30).
		expect(canonicalJSON({ "0": 1, "": 2 })).toBe('{"":2,"0":1}');
	});
});
