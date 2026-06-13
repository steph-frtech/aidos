"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SensorStatus } from "@/lib/env-binding-cockpit";
import { DATASTORES, ENVIRONMENTS } from "@/lib/environments";
import {
	approveBindingAction,
	proposeBindingAction,
	wallProbeAction,
} from "./cockpit-actions";
import {
	APPROVE_INITIAL,
	PROPOSE_INITIAL,
	WALL_PROBE_INITIAL,
} from "./cockpit-view";

/**
 * BindingCockpit — the DP09 cockpit on /environments: « déclarer/éditer un
 * binding d'environnement » as propose → ChangeSet → approbation.
 *
 * THREE controls (ui-completeness, CLAUDE.md §7 — every DP09 op has its
 * button, executable from the screen):
 *   1. « proposer le ChangeSet » — validates the draft FAIL-CLOSED (DP06 A1,
 *      closed sets, DP08 url_pattern classifier) and builds the
 *      content-addressed DRAFT envelope (spec_delta + mirror_delta together);
 *   2. « approuver » — the human approval: re-verifies the content address,
 *      applies via the S20 state machine (sandbox), and the matrix RECOMPUTES
 *      as the PURE DP07 projection (parity-pinned ∀) + the DP08 sensor is
 *      re-sensed;
 *   3. « sonder le mur » — routes kernel_write through the S58 gateway and
 *      shows the GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET BlockReason: the screen
 *      can NEVER write the kernel directly.
 *
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */

function Submit({ testid, label }: { testid: string; label: string }) {
	const t = useTranslations("environments");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function BindingCockpit({
	networks,
	sensor,
	seededMatrixHash,
}: {
	networks: readonly string[];
	sensor: SensorStatus;
	seededMatrixHash: string;
}) {
	const t = useTranslations("environments");
	const [proposeState, propose] = useActionState(
		proposeBindingAction,
		PROPOSE_INITIAL,
	);
	const [approveState, approve] = useActionState(
		approveBindingAction,
		APPROVE_INITIAL,
	);
	const [probeState, probe] = useActionState(
		wallProbeAction,
		WALL_PROBE_INITIAL,
	);

	const selectCls =
		"rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<div className="space-y-8">
			{/* the DP08 sensor status — green on the canonical emitted tree */}
			<section
				data-testid="dp09-sensor-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("sensorHeading")}
					</h2>
					<span
						data-testid="dp09-sensor-state"
						className={
							sensor.state === "green"
								? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
								: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
						}
					>
						{sensor.state === "green" ? t("sensorGreen") : t("sensorRed")}
					</span>
				</div>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("sensorBody")}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
					<code className="rounded bg-muted px-2 py-1 font-mono text-foreground">
						{sensor.rule}
					</code>
					<span className="font-medium text-muted-foreground">
						{t("hashLabel")}:
					</span>
					<code
						data-testid="dp09-sensor-address"
						className="rounded bg-muted px-2 py-1 font-mono text-foreground"
					>
						{sensor.address}
					</code>
					<Link
						href="/endpoints-fitness"
						data-testid="dp09-sensor-link"
						className="font-medium text-primary underline-offset-2 hover:underline"
					>
						{t("sensorLink")}
					</Link>
				</div>
			</section>

			{/* declare/edit a binding — propose → ChangeSet */}
			<section
				data-testid="cockpit-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("cockpitHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("cockpitBody")}
				</p>
				<form action={propose} className="mt-4 flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("envCol")}
						<select
							name="environment"
							data-testid="cockpit-env"
							defaultValue="dev"
							className={selectCls}
						>
							{ENVIRONMENTS.map((e) => (
								<option key={e} value={e}>
									{e}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("datastoreLabel")}
						<select
							name="datastore"
							data-testid="cockpit-datastore"
							className={selectCls}
						>
							{DATASTORES.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("networkCol")}
						<select
							name="network"
							data-testid="cockpit-network"
							className={selectCls}
						>
							{networks.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
					<label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("urlCol")}
						<input
							type="text"
							name="url_pattern"
							data-testid="cockpit-url"
							defaultValue="https://${APP_NAME}-dev.${DOMAIN}"
							className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
						<input
							type="checkbox"
							name="tls"
							data-testid="cockpit-tls"
							defaultChecked
							className="h-4 w-4 rounded border-border accent-primary"
						/>
						TLS
					</label>
					<label className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
						<input
							type="checkbox"
							name="managed"
							data-testid="cockpit-managed"
							className="h-4 w-4 rounded border-border accent-primary"
						/>
						{t("managedCol")}
					</label>
					<Submit testid="cockpit-propose" label={t("cockpitPropose")} />
				</form>

				{proposeState.refusal ? (
					<div
						data-testid="cockpit-refusal"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-destructive">
								{t("refused")}
							</span>
							<code
								data-testid="cockpit-refusal-code"
								className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-medium text-destructive"
							>
								{proposeState.refusal.code}
							</code>
							{proposeState.refusal.reason ? (
								<code
									data-testid="cockpit-refusal-reason"
									className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs text-destructive"
								>
									{proposeState.refusal.reason}
								</code>
							) : null}
						</div>
						<p className="mt-2 text-xs leading-relaxed text-destructive/90">
							{proposeState.refusal.message}
						</p>
					</div>
				) : null}

				{proposeState.proposal ? (
					<div
						data-testid="cockpit-proposal"
						className="mt-4 rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-foreground">
								{t("cockpitProposalHeading")}
							</span>
							<span
								data-testid="proposal-status"
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
							>
								{proposeState.proposal.envelope.status}
							</span>
							{proposeState.door ? (
								<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
									{proposeState.door}
								</code>
							) : null}
						</div>
						<dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
							<div className="flex gap-2">
								<dt className="font-medium">id:</dt>
								<dd data-testid="proposal-id" className="font-mono break-all">
									{proposeState.proposal.envelope.id}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-medium">spec_delta:</dt>
								<dd data-testid="proposal-spec" className="font-mono">
									{proposeState.proposal.envelope.specDelta?.kind}{" "}
									{proposeState.proposal.envelope.specDelta?.target}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-medium">mirror_delta:</dt>
								<dd data-testid="proposal-mirror" className="font-mono">
									{proposeState.proposal.envelope.mirrorDelta?.kind}{" "}
									{proposeState.proposal.envelope.mirrorDelta?.target}
								</dd>
							</div>
						</dl>
						<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
							{t("cockpitProposedNote")}
						</p>
						<form action={approve} className="mt-3">
							<input
								type="hidden"
								name="proposal"
								value={JSON.stringify(proposeState.proposal)}
							/>
							<input
								type="hidden"
								name="seededMatrixHash"
								value={seededMatrixHash}
							/>
							<Submit testid="cockpit-approve" label={t("cockpitApprove")} />
						</form>
					</div>
				) : null}

				{approveState.refusal ? (
					<div
						data-testid="cockpit-approve-refusal"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
					>
						<code className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-medium text-destructive">
							{approveState.refusal.code}
						</code>
						<p className="mt-2 text-xs leading-relaxed text-destructive/90">
							{approveState.refusal.message}
						</p>
					</div>
				) : null}

				{approveState.applied ? (
					<div
						data-testid="cockpit-applied"
						className="mt-4 rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-foreground">
								{t("cockpitAppliedHeading")}
							</span>
							<span
								data-testid="applied-status"
								className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary"
							>
								{approveState.applied.envelope.status}
							</span>
							{approveState.door ? (
								<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
									{approveState.door}
								</code>
							) : null}
						</div>

						{/* the matrix RECOMPUTED for the edited environment — pure DP07 */}
						<h3 className="mt-3 text-xs font-semibold text-foreground">
							{t("cockpitMatrixHeading", {
								environment: approveState.applied.binding.environment,
							})}
						</h3>
						<div className="mt-2 overflow-x-auto">
							<table
								data-testid="cockpit-matrix"
								className="w-full border-collapse text-left"
							>
								<thead>
									<tr className="border-b border-border text-xs font-medium text-muted-foreground">
										<th className="px-3 py-2">{t("matrixServiceCol")}</th>
										<th className="px-3 py-2">{t("matrixModeCol")}</th>
										<th className="px-3 py-2">{t("matrixEndpointCol")}</th>
									</tr>
								</thead>
								<tbody>
									{(approveState.matrixRows ?? []).map((r) => (
										<tr
											key={r.service}
											className="border-b border-border last:border-b-0"
										>
											<td className="px-3 py-2 font-mono text-xs text-foreground">
												{r.service}
											</td>
											<td
												data-testid={`cockpit-mode-${r.service}`}
												className="px-3 py-2 font-mono text-xs font-medium text-foreground"
											>
												{r.mode}
											</td>
											<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
												{r.endpoint_pattern}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
							<div className="flex gap-2">
								<dt className="font-medium">{t("matrixHashLabel")}:</dt>
								<dd
									data-testid="cockpit-matrix-hash"
									className="font-mono break-all"
								>
									{approveState.hash}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-medium">{t("sameAsSeededLabel")}:</dt>
								<dd data-testid="cockpit-matrix-same" className="font-mono">
									{approveState.sameAsSeeded ? t("sameYes") : t("sameNo")}
								</dd>
							</div>
							{approveState.sensor ? (
								<div className="flex gap-2">
									<dt className="font-medium">{t("sensorHeading")}:</dt>
									<dd data-testid="cockpit-sensor-state" className="font-mono">
										{approveState.sensor.state}
									</dd>
								</div>
							) : null}
						</dl>
					</div>
				) : null}
			</section>

			{/* the wall probe — kernel_write through the S58 gateway, refused */}
			<section
				data-testid="wall-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("wallProbeHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("wallProbeBody")}
				</p>
				<form action={probe} className="mt-4">
					<Submit testid="wall-probe" label={t("wallProbe")} />
				</form>
				{probeState.probed ? (
					<div
						data-testid="wall-probe-result"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-destructive">
								{t("refused")}
							</span>
							<code
								data-testid="wall-probe-code"
								className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-medium text-destructive"
							>
								{probeState.blockReason?.code}
							</code>
						</div>
						<p className="mt-2 text-xs leading-relaxed text-destructive/90">
							{probeState.blockReason?.explanation}
						</p>
						<ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive/90">
							{(probeState.blockReason?.howToFix ?? []).map((f) => (
								<li key={f}>{f}</li>
							))}
						</ul>
					</div>
				) : null}
			</section>
		</div>
	);
}
