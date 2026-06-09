"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AssistantReply,
	type ChatTurn,
	EXISTING_DAG,
	type Level,
	placementsByLevel,
} from "@/lib/ai-lab";
import { leftBrainAction } from "./actions";
import { emptyLab, type LabView } from "./fixtures";

/**
 * CockpitPanel makes /ai-lab action-capable (ui-completeness, CLAUDE.md §7): the corrected
 * FKE-38 AI Lab — a CONVERSATION wired to the REAL left brain (Claude).
 *  - GAUCHE : a multi-turn natural-language chat. You discuss; the message is NOT scoped — the
 *    left brain (Claude, gated) decides WHERE each spec goes across the whole verticale
 *    (produit → entité) × facet × mirror-pair. A direct truth-write is REFUSED at the wall (§2).
 *  - DROITE : the VERTICALE — the 7 levels, each showing the specs the intelligence PLACED there
 *    (facet · pair · spec). « Le chat agit sur tout niveau ; l'intelligence trouve où le mettre. »
 *
 * THE WALL (§2): the chat proposes; placements are clamped to the declared space (validatePlacements)
 * and never written to truth (promotion = /goal). DETERMINISM-FIRST (§6/§8): the LLM is the gated
 * exception (irreducible placement judgment), VERIFIED; a deterministic twin answers on failure
 * (mode "fallback", honestly flagged). Themed ADR 0010, i18n 0011.
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

export function CockpitPanel() {
	const t = useTranslations("aiLab");
	const replyText = useReplyText();
	const [view, action] = useActionState<LabView, FormData>(
		leftBrainAction,
		emptyLab(),
	);

	const placements = view.placements ?? [];
	const byLevel = placementsByLevel(placements);
	const thread = view.thread ?? [];
	const impactById = new Map(
		(view.impacts ?? []).map((i) => [i.specId, i.reason]),
	);

	return (
		<div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[34rem_1fr]">
			{/* ─────────────── GAUCHE — the conversation (real Claude), agrandie ─────────────── */}
			<section
				aria-label={t("leftHeading")}
				className="flex h-[46rem] flex-col rounded-xl border border-border bg-card"
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
					<textarea
						name="message"
						rows={2}
						required
						maxLength={600}
						data-testid="chat"
						placeholder={t("chatPlaceholder")}
						className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
					/>
					<SendButton label={t("chatCta")} working={t("working")} />
				</form>
			</section>

			{/* ─────────── DROITE — la verticale : où l'intelligence a placé les specs ─────────── */}
			<section
				aria-label={t("placementsHeading")}
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("placementsHeading")}
					</h2>
					<span
						data-testid="spec-count"
						className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{t("specsCount", { n: placements.length })}
					</span>
				</div>

				<ol className="space-y-2">
					{byLevel.map(({ level, items }) => (
						<li
							key={level}
							data-testid={`level-${LEVEL_KEY[level]}`}
							data-count={items.length}
							className={`rounded-lg border p-3 ${
								items.length
									? "border-border bg-background"
									: "border-dashed border-border/60 bg-muted/20"
							}`}
						>
							<div className="flex items-center gap-2">
								<span className="text-xs font-semibold tracking-tight text-foreground">
									{t(LEVEL_KEY[level])}
								</span>
								{items.length ? (
									<span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
										{items.length}
									</span>
								) : (
									<span className="text-[10px] text-muted-foreground">
										{t("levelEmpty")}
									</span>
								)}
							</div>
							{items.length ? (
								<ul className="mt-2 space-y-1.5">
									{items.map((p) => (
										<li
											key={`${p.facet}-${p.pairId}-${p.kernel ?? ""}`}
											className="flex items-start gap-2 text-xs"
										>
											<span
												title={t(`facet_${p.facet}`)}
												className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-foreground/10 font-mono text-[10px] font-bold text-foreground"
											>
												{p.facet}
											</span>
											<span className="text-muted-foreground">
												<span className="font-medium text-foreground">
													{p.pairId}
												</span>
												{p.kernel ? (
													<span className="text-muted-foreground">
														{" "}
														· {p.kernel}
													</span>
												) : null}{" "}
												— {p.spec}
											</span>
										</li>
									))}
								</ul>
							) : null}
						</li>
					))}
				</ol>

				{/* ─── Impact sur le DAG existant — la vague de rouge sur ce qui existe déjà ─── */}
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
							return (
								<li
									key={s.id}
									data-testid={`dag-${s.id}`}
									data-impacted={impacted ? "1" : "0"}
									className={`rounded-md border p-2 text-xs ${
										impacted
											? "border-destructive/40 bg-destructive/5"
											: "border-border/60 bg-muted/10 opacity-70"
									}`}
								>
									<div className="flex items-start gap-2">
										<span
											title={t(`facet_${s.facet}`)}
											className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-foreground/10 font-mono text-[10px] font-bold text-foreground"
										>
											{s.facet}
										</span>
										<div className="min-w-0">
											<span className="font-medium text-foreground">
												{s.title}
											</span>
											<span className="text-muted-foreground">
												{" "}
												· {t(LEVEL_KEY[s.level])} · {s.pairId}
											</span>
											{impacted ? (
												<div className="mt-0.5 flex items-start gap-1 text-destructive">
													<span aria-hidden>🔴</span>
													<span>{reason || t("impactReasonless")}</span>
												</div>
											) : null}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</div>

				<p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>
		</div>
	);
}
