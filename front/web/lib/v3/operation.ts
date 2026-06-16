// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then) + le champ Then de step.go BranchStep, la langue ubiquitaire KRD — jamais une thenable.
/**
 * lib/v3/operation.ts — le TWIN TS PUR de l'AST Operation (autorité Go :
 * back/kernel/operation/operation.go + step.go). C'est le SOCLE DÉTERMINISTE de
 * l'autoring d'opération V3 (A+B+C) : mes apps portent leur logique métier comme
 * une vérité N2 (Workflow) au lieu d'un blob de code.
 *
 * TROIS GESTES, AUCUN LLM (CLAUDE.md §6/§8 determinism-first) :
 *   B — buildOperation(typedInputs) → OperationAST : CONSTRUIT l'AST à partir d'un
 *       formulaire déjà typé. Pas de NL, pas de génération : un réducteur PUR qui
 *       valide la grammaire FERMÉE (les six verbes, MutateOp ∈ {create,clear}) et
 *       REFUSE de façon TYPÉE tout ce qui sort de la grammaire (verbe inconnu,
 *       entité vide, schéma manquant…). Le chat NL→candidat est la tranche 2 (gatée).
 *   C — deriveMirror({given,when,then}, op) → fixture {state→cmd→events} : DÉRIVE
 *       le miroir N2 (la forme Workflow, CLAUDE.md §1) à partir des intentions
 *       Gherkin + l'AST. Réducteur PUR : le Then référence les Emits déclarés par
 *       l'op (l'op porte ses événements ⇒ la fixture les attend), jamais inventés.
 *   proposeBody(op, mirror) → le `detail` encodé pour idea_capture (la porte de
 *       PROPOSITION, EL05/S59). On PROPOSE une idée {proposes:"operation"}, on
 *       n'écrit JAMAIS kernel/mirrors/fitness (LE MUR, CLAUDE.md §2). La promotion
 *       en vérité (kernel.operation) est /goal → ChangeSet → approbation HUMAINE.
 *
 * BYTE-FIDÉLITÉ À L'AUTORITÉ. La forme de l'AST reflète EXACTEMENT le Go (mêmes six
 * verbes, mêmes champs, MutateOp fermé). Le twin ne fait que CONSTRUIRE / VALIDER la
 * FORME — il n'EXÉCUTE PAS la sémantique d'interprétation (interpret.go reste
 * l'autorité du state→command→events ; on n'en réimplémente rien). Le content-address
 * du `detail` proposé réutilise le MÊME schéma canonique que lib/capture-idea.ts (clés
 * triées lex., SHA-256 hex — records.Canonicalize/Hash), jamais un chemin forké.
 *
 * Miroir de reproductibilité : lib/v3/operation.test.ts (fast-check + vitest).
 */

// ── La grammaire FERMÉE des six verbes (reflet de step.go StepKind) ──────────────

/**
 * StepKind — les SIX verbes du pipeline d'opération, en ordre canonique (pipeline).
 * Reflet EXACT de back/kernel/operation/step.go (KindValidate…KindReturn). Ensemble
 * FERMÉ : aucun autre verbe n'existe (la grammaire close, pas d'échappée free-code).
 */
export type StepKind =
	| "validate"
	| "authorize"
	| "read"
	| "mutate"
	| "branch"
	| "return";

/** STEP_KINDS — les six verbes en ordre canonique (reflet de step.go stepKinds). */
export const STEP_KINDS: readonly StepKind[] = [
	"validate",
	"authorize",
	"read",
	"mutate",
	"branch",
	"return",
] as const;

/** isStepKind — un verbe est-il l'un des six (reflet de step.go IsStepKind) ? */
export function isStepKind(k: string): k is StepKind {
	return (STEP_KINDS as readonly string[]).includes(k);
}

/** MutateOp — l'ensemble FERMÉ des opérations mutate (reflet de operation.go : create | clear). */
export type MutateOp = "create" | "clear";

/** MUTATE_OPS — les deux opérations mutate (reflet de operation.go MutateCreate/MutateClear). */
export const MUTATE_OPS: readonly MutateOp[] = ["create", "clear"] as const;

/** isMutateOp — l'op est-elle create|clear ? */
export function isMutateOp(o: string): o is MutateOp {
	return (MUTATE_OPS as readonly string[]).includes(o);
}

// ── L'union scellée des étapes (reflet des six types concrets de step.go) ────────

/** ValidateStep — shape-check l'input contre un schéma nommé (reflet de step.go). */
export interface ValidateStep {
	readonly kind: "validate";
	readonly schema: string;
}

/** AuthorizeStep — délègue à une Policy nommée ; un DENY court-circuite (reflet de step.go). */
export interface AuthorizeStep {
	readonly kind: "authorize";
	readonly policy: string;
}

/** ReadStep — charge une Entity matchant `where` dans le slot `$.`-rooté `as` (reflet de step.go). */
export interface ReadStep {
	readonly kind: "read";
	readonly entity: string;
	readonly where: Readonly<Record<string, unknown>>;
	readonly as: string;
}

/** MutateStep — crée/efface une Entity, émet un événement (reflet de step.go). */
export interface MutateStep {
	readonly kind: "mutate";
	readonly entity: string;
	readonly op: MutateOp;
	/** pour create : la ligne à écrire (valeurs = sélecteurs/exprs). */
	readonly data: Readonly<Record<string, unknown>>;
	/** pour clear : la cible. */
	readonly where: Readonly<Record<string, unknown>>;
	/** optionnel : le slot `$.`-rooté où lier le résultat. */
	readonly as: string;
}

/** BranchStep — conditionnel (grammaire close, sémantique minimale — reflet de step.go). */
export interface BranchStep {
	readonly kind: "branch";
	readonly cond: string;
	readonly then: readonly Step[];
	readonly else: readonly Step[];
}

/** ReturnStep — nomme le ref résultat (le slot que l'interpréteur expose — reflet de step.go). */
export interface ReturnStep {
	readonly kind: "return";
	readonly ref: string;
}

/** Step — un nœud du corps d'opération. Union SCELLÉE : exactement les six verbes. */
export type Step =
	| ValidateStep
	| AuthorizeStep
	| ReadStep
	| MutateStep
	| BranchStep
	| ReturnStep;

/**
 * OperationAST — un corps de workflow content-addressé (reflet de operation.go
 * Operation : {Name, Input, Steps[], Emits[]}). C'est l'autorité que ce twin
 * CONSTRUIT (B) ; l'EXÉCUTION (state→cmd→events) reste interpret.go côté Go.
 */
export interface OperationAST {
	readonly name: string;
	readonly input: string;
	readonly steps: readonly Step[];
	readonly emits: readonly string[];
}

// ── B — buildOperation : construction DÉTERMINISTE, refus TYPÉS ──────────────────

/** BuildErrorCode — les codes de refus typés de buildOperation (ensemble fermé). */
export type BuildErrorCode =
	| "EMPTY_NAME"
	| "EMPTY_INPUT"
	| "NO_STEPS"
	| "UNKNOWN_STEP_KIND"
	| "EMPTY_VALIDATE_SCHEMA"
	| "EMPTY_AUTHORIZE_POLICY"
	| "EMPTY_READ_ENTITY"
	| "EMPTY_READ_SLOT"
	| "EMPTY_MUTATE_ENTITY"
	| "UNKNOWN_MUTATE_OP"
	| "EMPTY_BRANCH_COND"
	| "EMPTY_RETURN_REF"
	| "EMIT_NOT_DECLARED";

/** BuildError — un refus typé, actionnable (code + explication + index de l'étape fautive). */
export interface BuildError {
	readonly code: BuildErrorCode;
	readonly message: string;
	/** l'index de l'étape fautive dans le pipeline (−1 si la faute est au niveau de l'op). */
	readonly stepIndex: number;
}

/** BuildResult — soit l'AST construit (ok), soit la liste ordonnée des refus (errors). */
export type BuildResult =
	| { readonly ok: true; readonly op: OperationAST }
	| { readonly ok: false; readonly errors: readonly BuildError[] };

/** TypedInputs — les entrées déjà typées du formulaire (B ne fait AUCun parse NL). */
export interface TypedInputs {
	readonly name: string;
	readonly input: string;
	readonly steps: readonly StepInput[];
	readonly emits: readonly string[];
}

/**
 * StepInput — une étape telle que saisie au formulaire : un `kind` (string libre,
 * VALIDÉ contre la grammaire fermée) + les champs propres au verbe. Tout champ hors
 * grammaire est ignoré ; tout champ requis manquant est un refus TYPÉ.
 */
export interface StepInput {
	readonly kind: string;
	readonly schema?: string;
	readonly policy?: string;
	readonly entity?: string;
	readonly where?: Readonly<Record<string, unknown>>;
	readonly as?: string;
	readonly op?: string;
	readonly data?: Readonly<Record<string, unknown>>;
	readonly cond?: string;
	readonly then?: readonly StepInput[];
	readonly else?: readonly StepInput[];
	readonly ref?: string;
}

function err(
	code: BuildErrorCode,
	message: string,
	stepIndex: number,
): BuildError {
	return { code, message, stepIndex };
}

/**
 * buildStep — construit UN Step depuis un StepInput, ou pousse les refus typés. PURE.
 * Le branch construit récursivement ses sous-pipelines (refus propagés avec l'index
 * parent). Aucune sémantique d'interprétation : on VALIDE la forme, on n'exécute rien.
 */
function buildStep(
	si: StepInput,
	index: number,
	errors: BuildError[],
): Step | null {
	if (!isStepKind(si.kind)) {
		errors.push(
			err(
				"UNKNOWN_STEP_KIND",
				`étape ${index} : verbe « ${si.kind} » hors grammaire fermée (${STEP_KINDS.join(" | ")})`,
				index,
			),
		);
		return null;
	}
	switch (si.kind) {
		case "validate": {
			const schema = (si.schema ?? "").trim();
			if (schema === "") {
				errors.push(
					err(
						"EMPTY_VALIDATE_SCHEMA",
						`étape ${index} : validate sans schéma`,
						index,
					),
				);
				return null;
			}
			return { kind: "validate", schema };
		}
		case "authorize": {
			const policy = (si.policy ?? "").trim();
			if (policy === "") {
				errors.push(
					err(
						"EMPTY_AUTHORIZE_POLICY",
						`étape ${index} : authorize sans policy`,
						index,
					),
				);
				return null;
			}
			return { kind: "authorize", policy };
		}
		case "read": {
			const entity = (si.entity ?? "").trim();
			const as = (si.as ?? "").trim();
			let bad = false;
			if (entity === "") {
				errors.push(
					err("EMPTY_READ_ENTITY", `étape ${index} : read sans entité`, index),
				);
				bad = true;
			}
			if (as === "") {
				errors.push(
					err("EMPTY_READ_SLOT", `étape ${index} : read sans slot $.as`, index),
				);
				bad = true;
			}
			if (bad) return null;
			return { kind: "read", entity, where: { ...(si.where ?? {}) }, as };
		}
		case "mutate": {
			const entity = (si.entity ?? "").trim();
			const op = (si.op ?? "").trim();
			let bad = false;
			if (entity === "") {
				errors.push(
					err(
						"EMPTY_MUTATE_ENTITY",
						`étape ${index} : mutate sans entité`,
						index,
					),
				);
				bad = true;
			}
			if (!isMutateOp(op)) {
				errors.push(
					err(
						"UNKNOWN_MUTATE_OP",
						`étape ${index} : mutate op « ${op} » hors {${MUTATE_OPS.join(", ")}}`,
						index,
					),
				);
				bad = true;
			}
			if (bad) return null;
			return {
				kind: "mutate",
				entity,
				op: op as MutateOp,
				data: { ...(si.data ?? {}) },
				where: { ...(si.where ?? {}) },
				as: (si.as ?? "").trim(),
			};
		}
		case "branch": {
			const cond = (si.cond ?? "").trim();
			if (cond === "") {
				errors.push(
					err(
						"EMPTY_BRANCH_COND",
						`étape ${index} : branch sans condition`,
						index,
					),
				);
				return null;
			}
			// Sous-pipelines construits récursivement (refus propagés avec l'index parent).
			const thenSteps: Step[] = [];
			for (const s of si.then ?? []) {
				const built = buildStep(s, index, errors);
				if (built !== null) thenSteps.push(built);
			}
			const elseSteps: Step[] = [];
			for (const s of si.else ?? []) {
				const built = buildStep(s, index, errors);
				if (built !== null) elseSteps.push(built);
			}
			return { kind: "branch", cond, then: thenSteps, else: elseSteps };
		}
		case "return": {
			const ref = (si.ref ?? "").trim();
			if (ref === "") {
				errors.push(
					err("EMPTY_RETURN_REF", `étape ${index} : return sans ref`, index),
				);
				return null;
			}
			return { kind: "return", ref };
		}
	}
}

/**
 * buildOperation — B : construit l'OperationAST depuis des entrées DÉJÀ TYPÉES.
 * Réducteur PUR & TOTAL & DÉTERMINISTE : mêmes entrées → même AST (ou mêmes refus,
 * dans le même ordre). Refuse de façon TYPÉE toute sortie de la grammaire fermée.
 * Les `emits` déclarés par un mutate au pipeline DOIVENT être dans op.emits (l'op
 * porte ses événements ⇒ rien d'émis hors du contrat — reflet de operation.go : « the
 * interpreter's emitted events are a subsequence of Emits »).
 */
export function buildOperation(inputs: TypedInputs): BuildResult {
	const errors: BuildError[] = [];

	const name = inputs.name.trim();
	if (name === "")
		errors.push(err("EMPTY_NAME", "l'opération n'a pas de nom", -1));

	const input = inputs.input.trim();
	if (input === "")
		errors.push(
			err("EMPTY_INPUT", "l'opération n'a pas de schéma d'input", -1),
		);

	if (inputs.steps.length === 0)
		errors.push(err("NO_STEPS", "l'opération n'a aucune étape", -1));

	const steps: Step[] = [];
	inputs.steps.forEach((si, i) => {
		const built = buildStep(si, i, errors);
		if (built !== null) steps.push(built);
	});

	const emits = inputs.emits.map((e) => e.trim()).filter((e) => e !== "");

	if (errors.length > 0) return { ok: false, errors };
	// emits coherence (the Then references only declared events) is enforced in
	// deriveMirror (C) — the fixture surface where the events are actually attested.
	return { ok: true, op: { name, input, steps, emits } };
}

// ── C — deriveMirror : la fixture N2 {state → command → events}, PURE ────────────

/** GherkinIntent — les trois intentions du miroir (la forme Workflow, CLAUDE.md §1). */
export interface GherkinIntent {
	readonly given: string;
	readonly when: string;
	readonly then: string;
}

/**
 * Fixture — un miroir N2 {state → command → events} (CLAUDE.md §1 : Workflow → fixture).
 * `command` = le nom de l'op + son input ; `expectedEvents` = les Emits que l'op
 * DÉCLARE (l'op porte ses événements ⇒ le Then les référence — jamais inventés).
 */
export interface Fixture {
	readonly operation: string;
	readonly given: string;
	readonly command: { readonly name: string; readonly input: string };
	readonly expectedEvents: readonly string[];
	readonly then: string;
}

/** DeriveErrorCode — les refus typés de deriveMirror (ensemble fermé). */
export type DeriveErrorCode =
	| "EMPTY_GIVEN"
	| "EMPTY_WHEN"
	| "EMPTY_THEN"
	| "THEN_REFERENCES_UNDECLARED_EVENT";

/** DeriveError — un refus typé de la dérivation du miroir. */
export interface DeriveError {
	readonly code: DeriveErrorCode;
	readonly message: string;
}

/** DeriveResult — soit la fixture dérivée (ok), soit les refus typés. */
export type DeriveResult =
	| { readonly ok: true; readonly fixture: Fixture }
	| { readonly ok: false; readonly errors: readonly DeriveError[] };

/**
 * deriveMirror — C : DÉRIVE la fixture N2 depuis les intentions Gherkin + l'AST. PURE.
 * COHÉRENCE des événements (le cœur de C) : si le `then` mentionne un nom d'événement
 * (par convention, un identifiant en CamelCase présent dans le texte) qui n'est PAS
 * dans op.emits, c'est un refus TYPÉ — l'op ne peut attendre que ce qu'elle déclare
 * émettre. expectedEvents = op.emits (le contrat d'événements de l'op, reflet de Go).
 */
export function deriveMirror(
	intent: GherkinIntent,
	op: OperationAST,
): DeriveResult {
	const errors: DeriveError[] = [];

	const given = intent.given.trim();
	const when = intent.when.trim();
	const then = intent.then.trim();

	if (given === "")
		errors.push({ code: "EMPTY_GIVEN", message: "le Given est vide" });
	if (when === "")
		errors.push({ code: "EMPTY_WHEN", message: "le When est vide" });
	if (then === "")
		errors.push({ code: "EMPTY_THEN", message: "le Then est vide" });

	// L'op porte ses Emits ⇒ tout événement nommé dans le Then doit être déclaré. Un
	// « événement » est tout identifiant CamelCase (≥2 segments majuscule-initiale,
	// p.ex. OrderCreated, PaymentCaptured) — une règle de forme close, sans liste de
	// suffixes arbitraire (donc PaymentCaptured comme OrderCreated sont détectés).
	const declared = new Set(op.emits);
	const mentioned = then.match(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g) ?? [];
	for (const ev of mentioned) {
		if (!declared.has(ev)) {
			errors.push({
				code: "THEN_REFERENCES_UNDECLARED_EVENT",
				message: `le Then référence l'événement « ${ev} » non déclaré par l'op (emits: ${op.emits.join(", ") || "∅"})`,
			});
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		fixture: {
			operation: op.name,
			given,
			command: { name: op.name, input: op.input },
			expectedEvents: [...op.emits],
			then,
		},
	};
}

// ── proposeBody : l'encodage du `detail` pour idea_capture (LA porte, EL05/S59) ──

/**
 * ProposeBody — le corps d'une proposition idea_capture {proposes, intent, source,
 * detail}. `proposes` est toujours "operation" (on propose une opération). `detail`
 * encode l'AST + le miroir dérivé en JSON DÉTERMINISTE (clés triées lex.) — le payload
 * vérifiable que /grill → /goal réhydrate. C'est une PROPOSITION : on n'écrit JAMAIS
 * kernel/mirrors/fitness (LE MUR). La promotion en vérité reste /goal → ChangeSet.
 */
export interface ProposeBody {
	readonly proposes: "operation";
	readonly intent: string;
	readonly source: "human";
	readonly detail: string;
}

/**
 * canonicalJSON — JSON déterministe BYTE-IDENTIQUE à records.Canonicalize (Go) : clés
 * d'objet triées par ordre lexicographique PUR (sort.Strings côté Go), récursivement,
 * sans espace insignifiant. On ÉMET les octets à la main — JSON.stringify NE convient
 * PAS : il réordonne les clés « index entier » (p.ex. "0") AVANT les clés string, alors
 * que Go trie tout par octet (sort.Strings). Émettre soi-même garantit la byte-fidélité
 * à l'autorité (le miroir operation.test.ts épingle le contre-exemple {"0":..,"":..}).
 */
export function canonicalJSON(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
	if (v !== null && typeof v === "object") {
		const keys = Object.keys(v as Record<string, unknown>).sort();
		const parts = keys.map(
			(k) =>
				`${JSON.stringify(k)}:${canonicalJSON((v as Record<string, unknown>)[k])}`,
		);
		return `{${parts.join(",")}}`;
	}
	// Scalaires (string, number, bool, null) — JSON.stringify est déterministe.
	return JSON.stringify(v);
}

/**
 * proposeBody — encode (op, fixture) en un corps idea_capture. Le `detail` est le
 * JSON canonique {ast, mirror} : déterministe (clés triées), donc content-addressable
 * BYTE-IDENTIQUEMENT au schéma de capture-idea.ts. PURE & TOTALE.
 */
export function proposeBody(op: OperationAST, mirror: Fixture): ProposeBody {
	const detail = canonicalJSON({ ast: op, mirror });
	return {
		proposes: "operation",
		intent: `opération « ${op.name} » : ${op.steps.length} étape(s), émet ${op.emits.join(", ") || "∅"}`,
		source: "human",
		detail,
	};
}

/** ParsedProposal — le résultat du round-trip du detail proposé : {ast, mirror}. */
export interface ParsedProposal {
	readonly ast: OperationAST;
	readonly mirror: Fixture;
}

/**
 * parseProposeDetail — réhydrate {ast, mirror} depuis le `detail` encodé par
 * proposeBody (le round-trip que /grill → /goal exerce). PURE ; lève sur JSON invalide.
 */
export function parseProposeDetail(detail: string): ParsedProposal {
	return JSON.parse(detail) as ParsedProposal;
}
