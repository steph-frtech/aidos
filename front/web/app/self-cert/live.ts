import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";
import {
	type Battery,
	CODE_BUILD_LOOP_SENSOR_RED,
	SENSOR_KINDS,
	type SensorKind,
	type SensorState,
	type SensorVerdict,
} from "../../lib/self-cert";

/**
 * /self-cert live reads — the decoder over the Go self-cert MCP `selfcert_certify` output (S84; the
 * ADR 0092 batch-4A flip). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): this decoder is the SINGLE runtime declaration of the
 * live wire shape; the static Battery / SensorVerdict are the front twin's types it fills. It pins the
 * decoder == the Go selfcertsrv certifyOutput contract ({green, sensors[{kind,state,detail}],
 * red_sensors, block_code}), NOT a second implementation of the battery logic (the Go selfcert.Certify
 * is authoritative — the judge is the deterministic mirror, never the LLM).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo battery. THE WALL (§2): the certify is below-the-line — it folds the sensor
 * verdicts into a VALUE, writes no truth (WroteKernel always false).
 */

function decodeState(raw: unknown): SensorState | null {
	const s = str(raw);
	if (s === "green" || s === "red") return s;
	return null;
}

function isSensorKind(s: string): s is SensorKind {
	return (SENSOR_KINDS as readonly string[]).includes(s);
}

function decodeSensor(raw: unknown): SensorVerdict | null {
	if (!isObject(raw)) return null;
	const kind = str(raw.kind);
	const state = decodeState(raw.state);
	if (kind === null || !isSensorKind(kind) || state === null) return null;
	const detail = str(raw.detail);
	const v: SensorVerdict = { kind, state };
	if (detail !== null && detail !== "") v.detail = detail;
	return v;
}

/** batteryDecoder decodes the Go `certifyOutput` (snake_case block_code/red_sensors) into a Battery. */
export const batteryDecoder: Decoder<Battery> = (
	raw: unknown,
): Battery | null => {
	if (!isObject(raw)) return null;
	if (typeof raw.green !== "boolean") return null;
	const sensors = arr(decodeSensor)(raw.sensors);
	if (sensors === null) return null;
	const battery: Battery = { green: raw.green, sensors };
	const blockCode = str(raw.block_code);
	if (blockCode === CODE_BUILD_LOOP_SENSOR_RED) {
		battery.blockCode = CODE_BUILD_LOOP_SENSOR_RED;
	}
	const redRaw = arr(str)(raw.red_sensors ?? []);
	if (redRaw !== null) {
		const red: SensorKind[] = [];
		for (const k of redRaw) {
			if (isSensorKind(k)) red.push(k);
		}
		if (red.length > 0) battery.redSensors = red;
	}
	return battery;
};
