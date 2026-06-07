"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Source } from "@/lib/gateway-sdk";
import type { GoalStream } from "@/lib/goal-stream";
import { type GoalStreamView, streamGoalAction } from "./actions";

/**
 * GoalStreamPanel — the action-capable client surface of /goal-stream (S60). It renders
 * the live open goal of the active project: the red set (the todo-list that IS the goal,
 * §56), the RedWorkQueue (§49.4), and the real sensor verdicts — tagged live/demo exactly
 * like the S59 cutover. The "refresh the stream" control EXECUTES streamGoalAction (the
 * typed SDK read through the gateway). READ-ONLY (CLAUDE.md §2): the screen projects; it
 * never opens/closes a goal. Themed (ADR 0010) + bilingual (ADR 0011).
 */
export function GoalStreamPanel({ initial }: { initial: GoalStreamView }) {
	const t = useTranslations("goalStream");
	const [identity, setIdentity] = useState("alice");
	const [activeProject, setActiveProject] = useState("proj-a");
	const [data, setData] = useState<GoalStream>(initial.data);
	const [source, setSource] = useState<Source>(initial.source);
	const [pending, setPending] = useState(false);

	async function onRefresh() {
		setPending(true);
		try {
			const v = await streamGoalAction(identity, activeProject);
			setData(v.data);
			setSource(v.source);
		} finally {
			setPending(false);
		}
	}

	const reasonLabel: Record<string, string> = {
		version_stale: t("reasonVersionStale"),
		failed_test: t("reasonFailedTest"),
		incident: t("reasonIncident"),
	};
	const statusLabel: Record<string, string> = {
		open: t("statusOpen"),
		claimed: t("statusClaimed"),
		blocked: t("statusBlocked"),
		resolved: t("statusResolved"),
	};

	return (
		<div className="space-y-10">
			<section
				aria-labelledby="stream-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<div className="flex items-center justify-between gap-3">
					<h2
						id="stream-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("streamHeading")}
					</h2>
					<span
						data-testid="stream-source"
						className={
							source === "live"
								? "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
								: "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						}
					>
						{t(source === "live" ? "sourceLive" : "sourceDemo")}
					</span>
				</div>

				<p className="mt-2 text-sm text-muted-foreground" data-testid="goal-id">
					{t("goalIdLabel")}:{" "}
					<span className="font-mono text-foreground">{data.goalId}</span>
				</p>

				<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						id="identity"
						label="identity"
						value={identity}
						onChange={setIdentity}
					/>
					<Field
						id="active-project"
						label="project"
						value={activeProject}
						onChange={setActiveProject}
					/>
				</div>
				<div className="mt-4">
					<button
						type="button"
						data-testid="refresh-button"
						onClick={onRefresh}
						disabled={pending}
						className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
					>
						{pending ? t("refreshing") : t("refreshButton")}
					</button>
				</div>
			</section>

			{/* The red set — the goal's todo-list (§56). */}
			<section
				aria-labelledby="red-set-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="red-set-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("redSetHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("redSetIntro")}</p>
				<ul className="mt-4 flex flex-wrap gap-2" data-testid="red-set">
					{data.redSet.map((m) => (
						<li
							key={m}
							className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-xs text-destructive"
						>
							{m}
						</li>
					))}
				</ul>
			</section>

			{/* The RedWorkQueue (§49.4). */}
			<section
				aria-labelledby="queue-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="queue-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("queueHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("queueIntro")}</p>
				<table className="mt-4 w-full text-sm" data-testid="queue">
					<thead>
						<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<th className="py-2">{t("colTarget")}</th>
							<th className="py-2">{t("colReason")}</th>
							<th className="py-2">{t("colStatus")}</th>
						</tr>
					</thead>
					<tbody>
						{data.queue.map((row) => (
							<tr
								key={row.target}
								data-testid={`queue-row-${row.target}`}
								className="border-t border-border"
							>
								<td className="py-2 font-mono text-xs text-foreground">
									{row.target}
								</td>
								<td className="py-2 text-muted-foreground">
									{reasonLabel[row.reason]}
								</td>
								<td className="py-2 text-muted-foreground">
									{statusLabel[row.status]}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* The real sensor verdicts. */}
			<section
				aria-labelledby="sensors-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="sensors-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("sensorsHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("sensorsIntro")}
				</p>
				<table className="mt-4 w-full text-sm" data-testid="sensors">
					<thead>
						<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<th className="py-2">{t("colMirror")}</th>
							<th className="py-2">{t("colVerdict")}</th>
						</tr>
					</thead>
					<tbody>
						{data.sensors.map((s) => (
							<tr
								key={s.mirror}
								data-testid={`sensor-row-${s.mirror}`}
								className="border-t border-border"
							>
								<td className="py-2 font-mono text-xs text-foreground">
									{s.mirror}
								</td>
								<td
									className={
										s.verdict === "green"
											? "py-2 font-medium text-primary"
											: "py-2 font-medium text-destructive"
									}
								>
									{t(s.verdict === "green" ? "verdictGreen" : "verdictRed")}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}

function Field({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="text-xs uppercase tracking-wide text-muted-foreground"
			>
				{label}
			</label>
			<input
				id={id}
				data-testid={`field-${id}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
			/>
		</div>
	);
}
