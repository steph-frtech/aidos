"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	ALL_FACETS,
	type AssistantReply,
	buildSpecGraph,
	type ChatTurn,
	cellFullyHandled,
	cellPlacements,
	EXISTING_DAG,
	type Level,
	MIRROR_PAIRS,
	nextPairId,
	type Placement,
	VERTICAL_LEVELS,
} from "@/lib/ai-lab";
import { leftBrainAction } from "./actions";
import { emptyLab, type LabView } from "./fixtures";
import { SpecGraph3D } from "./SpecGraph3D";

/**
 * CockpitPanel — the FKE-38 AI Lab. GAUCHE: a conversation wired to Claude (the left brain),
 * which fans a need across the verticale. DROITE: the NAVIGABLE big table (level × facet); click a
 * cell to open its ANATOMY DESCENT — validate a pair (Spec) → it generates the next (Comportement)
 * → Scénarios → Modèle → Contrat → Evidence, per facet (§6: the pair-to-pair chain is deterministic
 * code, never an LLM). Plus the impact on the EXISTING DAG. The wall §2 holds (propose-only; /goal).
 */

const LEVEL_KEY: Record<Level, string> = {
	produit: "level_produit",
	parcours: "level_parcours",
	vue: "level_vue",
	contrôle: "level_controle",
	action: "level_action",
	opération: "level_operation",
	entité: "level_entite",
};

function useReplyText() {
	const t = useTranslations("aiLab");
	return (reply: AssistantReply): string => {
		if (reply.kind === "greeting") return t("replyGreeting");
		if (reply.kind === "refused") return t("replyRefused");
		if (reply.kind === "fallback")
			return t("replyFallback", { placed: reply.placed });
		return t("replyGenerated", {
			facet: t(`facet_${reply.facet}`),
			n: reply.specs,
			divergent: reply.divergent,
		});
	};
}

function SubmitButton({
	label,
	working,
	testid,
	variant = "primary",
}: {
	label: string;
	working: string;
	testid?: string;
	variant?: "primary" | "ghost";
}) {
	const { pending } = useFormStatus();
	const cls =
		variant === "primary"
			? "bg-primary text-primary-foreground hover:bg-primary/90"
			: "border border-border bg-background text-foreground hover:bg-muted";
	return (
		<button
			type="submit"
			disabled={pending}
			data-testid={testid}
			className={`inline-flex shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
		>
			{pending ? working : label}
		</button>
	);
}

function Bubble({ turn, text }: { turn: ChatTurn; text: string }) {
	const isUser = turn.role === "user";
	const refused = turn.reply?.kind === "refused";
	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				data-testid={
					refused ? "wall-refused" : isUser ? "turn-user" : "turn-assistant"
				}
				className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
					isUser
						? "rounded-br-sm bg-primary text-primary-foreground"
						: refused
							? "rounded-bl-sm border border-destructive/30 bg-destructive/10 text-foreground"
							: "rounded-bl-sm bg-muted text-foreground"
				}`}
			>
				{isUser ? turn.text : text}
			</div>
		</div>
	);
}

function statusBadge(status: Placement["status"], t: (k: string) => string) {
	if (status === "validated")
		return {
			label: t("statusValidated"),
			cls: "bg-green-500/15 text-green-700 dark:text-green-300",
		};
	if (status === "realized")
		return {
			label: t("statusRealized"),
			cls: "bg-blue-600/15 text-blue-700 dark:text-blue-300",
		};
	return {
		label: t("statusProposed"),
		cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	};
}

export function CockpitPanel() {
	const t = useTranslations("aiLab");
	const replyText = useReplyText();
	const [view, action] = useActionState<LabView, FormData>(
		leftBrainAction,
		emptyLab(),
	);

	const placements = view.placements ?? [];
	const thread = view.thread ?? [];
	const impactById = new Map(
		(view.impacts ?? []).map((i) => [i.specId, i.reason]),
	);
	const sel = view.selectedCell;
	const selPairs = sel ? cellPlacements(placements, sel.level, sel.facet) : [];
	const [rightView, setRightView] = useState<"table" | "graph">("table");
	const graph = buildSpecGraph(placements, EXISTING_DAG, view.impacts ?? []);

	return (
		<div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[36rem_1fr]">
			{/* ─────────────── GAUCHE — the conversation (Claude), large ─────────────── */}
			<section
				aria-label={t("leftHeading")}
				className="flex h-[48rem] flex-col rounded-xl border border-border bg-card"
			>
				<div className="flex items-center justify-between gap-2 border-b border-border p-4">
					<div className="space-y-1">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("leftHeading")}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t("leftHelp")}
						</p>
					</div>
					{view.mode && view.mode !== "idle" ? (
						<span
							data-testid="brain-mode"
							data-mode={view.mode}
							className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
								view.mode === "llm"
									? "bg-blue-600/15 text-blue-700 dark:text-blue-300"
									: "bg-amber-500/15 text-amber-700 dark:text-amber-300"
							}`}
						>
							{view.mode === "llm" ? t("modeLlm") : t("modeFallback")}
						</span>
					) : null}
				</div>

				<div
					data-testid="thread"
					className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
				>
					{thread.map((turn) => (
						<Bubble
							key={turn.id}
							turn={turn}
							text={turn.reply ? replyText(turn.reply) : turn.text}
						/>
					))}
				</div>

				<form
					action={action}
					className="flex items-end gap-2 border-t border-border p-3"
				>
					<input type="hidden" name="intent" value="chat" />
					<textarea
						name="message"
						rows={2}
						required
						maxLength={600}
						data-testid="chat"
						placeholder={t("chatPlaceholder")}
						className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
					/>
					<SubmitButton
						label={t("chatCta")}
						working={t("working")}
						testid="generate"
					/>
				</form>
			</section>

			{/* ─────────── DROITE — la grande table navigable + descente + impact ─────────── */}
			<section
				aria-label={t("gridTableHeading")}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				{/* view toggle: the navigable table ↔ the 3D spec graph */}
				<div
					data-testid="view-toggle"
					className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
				>
					{(["table", "graph"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => setRightView(v)}
							data-testid={`view-${v}`}
							className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
								rightView === v
									? "bg-card text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{v === "table" ? t("viewTable") : t("viewGraph")}
						</button>
					))}
				</div>

				{rightView === "graph" ? (
					<SpecGraph3D graph={graph} />
				) : (
					<>
						{/* 1) the navigable big table: niveau × facette */}
						<div className="space-y-2">
							<h2 className="text-sm font-semibold tracking-tight text-foreground">
								{t("gridTableHeading")}
							</h2>
							<p className="text-xs text-muted-foreground">
								{t("gridTableHint")}
							</p>
							<div className="overflow-x-auto">
								<table className="w-full border-separate border-spacing-1 text-xs">
									<thead>
										<tr>
											<th className="p-1" />
											{ALL_FACETS.map((f) => (
												<th
													key={f}
													title={t(`facet_${f}`)}
													className="p-1 text-center font-semibold text-foreground"
												>
													{f}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{VERTICAL_LEVELS.map((level) => (
											<tr key={level}>
												<th className="whitespace-nowrap p-1 text-right text-[11px] font-medium text-muted-foreground">
													{t(LEVEL_KEY[level])}
												</th>
												{ALL_FACETS.map((facet) => {
													const cells = cellPlacements(
														placements,
														level,
														facet,
													);
													const count = cells.length;
													const validated = cells.filter(
														(c) =>
															c.status === "validated" ||
															c.status === "realized",
													).length;
													const handled = cellFullyHandled(
														placements,
														level,
														facet,
													);
													const active =
														sel?.level === level && sel?.facet === facet;
													return (
														<td key={facet} className="p-0.5">
															<form action={action}>
																<input
																	type="hidden"
																	name="intent"
																	value="select"
																/>
																<input
																	type="hidden"
																	name="level"
																	value={level}
																/>
																<input
																	type="hidden"
																	name="facet"
																	value={facet}
																/>
																<button
																	type="submit"
																	data-testid={`cell-${LEVEL_KEY[level]}-${facet}`}
																	data-count={count}
																	data-handled={handled ? "1" : "0"}
																	className={`flex h-8 w-full items-center justify-center rounded border text-[10px] transition-colors ${
																		active
																			? "border-primary bg-primary/20 font-semibold text-primary ring-1 ring-primary"
																			: handled
																				? "border-green-500/40 bg-green-500/15 font-medium text-green-700 hover:bg-green-500/25 dark:text-green-300"
																				: count
																					? "border-border bg-amber-500/10 text-foreground hover:bg-amber-500/20"
																					: "border-dashed border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
																	}`}
																>
																	{count ? `${validated}/${count}` : "·"}
																</button>
															</form>
														</td>
													);
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>

						{/* 2) the anatomy descent of the selected cell */}
						{sel ? (
							<div
								data-testid="anatomy"
								className="space-y-2 rounded-lg border border-border bg-background p-3"
							>
								<h3 className="text-sm font-semibold tracking-tight text-foreground">
									{t("anatomyHeading", {
										level: t(LEVEL_KEY[sel.level]),
										facet: t(`facet_${sel.facet}`),
									})}
								</h3>
								<ol className="space-y-1.5">
									{MIRROR_PAIRS.map((pair) => {
										const placed = selPairs.find((p) => p.pairId === pair.id);
										const badge = placed ? statusBadge(placed.status, t) : null;
										const canValidate = placed && placed.status !== "realized";
										const isLast = !nextPairId(pair.id);
										return (
											<li
												key={pair.id}
												data-testid={`pair-${pair.id}`}
												data-status={
													placed?.status ?? (placed ? "proposed" : "pending")
												}
												className={`rounded-md border p-2 text-xs ${
													placed
														? "border-border bg-card"
														: "border-dashed border-border/50 bg-muted/10 opacity-60"
												}`}
											>
												<div className="flex items-center justify-between gap-2">
													<span className="font-medium text-foreground">
														{pair.above}
														<span className="text-muted-foreground">
															{" "}
															↔ {pair.below}
														</span>
													</span>
													{badge ? (
														<span
															className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
														>
															{badge.label}
														</span>
													) : (
														<span className="text-[10px] text-muted-foreground">
															{t("pairPending")}
														</span>
													)}
												</div>
												{placed ? (
													<>
														<details className="mt-1">
															<summary className="cursor-pointer text-muted-foreground">
																{placed.spec}
															</summary>
															<p className="mt-1 border-l-2 border-border pl-2 text-muted-foreground">
																{placed.detail || t("detailNone")}
															</p>
														</details>
														{canValidate ? (
															<form action={action} className="mt-1.5">
																<input
																	type="hidden"
																	name="intent"
																	value="validate"
																/>
																<input
																	type="hidden"
																	name="level"
																	value={sel.level}
																/>
																<input
																	type="hidden"
																	name="facet"
																	value={sel.facet}
																/>
																<input
																	type="hidden"
																	name="pairId"
																	value={pair.id}
																/>
																<SubmitButton
																	label={
																		isLast ? t("realizeCta") : t("validateCta")
																	}
																	working={t("working")}
																	testid={`validate-${pair.id}`}
																	variant="ghost"
																/>
															</form>
														) : null}
													</>
												) : null}
											</li>
										);
									})}
								</ol>
							</div>
						) : (
							<p
								data-testid="select-hint"
								className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground"
							>
								{t("selectCellHint")}
							</p>
						)}

						{/* 3) impact on the existing DAG */}
						<div className="space-y-2 border-t border-border pt-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h3 className="text-sm font-semibold tracking-tight text-foreground">
									{t("impactHeading")}
								</h3>
								<span
									data-testid="impact-count"
									className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
								>
									{t("impactCount", { n: impactById.size })}
								</span>
							</div>
							<ul className="space-y-1.5">
								{EXISTING_DAG.map((s) => {
									const impacted = impactById.has(s.id);
									const reason = impactById.get(s.id);
									const resolved =
										impacted && cellFullyHandled(placements, s.level, s.facet);
									return (
										<li
											key={s.id}
											data-testid={`dag-${s.id}`}
											data-impacted={impacted ? "1" : "0"}
											data-resolved={resolved ? "1" : "0"}
											className={`rounded-md border p-2 text-xs ${
												resolved
													? "border-green-500/40 bg-green-500/5"
													: impacted
														? "border-destructive/40 bg-destructive/5"
														: "border-border/60 bg-muted/10 opacity-70"
											}`}
										>
											<span className="font-medium text-foreground">
												{s.title}
											</span>
											<span className="text-muted-foreground">
												{" "}
												· {t(LEVEL_KEY[s.level])} · {s.facet}·{s.pairId}
											</span>
											{impacted ? (
												<div
													className={`mt-0.5 ${resolved ? "text-green-700 dark:text-green-300" : "text-destructive"}`}
												>
													{resolved ? "🟢" : "🔴"}{" "}
													{reason || t("impactReasonless")}
													{resolved ? ` — ${t("impactResolved")}` : ""}
												</div>
											) : null}
										</li>
									);
								})}
							</ul>
						</div>
					</>
				)}

				<p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>
		</div>
	);
}
