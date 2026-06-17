"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Source } from "@/lib/gateway-sdk";
import {
	type CloseResult,
	checkCloseAction,
	type ProposeResult,
	proposeGoalAction,
} from "./actions";

/**
 * GoalPilotingPanel makes the /goal-piloting route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S66 UI-piloted /goal has TWO controls bound to the REAL engine, reachable
 * AND executable from the screen.
 *
 *   - Propose box — a real actor (identity + display) + the source idea + whether it carries a
 *     mirror + the LIVE red set → a DRAFT ChangeSet PROPOSAL + the live red-set worklist. The
 *     actor gate refuses a placeholder/agent (PLACEHOLDER_ACTOR); a mirror-less idea is refused
 *     (IDEA_WITHOUT_MIRROR); an empty red set is refused (NO_RED_SET).
 *   - Stop box — the live NON-GAMEABLE close gate: set the four live verdicts (red set green,
 *     prior green intact, mutation ≥ floor, no monster) → the close verdict + the four computed
 *     conditions. Closing is refused (GOAL_STILL_RED) unless all four hold — never on a declaration.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both controls run the pure twin lib/goal-piloting (the
 * byte-identical mirror of back/runtime/goalpiloting) — the verdict on screen matches the Go engine;
 * no agent-confidence is ever an input. THE WALL (§2): the propose action WRITES NOTHING — it returns
 * a DRAFT ChangeSet PROPOSAL for human approval; the close action never stamps CLOSED. The screen
 * PROPOSES a ChangeSet, never writes the Kernel. Themed on the ADR 0010 tokens; strings via next-intl
 * (ADR 0011).
 */

const proposeInitial: ProposeResult = { ok: false, messageKey: "" };
const closeInitial: CloseResult = { ok: false, closeable: false };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("goalPiloting");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * SourceBadge surfaces whether the displayed proposal / verdict came from the LIVE Go engine via the
 * passerelle (source:"live") or the deterministic demo twin fallback (source:"demo") — the ADR 0092
 * "twins must die" witness on screen.
 */
function SourceBadge({ source }: { source?: Source }) {
	const t = useTranslations("goalPiloting");
	if (!source) return null;
	const live = source === "live";
	return (
		<span
			data-testid="source-badge"
			data-source={source}
			title={live ? t("sourceLiveTitle") : t("sourceDemoTitle")}
			className={
				live
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
			}
		>
			<span
				aria-hidden="true"
				className={
					live
						? "size-1.5 rounded-full bg-primary"
						: "size-1.5 rounded-full bg-muted-foreground"
				}
			/>
			{live ? t("sourceLive") : t("sourceDemo")}
		</span>
	);
}

function Condition({ ok, label }: { ok: boolean; label: string }) {
	return (
		<li
			data-testid="stop-condition"
			data-ok={ok ? "true" : "false"}
			className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
				ok
					? "border-primary/40 bg-primary/10 text-primary"
					: "border-destructive/40 bg-destructive/10 text-destructive"
			}`}
		>
			<span aria-hidden>{ok ? "✓" : "✗"}</span>
			{label}
		</li>
	);
}

export function GoalPilotingPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("goalPiloting");
	const [propose, proposeAction] = useActionState(
		proposeGoalAction,
		proposeInitial,
	);
	const [close, closeActionFn] = useActionState(checkCloseAction, closeInitial);

	return (
		<div className="space-y-8">
			{/* Active-project badge — the scope (S57 cookie, never a field) */}
			<div className="flex flex-wrap items-center gap-3 text-xs">
				<span
					data-testid="active-project"
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 font-medium text-muted-foreground"
				>
					{t("activeProjectLabel")}:{" "}
					<code className="font-mono">{activeProjectId ?? t("noProject")}</code>
				</span>
			</div>

			{/* The propose box — open a goal (DRAFT ChangeSet proposal + live red set) */}
			<form
				action={proposeAction}
				data-testid="propose-form"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("proposeHeading")}
					</h2>
					{propose.ok || propose.messageKey === "openRefused" ? (
						<SourceBadge source={propose.source} />
					) : null}
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("actorIdentityLabel")}
						</span>
						<input
							name="actorIdentity"
							data-testid="actor-identity"
							placeholder={t("actorIdentityPlaceholder")}
							defaultValue="u-amelie"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("actorDisplayLabel")}
						</span>
						<input
							name="actorDisplay"
							data-testid="actor-display"
							placeholder={t("actorDisplayPlaceholder")}
							defaultValue="Amélie Roy"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("ideaIdLabel")}
						</span>
						<input
							name="ideaId"
							data-testid="idea-id"
							required
							placeholder={t("ideaIdPlaceholder")}
							defaultValue="idea-order-discount"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("specTargetLabel")}
						</span>
						<input
							name="specTarget"
							data-testid="spec-target"
							placeholder="Order.discount"
							defaultValue="Order.discount"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("redSetLabel")}
					</span>
					<textarea
						name="redSet"
						data-testid="propose-red-set"
						rows={3}
						placeholder={t("redSetPlaceholder")}
						defaultValue="Order.discount.fixture"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<span className="text-xs text-muted-foreground">
						{t("redSetHint")}
					</span>
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="hasMirror"
						data-testid="has-mirror"
						defaultChecked
						className="h-4 w-4 rounded border-border accent-[var(--primary)]"
					/>
					{t("hasMirrorLabel")}
				</label>
				<div className="flex items-center gap-3">
					<Submit label={t("proposeButton")} testid="propose-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>
				{propose.messageKey && (
					<div
						data-testid="propose-result"
						className={`space-y-2 text-sm ${
							propose.ok ? "text-primary" : "text-destructive"
						}`}
					>
						<p>{t(`messages.${propose.messageKey}`)}</p>
						{propose.ok && (
							<div
								data-testid="proposal"
								className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-foreground"
							>
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<span
										data-testid="draft-badge"
										className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold text-primary"
									>
										{t("draftBadge")}: {propose.changeSetStatus}
									</span>
									<code className="font-mono text-xs text-muted-foreground">
										{propose.changeSetRef}
									</code>
								</div>
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										{t("liveRedSetLabel")} ({propose.redSet?.length ?? 0})
									</p>
									<ul data-testid="live-red-set" className="mt-1 space-y-1">
										{(propose.redSet ?? []).map((m) => (
											<li
												key={m}
												data-testid="red-mirror"
												className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive"
											>
												<span aria-hidden>●</span>
												{m}
											</li>
										))}
									</ul>
								</div>
							</div>
						)}
						{!propose.ok && propose.block && (
							<div
								data-testid="propose-block"
								data-code={propose.block.code}
								className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
							>
								<code className="font-mono text-xs font-semibold">
									{propose.block.code}
								</code>
								<p className="text-xs">{propose.block.explanation}</p>
								<ul className="list-inside list-disc text-xs">
									{propose.block.howToFix.map((fix) => (
										<li key={fix}>{fix}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</form>

			{/* The Stop box — the live non-gameable close gate */}
			<form
				action={closeActionFn}
				data-testid="close-form"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("closeHeading")}
					</h2>
					{close.ok ? <SourceBadge source={close.source} /> : null}
				</div>
				<input
					type="hidden"
					name="redSet"
					value="Order.discount.fixture"
					readOnly
				/>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="redGreen"
							data-testid="cond-red-green"
							className="h-4 w-4 rounded border-border accent-[var(--primary)]"
						/>
						{t("condRedSetGreen")}
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="priorIntact"
							data-testid="cond-prior-intact"
							defaultChecked
							className="h-4 w-4 rounded border-border accent-[var(--primary)]"
						/>
						{t("condPriorGreen")}
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<span className="text-xs font-medium text-muted-foreground">
							{t("mutationLabel")}
						</span>
						<input
							type="number"
							name="mutation"
							data-testid="cond-mutation"
							step="0.05"
							min="0"
							max="1"
							defaultValue="0.9"
							className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<span className="text-xs text-muted-foreground">
							{t("mutationFloorLabel")}
						</span>
						<input
							type="number"
							name="mutationFloor"
							data-testid="cond-mutation-floor"
							step="0.05"
							min="0"
							max="1"
							defaultValue="0.8"
							className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="hasMonster"
							data-testid="cond-monster"
							className="h-4 w-4 rounded border-border accent-[var(--primary)]"
						/>
						{t("condMonster")}
					</label>
				</div>
				<div className="flex items-center gap-3">
					<Submit label={t("checkCloseButton")} testid="close-submit" />
					<span className="text-xs text-muted-foreground">
						{t("nonGameableNote")}
					</span>
				</div>
				{close.ok && (
					<div data-testid="close-result" className="space-y-3">
						<p
							data-testid="close-verdict"
							data-closeable={close.closeable ? "true" : "false"}
							className={`text-sm font-semibold ${
								close.closeable ? "text-primary" : "text-destructive"
							}`}
						>
							{close.closeable ? t("closeAccepted") : t("closeRefused")}
						</p>
						{close.conditions && (
							<ul className="grid gap-2 sm:grid-cols-2">
								<Condition
									ok={close.conditions.redSetGreen}
									label={t("condRedSetGreen")}
								/>
								<Condition
									ok={close.conditions.priorGreenIntact}
									label={t("condPriorGreen")}
								/>
								<Condition
									ok={close.conditions.mutationOk}
									label={t("condMutationOk")}
								/>
								<Condition
									ok={close.conditions.noMonster}
									label={t("condNoMonster")}
								/>
							</ul>
						)}
						{!close.closeable && close.block && (
							<div
								data-testid="close-block"
								data-code={close.block.code}
								className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
							>
								<code className="font-mono text-xs font-semibold">
									{close.block.code}
								</code>
								<p className="text-xs text-destructive">
									{close.block.explanation}
								</p>
							</div>
						)}
					</div>
				)}
			</form>
		</div>
	);
}
