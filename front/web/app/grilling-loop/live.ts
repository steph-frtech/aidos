import type { ProvenanceSource, Status } from "../../lib/capture-idea";
import type { GrillVerdict } from "../../lib/exploration";
import { type Decoder, isObject, str } from "../../lib/gateway-sdk";
import { knownVerdict, type VerdictRecord } from "../../lib/grilling-loop";

/**
 * /grilling-loop live reads — the decoder over the Go grilling-loop MCP `grill_route` output (S65; the
 * ADR 0092 batch-4B flip). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the decoder is a PURE importable function.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): this decoder is the SINGLE runtime declaration of the
 * live wire shape; the static VerdictRecord is the twin's type it fills. It pins the decoder == the Go
 * grillingloopsrv routeOutput contract ({id, proposes, intent, source, detail, status, verdict, reason})
 * — reconstructing the twin's nested idea.provenance{source,detail} + idea.rejectReason from the flat Go
 * fields — NOT a second implementation of the routing logic (the Go grillingloop.Route is authoritative;
 * the routing is deterministic, the LLM is the barricaded re-verify exception).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same VerdictRecord; a malformed payload returns null and readVia
 * falls back to the demo. THE WALL (§2): the routed idea is a CANDIDATE-truth (no version, no mirror) —
 * persistence is the below-the-line ideas write the action does; promotion stays the /goal flow.
 */

const STATUSES: readonly Status[] = [
	"draft",
	"grilled",
	"spiking",
	"harvested",
	"rejected",
];

/** routeDecoder decodes the Go `routeOutput` into a VerdictRecord (the twin's nested idea shape). */
export const routeDecoder: Decoder<VerdictRecord> = (
	raw: unknown,
): VerdictRecord | null => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const proposes = str(raw.proposes);
	const intent = str(raw.intent);
	const sourceRaw = str(raw.source);
	const detail = str(raw.detail) ?? "";
	const status = str(raw.status);
	const verdict = str(raw.verdict);
	if (
		id === null ||
		proposes === null ||
		intent === null ||
		status === null ||
		verdict === null
	) {
		return null;
	}
	if (!(STATUSES as readonly string[]).includes(status)) return null;
	if (!knownVerdict(verdict)) return null;
	const source: ProvenanceSource =
		sourceRaw === "incident" ? "incident" : "human";
	const reason = str(raw.reason) ?? "";
	const rec: VerdictRecord = {
		idea: {
			id,
			// proposes is the kernel-kind the intention proposes; the twin's Proposes is a string union the
			// Go server already validated (route refuses an off-schema proposes) — kept as the wire value.
			proposes: proposes as VerdictRecord["idea"]["proposes"],
			intent,
			provenance: { source, detail },
			status: status as Status,
			...(verdict === "bad" && reason !== "" ? { rejectReason: reason } : {}),
		},
		verdict: verdict as GrillVerdict,
		...(verdict === "bad" && reason !== "" ? { reason } : {}),
	};
	return rec;
};
