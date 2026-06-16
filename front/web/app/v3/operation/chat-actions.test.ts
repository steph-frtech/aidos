// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then) + le champ Then de step.go BranchStep — la langue ubiquitaire KRD, jamais une thenable.
/**
 * chat-actions.test.ts — le MIROIR du chat A (LLM mocké, déterministe) : il PROUVE que le
 * LLM N'EST JAMAIS AUTORITAIRE. Le faux client LLM (un LlmCaller injecté) rend la sortie du
 * modèle entièrement contrôlée, sans réseau ni binaire — la garantie est testée à la source :
 *   (a) candidat VALIDE (verbes de la grammaire fermée, champs présents) → kind:"prefill" + un
 *       TypedInputs qui PASSE buildOperation (l'AST validé pré-remplit l'éditeur B) ;
 *   (b) candidat HORS-GRAMMAIRE (verbe inventé / mutate op illégal) → kind:"refused" : le candidat
 *       est REJETÉ par buildOperation, AUCUN prefill valide — les refus typés remontent à l'écran ;
 *   (c) JSON malformé / candidate absent → kind:"llmUnavailable" / "malformed" : refus, aucun prefill ;
 *   (d) panne LLM (caller → null) → kind:"llmUnavailable" : repli déterministe pur.
 *
 * LE CŒUR DE LA PREUVE (la frontière déterministe) : quoi que propose le faux LLM, c'est
 * buildOperation (l'autorité PURE) qui décide. Le LLM propose ; le code juge.
 *
 * + le SOCLE PUR (lib/v3/operation-chat) : coerceCandidate / candidateToTyped / parsePairs /
 *   judgeCandidate — déterministes, sans LLM (determinism-first, CLAUDE.md §6/§8).
 */

import { describe, expect, it } from "vitest";
import { buildOperation } from "../../../lib/v3/operation";
import {
	candidateToTyped,
	coerceCandidate,
	judgeCandidate,
	parsePairs,
} from "../../../lib/v3/operation-chat";
import {
	type LlmCaller,
	type OperationGrammar,
	proposeFromText,
} from "./chat-actions";

const GRAMMAR: OperationGrammar = {
	entities: ["Cart", "Order"],
	policies: ["canPlaceOrder"],
	events: ["OrderCreated", "CartCleared"],
};

/** fakeLlm — un faux LlmCaller : renvoie EXACTEMENT la réponse-modèle qu'on lui fixe (déterministe). */
function fakeLlm(modelReply: string): LlmCaller {
	return async () => modelReply;
}

/** Le JSON-réponse que le modèle « renverrait » : {reply, candidate}, sérialisé tel quel. */
function modelJson(reply: string, candidate: unknown): string {
	return JSON.stringify({ reply, candidate });
}

// Le candidat VALIDE (createOrder) que le LLM proposerait — tous verbes ∈ grammaire fermée.
const VALID_CANDIDATE = {
	name: "createOrder",
	input: "CreateOrderInput",
	steps: [
		{ kind: "validate", schema: "CreateOrderInput" },
		{ kind: "authorize", policy: "canPlaceOrder" },
		{
			kind: "read",
			entity: "Cart",
			where: "id = $.input.cartId",
			as: "$.cart",
		},
		{
			kind: "mutate",
			entity: "Order",
			op: "create",
			data: "items = $.cart.items",
			as: "$.order",
		},
		{ kind: "return", ref: "$.order" },
	],
	emits: ["OrderCreated"],
};

describe("proposeFromText — le LLM propose, le code juge (la frontière déterministe)", () => {
	it("(a) candidat VALIDE → prefill : l'AST proposé PASSE buildOperation", async () => {
		const res = await proposeFromText(
			"crée une commande à partir du panier",
			GRAMMAR,
			fakeLlm(modelJson("J'ai compris : créer une commande.", VALID_CANDIDATE)),
		);

		expect(res.kind).toBe("prefill");
		if (res.kind !== "prefill") return;
		// Le typed pré-rempli est exactement ce que l'éditeur B recevra ; il passe l'autorité.
		const built = buildOperation(res.typed);
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.op.name).toBe("createOrder");
		expect(built.op.steps.map((s) => s.kind)).toEqual([
			"validate",
			"authorize",
			"read",
			"mutate",
			"return",
		]);
		expect(built.op.emits).toEqual(["OrderCreated"]);
		expect(res.reply).toContain("compris");
	});

	it("(b) verbe INVENTÉ → refused : buildOperation REJETTE, AUCUN prefill valide", async () => {
		const candidate = {
			name: "createOrder",
			input: "CreateOrderInput",
			// « persist » n'est PAS l'un des six verbes : hors grammaire fermée.
			steps: [{ kind: "persist", entity: "Order" }],
			emits: [],
		};
		const res = await proposeFromText(
			"sauvegarde la commande",
			GRAMMAR,
			fakeLlm(modelJson("Je propose une étape de sauvegarde.", candidate)),
		);

		expect(res.kind).toBe("refused");
		if (res.kind !== "refused") return;
		// Le refus est TYPÉ : c'est buildOperation (l'autorité), pas le LLM, qui décide.
		expect(res.errors.some((e) => e.code === "UNKNOWN_STEP_KIND")).toBe(true);
		// Et le typed renvoyé pour affichage NE passe PAS l'autorité (jamais un prefill « valide »).
		expect(buildOperation(res.typed).ok).toBe(false);
	});

	it("(b') mutate op ILLÉGALE → refused : buildOperation REJETTE (UNKNOWN_MUTATE_OP)", async () => {
		const candidate = {
			name: "wipeOrder",
			input: "WipeInput",
			// « delete » n'est pas dans {create, clear} : hors grammaire fermée.
			steps: [
				{
					kind: "mutate",
					entity: "Order",
					op: "delete",
					where: "id = $.input.id",
				},
			],
			emits: [],
		};
		const res = await proposeFromText(
			"supprime la commande",
			GRAMMAR,
			fakeLlm(modelJson("Je propose une suppression.", candidate)),
		);

		expect(res.kind).toBe("refused");
		if (res.kind !== "refused") return;
		expect(res.errors.some((e) => e.code === "UNKNOWN_MUTATE_OP")).toBe(true);
	});

	it("(b'') entité inconnue NON refusée par le chat — la ref libre est validée en FORME, jugée en aval", async () => {
		// Une entité hors les pistes du projet n'est PAS un refus de grammaire (les refs sont
		// libres en forme, S11) : le candidat passe buildOperation. La preuve que le chat n'invente
		// pas une autorité de domaine — il ne juge QUE la grammaire fermée (les verbes), via build.
		const candidate = {
			name: "touchWidget",
			input: "WidgetInput",
			steps: [
				{ kind: "read", entity: "Widget", where: "id = $.input.id", as: "$.w" },
				{ kind: "return", ref: "$.w" },
			],
			emits: [],
		};
		const res = await proposeFromText(
			"lis un widget",
			GRAMMAR,
			fakeLlm(modelJson("Je lis un widget.", candidate)),
		);
		expect(res.kind).toBe("prefill");
		if (res.kind !== "prefill") return;
		expect(buildOperation(res.typed).ok).toBe(true);
	});

	it("(c) JSON malformé → llmUnavailable : aucun prefill", async () => {
		const res = await proposeFromText(
			"crée une commande",
			GRAMMAR,
			fakeLlm("ceci n'est pas du JSON {{{ cassé"),
		);
		expect(res.kind).toBe("llmUnavailable");
	});

	it("(c') candidate:null (le LLM renonce) → malformed : aucun prefill, on garde sa phrase", async () => {
		const res = await proposeFromText(
			"euh je sais pas",
			GRAMMAR,
			fakeLlm(modelJson("Il me manque des détails sur l'opération.", null)),
		);
		expect(res.kind).toBe("malformed");
		if (res.kind !== "malformed") return;
		expect(res.reply).toContain("manque");
	});

	it("(c'') candidat de forme inexploitable (steps non-array) → malformed : JETÉ", async () => {
		const res = await proposeFromText(
			"n'importe quoi",
			GRAMMAR,
			fakeLlm(
				modelJson("Voilà.", {
					name: "x",
					input: "y",
					steps: "pas un tableau",
					emits: [],
				}),
			),
		);
		expect(res.kind).toBe("malformed");
	});

	it("(d) panne LLM (caller → null) → llmUnavailable : repli déterministe pur", async () => {
		const res = await proposeFromText(
			"crée une commande",
			GRAMMAR,
			async () => null,
		);
		expect(res.kind).toBe("llmUnavailable");
	});

	it("message vide → llmUnavailable sans appeler le LLM", async () => {
		let called = false;
		const res = await proposeFromText("   ", GRAMMAR, async () => {
			called = true;
			return modelJson("x", VALID_CANDIDATE);
		});
		expect(res.kind).toBe("llmUnavailable");
		expect(called).toBe(false);
	});
});

describe("operation-chat — le socle PUR (coercion + jonction A→B, aucun LLM)", () => {
	it("coerceCandidate coerce une forme close ; un non-objet / steps non-array → null", () => {
		expect(coerceCandidate(null)).toBeNull();
		expect(coerceCandidate({ name: "x", steps: 42 })).toBeNull();
		const c = coerceCandidate(VALID_CANDIDATE);
		expect(c).not.toBeNull();
		expect(c?.name).toBe("createOrder");
		expect(c?.steps.length).toBe(5);
	});

	it("coerceCandidate coerce les types non-string en string (candidat UNTRUSTWORTHY)", () => {
		const c = coerceCandidate({
			name: 123,
			input: true,
			steps: [{ kind: "validate", schema: 99 }],
			emits: ["A", 7, "B"],
		});
		expect(c?.name).toBe(""); // 123 n'est pas une string → ""
		expect(c?.input).toBe("");
		expect(c?.steps[0]?.schema).toBe(""); // 99 → ""
		expect(c?.emits).toEqual(["A", "B"]); // le 7 (coercé "") est filtré
	});

	it("coerceCandidate accepte where/data en OBJET et les re-sérialise en texte « k = v » (clés triées)", () => {
		const c = coerceCandidate({
			name: "n",
			input: "i",
			steps: [
				{ kind: "read", entity: "Cart", where: { b: "2", a: "1" }, as: "$.c" },
			],
			emits: [],
		});
		// L'objet libre du LLM est NORMALISÉ en texte trié (déterminisme) ; B le re-parse.
		expect(c?.steps[0]?.where).toBe("a = 1\nb = 2");
	});

	it("candidateToTyped projette vers la MÊME forme que l'éditeur B (where/data parsés via parsePairs)", () => {
		const c = coerceCandidate(VALID_CANDIDATE);
		if (c === null) throw new Error("candidate inattendu null");
		const typed = candidateToTyped(c);
		const readStep = typed.steps[2];
		expect(readStep.kind).toBe("read");
		if (readStep.kind === "read")
			expect(readStep.where).toEqual({ id: "$.input.cartId" });
		const mutateStep = typed.steps[3];
		expect(mutateStep.kind).toBe("mutate");
		if (mutateStep.kind === "mutate") {
			expect(mutateStep.op).toBe("create");
			expect(mutateStep.data).toEqual({ items: "$.cart.items" });
		}
	});

	it("parsePairs : « clé = valeur » par ligne → objet plat (ordre préservé, lignes vides ignorées)", () => {
		expect(parsePairs("a = 1\n\nb = 2\npasdegal")).toEqual({ a: "1", b: "2" });
	});

	it("judgeCandidate EST la porte : forme inexploitable → malformed ; sinon le verdict de buildOperation", () => {
		expect(judgeCandidate(null).kind).toBe("malformed");
		const valid = judgeCandidate(VALID_CANDIDATE);
		expect(valid.kind).toBe("judged");
		if (valid.kind === "judged") expect(valid.build.ok).toBe(true);
		const bad = judgeCandidate({
			name: "x",
			input: "y",
			steps: [{ kind: "teleport" }],
			emits: [],
		});
		expect(bad.kind).toBe("judged");
		if (bad.kind === "judged") expect(bad.build.ok).toBe(false);
	});

	it("DÉTERMINISME : même candidat → même typed (réducteur pur)", () => {
		const a = candidateToTyped(
			coerceCandidate(VALID_CANDIDATE) ?? {
				name: "",
				input: "",
				steps: [],
				emits: [],
			},
		);
		const b = candidateToTyped(
			coerceCandidate(VALID_CANDIDATE) ?? {
				name: "",
				input: "",
				steps: [],
				emits: [],
			},
		);
		expect(a).toEqual(b);
	});
});
