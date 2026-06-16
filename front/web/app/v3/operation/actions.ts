"use server";

import { captureIdea } from "@/lib/capture-idea";
import {
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	type BuildError,
	buildOperation,
	type DeriveError,
	deriveMirror,
	type Fixture,
	type GherkinIntent,
	type OperationAST,
	proposeBody,
	type StepInput,
	type TypedInputs,
} from "@/lib/v3/operation";

/**
 * Server Actions for the /v3/operation authoring surface (autoring d'opération V3, B+C).
 *
 * THE SURFACE (this slice): the human authors a WORKFLOW (N2) truth-CANDIDATE for the
 * active project — a typed Operation AST (B, buildOperation) + its derived BDD mirror
 * (C, deriveMirror, the fixture state→command→events) — and PROPOSES it. There is NO
 * chat / NL here (that is tranche 2, gated): the AST is CONSTRUCTED by the typed editor,
 * the mirror DERIVED by the pure reducer. The Go (back/kernel/operation) is the authority;
 * lib/v3/operation is its byte-faithful twin, pinned by lib/v3/operation.test.ts.
 *
 * THE WALL (CLAUDE.md §2) — INVIOLABLE: this PROPOSES, it NEVER writes truth. The proposal
 * rides the SINGLE legal capture door (idea_capture, EL05/S59): a draft `ideas` row, no
 * version, no mirror-freeze — a candidate-truth ABOVE the product but BELOW the freeze. The
 * promotion to a kernel.operation truth is /goal → ChangeSet → HUMAN approval (out of scope,
 * a documented forward-dependency). No kernel/mirrors/fitness write ever originates here; the
 * promotion-gate hook refuses "no mirror, no kernel".
 *
 * THE DISPATCH (S59): the proposal goes through the typed gateway (callGateway/readVia →
 * gateway_call → idea_capture). When the passerelle is down / undispatched / refused, a
 * GOVERNED demo fallback yields the deterministic draft the pure twin (captureIdea, the
 * byte-identical twin of ideas.Capture) would compute (source:"demo") — never a silent
 * broken-live, never a partial write.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): build + derive + proposeBody are PURE; this action
 * only validates the typed form and relays an already-decided, content-addressed proposal.
 */

/** The id + status of the draft idea the capture door produced (the proposal landing). */
export interface ProposedIdea {
	id: string;
	status: string;
	source: Source;
}

/** ProposeResult — the outcome of a propose attempt, rendered by the client panel. */
export interface ProposeResult {
	ok: boolean;
	/** i18n key under the "v3operation.messages" namespace describing the outcome. */
	messageKey: string;
	/** The typed BUILD refusals (B), when the form did not yield a valid AST. */
	buildErrors?: BuildError[];
	/** The typed DERIVE refusals (C), when the mirror could not be derived. */
	deriveErrors?: DeriveError[];
	/** The draft idea the capture door produced, when the proposal landed. */
	idea?: ProposedIdea;
}

// The idea_capture output shape (the idea-intake MCP ideaOutput), decoded ONCE — the
// single declaration of the door's response (never double-typed). We only consume the
// id + status (the proposal landing); the rest is echoed back by the door.
interface CaptureOutput {
	id: string;
	status: string;
}
const captureDecoder: Decoder<CaptureOutput> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const status = str(raw.status);
	if (id === null || status === null) return null;
	return { id, status };
};

/**
 * proposeOperationAction is the action-capable control behind the "Proposer" button
 * (CLAUDE.md §7 ui-completeness): the human submits a typed Operation AST + a Given/When/
 * Then mirror; the action re-runs B (buildOperation) + C (deriveMirror) SERVER-SIDE (the
 * code is the authority — never trusting a client-built payload), encodes the proposal via
 * proposeBody, and DISPATCHES it through the gateway to idea_capture (a draft `ideas` row,
 * HUMAN provenance, scoped to the active project). Returns the draft idea's id + status, or
 * the typed build/derive refusals. THE WALL: a propose, never a truth-write.
 */
export async function proposeOperationAction(
	_prev: ProposeResult,
	formData: FormData,
): Promise<ProposeResult> {
	// The editor serialises its typed state into two hidden fields (already-typed JSON, no
	// NL parse): the Operation form (B) and the Gherkin intent (C). A malformed payload is a
	// programming error of the client, not a user input — we fail closed, never coerce.
	let typed: TypedInputs;
	let intent: GherkinIntent;
	try {
		const opRaw = JSON.parse(String(formData.get("op") ?? "")) as TypedInputs;
		const mirrorRaw = JSON.parse(
			String(formData.get("mirror") ?? ""),
		) as GherkinIntent;
		typed = normaliseTyped(opRaw);
		intent = {
			given: String(mirrorRaw.given ?? ""),
			when: String(mirrorRaw.when ?? ""),
			// biome-ignore lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD — jamais une thenable.
			then: String(mirrorRaw.then ?? ""),
		};
	} catch {
		return { ok: false, messageKey: "malformedPayload" };
	}

	// B — re-build the AST SERVER-SIDE (the authority). A typed refusal blocks the propose.
	const built = buildOperation(typed);
	if (!built.ok) {
		return {
			ok: false,
			messageKey: "buildRefused",
			buildErrors: [...built.errors],
		};
	}
	const op: OperationAST = built.op;

	// C — re-derive the mirror SERVER-SIDE. The propose gate (C obligatory) is enforced both
	// client-side (the disabled button) AND here (no mirror ⇒ no proposal can land).
	const derived = deriveMirror(intent, op);
	if (!derived.ok) {
		return {
			ok: false,
			messageKey: "deriveRefused",
			deriveErrors: [...derived.errors],
		};
	}
	const mirror: Fixture = derived.fixture;

	// The proposal — the canonical {proposes, intent, source, detail} body (proposeBody).
	const body = proposeBody(op, mirror);

	// DISPATCH through the gateway to idea_capture (the single legal capture door). The
	// scope is the active (identity, project) from the S57 cookie; the door scopes the draft.
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"idea_capture",
		{
			proposes: body.proposes,
			intent: body.intent,
			source: body.source,
			detail: body.detail,
			project_id: scope.activeProject,
		},
		captureDecoder,
		// GOVERNED demo fallback — the deterministic draft the pure twin (captureIdea, the
		// byte-identical twin of ideas.Capture) would compute. Same content-address id as the
		// live door, status "draft" (the only legal first state). Honest source:"demo".
		demoCapture(body.intent, body.detail),
	);

	return {
		ok: true,
		messageKey: source === "live" ? "proposedLive" : "proposedDemo",
		idea: { id: data.id, status: data.status, source },
	};
}

/**
 * demoCapture computes the draft idea the capture door would land, PURELY — the
 * byte-identical content-address (captureIdea ≡ ideas.Capture) so the demo fallback is
 * faithful to the live door (the same id, the only legal first status "draft").
 */
function demoCapture(intent: string, detail: string): CaptureOutput {
	const idea = captureIdea("operation", intent, { source: "human", detail });
	return { id: idea.id, status: idea.status };
}

/**
 * normaliseTyped coerces the parsed editor payload into the closed TypedInputs shape —
 * every field defaulted, the steps mapped to StepInput recursively. It does NOT validate
 * the grammar (buildOperation owns that, the authority): it only guarantees the shape so
 * the pure reducer sees a total input. No NL, no coercion of values — strings stay strings.
 */
function normaliseTyped(raw: TypedInputs): TypedInputs {
	return {
		name: String(raw.name ?? ""),
		input: String(raw.input ?? ""),
		emits: Array.isArray(raw.emits) ? raw.emits.map((e) => String(e)) : [],
		steps: Array.isArray(raw.steps) ? raw.steps.map(normaliseStep) : [],
	};
}

function normaliseStep(s: StepInput): StepInput {
	// Built immutably (StepInput fields are readonly): every present field is coerced to its
	// closed shape; absent fields stay absent (buildOperation defaults them). No NL parse.
	return {
		kind: String(s.kind ?? ""),
		...(s.schema !== undefined ? { schema: String(s.schema) } : {}),
		...(s.policy !== undefined ? { policy: String(s.policy) } : {}),
		...(s.entity !== undefined ? { entity: String(s.entity) } : {}),
		...(s.as !== undefined ? { as: String(s.as) } : {}),
		...(s.op !== undefined ? { op: String(s.op) } : {}),
		...(s.cond !== undefined ? { cond: String(s.cond) } : {}),
		...(s.ref !== undefined ? { ref: String(s.ref) } : {}),
		...(isObject(s.where) ? { where: { ...s.where } } : {}),
		...(isObject(s.data) ? { data: { ...s.data } } : {}),
		// biome-ignore lint/suspicious/noThenProperty: « then » est le champ Then de step.go BranchStep (le sous-pipeline), la langue ubiquitaire KRD — jamais une thenable.
		...(Array.isArray(s.then) ? { then: s.then.map(normaliseStep) } : {}),
		...(Array.isArray(s.else) ? { else: s.else.map(normaliseStep) } : {}),
	};
}
