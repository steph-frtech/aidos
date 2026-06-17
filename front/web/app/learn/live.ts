import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";
import type {
	Bump,
	Outcome,
	RedWave,
	RedWorkItem,
	WaveLayer,
} from "../../lib/learn";

/**
 * /learn live read — the decoder over the Go learn `close_loop` tool output (S59 cutover, ADR 0092).
 * Kept OUT of actions.ts (a Next "use server" module may only export async functions) so the parity
 * mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `outcomeDecoder` is the SINGLE runtime declaration of
 * the live outcome shape; the static Outcome (lib/learn) is the contract the decoder fills. The
 * parity mirror pins the decoder == the Go `closeOutput.outcome` contract (learn.Outcome:
 * candidate.idea.provenance{source,detail} · bump{target_id,before,after,moved} ·
 * wave.items[]{target,reason,layer} · wall.code · wrote_kernel) — NOT a second implementation of
 * the bump/wave logic (the Go learn.Close is authoritative). The lean front Outcome PROJECTS the
 * rich Go Outcome: it keeps the provenance, the bump, the mirror-first wave, the wall code, and
 * wrote_kernel; it drops the wave items' dependencies/wave_id and the full idea record.
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo outcome. THE WALL (§2): a live close_loop READS — its WroteKernel is always
 * false; the decoder rejects any payload claiming a kernel write (wrote_kernel must be false).
 */

/** The closed front wave layers (the Go redwave.Layer values the panel renders). */
const WAVE_LAYERS = new Set<WaveLayer>([
	"mirror",
	"projection",
	"operation_action",
	"button",
]);

/** The closed front red-work reasons (the Go redwave.Reason values). */
const WAVE_REASONS = new Set<RedWorkItem["reason"]>([
	"version_stale",
	"failed_test",
	"incident",
]);

/** decodeLayer narrows a string to a closed WaveLayer (else null → reject). */
function decodeLayer(raw: unknown): WaveLayer | null {
	const s = str(raw);
	return s !== null && WAVE_LAYERS.has(s as WaveLayer)
		? (s as WaveLayer)
		: null;
}

/** decodeReason narrows a string to a closed RedWorkItem reason (else null → reject). */
function decodeReason(raw: unknown): RedWorkItem["reason"] | null {
	const s = str(raw);
	return s !== null && WAVE_REASONS.has(s as RedWorkItem["reason"])
		? (s as RedWorkItem["reason"])
		: null;
}

/** decodeBump decodes the Go learn.Bump (snake_case) → the front Bump. */
function decodeBump(raw: unknown): Bump | null {
	if (!isObject(raw)) return null;
	const targetId = str(raw.target_id);
	const before = str(raw.before);
	const after = str(raw.after);
	const moved = typeof raw.moved === "boolean" ? raw.moved : null;
	if (
		targetId === null ||
		before === null ||
		after === null ||
		moved === null
	) {
		return null;
	}
	return { targetId, before, after, moved };
}

/** decodeWorkItem decodes one Go redwave.RedWorkItem → the front RedWorkItem (drops deps/wave_id). */
function decodeWorkItem(raw: unknown): RedWorkItem | null {
	if (!isObject(raw)) return null;
	const target = str(raw.target);
	const reason = decodeReason(raw.reason);
	const layer = decodeLayer(raw.layer);
	if (target === null || reason === null || layer === null) return null;
	return { target, reason, layer };
}

/** decodeWave decodes the Go redwave.RedWave → the front RedWave. An absent items list → []. */
function decodeWave(raw: unknown): RedWave | null {
	if (!isObject(raw)) return null;
	const items = arr(decodeWorkItem)(raw.items ?? []);
	if (items === null) return null;
	return { items };
}

/**
 * outcomeDecoder decodes the Go learn `close_loop` tool output ({ outcome }) into the front Outcome.
 * The tool wraps the outcome under `outcome`; a flat payload (the outcome fields at the root) is
 * tolerated. provenance is read from candidate.idea.provenance{source,detail} (the §S107 incident
 * provenance). A non-incident provenance, a kernel-write claim, or any missing required part →
 * null (→ demo fallback).
 */
export const outcomeDecoder: Decoder<Outcome> = (raw) => {
	if (!isObject(raw)) return null;
	const o = isObject(raw.outcome) ? raw.outcome : raw;

	// provenance — candidate.idea.provenance{source,detail}; the loop is always incident-sourced.
	const candidate = isObject(o.candidate) ? o.candidate : null;
	const idea = candidate && isObject(candidate.idea) ? candidate.idea : null;
	const prov = idea && isObject(idea.provenance) ? idea.provenance : null;
	const provSource = prov ? str(prov.source) : null;
	const provDetail = prov ? str(prov.detail) : null;
	if (provSource !== "incident" || provDetail === null) return null;

	const bump = decodeBump(o.bump);
	const wave = decodeWave(o.wave);
	if (bump === null || wave === null) return null;

	// wall.code — the re-asserted refusal; the loop is a read, so it must be the wall refusal.
	const wall = isObject(o.wall) ? o.wall : null;
	const wallCode = wall ? str(wall.code) : null;
	if (wallCode !== "REALITY_CANNOT_DECLARE_TRUTH") return null;

	// wrote_kernel — the anti-circularity guarantee: a live close_loop NEVER writes truth.
	const wroteKernel =
		typeof o.wrote_kernel === "boolean" ? o.wrote_kernel : null;
	if (wroteKernel !== false) return null;

	return {
		provenanceSource: "incident",
		provenanceDetail: provDetail,
		bump,
		wave,
		wallCode: "REALITY_CANNOT_DECLARE_TRUTH",
		wroteKernel: false,
	};
};
