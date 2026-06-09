"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { PairCell } from "@/lib/ai-lab";
import type { DecisionCard } from "@/lib/conscience";
import {
	chatAction,
	loadCockpitAction,
	scopePairAction,
	validateCardAction,
} from "./actions";
import { type CockpitView, emptyView, SCENARIOS } from "./fixtures";

/**
 * CockpitPanel makes /ai-lab action-capable (ui-completeness, CLAUDE.md §7): the FK11 trialogue.
 * Every cockpit op has a control bound to a Server Action running the PURE twin lib/ai-lab —
 *  - LOAD a cockpit (the CENTRE navigable layer + DROITE cards/red-wave/blast/gate),
 *  - CHAT a slot in the GAUCHE pane (proposes amber, never a truth ; a truth-write is refused),
 *  - CLICK a pair voyant to SCOPE the left + right panes (deterministic),
 *  - VALIDATE a decision card to flip the addressed pair 🔴→🟢 (below the wall) or open a goal.
 *
 * DETERMINISM-FIRST (§6/§8): the controls run the pure twin, never an LLM — same input → same
 * cockpit (the determinism badge). THE WALL (§2): below the wall is read-only from the cockpit ;
 * a chat truth-write is REFUSED ; an above-the-wall option opens a /goal. Themed ADR 0010,
 * strings via next-intl (0011).
 */

function voyantClasses(v: string): string {
	if (v === "green")
		return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
	if (v === "amber")
		return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
	return "bg-destructive/15 text-destructive border-destructive/30";
}

function voyantGlyph(v: string): string {
	if (v === "green") return "🟢";
	if (v === "amber") return "🟡";
	return "🔴";
}

function Pending({ idle, busy }: { idle: string; busy: string }) {
	const { pending } = useFormStatus();
	return <>{pending ? busy : idle}</>;
}

export function CockpitPanel() {
	const t = useTranslations("aiLab");
	const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
	const [mode, setMode] = useState<"conversational" | "navigational">(
		"navigational",
	);

	const [load, loadFn] = useActionState(loadCockpitAction, emptyView);
	const [chat, chatFn] = useActionState(chatAction, emptyView);
	const [scope, scopeFn] = useActionState(scopePairAction, emptyView);
	const [valid, validFn] = useActionState(validateCardAction, emptyView);

	// the freshest cockpit state across the four actions (latest-write-wins is fine here:
	// each action returns the full rebuilt state).
	const latest: CockpitView = valid.ok
		? valid
		: scope.ok
			? scope
			: chat.ok
				? chat
				: load.ok
					? load
					: emptyView;
	const state = latest.state;
	const activeScope = scope.scope;

	return (
		<div
			className="mt-10 space-y-6"
			data-testid="cockpit-panel"
			data-mode={mode}
		>
			{/* ── controls: scenario + mode + LOAD ─────────────────────────── */}
			<form
				action={loadFn}
				className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-5"
			>
				<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					{t("scenarioLabel")}
					<select
						name="scenarioId"
						data-testid="scenario-select"
						value={scenarioId}
						onChange={(e) => setScenarioId(e.target.value)}
						className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{SCENARIOS.map((s) => (
							<option key={s.id} value={s.id}>
								{s.label}
							</option>
						))}
					</select>
				</label>
				<fieldset className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					{t("modeLabel")}
					<div className="flex gap-2" data-testid="mode-toggle">
						{(["navigational", "conversational"] as const).map((m) => (
							<label
								key={m}
								className="inline-flex items-center gap-1 text-sm text-foreground"
							>
								<input
									type="radio"
									name="mode"
									value={m}
									checked={mode === m}
									onChange={() => setMode(m)}
									data-testid={`mode-${m}`}
								/>
								{t(`mode_${m}`)}
							</label>
						))}
					</div>
				</fieldset>
				<button
					type="submit"
					data-testid="load-submit"
					className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					<Pending idle={t("loadCta")} busy={t("working")} />
				</button>
				{latest.deterministic !== undefined && (
					<span
						data-testid="determinism-badge"
						data-deterministic={String(latest.deterministic)}
						className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
					>
						{latest.deterministic
							? t("deterministicYes")
							: t("deterministicNo")}
					</span>
				)}
			</form>

			{latest.error && (
				<p data-testid="error" className="text-sm text-destructive">
					{latest.error}
				</p>
			)}

			{state && (
				<div className="grid gap-4 lg:grid-cols-3" data-testid="trialogue">
					{/* ── GAUCHE : the chat that proposes slots, never a truth ─── */}
					<section
						data-testid="pane-left"
						className="space-y-3 rounded-xl border border-border bg-card p-4"
					>
						<h3 className="text-sm font-semibold text-foreground">
							{t("leftHeading")}
						</h3>
						<p className="text-xs text-muted-foreground">{t("leftHelp")}</p>
						<form action={chatFn} className="space-y-2">
							<input type="hidden" name="scenarioId" value={scenarioId} />
							<input
								type="hidden"
								name="facet"
								value={activeScope?.facet ?? "F"}
								data-testid="chat-facet"
							/>
							<textarea
								name="message"
								data-testid="chat-input"
								rows={3}
								placeholder={t("chatPlaceholder")}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
							<button
								type="submit"
								data-testid="chat-submit"
								className="inline-flex items-center justify-center rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
							>
								<Pending idle={t("chatCta")} busy={t("working")} />
							</button>
						</form>
						{chat.slot && (
							<div
								data-testid="proposed-slot"
								data-status={chat.slot.status}
								className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
							>
								<span className="font-medium text-amber-700 dark:text-amber-300">
									🟡 {t("proposedSlot")}
								</span>
								<p className="mt-1 text-muted-foreground">{chat.slot.intent}</p>
								<p className="mt-1 font-mono text-[11px] text-muted-foreground">
									{chat.slot.id} · facet {chat.slot.facet}
								</p>
							</div>
						)}
						{chat.refusal && (
							<div
								data-testid="wall-refusal"
								data-code={chat.refusal.code}
								className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs"
							>
								<span className="font-medium text-destructive">
									⛔ {t("wallRefused")}
								</span>
								<p className="mt-1 text-muted-foreground">
									{chat.refusal.explanation}
								</p>
								<ul className="mt-1 list-disc pl-4 text-muted-foreground">
									{chat.refusal.howToFix.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						)}
						{activeScope && (
							<p
								data-testid="left-scope"
								className="text-[11px] text-muted-foreground"
							>
								{t("scopedTo")} {activeScope.facet}:{activeScope.pair}
							</p>
						)}
					</section>

					{/* ── CENTRE : the navigable layer, the wall, the voyants ──── */}
					<section
						data-testid="pane-center"
						className="space-y-3 rounded-xl border border-border bg-card p-4"
					>
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-foreground">
								{t("centerHeading")}
							</h3>
							<span
								data-testid="verdict-badge"
								data-verdict={state.verdict}
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
									state.verdict === "drift"
										? "bg-destructive/15 text-destructive"
										: "bg-green-500/15 text-green-700 dark:text-green-300"
								}`}
							>
								{state.verdict === "drift" ? t("drift") : t("aligned")}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
						<ul className="space-y-1.5">
							{state.cells.map((cell: PairCell) => (
								<li key={cell.key}>
									<form action={scopeFn}>
										<input type="hidden" name="scenarioId" value={scenarioId} />
										<input type="hidden" name="pairKey" value={cell.key} />
										<button
											type="submit"
											data-testid="pair-cell"
											data-pair-key={cell.key}
											data-voyant={cell.voyant}
											data-tier={cell.tier}
											data-readonly={String(cell.readOnly)}
											className={`flex w-full flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:brightness-105 ${voyantClasses(cell.voyant)}`}
										>
											<span aria-hidden>{voyantGlyph(cell.voyant)}</span>
											<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background/50 font-mono text-[11px] font-bold">
												{cell.facet}
											</span>
											<span className="font-mono text-[11px]">{cell.pair}</span>
											<span className="font-mono text-[10px] opacity-70">
												{cell.source}
											</span>
											<span
												className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
													cell.tier === "above"
														? "bg-blue-600/15 text-blue-700 dark:text-blue-300"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{cell.tier === "above"
													? t("tierAbove")
													: t("tierBelow")}
											</span>
										</button>
									</form>
								</li>
							))}
						</ul>
						<p className="text-[11px] text-muted-foreground">
							🟢 {state.green} · 🔴 {state.red} · 🟡 {state.amber}
						</p>
					</section>

					{/* ── DROITE : cards + blast + red wave + promotion gate ────── */}
					<section
						data-testid="pane-right"
						className="space-y-3 rounded-xl border border-border bg-card p-4"
					>
						<h3 className="text-sm font-semibold text-foreground">
							{t("rightHeading")}
						</h3>

						{/* red wave */}
						<div
							data-testid="red-wave"
							className="rounded-md border border-border bg-muted/40 p-2.5 text-xs"
						>
							<span className="font-medium text-foreground">
								{t("redWaveHeading")}
							</span>
							{state.redWave.length === 0 ? (
								<span className="ml-2 text-muted-foreground">
									{t("redWaveEmpty")}
								</span>
							) : (
								<ul className="mt-1 space-y-0.5 font-mono text-[11px] text-destructive">
									{state.redWave.map((k) => (
										<li key={k} data-testid="red-wave-item">
											🔴 {k}
										</li>
									))}
								</ul>
							)}
						</div>

						{/* promotion gate */}
						{state.gate && (
							<div
								data-testid="promotion-gate"
								data-can-promote={String(state.gate.canPromote)}
								className="rounded-md border border-border bg-muted/40 p-2.5 text-xs"
							>
								<span className="font-medium text-foreground">
									{t("gateHeading")}
								</span>
								<p className="mt-1 text-muted-foreground">
									A{state.gate.level} →{" "}
									{state.gate.canPromote
										? `A${state.gate.nextLevel} ✓`
										: t("gateBlocked")}
								</p>
							</div>
						)}

						{/* decision cards */}
						{state.cards.length === 0 ? (
							<p
								data-testid="no-cards"
								className="text-xs text-muted-foreground"
							>
								{t("noCards")}
							</p>
						) : (
							<ul className="space-y-2" data-testid="cards">
								{state.cards.map((c: DecisionCard) => (
									<li
										key={c.id}
										data-testid="card"
										data-card-id={c.id}
										data-advisory={String(c.advisory)}
										className={`rounded-md border p-2.5 text-xs ${
											c.advisory
												? "border-amber-500/30 bg-amber-500/10"
												: "border-destructive/30 bg-destructive/10"
										}`}
									>
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-mono text-[11px] font-bold">
												{c.facet}
											</span>
											<span className="font-mono text-[11px]">{c.pair}</span>
											<span
												data-testid="card-blast"
												className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
											>
												{t("blastLabel")}: {c.blast}
											</span>
										</div>
										{c.detail && (
											<p className="mt-1 text-muted-foreground">{c.detail}</p>
										)}
										<div className="mt-2 flex flex-wrap gap-1.5">
											{c.options.map((opt) => (
												<form key={opt} action={validFn}>
													<input
														type="hidden"
														name="scenarioId"
														value={scenarioId}
													/>
													<input type="hidden" name="cardId" value={c.id} />
													<input type="hidden" name="option" value={opt} />
													<button
														type="submit"
														data-testid="card-option"
														data-card-id={c.id}
														data-option={opt}
														className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
															opt === c.recommendation
																? "bg-primary text-primary-foreground hover:bg-primary/90"
																: "border border-border bg-muted text-foreground hover:bg-muted/70"
														}`}
													>
														{opt}
													</button>
												</form>
											))}
										</div>
									</li>
								))}
							</ul>
						)}

						{valid.flippedPair && (
							<p
								data-testid="flipped"
								data-pair={valid.flippedPair}
								className="text-xs text-green-700 dark:text-green-300"
							>
								🟢 {t("flipped")} {valid.flippedPair}
							</p>
						)}
						{valid.openedGoal && (
							<p
								data-testid="opened-goal"
								className="text-xs text-blue-700 dark:text-blue-300"
							>
								{t("openedGoal")}
							</p>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
