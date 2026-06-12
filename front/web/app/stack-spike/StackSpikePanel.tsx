"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { HarvestRecord, SpikeVerdict } from "@/lib/stack-spike";
import { reEmitAction } from "./actions";
import { REEMIT_INITIAL, type ReEmitView } from "./view";

/**
 * StackSpikePanel renders the DP01 MEASURED verdict (read-only with respect to
 * truth): go/no-go, the measurement booleans, the compared bytes (the emitted
 * compose + its source/output hashes), the ≤3-form fit table, and the /harvest
 * record. ONE control (« ré-émettre », ui-completeness CLAUDE.md §7) re-runs the
 * pure engine and compares hashes — it writes NOTHING (the wall, §2).
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function check(b: boolean): string {
	return b ? "✓" : "✗";
}

function ReEmitSubmit() {
	const t = useTranslations("stackSpike");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="reemit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("reemit")}
		</button>
	);
}

export function StackSpikePanel({
	activeProjectId,
	verdict,
	record,
}: {
	activeProjectId: string | null;
	verdict: SpikeVerdict;
	record: HarvestRecord;
}) {
	const t = useTranslations("stackSpike");
	const [state, action] = useActionState<ReEmitView, FormData>(
		reEmitAction,
		REEMIT_INITIAL,
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
						{t("chosenFormLabel")}:{" "}
						<span data-testid="chosen-form" className="font-mono">
							{verdict.chosenForm}
						</span>
					</span>
				</div>
				<p
					data-testid="rationale"
					className="mt-3 text-sm leading-relaxed text-muted-foreground"
				>
					{verdict.rationale}
				</p>
				<dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
					<div className="rounded-lg bg-muted/40 p-2">
						<dt className="text-muted-foreground">{t("byteIdentical")}</dt>
						<dd
							data-testid="m-byte-identical"
							className="font-mono text-foreground"
						>
							{check(m.byteIdentical)} ×{m.emissions}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-2">
						<dt className="text-muted-foreground">{t("roundTrip")}</dt>
						<dd
							data-testid="m-round-trip"
							className="font-mono text-foreground"
						>
							{check(m.roundTripOK)}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-2">
						<dt className="text-muted-foreground">{t("driftSource")}</dt>
						<dd
							data-testid="m-drift-source"
							className="font-mono text-foreground"
						>
							{check(m.driftDetectedOnSource)}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-2">
						<dt className="text-muted-foreground">{t("driftTemplate")}</dt>
						<dd
							data-testid="m-drift-template"
							className="font-mono text-foreground"
						>
							{check(m.driftDetectedOnTmpl)} {t("driftBlind")}
						</dd>
					</div>
				</dl>
			</section>

			{/* the ≤3-form fit — a feature count against declared criteria */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("formsHeading")}
				</h2>
				<table className="mt-3 w-full text-left text-xs">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-1.5 pr-2 font-medium">{t("formCol")}</th>
							<th className="py-1.5 pr-2 font-medium">{t("bodyCol")}</th>
							<th className="py-1.5 pr-2 font-medium">{t("addrCol")}</th>
							<th className="py-1.5 pr-2 font-medium">{t("wallCol")}</th>
							<th className="py-1.5 pr-2 font-medium">{t("appendCol")}</th>
							<th className="py-1.5 font-medium">{t("fitCol")}</th>
						</tr>
					</thead>
					<tbody data-testid="forms">
						{verdict.forms.map((f) => (
							<tr
								key={f.form}
								data-form={f.form}
								className="border-b border-border/50 last:border-0"
							>
								<td className="py-1.5 pr-2 font-mono text-foreground">
									{f.form}
								</td>
								<td className="py-1.5 pr-2">{check(f.carriesBody)}</td>
								<td className="py-1.5 pr-2">{check(f.contentAddressed)}</td>
								<td className="py-1.5 pr-2">{check(f.wallGoverned)}</td>
								<td className="py-1.5 pr-2">{check(f.appendOnly)}</td>
								<td className="py-1.5 font-mono">{f.fit}/4</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* the compared bytes — hashes + the emitted compose */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("bytesHeading")}
				</h2>
				<dl className="mt-3 space-y-1.5 text-xs">
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">{t("sourceHashLabel")}:</dt>
						<dd data-testid="source-hash" className="font-mono break-all">
							{m.sourceHash}
						</dd>
					</div>
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">{t("outputHashLabel")}:</dt>
						<dd data-testid="output-hash" className="font-mono break-all">
							{m.outputHash}
						</dd>
					</div>
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">{t("emittedBytesLabel")}:</dt>
						<dd className="font-mono">{m.emittedBytes}</dd>
					</div>
				</dl>

				<form action={action} className="mt-4 flex items-center gap-3">
					<input type="hidden" name="initialOutputHash" value={m.outputHash} />
					<ReEmitSubmit />
					{state.ok && (
						<span
							data-testid="reemit-result"
							data-equal={state.bytesEqual ? "true" : "false"}
							className={`text-xs font-medium ${
								state.bytesEqual ? "text-primary" : "text-destructive"
							}`}
						>
							{state.bytesEqual ? t("bytesEqual") : t("bytesDiverged")}
						</span>
					)}
				</form>

				<pre
					data-testid="emitted-compose"
					className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted/40 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground"
				>
					{verdict.emitted}
				</pre>
			</section>

			{/* the /harvest record — a record, never a declaration */}
			<section
				data-testid="harvest"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("harvestHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{record.intent}
				</p>
				<dl className="mt-3 space-y-1.5 text-xs">
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">{t("recordHashLabel")}:</dt>
						<dd data-testid="record-hash" className="font-mono break-all">
							{record.recordHash}
						</dd>
					</div>
					<div className="flex flex-wrap gap-2">
						<dt className="text-muted-foreground">{t("statusLabel")}:</dt>
						<dd className="font-mono">
							{record.status} · proposes={record.proposes} · has_mirror=
							{String(record.hasMirror)} · has_version=
							{String(record.hasVersion)}
						</dd>
					</div>
				</dl>
				<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
					{record.openQuestions.map((q) => (
						<li key={q}>{q}</li>
					))}
				</ul>
			</section>
		</div>
	);
}
