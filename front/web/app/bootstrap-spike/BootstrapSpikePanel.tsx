"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { HarvestRecord, SpikeVerdict } from "@/lib/bootstrap-spike";
import { CRITERIA } from "@/lib/bootstrap-spike";
import { reMeasureAction } from "./actions";
import { REMEASURE_INITIAL, type ReMeasureView } from "./view";

/**
 * BootstrapSpikePanel renders the DP10 MEASURED verdict (read-only with respect
 * to truth): go/no-go, the seven conjuncts, the REAL startup event log
 * (traefik→datastore→serveur, healthchecks, URL 200), the printed URLs, the
 * deploy.sh measured facts, the ≤3-candidate score table, and the /harvest
 * record. ONE control (« re-mesurer », ui-completeness CLAUDE.md §7) re-decides
 * over the pinned measurement and compares verdict hashes — it writes NOTHING
 * (the wall, §2). Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function ReMeasureSubmit() {
	const t = useTranslations("bootstrapSpike");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="remeasure"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("remeasure")}
		</button>
	);
}

export function BootstrapSpikePanel({
	activeProjectId,
	verdict,
	record,
}: {
	activeProjectId: string | null;
	verdict: SpikeVerdict;
	record: HarvestRecord;
}) {
	const t = useTranslations("bootstrapSpike");
	const [state, action] = useActionState<ReMeasureView, FormData>(
		reMeasureAction,
		REMEASURE_INITIAL,
	);
	const m = verdict.measurement;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* the verdict — measured, never declared */}
			<section
				data-testid="verdict-card"
				data-verdict={verdict.go ? "go" : "no-go"}
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("verdictHeading")}
					</h2>
					<span
						data-testid="verdict"
						className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
							verdict.go
								? "bg-primary text-primary-foreground"
								: "bg-destructive text-destructive-foreground"
						}`}
					>
						{verdict.go ? t("go") : t("noGo")}
					</span>
					<span className="text-xs text-muted-foreground">
						{t("winnerLabel")}:{" "}
						<span data-testid="winner" className="font-mono">
							{verdict.winner}
						</span>
					</span>
				</div>
				<ul data-testid="reasons" className="mt-4 space-y-1">
					{verdict.reasons.map((r) => (
						<li
							key={r}
							className="font-mono text-xs leading-relaxed text-muted-foreground"
						>
							{r}
						</li>
					))}
				</ul>
				<p className="mt-4 text-xs text-muted-foreground">
					{t("verdictHashLabel")}:{" "}
					<span data-testid="verdict-hash" className="font-mono break-all">
						{verdict.verdictHash}
					</span>
				</p>
			</section>

			{/* the REAL startup log — ordered events of run 1 (run 2 identical: reproducible) */}
			<section
				data-testid="startup-log"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("logHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("logNote")}</p>
				<table className="mt-3 w-full text-left text-xs">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-1 pr-3 font-medium">#</th>
							<th className="py-1 pr-3 font-medium">{t("eventKind")}</th>
							<th className="py-1 font-medium">{t("eventDetail")}</th>
						</tr>
					</thead>
					<tbody data-testid="events">
						{m.run1.events.map((e) => (
							<tr
								key={e.seq}
								data-kind={e.kind}
								className="border-b border-border/50"
							>
								<td className="py-1 pr-3 font-mono text-muted-foreground">
									{e.seq}
								</td>
								<td className="py-1 pr-3 font-mono text-foreground">
									{e.kind}
								</td>
								<td className="py-1 font-mono text-muted-foreground">
									{e.detail}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="mt-3 text-xs text-muted-foreground">
					{t("urlsLabel")}:{" "}
					<span data-testid="urls" className="font-mono">
						{m.run1.urls.join(" ")}
					</span>
				</p>
			</section>

			{/* deploy.sh measured facts + the ≤3 candidates */}
			<section
				data-testid="candidates-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("candidatesHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{t("scriptFacts", {
						prompts: m.script.promptCount,
						refs: m.script.dataDockersRefs,
						lines: m.script.scriptLineCount,
					})}
				</p>
				<table className="mt-3 w-full text-left text-xs">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-1 pr-3 font-medium">{t("candidateLabel")}</th>
							{CRITERIA.map((c) => (
								<th key={c} className="py-1 pr-2 font-mono font-medium">
									{c}
								</th>
							))}
							<th className="py-1 font-medium">{t("scoreLabel")}</th>
						</tr>
					</thead>
					<tbody data-testid="candidates">
						{m.candidates.map((c) => (
							<tr
								key={c.id}
								data-candidate={c.id}
								className="border-b border-border/50"
							>
								<td className="py-1 pr-3 text-foreground">{c.label}</td>
								{CRITERIA.map((crit) => (
									<td key={crit} className="py-1 pr-2 font-mono">
										{c.features[crit] ? "✓" : "✗"}
									</td>
								))}
								<td className="py-1 font-mono text-foreground">
									{c.score}/{CRITERIA.length}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* the one control — re-decide purely, compare addresses (writes NOTHING) */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("remeasureHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{t("remeasureNote")}
				</p>
				<form
					action={action}
					className="mt-3 flex flex-wrap items-center gap-3"
				>
					<input
						type="hidden"
						name="initialVerdictHash"
						value={verdict.verdictHash}
					/>
					<ReMeasureSubmit />
					{state.ok && (
						<span
							data-testid="remeasure-result"
							data-equal={state.hashEqual ? "true" : "false"}
							className="font-mono text-xs text-muted-foreground"
						>
							{state.hashEqual ? t("remeasureEqual") : t("remeasureDiff")}
						</span>
					)}
				</form>
			</section>

			{/* the /harvest record — a DRAFT proposal, never a freeze */}
			<section
				data-testid="harvest"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("harvestHeading")}
				</h2>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					{record.intent}
				</p>
				<p className="mt-3 font-mono text-xs text-muted-foreground">
					proposes={record.proposes} · status={record.status} · has_mirror=
					{String(record.hasMirror)} · has_version={String(record.hasVersion)}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{t("recordHashLabel")}:{" "}
					<span data-testid="record-hash" className="font-mono break-all">
						{record.recordHash}
					</span>
				</p>
				<ul className="mt-3 space-y-1">
					{record.openQuestions.map((q) => (
						<li
							key={q}
							className="text-xs leading-relaxed text-muted-foreground"
						>
							{q}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
