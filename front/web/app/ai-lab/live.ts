import type {
	CockpitState,
	Mode,
	PairCell,
	PromotionGate,
	Voyant,
	WallTier,
} from "../../lib/ai-lab";
import type {
	BlastRadius,
	CardOption,
	DecisionCard,
	DriftKind,
	Source,
} from "../../lib/conscience";
import type { Facet } from "../../lib/facetwire";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /ai-lab live read — the decoder over the Go ai-lab `build_cockpit` tool output (kill-twins
 * batch, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `cockpitDecoder` is the SINGLE runtime
 * declaration of the live cockpit shape; the static CockpitState is the front twin's type the
 * decoder fills. The parity mirror pins the decoder == the Go `ailabsrv.build_cockpit` →
 * `ailab.CockpitState` contract (kernel_id, mode, cells[], cards[], red_wave[], blast{}, gate?,
 * verdict, green, red, amber), NOT a second implementation of the composition (the Go
 * ailab.BuildCockpit over conscience.Reconcile is authoritative — AUCUN NOUVEAU JUGE).
 * DETERMINISM-FIRST (§6/§8): same JSON → same cockpit; a malformed payload returns null and
 * readVia falls back to the demo cockpit.
 */

/** The closed voyant strings the Go cell carries (🟢/🔴/🟡). */
function decodeVoyant(v: string): Voyant | null {
	return v === "green" || v === "red" || v === "amber" ? v : null;
}

/** The closed wall-tier strings (above = propose-only ; below = read-only from the cockpit). */
function decodeTier(v: string): WallTier | null {
	return v === "above" || v === "below" ? v : null;
}

/** The closed overall verdict strings the cockpit carries (§13.6). */
function decodeVerdict(v: string): "aligned" | "drift" | null {
	return v === "aligned" || v === "drift" ? v : null;
}

/** The closed cockpit mode strings — same screen, different zoom. */
function decodeMode(v: string): Mode | null {
	return v === "conversational" || v === "navigational" ? v : null;
}

/** decodeCell decodes ONE Go `PairCell` (the CENTRE navigable atom). A missing required field
 *  → null (→ demo fallback). */
function decodeCell(raw: unknown): PairCell | null {
	if (!isObject(raw)) return null;
	const key = str(raw.key);
	const facet = str(raw.facet);
	const pair = str(raw.pair);
	const source = str(raw.source);
	const voyantStr = str(raw.voyant);
	const tierStr = str(raw.tier);
	if (
		key === null ||
		facet === null ||
		pair === null ||
		source === null ||
		voyantStr === null ||
		tierStr === null
	) {
		return null;
	}
	if (typeof raw.read_only !== "boolean") return null;
	const voyant = decodeVoyant(voyantStr);
	const tier = decodeTier(tierStr);
	if (voyant === null || tier === null) return null;
	return {
		key,
		facet: facet as Facet,
		pair,
		source,
		voyant,
		tier,
		readOnly: raw.read_only,
	};
}

/** decodeCard decodes ONE Go `conscience.DecisionCard` (the DROITE card). `blast`, `options[]` and
 *  the recommendation are required; drift/detail tolerate absence (the Go `omitempty`). Identical
 *  contract to the /conscience panel's decodeCard — the cards come from the same FK09 source. */
function decodeCard(raw: unknown): DecisionCard | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const kernelId = str(raw.kernel_id);
	const source = str(raw.source);
	const facet = str(raw.facet);
	const pair = str(raw.pair);
	const blast = str(raw.blast);
	const recommendation = str(raw.recommendation);
	if (
		id === null ||
		kernelId === null ||
		source === null ||
		facet === null ||
		pair === null ||
		blast === null ||
		recommendation === null
	) {
		return null;
	}
	if (typeof raw.advisory !== "boolean") return null;
	const options = arr(str)(raw.options);
	if (options === null) return null;
	const drift = raw.drift === undefined ? undefined : str(raw.drift);
	const detail = raw.detail === undefined ? undefined : str(raw.detail);
	return {
		id,
		kernel_id: kernelId,
		source: source as Source,
		facet: facet as Facet,
		pair,
		drift: (drift ?? undefined) as DriftKind | undefined,
		detail: detail ?? undefined,
		blast: blast as BlastRadius,
		options: options as CardOption[],
		recommendation: recommendation as CardOption,
		advisory: raw.advisory,
	};
}

/** decodeGate decodes the optional Go `PromotionGate` (DROITE, FK10). Absent (omitempty) →
 *  undefined; present-but-malformed → null (→ demo fallback for the whole cockpit). */
function decodeGate(raw: unknown): PromotionGate | null | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (!isObject(raw)) return null;
	const level = num(raw.level);
	const nextLevel = num(raw.next_level);
	if (level === null || nextLevel === null) return null;
	if (typeof raw.can_promote !== "boolean") return null;
	return { level, canPromote: raw.can_promote, nextLevel };
}

/** decodeBlast decodes the Go `blast` map {cardID → blast radius} (a flat string→string record). */
function decodeBlast(raw: unknown): Record<string, string> | null {
	if (raw === undefined || raw === null) return {};
	if (!isObject(raw)) return null;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw)) {
		const s = str(v);
		if (s === null) return null;
		out[k] = s;
	}
	return out;
}

/**
 * cockpitDecoder decodes the Go `build_cockpit` tool output (ailab.CockpitState: `{ kernel_id,
 * mode, cells, cards, red_wave, blast, gate?, verdict, green, red, amber }`) into the front
 * CockpitState. The Go `red_wave` (snake) maps to the front `redWave` (camel); a missing required
 * field → null (→ demo fallback). PURE + total.
 */
export const cockpitDecoder: Decoder<CockpitState> = (raw) => {
	if (!isObject(raw)) return null;
	const kernelId = str(raw.kernel_id);
	const modeStr = str(raw.mode);
	const verdictStr = str(raw.verdict);
	const green = num(raw.green);
	const red = num(raw.red);
	const amber = num(raw.amber);
	if (
		kernelId === null ||
		modeStr === null ||
		verdictStr === null ||
		green === null ||
		red === null ||
		amber === null
	) {
		return null;
	}
	const mode = decodeMode(modeStr);
	const verdict = decodeVerdict(verdictStr);
	if (mode === null || verdict === null) return null;
	const cells = arr(decodeCell)(raw.cells ?? []);
	const cards = arr(decodeCard)(raw.cards ?? []);
	const redWave = arr(str)(raw.red_wave ?? []);
	if (cells === null || cards === null || redWave === null) return null;
	const blast = decodeBlast(raw.blast);
	if (blast === null) return null;
	const gate = decodeGate(raw.gate);
	if (gate === null) return null;
	return {
		kernel_id: kernelId,
		mode,
		cells,
		cards,
		redWave,
		blast,
		gate,
		verdict,
		green,
		red,
		amber,
	};
};
