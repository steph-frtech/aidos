"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type Action,
	type Decision,
	enforce,
	type Level,
	levelLabel,
	promotionFromHistory,
	type RunOutcome,
} from "@/lib/autonomy";

/**
 * AutonomyPanel makes the /autonomy route action-capable (ui-completeness, CLAUDE.md §7): the FK10
 * pure functions have TWO controls bound to them, reachable AND executable from the screen —
 *   ENFORCER : a declared level + an attempted action → admis/refusé (with the AGENT_AUTONOMY_EXCEEDED
 *              BlockReason on a refusal). The canonical fixture: an A1 agent attempting a merge.
 *   CALCULER LA MONTÉE : a current level + an AgentRun history → the level the history EARNS
 *              (current+1 IFF the window is all green at E4+ with no incident, never declared).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both controls run the PURE twin lib/autonomy, never an LLM —
 * same input → same verdict / same level. THE WALL (§2): the screen WRITES NOTHING — the verdict
 * and the proposed level are projections; freezing a promotion goes idea → mirror → /goal. Themed
 * on ADR 0010 tokens; strings via next-intl (0011).
 */

interface ActionScenario {
	id: string;
	label: string;
	declared: Level;
	action: Action;
}

interface HistoryScenario {
	id: string;
	label: string;
	current: Level;
	history: RunOutcome[];
}

const g = (evidence: number, incident = false): RunOutcome => ({
	green: true,
	evidence,
	incident,
});

const ACTION_SCENARIOS: ActionScenario[] = [
	{
		id: "a1-merge",
		label: "A1 → merge (A6, critique)",
		declared: 1,
		action: { name: "merge", required: 6, critical: true },
	},
	{
		id: "a6-merge",
		label: "A6 → merge (A6, critique)",
		declared: 6,
		action: { name: "merge", required: 6, critical: true },
	},
	{
		id: "a8-critical",
		label: "A8 → action critique A8 (jamais)",
		declared: 8,
		action: { name: "irreversible", required: 8, critical: true },
	},
	{
		id: "a3-read",
		label: "A3 → lecture (A0)",
		declared: 3,
		action: { name: "read", required: 0, critical: false },
	},
];

const HISTORY_SCENARIOS: HistoryScenario[] = [
	{
		id: "clean",
		label: "A1 · 3 runs verts E4+ sans incident",
		current: 1,
		history: [g(4), g(5), g(4)],
	},
	{
		id: "incident",
		label: "A1 · un incident dans la fenêtre",
		current: 1,
		history: [g(4), g(4, true), g(4)],
	},
	{
		id: "below-e4",
		label: "A1 · un run sous E4 (E3)",
		current: 1,
		history: [g(4), g(3), g(4)],
	},
];

export function AutonomyPanel() {
	const t = useTranslations("autonomy");
	const [actScenario, setActScenario] = useState(ACTION_SCENARIOS[0].id);
	const [decision, setDecision] = useState<{
		dec: Decision;
		declared: Level;
		action: Action;
	} | null>(null);
	const [histScenario, setHistScenario] = useState(HISTORY_SCENARIOS[0].id);
	const [promotion, setPromotion] = useState<{
		current: Level;
		promoted: Level;
		earned: boolean;
	} | null>(null);

	function runEnforce() {
		const s = ACTION_SCENARIOS.find((x) => x.id === actScenario);
		if (!s) return;
		setDecision({
			dec: enforce(s.declared, s.action),
			declared: s.declared,
			action: s.action,
		});
	}

	function runPromote() {
		const s = HISTORY_SCENARIOS.find((x) => x.id === histScenario);
		if (!s) return;
		const promoted = promotionFromHistory(s.current, s.history);
		setPromotion({
			current: s.current,
			promoted,
			earned: promoted > s.current,
		});
	}

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
					{([0, 1, 2, 3, 4, 5, 6, 7, 8] as Level[]).map((l) => (
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

			{/* ── Control 1 : ENFORCER ── */}
			<div className="space-y-4">
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
							data-testid="action-select"
							value={actScenario}
							onChange={(e) => setActScenario(e.target.value)}
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
						type="button"
						data-testid="enforce-submit"
						onClick={runEnforce}
						className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{t("enforceCta")}
					</button>
				</div>

				{decision ? (
					<div
						data-testid="decision"
						data-allowed={decision.dec.allowed ? "true" : "false"}
						className={
							decision.dec.allowed
								? "space-y-2 rounded-xl border border-green-500/40 bg-green-500/5 p-4"
								: "space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
						}
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{t("declaredLabel")}: {levelLabel(decision.declared)}
							</span>
							<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{t("requiredLabel")}: {levelLabel(decision.action.required)}
							</span>
							{decision.action.critical ? (
								<span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
									{t("criticalTag")}
								</span>
							) : null}
							<span
								data-testid="decision-badge"
								className={
									decision.dec.allowed
										? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
										: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
								}
							>
								{decision.dec.allowed ? t("admitted") : t("refused")}
							</span>
						</div>
						{decision.dec.blockReason ? (
							<div data-testid="block-reason" className="space-y-1.5">
								<code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
									{decision.dec.blockReason.code}
								</code>
								<p className="text-xs text-muted-foreground">
									{decision.dec.blockReason.explanation}
								</p>
								<ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
									{decision.dec.blockReason.howToFix.map((h) => (
										<li key={h} data-testid="how-to-fix">
											{h}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				) : null}
			</div>

			{/* ── Control 2 : CALCULER LA MONTÉE ── */}
			<div className="space-y-4">
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
							data-testid="history-select"
							value={histScenario}
							onChange={(e) => setHistScenario(e.target.value)}
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
						type="button"
						data-testid="promote-submit"
						onClick={runPromote}
						className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{t("promoteCta")}
					</button>
				</div>

				{promotion ? (
					<div
						data-testid="promotion"
						data-earned={promotion.earned ? "true" : "false"}
						className={
							promotion.earned
								? "flex flex-wrap items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/5 p-4"
								: "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-4"
						}
					>
						<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
							{t("currentLabel")}: {levelLabel(promotion.current)}
						</span>
						<span className="text-muted-foreground">→</span>
						<span
							data-testid="promoted-level"
							className={
								promotion.earned
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 font-mono text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
							}
						>
							{levelLabel(promotion.promoted)}
						</span>
						<span
							data-testid="promotion-verdict"
							className="text-xs text-muted-foreground"
						>
							{promotion.earned ? t("promoted") : t("withheld")}
						</span>
					</div>
				) : null}
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">
				{t("footer")}
			</p>
		</section>
	);
}
