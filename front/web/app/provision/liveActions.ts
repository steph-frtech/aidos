"use server";

import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { SAMPLE_ENTITY, SAMPLE_GO_DECISION } from "@/lib/provision";

/**
 * /provision live read (S59 cutover). It runs the LIVE deterministic datastore planner over a
 * fixed demo Spec through the typed S58 gateway via the S59 SDK — the below-the-line `plan`
 * read of the dispatched provision server (S89, ADR 0006/0047) — confirming the live backend
 * plans byte-identically to the twin (lib/provision), with the deterministic demo plan
 * preserved as the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. `plan` is a PURE below-the-line projection that WRITES
 * NOTHING (the Plan is a record); the fenced stack.engrave_manifest (a StackManifest truth
 * write) is refused by the router BEFORE dispatch. No truth-write ever originates here.
 *
 * DETERMINISM-FIRST (§6/§8): the plan is a membership check + a hash + the SAME DDL emitter —
 * never an LLM; same Spec → byte-identical Plan. A malformed / undispatched / refused gateway
 * answer deterministically yields the demo plan.
 */

/** A live plan summary — the provision.Plan shape (DDL elided), decoded ONCE. */
export interface LivePlan {
	id: string;
	projectId: string;
	target: string;
	image: string;
	database: string;
	namespace: string;
	reasons: string[];
}

export interface LivePlanView {
	plan: LivePlan;
	source: Source;
}

// The decoder is the SINGLE declaration of the live plan shape (never double-typed). The
// dispatched `plan` tool answers with the planOutput envelope {ok, plan, block}; we decode
// the nested plan (the demo fallback covers ok=false / block).
const planDecoder: Decoder<{ plan: LivePlan }> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const p = raw.plan;
	if (!isObject(p)) return null;
	const id = str(p.id);
	const projectId = str(p.projectId);
	const target = str(p.target);
	const image = str(p.image);
	const database = str(p.database);
	const namespace = str(p.namespace);
	const reasons = arr(str)(p.reasons);
	if (
		id === null ||
		projectId === null ||
		target === null ||
		image === null ||
		database === null ||
		namespace === null ||
		reasons === null
	) {
		return null;
	}
	return {
		plan: { id, projectId, target, image, database, namespace, reasons },
	};
};

const DEMO_PROJECT_ID = "demo-app";

/** The deterministic demo plain-Postgres plan — the panel's out-of-the-box provision. */
function demoPlan(): { plan: LivePlan } {
	return {
		plan: {
			id: "demo-plan",
			projectId: DEMO_PROJECT_ID,
			target: "plain-postgres",
			image: "postgres:16",
			database: "app_demo",
			namespace: "proj_demo",
			reasons: [
				"target plain-postgres (the default by construction; escape hatch always available)",
			],
		},
	};
}

/**
 * livePlan runs the LIVE planner over a fixed demo Spec (live → demo fallback). The entity is
 * sent with kind:"entity" (the S34 EmitMigration requires it) and the measured S88 Go decision.
 */
export async function livePlan(): Promise<LivePlanView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"plan",
		{
			spec: {
				projectId: DEMO_PROJECT_ID,
				target: "",
				decision: SAMPLE_GO_DECISION,
				entities: [
					{
						id: "demo-order",
						kind: "entity",
						name: SAMPLE_ENTITY.name,
						fields: SAMPLE_ENTITY.fields,
					},
				],
				needsVector: false,
			},
		},
		planDecoder,
		demoPlan(),
	);
	return { plan: data.plan, source };
}
