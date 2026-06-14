"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { PROPOSES_KINDS } from "@/lib/capture-idea";
import {
	type CaptureResult,
	captureIdeaAction,
	type InboxSnapshot,
} from "./actions";

/**
 * CaptureIdeaPanel makes the /capture-idea route action-capable (ui-completeness law,
 * CLAUDE.md §7): the human's free-text intention has a control bound to a REAL
 * capture, reachable AND executable from the screen.
 *
 *   - Capture box — a free-text intention + the kind it would become + (optionally)
 *     who is asking → a content-addressed draft `ideas` row, HUMAN provenance, SCOPED
 *     to the ACTIVE project (the S57 cookie pins it; never a field).
 *   - Per-project inbox — the live list of the active project's ideas (the inbox that
 *     replaces the global /ideas fixture). Each card carries the explicit "no mirror
 *     yet" marker + the provenance.
 *
 * THE WALL (CLAUDE.md §2): the capture writes the `ideas` schema BELOW the wall's
 * write-fence (a candidate-truth — no version, no mirror). Promotion to a kernel
 * truth is /goal (S65/S66), never a write from this screen. Themed on the ADR 0010
 * tokens; strings via next-intl (ADR 0011).
 */

const initial: CaptureResult = { ok: false, messageKey: "" };

function Submit({ label }: { label: string }) {
	const t = useTranslations("captureIdea");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="capture-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function CaptureIdeaPanel({ snapshot }: { snapshot: InboxSnapshot }) {
	const t = useTranslations("captureIdea");
	const [result, action] = useActionState(captureIdeaAction, initial);
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

			{/* The capture box — the action-capable control */}
			<form
				action={action}
				data-testid="capture-form"
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
						data-testid="capture-intent"
						required
						rows={3}
						placeholder={t("intentPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("proposesLabel")}
						</span>
						<select
							name="proposes"
							data-testid="capture-proposes"
							defaultValue="operation"
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
							{t("whoLabel")}
						</span>
						<input
							name="who"
							data-testid="capture-who"
							placeholder={t("whoPlaceholder")}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<div className="flex items-center gap-3">
					<Submit label={t("captureButton")} />
					<span className="text-xs text-muted-foreground">
						{t("provenanceNote")}
					</span>
				</div>
				{result.messageKey && (
					<p
						data-testid="capture-result"
						className={`text-sm ${
							result.ok ? "text-primary" : "text-destructive"
						}`}
					>
						{t(`messages.${result.messageKey}`)}
						{result.ok && result.id && (
							<>
								{" "}
								<code className="font-mono text-xs">
									{result.id.slice(0, 12)}…
								</code>
							</>
						)}
					</p>
				)}
			</form>

			{/* The per-project inbox — the live list that replaces the global fixture */}
			<section
				data-testid="inbox"
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
								data-testid="inbox-card"
								data-idea-id={idea.id}
								className="space-y-2 rounded-xl border border-border bg-card p-4"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
										{t(`statusName.${idea.status}`)}
									</span>
									<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{t(`proposesKind.${idea.proposes}`)}
									</span>
									<span
										data-testid="no-mirror-marker"
										className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
									>
										{t("noMirrorMarker")}
									</span>
								</div>
								<p className="text-sm leading-relaxed text-foreground">
									{idea.intent}
								</p>
								<p
									data-testid="inbox-provenance"
									className="text-xs text-muted-foreground"
								>
									{t("provenanceLabel")}:{" "}
									{t(`sourceName.${idea.provenance.source}`)} —{" "}
									{idea.provenance.detail}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
