"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { PROPOSES_KINDS } from "@/lib/capture-idea";
import { verdicts } from "@/lib/exploration";
import {
	type InboxSnapshot,
	type RouteResult,
	routeIntentionAction,
} from "./actions";

/**
 * GrillingLoopPanel makes the /grilling-loop route action-capable (ui-completeness law,
 * CLAUDE.md §7): the in-product grilling loop has a control bound to the REAL verdict
 * routing, reachable AND executable from the screen.
 *
 *   - Grilling box — an intention (prose intent + ≤ 5 scenarios) + the kind it would
 *     become + the NAMED verdict (sharp | fuzzy | bad) (+ a traced reason for bad) →
 *     a content-addressed, deterministically-routed `ideas` row, HUMAN provenance,
 *     SCOPED to the ACTIVE project (the S57 cookie pins it; never a field).
 *   - Routed-ideas inbox — the live trace of grilling decisions for the active project
 *     (grilled | spiking | rejected lanes), each card carrying its verdict lane.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict picker offers EXACTLY the closed
 * three-value set (verdicts(), the S28 twin); the routing is the authority, performed by
 * the pure twin. THE WALL (§2): the routing writes the `ideas` schema BELOW the wall's
 * write-fence (a candidate-truth — no version, no mirror). Promotion is /goal (S66), never
 * a write here. Themed on the ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

const initial: RouteResult = { ok: false, messageKey: "" };

function Submit({ label }: { label: string }) {
	const t = useTranslations("grillingLoop");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="grill-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

const LANE_CLASS: Record<string, string> = {
	grilled: "border-primary/40 bg-primary/10 text-primary",
	spiking:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function GrillingLoopPanel({ snapshot }: { snapshot: InboxSnapshot }) {
	const t = useTranslations("grillingLoop");
	const [result, action] = useActionState(routeIntentionAction, initial);
	const isLive = snapshot.source === "live";

	return (
		<div className="space-y-8">
			{/* Source + active-project badge */}
			<div className="flex flex-wrap items-center gap-3 text-xs">
				<span
					data-testid="source-badge"
					className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${
						isLive
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground"
					}`}
				>
					{isLive ? t("sourceLive") : t("sourceDemo")}
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 font-medium text-muted-foreground"
				>
					{t("activeProjectLabel")}:{" "}
					<code className="font-mono">
						{snapshot.activeProjectId ?? t("noProject")}
					</code>
				</span>
			</div>

			{/* The grilling box — the action-capable control */}
			<form
				action={action}
				data-testid="grill-form"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("formHeading")}
				</h2>
				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("intentLabel")}
					</span>
					<textarea
						name="intent"
						data-testid="grill-intent"
						required
						rows={2}
						placeholder={t("intentPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("scenariosLabel")}
					</span>
					<textarea
						name="scenarios"
						data-testid="grill-scenarios"
						rows={5}
						placeholder={t("scenariosPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<span className="text-xs text-muted-foreground">
						{t("scenariosHint")}
					</span>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("proposesLabel")}
						</span>
						<select
							name="proposes"
							data-testid="grill-proposes"
							defaultValue="policy"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{PROPOSES_KINDS.map((k) => (
								<option key={k} value={k}>
									{t(`proposesKind.${k}`)}
								</option>
							))}
						</select>
					</label>
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("verdictLabel")}
						</span>
						<select
							name="verdict"
							data-testid="grill-verdict"
							defaultValue="sharp"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{verdicts().map((v) => (
								<option key={v} value={v}>
									{t(`verdictName.${v}`)}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("whoLabel")}
						</span>
						<input
							name="who"
							data-testid="grill-who"
							placeholder={t("whoPlaceholder")}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("reasonLabel")}
						</span>
						<input
							name="reason"
							data-testid="grill-reason"
							placeholder={t("reasonPlaceholder")}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<div className="flex items-center gap-3">
					<Submit label={t("grillButton")} />
					<span className="text-xs text-muted-foreground">
						{t("provenanceNote")}
					</span>
				</div>
				{result.messageKey && (
					<p
						data-testid="grill-result"
						className={`text-sm ${
							result.ok ? "text-primary" : "text-destructive"
						}`}
					>
						{t(`messages.${result.messageKey}`)}
						{result.ok && result.verdict && result.status && (
							<>
								{" "}
								<code data-testid="routed-lane" className="font-mono text-xs">
									{result.verdict} → {result.status}
								</code>
								{result.id && (
									<>
										{" · "}
										<code className="font-mono text-xs">
											{result.id.slice(0, 12)}…
										</code>
									</>
								)}
							</>
						)}
					</p>
				)}
			</form>

			{/* The routed-ideas inbox — the live trace of grilling decisions */}
			<section
				data-testid="routed-inbox"
				aria-label={t("inboxHeading")}
				className="space-y-3"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("inboxHeading")} ({snapshot.rows.length})
				</h2>
				{snapshot.rows.length === 0 ? (
					<p
						data-testid="inbox-empty"
						className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground"
					>
						{t("inboxEmpty")}
					</p>
				) : (
					<ul className="space-y-3">
						{snapshot.rows.map((idea) => (
							<li
								key={idea.id}
								data-testid="routed-card"
								data-idea-id={idea.id}
								data-status={idea.status}
								className="space-y-2 rounded-xl border border-border bg-card p-4"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span
										data-testid="lane-badge"
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
											LANE_CLASS[idea.status] ??
											"border-border bg-muted text-muted-foreground"
										}`}
									>
										{t(`statusName.${idea.status}`)}
									</span>
									<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{t(`proposesKind.${idea.proposes}`)}
									</span>
									<span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
										{t("noMirrorMarker")}
									</span>
								</div>
								<p className="text-sm leading-relaxed text-foreground">
									{idea.intent}
								</p>
								{idea.rejectReason && (
									<p
										data-testid="reject-reason"
										className="text-xs text-destructive"
									>
										{t("rejectReasonLabel")}: {idea.rejectReason}
									</p>
								)}
								<p className="text-xs text-muted-foreground">
									{t("provenanceLabel")}: {t(`sourceName.${idea.source}`)} —{" "}
									{idea.detail}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
