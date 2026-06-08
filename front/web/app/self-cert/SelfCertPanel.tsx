"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SENSOR_KINDS } from "@/lib/self-cert";
import { type CertifyResult, certifyDiffAction } from "./actions";

/**
 * SelfCertPanel makes the /self-cert route action-capable (ui-completeness law, CLAUDE.md §7):
 * the self-certification gate has a control bound to the REAL deterministic battery, reachable
 * AND executable from the screen.
 *
 *   - Self-cert console — per sensor (types/lint/unit/fixture/property/pact/archfit), the human
 *     marks whether it passed over the candidate diff (and, when red, the detail — the arch
 *     boundary / Pact contract / type error that broke) → the COMPUTED gated battery (green |
 *     red + BUILD_LOOP_SENSOR_RED). A red arch boundary or Pact contract blocks the iteration
 *     before green.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the gate is a PURE FUNCTION of the sensor verdicts (the
 * pure twin certify(), byte-identical to back/runtime/buildloop/selfcert.Certify) — never an LLM
 * judgment; the judge is the deterministic mirror. THE WALL (§2): the gate is a read/compute
 * below the line — it writes NO truth. Themed on the ADR 0010 tokens; strings via next-intl
 * (ADR 0011).
 */

const initial: CertifyResult = { ok: false };

function Submit({ label }: { label: string }) {
	const t = useTranslations("selfCert");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="certify-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function SelfCertPanel() {
	const t = useTranslations("selfCert");
	const [result, action] = useActionState(certifyDiffAction, initial);

	const inputClass =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<div className="space-y-8">
			<form
				action={action}
				data-testid="certify-form"
				className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-base font-semibold tracking-tight text-foreground">
					{t("consoleHeading")}
				</h2>
				<p className="text-sm text-muted-foreground">{t("consoleHint")}</p>

				<div className="space-y-3">
					{SENSOR_KINDS.map((kind) => (
						<div
							key={kind}
							data-testid={`sensor-row-${kind}`}
							className="grid grid-cols-1 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[8rem_auto_1fr]"
						>
							<span className="font-mono text-sm font-medium text-foreground">
								{kind}
							</span>
							<label className="inline-flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									name={`green-${kind}`}
									data-testid={`green-${kind}`}
									defaultChecked
									className="h-4 w-4 rounded border-border"
								/>
								{t("sensorGreenLabel")}
							</label>
							<input
								name={`detail-${kind}`}
								data-testid={`detail-${kind}`}
								placeholder={t("sensorDetailPlaceholder")}
								className={inputClass}
							/>
						</div>
					))}
				</div>

				<Submit label={t("certify")} />
			</form>

			{result.ok && result.battery && (
				<section
					data-testid="battery"
					aria-label={t("batteryHeading")}
					className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
				>
					<h2 className="text-base font-semibold tracking-tight text-foreground">
						{t("batteryHeading")}
					</h2>
					<div className="flex items-center gap-3">
						<span
							data-testid="gate-badge"
							data-green={result.battery.green ? "true" : "false"}
							className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
								result.battery.green
									? "border-primary/40 bg-primary/10 text-primary"
									: "border-destructive/40 bg-destructive/10 text-destructive"
							}`}
						>
							{result.battery.green ? t("gateGreen") : t("gateRed")}
						</span>
						{result.battery.blockCode && (
							<span
								data-testid="block-code"
								className="font-mono text-sm text-destructive"
							>
								{result.battery.blockCode}
							</span>
						)}
					</div>

					<ul className="space-y-1.5">
						{result.battery.sensors.map((s) => (
							<li
								key={s.kind}
								data-testid={`battery-sensor-${s.kind}`}
								data-state={s.state}
								className="flex items-center gap-2 text-sm"
							>
								<span
									className={`inline-block h-2 w-2 rounded-full ${
										s.state === "green" ? "bg-primary" : "bg-destructive"
									}`}
									aria-hidden
								/>
								<span className="font-mono text-foreground">{s.kind}</span>
								<span className="text-muted-foreground">
									{s.state === "green" ? t("ok") : t("red")}
								</span>
								{s.detail && (
									<span className="text-xs text-muted-foreground">
										— {s.detail}
									</span>
								)}
							</li>
						))}
					</ul>

					{result.battery.redSensors &&
						result.battery.redSensors.length > 0 && (
							<p
								data-testid="red-sensors"
								className="text-sm text-muted-foreground"
							>
								{t("redSensors")}: {result.battery.redSensors.join(", ")}
							</p>
						)}
				</section>
			)}
		</div>
	);
}
