"use server";

import {
	type Battery,
	certify,
	SENSOR_KINDS,
	type SensorKind,
	type SensorVerdict,
} from "@/lib/self-cert";

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
 * THE ACTION-CAPABLE OP (ui-completeness, CLAUDE.md §7): the op this screen develops is the
 * SELF-CERTIFICATION GATE — given the per-sensor verdicts over a candidate diff, COMPUTE the
 * gated battery (green | red + BUILD_LOOP_SENSOR_RED). It is a PURE FUNCTION of the sensor
 * verdicts (the deterministic twin lib/self-cert.certify, byte-identical to
 * back/runtime/buildloop/selfcert.Certify) — never an LLM judgment. The control on the screen is
 * bound to it and executes it; the Playwright e2e proves it.
 *
 * THE WALL (CLAUDE.md §2): the gate is a READ/COMPUTE below the line — it writes NOTHING. The
 * sensor RUNS happen over the sandbox (S82); a truth a green build proposes goes through
 * propose→ChangeSet (S85). This action never touches the kernel/mirrors/fitness — it returns the
 * Battery as a VALUE.
 */

export interface CertifyResult {
	ok: boolean;
	/** i18n key under "selfCert.messages" describing a validation outcome (empty when ok). */
	messageKey?: string;
	/** The computed self-certification battery (when ok). */
	battery?: Battery;
}

/**
 * certifyDiffAction is the action-capable control behind the self-cert console (CLAUDE.md §7
 * ui-completeness): the human picks, per sensor, whether it is green or red over the candidate
 * diff (and an optional detail — the arch boundary / Pact contract / type error that broke),
 * then submits — the action COMPUTES the gated battery DETERMINISTICALLY (the code is the
 * authority) and returns it. A red sensor (a broken arch boundary or Pact contract) yields a red
 * battery with BUILD_LOOP_SENSOR_RED: the iteration is blocked before green. No LLM enters; the
 * judge is the deterministic mirror.
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

	const battery = certify(verdicts);
	return { ok: true, battery };
}
