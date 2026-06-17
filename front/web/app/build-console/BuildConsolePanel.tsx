"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Source } from "@/lib/gateway-sdk";
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
 * S86 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source): both ops now read the LIVE
 * result from the Go build-console MCP server through the passerelle (the demo twin is the
 * deterministic fallback), tagged by a `source` badge (live | démo).
 *
 * DETERMINISM-FIRST (§6/§8): the projection is a transform and the stable verdict is the §43
 * engine — pure (back/runtime/buildconsole, the authority via the gateway); no LLM. THE WALL (§2):
 * both ops are read/compute below the line — they write NO truth; the DAG node is committed by the
 * privileged `aidos` writer. Themed on ADR 0010; strings via next-intl (ADR 0011).
 */

const initialProject: ProjectResult = { ok: false };
const initialStable: StableResult = { ok: false };

function SourceBadge({ source }: { source: Source }) {
	const t = useTranslations("buildConsole");
	const live = source === "live";
	return (
		<span
			data-testid="source-badge"
			data-source={source}
			title={live ? t("sourceLiveTitle") : t("sourceDemoTitle")}
			className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
				live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
			}`}
		>
			{live ? t("sourceLive") : t("sourceDemo")}
		</span>
	);
}

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

				{proj.ok && proj.view ? (
					<div
						data-testid="project-result"
						className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
					>
						<div className="flex items-center justify-between">
							<p
								data-testid="faithful"
								className={
									proj.view.faithfulProjection
										? "font-medium text-primary"
										: "font-medium text-destructive"
								}
							>
								{proj.view.faithfulProjection
									? t("project.faithfulOk")
									: t("project.faithfulKo")}
							</p>
							<SourceBadge source={proj.source ?? "demo"} />
						</div>
						<p className="text-muted-foreground">
							{t("project.attemptsLabel")}:{" "}
							<span data-testid="attempts-count">
								{proj.view.attempts.length}
							</span>{" "}
							· {t("project.sensorsLabel")}:{" "}
							<span data-testid="sensors-count">
								{proj.view.sensors.length}
							</span>{" "}
							· {t("project.pendingLabel")}:{" "}
							<span data-testid="pending-count">{proj.view.pendingCount}</span>
						</p>
						<p className="text-muted-foreground">
							{t("project.breakerLabel")}:{" "}
							<span data-testid="breaker-verdict">{proj.view.verdict}</span> ·{" "}
							{t("project.costLabel")}: {proj.view.ciSpent}/{proj.view.ciCap} CI
							· {proj.view.tokensSpent}/{proj.view.tokensCap} tok
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

				{stable.ok && stable.view ? (
					<div
						data-testid="stable-result"
						className={`space-y-2 rounded-lg border p-4 text-sm ${
							stable.view.recorded
								? "border-primary/40 bg-primary/10"
								: "border-destructive/40 bg-destructive/10"
						}`}
					>
						<div className="flex items-center justify-between">
							<p
								data-testid="stable-verdict"
								className={
									stable.view.recorded
										? "font-medium text-primary"
										: "font-medium text-destructive"
								}
							>
								{stable.view.recorded
									? t("stable.recorded")
									: t("stable.refused")}
							</p>
							<SourceBadge source={stable.source ?? "demo"} />
						</div>
						{!stable.view.recorded ? (
							<>
								<p
									data-testid="stable-block-code"
									className="font-mono text-xs"
								>
									{stable.view.blockCode}
								</p>
								<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{stable.view.howToFix.map((h) => (
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
