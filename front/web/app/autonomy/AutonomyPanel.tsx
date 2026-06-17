"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import {
	ACTION_SCENARIOS,
	HISTORY_SCENARIOS,
	levelLabel,
} from "@/lib/autonomy-data";
import { enforceAction, promoteAction } from "./actions";
import { emptyEnforceView, emptyPromoteView } from "./view";

/**
 * AutonomyPanel makes the /autonomy route action-capable (ui-completeness, CLAUDE.md §7): the FK10
 * A0..A8 ladder has TWO controls bound to the Go engine, reachable AND executable from the screen —
 *   ENFORCER : a declared level + an attempted action → admis/refusé (with the AGENT_AUTONOMY_EXCEEDED
 *              BlockReason on a refusal). The canonical fixture: an A1 agent attempting a merge.
 *   CALCULER LA MONTÉE : a current level + an AgentRun history → the level the history EARNS
 *              (current+1 IFF the window is all green at E4+ with no incident, never declared).
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). Each control submits a
 * Server Action (enforceAction / promoteAction) that reads the LIVE verdict / level from the Go
 * autonomy MCP server through the passerelle (readVia, the dispatched below-the-line read), with the
 * TS twin (lib/autonomy) preserved ONLY as the deterministic demo fallback (lib/autonomy-data,
 * source:"live"|"demo"). The panel value-imports ONLY the demo scenarios + the levelLabel display
 * helper from lib/autonomy-data — NEVER the twin logic (lib/autonomy) — so the T5 cliquet stays
 * GREEN; the live compute lives behind readVia in actions.ts.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the Go enforce/promote (and their demo twins) are PURE — same
 * input → same verdict / same level, never an LLM. THE WALL (§2): the screen WRITES NOTHING — the
 * verdict and the proposed level are projections; freezing a promotion goes idea → mirror → /goal.
 * Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

/** The honest live/demo provenance badge (ADR 0074: a source:"demo" is shown, never hidden). */
function SourceBadge({ source }: { source: "live" | "demo" }) {
	const t = useTranslations("autonomy");
	return (
		<span
			data-testid="source-badge"
			data-source={source}
			className={
				source === "live"
					? "inline-flex items-center rounded-full bg-blue-600/15 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300"
					: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
			}
		>
			{source === "live" ? t("sourceLive") : t("sourceDemo")}
		</span>
	);
}

export function AutonomyPanel() {
	const t = useTranslations("autonomy");
	const [enforceView, runEnforce] = useActionState(
		enforceAction,
		emptyEnforceView,
	);
	const [promoteView, runPromote] = useActionState(
		promoteAction,
		emptyPromoteView,
	);

	return (
		<section
			aria-label={t("panelHeading")}
			data-testid="autonomy-panel"
			className="mt-10 space-y-10"
		>
			{/* The closed A0..A8 ladder, declared. */}
			<div className="space-y-2">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ladderHeading")}
				</h3>
				<div data-testid="ladder" className="flex flex-wrap gap-1.5">
					{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
						<span
							key={l}
							data-testid="ladder-rung"
							data-level={l}
							className={
								l >= 8
									? "inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-xs font-medium text-amber-700 dark:text-amber-300"
									: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
							}
						>
							{levelLabel(l)}
						</span>
					))}
				</div>
			</div>

			{/* ── Control 1 : ENFORCER (Server Action → Go enforce) ── */}
			<form action={runEnforce} className="space-y-4">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("enforceHeading")}
				</h3>
				<div className="flex flex-wrap items-end gap-3">
					<div className="space-y-1">
						<label
							htmlFor="actScenario"
							className="block text-sm font-medium text-foreground"
						>
							{t("actionLabel")}
						</label>
						<select
							id="actScenario"
							name="scenarioId"
							data-testid="action-select"
							defaultValue={ACTION_SCENARIOS[0].id}
							className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{ACTION_SCENARIOS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.label}
								</option>
							))}
						</select>
					</div>
					<button
						type="submit"
						data-testid="enforce-submit"
						className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{t("enforceCta")}
					</button>
				</div>

				{enforceView.ok && enforceView.snapshot ? (
					<div
						data-testid="decision"
						data-allowed={enforceView.snapshot.allowed ? "true" : "false"}
						className={
							enforceView.snapshot.allowed
								? "space-y-2 rounded-xl border border-green-500/40 bg-green-500/5 p-4"
								: "space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
						}
					>
						<div className="flex flex-wrap items-center gap-2">
							{enforceView.source ? (
								<SourceBadge source={enforceView.source} />
							) : null}
							<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{t("declaredLabel")}: {enforceView.snapshot.declared}
							</span>
							<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{t("requiredLabel")}: {enforceView.snapshot.required}
							</span>
							{enforceView.snapshot.critical ? (
								<span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
									{t("criticalTag")}
								</span>
							) : null}
							<span
								data-testid="decision-badge"
								className={
									enforceView.snapshot.allowed
										? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
										: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
								}
							>
								{enforceView.snapshot.allowed ? t("admitted") : t("refused")}
							</span>
						</div>
						{enforceView.snapshot.code ? (
							<div data-testid="block-reason" className="space-y-1.5">
								<code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
									{enforceView.snapshot.code}
								</code>
								{enforceView.snapshot.explanation ? (
									<p className="text-xs text-muted-foreground">
										{enforceView.snapshot.explanation}
									</p>
								) : null}
								<ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
									{(enforceView.snapshot.howToFix ?? []).map((h) => (
										<li key={h} data-testid="how-to-fix">
											{h}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				) : null}
				{enforceView.error ? (
					<p data-testid="enforce-error" className="text-xs text-destructive">
						{enforceView.error}
					</p>
				) : null}
			</form>

			{/* ── Control 2 : CALCULER LA MONTÉE (Server Action → Go promote) ── */}
			<form action={runPromote} className="space-y-4">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("promoteHeading")}
				</h3>
				<div className="flex flex-wrap items-end gap-3">
					<div className="space-y-1">
						<label
							htmlFor="histScenario"
							className="block text-sm font-medium text-foreground"
						>
							{t("historyLabel")}
						</label>
						<select
							id="histScenario"
							name="scenarioId"
							data-testid="history-select"
							defaultValue={HISTORY_SCENARIOS[0].id}
							className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{HISTORY_SCENARIOS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.label}
								</option>
							))}
						</select>
					</div>
					<button
						type="submit"
						data-testid="promote-submit"
						className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{t("promoteCta")}
					</button>
				</div>

				{promoteView.ok && promoteView.snapshot ? (
					<div
						data-testid="promotion"
						data-earned={promoteView.snapshot.earned ? "true" : "false"}
						className={
							promoteView.snapshot.earned
								? "flex flex-wrap items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/5 p-4"
								: "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-4"
						}
					>
						{promoteView.source ? (
							<SourceBadge source={promoteView.source} />
						) : null}
						<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
							{t("currentLabel")}: {promoteView.snapshot.current}
						</span>
						<span className="text-muted-foreground">→</span>
						<span
							data-testid="promoted-level"
							className={
								promoteView.snapshot.earned
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 font-mono text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
							}
						>
							{promoteView.snapshot.promoted}
						</span>
						<span
							data-testid="promotion-verdict"
							className="text-xs text-muted-foreground"
						>
							{promoteView.snapshot.earned ? t("promoted") : t("withheld")}
						</span>
					</div>
				) : null}
				{promoteView.error ? (
					<p data-testid="promote-error" className="text-xs text-destructive">
						{promoteView.error}
					</p>
				) : null}
			</form>

			<p className="text-xs leading-relaxed text-muted-foreground">
				{t("footer")}
			</p>
		</section>
	);
}
