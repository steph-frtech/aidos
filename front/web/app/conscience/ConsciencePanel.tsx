"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { DecisionCard, PairVerdict } from "@/lib/conscience";
import { reconcileAction } from "./actions";
import { type ConscienceView, emptyView, SCENARIOS } from "./fixtures";

/**
 * ConsciencePanel makes the /conscience route action-capable (ui-completeness, CLAUDE.md §7): the
 * FK09 aggregator Reconcile has ONE control bound to it — RÉCONCILIER — reachable AND executable
 * from the screen. Pick a scenario, run the conscience, and the reconciled sourced pairs + the
 * §FKE-31 decision cards + the overall verdict appear. A divergence produces its actionable card;
 * an aligned kernel produces none; the soft X facet stays aligned with an advisory card (§13.6).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/conscience, never an LLM
 * — same input → same report (the determinism badge). THE WALL (§2): it WRITES NOTHING — the
 * report and the cards are projections. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit() {
	const t = useTranslations("conscience");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="reconcile-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("reconcileCta")}
		</button>
	);
}

function verdictPill(t: ReturnType<typeof useTranslations>, v: string) {
	if (v === "green")
		return {
			cls: "bg-green-500/15 text-green-700 dark:text-green-300",
			label: t("verdictGreen"),
		};
	if (v === "advisory")
		return {
			cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
			label: t("verdictAdvisory"),
		};
	return { cls: "bg-destructive/15 text-destructive", label: t("verdictRed") };
}

function PairRow({ p }: { p: PairVerdict }) {
	const t = useTranslations("conscience");
	const pill = verdictPill(t, p.verdict);
	return (
		<li
			data-testid="pair"
			data-source={p.source}
			data-facet={p.facet}
			data-verdict={p.verdict}
			className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
		>
			<span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
				{p.source}
			</span>
			<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold text-foreground">
				{p.facet}
			</span>
			<span className="font-mono text-[11px] text-muted-foreground">
				{p.pair}
			</span>
			<span
				className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}
			>
				{pill.label}
			</span>
		</li>
	);
}

function CardItem({ c }: { c: DecisionCard }) {
	const t = useTranslations("conscience");
	return (
		<div
			data-testid="decision-card"
			data-facet={c.facet}
			data-source={c.source}
			data-advisory={c.advisory ? "true" : "false"}
			data-recommendation={c.recommendation}
			className={
				c.advisory
					? "space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
					: "space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
			}
		>
			<div className="flex flex-wrap items-center gap-2">
				<code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
					{c.id}
				</code>
				<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold text-foreground">
					{c.facet}
				</span>
				<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
					{c.drift}
				</span>
				<span
					data-testid="card-blast"
					className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
				>
					{t("blastLabel")}: {c.blast}
				</span>
				{c.advisory ? (
					<span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
						{t("advisoryTag")}
					</span>
				) : null}
			</div>
			{c.detail ? (
				<p className="text-xs text-muted-foreground">{c.detail}</p>
			) : null}
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-[11px] text-muted-foreground">
					{t("optionsLabel")}:
				</span>
				{c.options.map((o) => (
					<span
						key={o}
						data-testid="card-option"
						className={
							o === c.recommendation
								? "inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
								: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
						}
					>
						{o}
						{o === c.recommendation ? ` ★` : ""}
					</span>
				))}
			</div>
		</div>
	);
}

export function ConsciencePanel() {
	const t = useTranslations("conscience");
	const [state, formAction] = useActionState<ConscienceView, FormData>(
		reconcileAction,
		emptyView,
	);
	const rep = state.report;

	return (
		<section
			aria-label={t("panelHeading")}
			data-testid="conscience-panel"
			className="mt-10 space-y-6"
		>
			<form action={formAction} className="space-y-4">
				<label
					htmlFor="scenarioId"
					className="block text-sm font-medium text-foreground"
				>
					{t("scenarioLabel")}
				</label>
				<select
					id="scenarioId"
					name="scenarioId"
					data-testid="scenario-select"
					defaultValue={SCENARIOS[0]?.id}
					className="w-full max-w-xl rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{SCENARIOS.map((s) => (
						<option key={s.id} value={s.id}>
							{s.label}
						</option>
					))}
				</select>
				<Submit />
			</form>

			{state.error ? (
				<p data-testid="reconcile-error" className="text-sm text-destructive">
					{state.error}
				</p>
			) : null}

			{state.ok && rep ? (
				<div data-testid="report" className="space-y-6">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm text-muted-foreground">
							{t("kernelIdLabel")}
						</span>
						<code
							data-testid="kernel-id"
							className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
						>
							{rep.kernel_id}
						</code>
						<span
							data-testid="verdict-badge"
							data-verdict={rep.verdict}
							className={
								rep.verdict === "aligned"
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
							}
						>
							{rep.verdict === "aligned" ? t("aligned") : t("drift")}
						</span>
						<span
							data-testid="counts"
							className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{t("greenN", { n: rep.green })} · {t("redN", { n: rep.red })} ·{" "}
							{t("advisoryN", { n: rep.advisory })}
						</span>
						<span
							data-testid="determinism-badge"
							data-deterministic={state.deterministic ? "true" : "false"}
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{state.deterministic
								? t("deterministicYes")
								: t("deterministicNo")}
						</span>
					</div>

					<div className="space-y-3">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("pairsHeading")}
						</h3>
						<ul data-testid="pairs" className="space-y-1.5">
							{rep.pairs.map((p) => (
								<PairRow key={`${p.source}:${p.facet}:${p.pair}`} p={p} />
							))}
						</ul>
					</div>

					<div className="space-y-3">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("cardsHeading")}
						</h3>
						{rep.cards.length === 0 ? (
							<p
								data-testid="no-cards"
								className="text-sm text-muted-foreground"
							>
								{t("noCards")}
							</p>
						) : (
							<div data-testid="cards" className="grid gap-3 lg:grid-cols-2">
								{rep.cards.map((c) => (
									<CardItem key={c.id} c={c} />
								))}
							</div>
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
