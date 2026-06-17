import type { CellViolation, FanOutSpec } from "../../lib/federation-cockpit";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /federation-cockpit live read — the decoder over the Go federation `fan_out` tool output (S59
 * cutover, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * THE LIVE PIECE OF THE COCKPIT. The §50 cockpit composes three things: the per-cell BEHAVIOURAL
 * ratchet (S100), the STRUCTURAL ratchet (S102), and the transverse RED-WAVE fan-out (§51). The
 * federation MCP server's `fan_out` tool is the cross-cell composition that returns the red-wave
 * fan-out as a VALUE — exactly which cells a GLOBAL policy reddened and each reddened cell's OWN
 * RedWorkQueue. THIS decoder decodes that fan-out output (federationsrv.fanOutOutput:
 * `{ waves: CellRedWave[], affected: CellRef[] }`) into the front `FanOutSpec` the cockpit
 * overlays. The behavioural + structural ratchets stay the demo-derived twin compute (those tools
 * — measure/ratchet — are the arch-fitness panel's live read, not the cockpit's); the fan-out IS
 * the cockpit's live read.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `fanOutDecoder` is the SINGLE runtime declaration of
 * the live fan-out shape; the static FanOutSpec is the front twin's type the decoder fills. The
 * parity mirror pins the decoder == the Go `fanOutOutput` CONTRACT (the `waves[]` with snake-cased
 * `reddened`/`queue` + the `affected[]` cell refs), NOT a second implementation of the fan-out
 * logic (the Go federation.FanOut is authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same
 * verdict; a malformed payload returns null and readVia falls back to the demo wave.
 */

/**
 * decodeWaveCell decodes one Go `CellRedWave` ({ cell, reddened, queue }) into a front
 * `CellViolation` (cell, violates). The cockpit's FanOutSpec carries the per-cell VIOLATION bit;
 * the Go fan-out reports it as `reddened` (a policy-spanned cell that violates is reddened). The
 * queue rows are advisory for the cockpit overlay (the cockpit re-derives the queue ref from the
 * wave id) — they are decoded for completeness but only `cell` + `reddened` shape the FanOutSpec.
 */
function decodeWaveCell(raw: unknown): CellViolation | null {
	if (!isObject(raw)) return null;
	const cell = str(raw.cell);
	if (cell === null) return null;
	if (typeof raw.reddened !== "boolean") return null;
	return { cell, violates: raw.reddened };
}

/**
 * fanOutDecoder decodes the Go `fan_out` tool output ({ waves, affected }) into the front
 * FanOutSpec the cockpit overlays. The `policy_wave_id` is not carried on the output (it stamps the
 * queue rows server-side); the cockpit supplies it from the request args, so the decoder fills it
 * from the FIRST reddened queue's wave id when present, else leaves it for the action to stamp. The
 * `waves` list is required (an absent/empty fan-out is a legal "no active wave"); a malformed wave
 * cell → null (→ demo fallback).
 */
export const fanOutDecoder: Decoder<FanOutSpec> = (raw) => {
	if (!isObject(raw)) return null;
	const waves = arr(decodeWaveCell)(raw.waves);
	if (waves === null) return null;
	const policyWaveId = waveIdOf(raw);
	return { policyWaveId, cells: waves };
};

/**
 * waveIdOf reads the policy wave id stamped on the first reddened cell's first queue row
 * (RedWorkItem.wave_id), the content address the server stamped the fan-out with. Absent (no
 * reddened cell) ⇒ "" — the cockpit action then stamps the requested wave id. PURE.
 */
function waveIdOf(raw: Record<string, unknown>): string {
	const waves = raw.waves;
	if (!Array.isArray(waves)) return "";
	for (const w of waves) {
		if (!isObject(w)) continue;
		const queue = w.queue;
		if (!Array.isArray(queue)) continue;
		for (const row of queue) {
			if (!isObject(row)) continue;
			const id = str(row.wave_id);
			if (id !== null && id !== "") return id;
		}
	}
	return "";
}
