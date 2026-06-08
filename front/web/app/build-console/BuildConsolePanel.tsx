"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type ProjectResult,
	projectBuildStateAction,
	recordStablePhaseAction,
	type StableResult,
} from "./actions";

/**
 * BuildConsolePanel makes the /build-console route action-capable (ui-completeness law,
 * CLAUDE.md §7): the two ops the step develops each have a control bound to the REAL
 * deterministic op, reachable AND executable from the screen.
 *
 *   - PROJECT the build state — the recorded run + history + decision + cost + pending →
 *     the streamed console state, with the non-gameable faithfulness check (the state EQUALS
 *     the recorded run);
 *   - RECORD a stable phase — the project's §43 cut → record the per-project DAG node when
 *     stable, refuse an inconsistent cut (STABLE_PHASE_INCONSISTENT_CUT).
 *
 * DETERMINISM-FIRST (§6/§8): the projection is a transform and the stable verdict is the §43
 * engine — pure twins (lib/build-console), byte-identical to back/runtime/buildconsole; no LLM.
 * THE WALL (§2): both ops are read/compute below the line — they write NO truth; the DAG node
 * is committed by the privileged `aidos` writer. Themed on ADR 0010; strings via next-intl
 * (ADR 0011).
 */

const initialProject: ProjectResult = { ok: false };
const initialStable: StableResult = { ok: false };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("buildConsole");
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

function field(
	label: string,
	hint: string,
	control: React.ReactNode,
): React.ReactNode {
	return (
		<div className="block space-y-1.5">
			<span className="text-sm font-medium text-foreground">{label}</span>
			<span className="block text-xs text-muted-foreground">{hint}</span>
			{control}
		</div>
	);
}

export function BuildConsolePanel() {
	const t = useTranslations("buildConsole");
	const [proj, projectAction] = useActionState(
		projectBuildStateAction,
		initialProject,
	);
	const [stable, stableAction] = useActionState(
		recordStablePhaseAction,
		initialStable,
	);

	const inputClass =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
	const areaClass = `${inputClass} font-mono`;

	return (
		<div className="space-y-12">
			{/* ── OP 1 — project the streamed build state ── */}
			<section
				data-testid="project-panel"
				className="space-y-5 rounded-xl border border-border bg-card p-6"
			>
				<div className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("project.heading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("project.body")}</p>
				</div>

				<form action={projectAction} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						{field(
							t("project.runId"),
							t("project.runIdHint"),
							<input
								name="runId"
								data-testid="run-id"
								defaultValue="run-checkout-1"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.goal"),
							t("project.goalHint"),
							<input
								name="goal"
								data-testid="goal"
								defaultValue="goal-order-checkout"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.result"),
							t("project.resultHint"),
							<input
								name="result"
								data-testid="result"
								defaultValue="green"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.verdict"),
							t("project.verdictHint"),
							<input
								name="verdict"
								data-testid="verdict"
								defaultValue="green"
								className={inputClass}
							/>,
						)}
					</div>
					{field(
						t("project.writes"),
						t("project.writesHint"),
						<textarea
							name="writes"
							data-testid="writes"
							rows={2}
							defaultValue={"diff-1 | ok"}
							className={areaClass}
						/>,
					)}
					{field(
						t("project.diffHashes"),
						t("project.diffHashesHint"),
						<textarea
							name="diffHashes"
							data-testid="diff-hashes"
							rows={2}
							defaultValue={"diff-1"}
							className={areaClass}
						/>,
					)}
					{field(
						t("project.greenMirrors"),
						t("project.greenMirrorsHint"),
						<textarea
							name="greenMirrors"
							data-testid="green-mirrors"
							rows={2}
							defaultValue={"Order.checkout.feature"}
							className={areaClass}
						/>,
					)}
					<div className="grid gap-4 sm:grid-cols-4">
						{field(
							t("project.ciSpent"),
							"",
							<input
								name="ciMinutesSpent"
								defaultValue="4"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.ciCap"),
							"",
							<input
								name="ciMinutesCap"
								defaultValue="30"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.tokensSpent"),
							"",
							<input
								name="llmTokensSpent"
								defaultValue="12000"
								className={inputClass}
							/>,
						)}
						{field(
							t("project.tokensCap"),
							"",
							<input
								name="llmTokensCap"
								defaultValue="100000"
								className={inputClass}
							/>,
						)}
					</div>
					{field(
						t("project.pending"),
						t("project.pendingHint"),
						<textarea
							name="pending"
							data-testid="pending"
							rows={2}
							defaultValue={"prop-2\nprop-1"}
							className={areaClass}
						/>,
					)}
					<Submit label={t("project.submit")} testid="project-submit" />
				</form>

				{proj.ok && proj.state ? (
					<div
						data-testid="project-result"
						className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
					>
						<p
							data-testid="faithful"
							className={
								proj.faithful
									? "font-medium text-primary"
									: "font-medium text-destructive"
							}
						>
							{proj.faithful
								? t("project.faithfulOk")
								: t("project.faithfulKo")}
						</p>
						<p className="text-muted-foreground">
							{t("project.attemptsLabel")}:{" "}
							<span data-testid="attempts-count">
								{proj.state.attempts.length}
							</span>{" "}
							· {t("project.sensorsLabel")}:{" "}
							<span data-testid="sensors-count">
								{proj.state.sensors.length}
							</span>{" "}
							· {t("project.pendingLabel")}:{" "}
							<span data-testid="pending-count">
								{proj.state.approval.pendingCount}
							</span>
						</p>
						<p className="text-muted-foreground">
							{t("project.breakerLabel")}:{" "}
							<span data-testid="breaker-verdict">
								{proj.state.breaker.verdict}
							</span>{" "}
							· {t("project.costLabel")}: {proj.state.cost.ciMinutesSpent}/
							{proj.state.cost.ciMinutesCap} CI ·{" "}
							{proj.state.cost.llmTokensSpent}/{proj.state.cost.llmTokensCap}{" "}
							tok
						</p>
					</div>
				) : null}
				{!proj.ok && proj.messageKey ? (
					<p data-testid="project-error" className="text-sm text-destructive">
						{t(`messages.${proj.messageKey}`)}
					</p>
				) : null}
			</section>

			{/* ── OP 2 — record a per-project stable phase ── */}
			<section
				data-testid="stable-panel"
				className="space-y-5 rounded-xl border border-border bg-card p-6"
			>
				<div className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("stable.heading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("stable.body")}</p>
				</div>

				<form action={stableAction} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						{field(
							t("stable.projectId"),
							t("stable.projectIdHint"),
							<input
								name="projectId"
								data-testid="stable-project"
								defaultValue="shop"
								className={inputClass}
							/>,
						)}
						{field(
							t("stable.label"),
							t("stable.labelHint"),
							<input
								name="label"
								data-testid="stable-label"
								defaultValue="checkout-stable"
								className={inputClass}
							/>,
						)}
					</div>
					{field(
						t("stable.heads"),
						t("stable.headsHint"),
						<textarea
							name="heads"
							data-testid="stable-heads"
							rows={2}
							defaultValue={"createOrder@v3"}
							className={areaClass}
						/>,
					)}
					{field(
						t("stable.links"),
						t("stable.linksHint"),
						<textarea
							name="links"
							data-testid="stable-links"
							rows={2}
							defaultValue={"checkout@v1 -> createOrder@v3"}
							className={areaClass}
						/>,
					)}
					{field(
						t("stable.sensors"),
						t("stable.sensorsHint"),
						<textarea
							name="sensors"
							data-testid="stable-sensors"
							rows={2}
							defaultValue={"createOrder.fixture | ok"}
							className={areaClass}
						/>,
					)}
					<Submit label={t("stable.submit")} testid="stable-submit" />
				</form>

				{stable.ok && stable.result ? (
					<div
						data-testid="stable-result"
						className={`space-y-2 rounded-lg border p-4 text-sm ${
							stable.result.recorded
								? "border-primary/40 bg-primary/10"
								: "border-destructive/40 bg-destructive/10"
						}`}
					>
						<p
							data-testid="stable-verdict"
							className={
								stable.result.recorded
									? "font-medium text-primary"
									: "font-medium text-destructive"
							}
						>
							{stable.result.recorded
								? t("stable.recorded")
								: t("stable.refused")}
						</p>
						{!stable.result.recorded ? (
							<>
								<p
									data-testid="stable-block-code"
									className="font-mono text-xs"
								>
									{stable.result.blockCode}
								</p>
								<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{stable.result.howToFix.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</>
						) : null}
					</div>
				) : null}
			</section>
		</div>
	);
}
