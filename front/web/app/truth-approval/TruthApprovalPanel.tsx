"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Decision, Outcome } from "@/lib/truth-approval";
import { concurrentAction, gateAction, relandAction } from "./actions";
import { CONCURRENCY_INITIAL, GATE_INITIAL, RELAND_INITIAL } from "./view";

/**
 * TruthApprovalPanel makes the /truth-approval route action-capable (ui-completeness, CLAUDE.md §7):
 * S110's three controls, each bound to the REAL pure twin lib/truth-approval —
 *
 *   1. THE GATE (S63): propose+approve a truth-write — a veto blocks; a recorded override (with ADR)
 *      lands it with provenance; partial approval escalates.
 *   2. CONCURRENCY (§9): two members propose at the SAME head — exactly ONE lands, the SECOND is
 *      refused STALE_HEAD, never last-write-wins.
 *   3. RELAND (S25): the stale member re-runs the mirrors against the new head and re-applies.
 *
 * DETERMINISM-FIRST (§6/§8): every control runs the pure twin — same input → identical outcome,
 * never an LLM. THE WALL (§2): the cockpit WRITES NOTHING; it decides admission and returns the
 * envelope the CLI would apply. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function outcomeLabel(
	t: ReturnType<typeof useTranslations>,
	o: Outcome,
): string {
	switch (o) {
		case "applied":
			return t("outcomeApplied");
		case "blocked":
			return t("outcomeBlocked");
		case "escalated":
			return t("outcomeEscalated");
		case "stale_head":
			return t("outcomeStale");
	}
}

function badgeClass(o: Outcome): string {
	if (o === "applied")
		return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
	if (o === "stale_head")
		return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
	return "bg-destructive/15 text-destructive";
}

function DecisionRow({ d }: { d: Decision }) {
	const t = useTranslations("truthApproval");
	return (
		<div className="rounded-lg border border-border bg-card p-3 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-foreground">{d.actor}</span>
				<span
					data-testid={`outcome-${d.actor}`}
					className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass(d.outcome)}`}
				>
					{outcomeLabel(t, d.outcome)}
				</span>
				{d.blockCode ? (
					<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
						{d.blockCode}
					</code>
				) : null}
			</div>
			<dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
				{d.newHead ? (
					<div>
						<dt className="inline font-medium">{t("newHeadLabel")}: </dt>
						<dd className="inline" data-testid={`new-head-${d.actor}`}>
							<code>{d.newHead}</code>
						</dd>
					</div>
				) : null}
				{d.staleAgainst ? (
					<div>
						<dt className="inline font-medium">{t("staleAgainstLabel")}: </dt>
						<dd className="inline">
							<code>{d.staleAgainst}</code>
						</dd>
					</div>
				) : null}
				{d.override ? (
					<div className="sm:col-span-2 text-amber-600 dark:text-amber-400">
						{t("overrideProvenance", {
							by: d.override.by,
							adr: d.override.adr,
						})}
					</div>
				) : null}
			</dl>
		</div>
	);
}

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("truthApproval");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function TruthApprovalPanel() {
	const t = useTranslations("truthApproval");
	const [gate, gateSubmit] = useActionState(gateAction, GATE_INITIAL);
	const [conc, concSubmit] = useActionState(
		concurrentAction,
		CONCURRENCY_INITIAL,
	);
	const [reland, relandSubmit] = useActionState(relandAction, RELAND_INITIAL);
	const [mode, setMode] = useState("full");
	const [override, setOverride] = useState(false);

	// The new head the stale member re-runs against (from the concurrent batch's landed write).
	const landedHead =
		conc.decisions.find((d) => d.outcome === "applied")?.newHead ?? "";

	return (
		<div className="space-y-12">
			{/* ── 1. THE AUTHORITY GATE ── */}
			<section className="space-y-4" data-testid="section-gate">
				<h2 className="text-lg font-semibold text-foreground">
					{t("gateHeading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("gateBody")}
				</p>
				<form
					action={gateSubmit}
					className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
				>
					<input type="hidden" name="mode" value={mode} />
					<input
						type="hidden"
						name="override"
						value={override ? "on" : "off"}
					/>
					<fieldset className="flex flex-wrap gap-2">
						{[
							{ v: "full", k: "fullApproval" },
							{ v: "veto", k: "withVeto" },
							{ v: "partial", k: "partialApproval" },
						].map((opt) => (
							<button
								key={opt.v}
								type="button"
								data-testid={`mode-${opt.v}`}
								aria-pressed={mode === opt.v}
								onClick={() => setMode(opt.v)}
								className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
									mode === opt.v
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-background text-muted-foreground hover:bg-muted"
								}`}
							>
								{t(opt.k)}
							</button>
						))}
					</fieldset>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							data-testid="override-toggle"
							checked={override}
							onChange={(e) => setOverride(e.target.checked)}
							className="h-4 w-4 rounded border-border"
						/>
						{t("overrideLabel")}
					</label>
					<Submit label={t("approve")} testId="gate-submit" />
				</form>
				{gate.ran && gate.decision ? (
					<div className="space-y-2" data-testid="gate-result">
						<DecisionRow d={gate.decision} />
						<p className="text-xs text-muted-foreground">{t("noTruthWrite")}</p>
					</div>
				) : null}
			</section>

			{/* ── 2. CONTENT-ADDRESSED CONCURRENCY ── */}
			<section className="space-y-4" data-testid="section-concurrency">
				<h2 className="text-lg font-semibold text-foreground">
					{t("concurrencyHeading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("concurrencyBody")}
				</p>
				<form action={concSubmit}>
					<Submit label={t("runConcurrent")} testId="concurrent-submit" />
				</form>
				{conc.ran ? (
					<div className="space-y-3" data-testid="concurrent-result">
						<div className="flex flex-wrap gap-4 text-sm">
							<span>
								<span className="font-medium text-foreground">
									{t("appliedCountLabel")}:{" "}
								</span>
								<span
									data-testid="applied-count"
									className="font-semibold text-emerald-600 dark:text-emerald-400"
								>
									{conc.appliedCount}
								</span>
							</span>
							<span>
								<span className="font-medium text-foreground">
									{t("staleLabel")}:{" "}
								</span>
								<span
									data-testid="stale-members"
									className="font-semibold text-amber-600 dark:text-amber-400"
								>
									{conc.stale.join(", ") || "—"}
								</span>
							</span>
						</div>
						<div className="space-y-2">
							{conc.decisions.map((d) => (
								<DecisionRow key={d.actor} d={d} />
							))}
						</div>
						<p className="text-xs text-muted-foreground">{t("noTruthWrite")}</p>
					</div>
				) : null}
			</section>

			{/* ── 3. RELAND AGAINST THE NEW HEAD ── */}
			<section className="space-y-4" data-testid="section-reland">
				<h2 className="text-lg font-semibold text-foreground">
					{t("relandHeading")}
				</h2>
				<form action={relandSubmit}>
					<input type="hidden" name="newHead" value={landedHead} />
					<Submit label={t("reland")} testId="reland-submit" />
				</form>
				{reland.ran && reland.decision ? (
					<div className="space-y-2" data-testid="reland-result">
						<p className="text-xs text-muted-foreground">{t("relandResult")}</p>
						<DecisionRow d={reland.decision} />
					</div>
				) : null}
			</section>
		</div>
	);
}
