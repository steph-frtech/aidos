"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	type Battery,
	SENSOR_KINDS,
	type SensorKind,
	type SensorVerdict,
} from "@/lib/self-cert";
import { certifyArgs, demoBattery } from "@/lib/self-cert-data";
import { batteryDecoder } from "./live";

/**
 * Server Actions for the /self-cert Workbench panel (S84 — computational self-certification in
 * the build loop).
 *
 * THE STEP (ROADMAP S84): at each diff the build loop self-certifies over the REAL computational
 * sensor battery (types/lint/unit/fixtures/properties/Pact contract/arch-fitness of the emitted
 * TS tree via dependency-cruiser), gating EVERY iteration. The iteration is GREEN only when every
 * sensor passes; a diff that breaks an arch boundary or a Pact contract reddens its sensor and
 * BLOCKS the iteration before green.
 *
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). The certify control now reads the
 * LIVE gated battery from the Go self-cert MCP server through the passerelle (`readVia(scope,
 * "selfcert_certify", …)`, the dispatched below-the-line read), with the twin `lib/self-cert.certify`
 * compute preserved ONLY as the deterministic demo fallback (`lib/self-cert-data.demoBattery`, tagged
 * `source:"live"|"demo"`). The action NO LONGER folds the verdicts client-side. The `readVia` frontier
 * import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback (the same pure twin compute the
 * Go selfcert.Certify reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * battery. The judge is the deterministic mirror, never the LLM.
 *
 * THE WALL (CLAUDE.md §2): the gate is a READ/COMPUTE below the line — it writes NOTHING (WroteKernel
 * always false). The sensor RUNS happen over the sandbox (S82); a truth a green build proposes goes
 * through propose→ChangeSet (S85). This action returns the Battery as a VALUE.
 */

export interface CertifyResult {
	ok: boolean;
	/** i18n key under "selfCert.messages" describing a validation outcome (empty when ok). */
	messageKey?: string;
	/** The computed self-certification battery (when ok). */
	battery?: Battery;
	/** the read source — "live" (the Go engine answered) or "demo" (the deterministic fallback). */
	source?: "live" | "demo";
}

/**
 * certifyDiffAction is the action-capable control behind the self-cert console (CLAUDE.md §7
 * ui-completeness): the human picks, per sensor, whether it is green or red over the candidate
 * diff (and an optional detail — the arch boundary / Pact contract / type error that broke),
 * then submits — the action reads the gated battery LIVE from the Go engine through the passerelle
 * (the twin demoBattery is the deterministic fallback). A red sensor (a broken arch boundary or Pact
 * contract) yields a red battery with BUILD_LOOP_SENSOR_RED: the iteration is blocked before green.
 * No LLM enters; the judge is the deterministic mirror.
 */
export async function certifyDiffAction(
	_prev: CertifyResult,
	formData: FormData,
): Promise<CertifyResult> {
	const verdicts: SensorVerdict[] = [];
	for (const kind of SENSOR_KINDS) {
		// A checked checkbox named `green-<kind>` means the sensor passed; absent ⇒ red.
		const green = String(formData.get(`green-${kind}`) ?? "") === "on";
		const detail = String(formData.get(`detail-${kind}`) ?? "").trim();
		const v: SensorVerdict = {
			kind: kind as SensorKind,
			state: green ? "green" : "red",
		};
		if (!green && detail !== "") v.detail = detail;
		verdicts.push(v);
	}

	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"selfcert_certify",
		certifyArgs(verdicts),
		batteryDecoder,
		demoBattery(verdicts),
	);
	return { ok: true, battery: data, source };
}
