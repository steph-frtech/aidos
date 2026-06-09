"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AssistantReply,
	type ChatTurn,
	type GridCell,
	MIRROR_PAIRS,
} from "@/lib/ai-lab";
import type { Facet } from "@/lib/facetwire";
import { generateSpecsAction } from "./actions";
import { emptyLab, GRID_FACETS, type LabView } from "./fixtures";

/**
 * CockpitPanel makes /ai-lab action-capable (ui-completeness, CLAUDE.md §7): the corrected
 * FKE-38 AI Lab — a two-pane SPEC GENERATOR with a real CONVERSATION.
 *  - GAUCHE : a multi-turn natural-language CHAT (the « cerveau gauche »). You discuss; each
 *    message GENERATES the specs across the 6 mirror-pairs of the selected facet (a column of the
 *    6×6), ABOVE the wall (proposed — never a truth), and the left brain replies. A direct
 *    truth-write is REFUSED at the wall (§2) ; the only door is idea → mirror → /goal.
 *  - DROITE : the 6×6 grid — 6 mirror-pairs (rows) × facets (columns). Each cell shows the
 *    generated SPEC (above the wall) and its MACHINE (the mirror/test, below the wall) with the
 *    live conscience voyant 🟢/🔴/🟡.
 *
 * DETERMINISM-FIRST (§6/§8): the conversation runs the PURE twin lib/ai-lab (generateSpecs +
 * buildGrid + assistantReply) — the reply is a structured value rendered bilingually; the prose
 * compilation is the gated runtime exception, not this twin. THE WALL (§2): the chat proposes;
 * machines below are read-only; promotion is /goal. Themed ADR 0010, i18n 0011.
 */

function voyantDot(v: GridCell["voyant"]): string {
	if (v === "green") return "bg-green-500";
	if (v === "red") return "bg-destructive";
	return "bg-amber-500";
}

/** Render a structured assistant reply bilingually. */
function useReplyText() {
	const t = useTranslations("aiLab");
	return (reply: AssistantReply): string => {
		if (reply.kind === "greeting") return t("replyGreeting");
		if (reply.kind === "refused") return t("replyRefused");
		return t("replyGenerated", {
			facet: t(`facet_${reply.facet}`),
			n: reply.specs,
			divergent: reply.divergent,
		});
	};
}

function SendButton({ label, working }: { label: string; working: string }) {
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			disabled={pending}
			data-testid="generate"
			className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
				data-role={turn.role}
				className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
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

export function CockpitPanel() {
	const t = useTranslations("aiLab");
	const replyText = useReplyText();
	const [view, action] = useActionState<LabView, FormData>(
		generateSpecsAction,
		emptyLab(),
	);

	const specCount = view.specs?.length ?? 0;
	const cells = view.cells ?? [];
	const byKey = new Map(cells.map((c) => [c.key, c]));
	const thread = view.thread ?? [];

	return (
		<div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[24rem_1fr]">
			{/* ─────────────── GAUCHE — the conversation ─────────────── */}
			<section
				aria-label={t("leftHeading")}
				className="flex h-[34rem] flex-col rounded-xl border border-border bg-card"
			>
				<div className="space-y-1 border-b border-border p-4">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("leftHeading")}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t("leftHelp")}
					</p>
				</div>

				{/* the thread (scrollable) */}
				<div
					data-testid="thread"
					className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
				>
					{thread.map((turn) => (
						<Bubble
							key={turn.id}
							turn={turn}
							text={turn.reply ? replyText(turn.reply) : ""}
						/>
					))}
				</div>

				{/* the composer (bottom, chat-style) */}
				<form
					action={action}
					className="flex flex-col gap-2 border-t border-border p-3"
				>
					<div className="flex items-center gap-2">
						<label
							htmlFor="lab-facet"
							className="text-xs font-medium text-muted-foreground"
						>
							{t("facetLabel")}
						</label>
						<select
							id="lab-facet"
							name="facet"
							defaultValue={view.selectedFacet ?? "F"}
							data-testid="facet"
							className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
						>
							{GRID_FACETS.map((f: Facet) => (
								<option key={f} value={f}>
									{f} — {t(`facet_${f}`)}
								</option>
							))}
						</select>
					</div>
					<div className="flex items-end gap-2">
						<textarea
							name="message"
							rows={2}
							required
							data-testid="chat"
							placeholder={t("chatPlaceholder")}
							className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
						/>
						<SendButton label={t("chatCta")} working={t("working")} />
					</div>
				</form>
			</section>

			{/* ─────────── DROITE — the 6×6 grid (specs above, machines below) ─────────── */}
			<section
				aria-label={t("gridHeading")}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("gridHeading")}
					</h2>
					<span
						data-testid="spec-count"
						className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{t("specsCount", { n: specCount })}
					</span>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full border-separate border-spacing-1 text-xs">
						<thead>
							<tr>
								<th className="p-1 text-left font-medium text-muted-foreground">
									{t("pairColHeading")}
								</th>
								{GRID_FACETS.map((f) => (
									<th
										key={f}
										className="p-1 text-center font-semibold text-foreground"
										title={t(`facet_${f}`)}
									>
										{f}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{MIRROR_PAIRS.map((p) => (
								<tr key={p.id}>
									<th className="whitespace-nowrap p-1 text-left align-middle font-normal">
										<span className="font-medium text-foreground">
											{p.above}
										</span>
										<span className="text-muted-foreground"> ↔ {p.below}</span>
									</th>
									{GRID_FACETS.map((f) => {
										const cell = byKey.get(`${p.id}@${f}`);
										const v = cell?.voyant ?? "amber";
										const hasSpec = Boolean(cell?.spec);
										return (
											<td key={f} className="p-0.5">
												<div
													data-testid={`cell-${p.id}-${f}`}
													data-voyant={v}
													data-spec={hasSpec ? "1" : "0"}
													title={
														cell?.spec
															? `${t("aboveWall")}: ${cell.spec.text}\n${t("belowWall")}: ${p.below} — ${v}`
															: `${p.below} — ${v}`
													}
													className="flex flex-col overflow-hidden rounded-md border border-border"
												>
													<div
														className={`h-5 ${hasSpec ? "bg-amber-500/25" : "bg-muted/40"}`}
													/>
													<div className="h-px bg-foreground/40" />
													<div className="flex h-5 items-center justify-center bg-background">
														<span
															className={`inline-block h-2.5 w-2.5 rounded-full ${voyantDot(v)}`}
														/>
													</div>
												</div>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-3 w-3 rounded-sm bg-amber-500/25 ring-1 ring-border" />
						{t("legendSpec")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
						{t("legendGreen")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
						{t("legendRed")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
						{t("legendAmber")}
					</span>
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>
		</div>
	);
}
