"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type AttachResultView, attachBehaviorAction } from "./actions";

/**
 * BehaviorCapturePanel makes the /behavior-capture route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S67 attach-at-capture has a control bound to the REAL engine, reachable AND
 * executable from the screen.
 *
 *   - Attach box — the captured idea ref + the target entity + a behavior picked from the surfaced
 *     library → the dry-run expansion (byte-identical to S76) + a DRAFT ChangeSet PROPOSAL. A
 *     no-idea / unknown-behavior / entity-less attach is refused with a traced message.
 *
 * ADR 0092 CUTOVER (the Go engine is the SINGLE live source). The control now runs the dispatched Go
 * `behavior_attach_at_capture` dry-run through the passerelle (the surfaced library reads the Go
 * `behavior_library` tool); the pure TS twin (lib/behavior-capture) survives ONLY as the deterministic
 * demo fallback (`source:"live"|"demo"`). The expansion on screen is what S76 computes — no LLM, no
 * second implementation (the expansionId matches the Go content address).
 *
 * THE WALL (§2): the attach WRITES NOTHING — it is a DRY-RUN returning a DRAFT ChangeSet PROPOSAL for
 * human approval; the screen PROPOSES, never writes the Kernel. Themed on the ADR 0010 tokens; strings
 * via next-intl (0011).
 */

const initial: AttachResultView = { ok: false, messageKey: "" };

function Submit({ label }: { label: string }) {
	const t = useTranslations("behaviorCapture");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="attach-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

function PieceGroup({ label, names }: { label: string; names: string[] }) {
	if (names.length === 0) return null;
	return (
		<div className="space-y-1" data-testid="piece-group">
			<p className="text-xs font-semibold tracking-tight text-foreground">
				{label}
			</p>
			<ul className="flex flex-wrap gap-1.5">
				{names.map((n) => (
					<li
						key={n}
						data-testid="piece"
						className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
					>
						{n}
					</li>
				))}
			</ul>
		</div>
	);
}

export function BehaviorCapturePanel({
	activeProjectId,
	libraryKinds,
}: {
	activeProjectId: string | null;
	libraryKinds: string[];
}) {
	const t = useTranslations("behaviorCapture");
	const [state, action] = useActionState(attachBehaviorAction, initial);

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* Surfaced library (the S76 catalogue). */}
			<section
				data-testid="library"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("libraryHeading")}
				</h2>
				<ul className="flex flex-wrap gap-2">
					{libraryKinds.map((k) => (
						<li
							key={k}
							data-testid="library-behavior"
							className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
						>
							{k}
						</li>
					))}
				</ul>
			</section>

			{/* Attach control (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("attachHeading")}
				</h2>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("ideaRefLabel")}
						</span>
						<input
							name="ideaRef"
							data-testid="idea-ref"
							placeholder={t("ideaRefPlaceholder")}
							defaultValue="idea-capture-001"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("entityLabel")}
						</span>
						<input
							name="entity"
							data-testid="entity"
							placeholder={t("entityPlaceholder")}
							defaultValue="Order"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>

				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("behaviorLabel")}
					</span>
					<select
						name="behavior"
						data-testid="behavior-select"
						defaultValue={libraryKinds[0] ?? ""}
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{libraryKinds.map((k) => (
							<option key={k} value={k}>
								{k}
							</option>
						))}
					</select>
				</label>

				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("attachButton")} />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>
			</form>

			{/* Outcome. */}
			{state.messageKey !== "" && (
				<section
					data-testid="attach-result"
					data-ok={state.ok ? "true" : "false"}
					className={`space-y-4 rounded-xl border p-5 ${
						state.ok
							? "border-primary/40 bg-primary/5"
							: "border-destructive/40 bg-destructive/5"
					}`}
				>
					<p
						className={`text-sm font-medium ${state.ok ? "text-primary" : "text-destructive"}`}
					>
						{t(`messages.${state.messageKey}`)}
					</p>
					{!state.ok && state.error && (
						<p
							data-testid="attach-error"
							className="font-mono text-xs text-destructive"
						>
							{state.error}
						</p>
					)}

					{state.ok && state.expansionId && (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<span
									data-testid="draft-badge"
									className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground"
								>
									{t("draftBadge")} {state.changeSetStatus}
								</span>
								<span className="text-muted-foreground">
									{t("pieceCountLabel")}:{" "}
									<span
										data-testid="piece-count"
										className="font-mono text-foreground"
									>
										{state.pieceCount}
									</span>
								</span>
								{state.source && (
									<span
										data-testid="attach-source"
										className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-muted-foreground"
									>
										{state.source}
									</span>
								)}
							</div>

							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">
									{t("expansionIdLabel")}
								</p>
								<p
									data-testid="expansion-id"
									className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground"
								>
									{state.expansionId}
								</p>
							</div>

							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{t("previewHeading")}
							</h3>
							<div className="grid gap-3 sm:grid-cols-2">
								<PieceGroup
									label={t("attributesLabel")}
									names={state.attributes ?? []}
								/>
								<PieceGroup
									label={t("relationsLabel")}
									names={state.relations ?? []}
								/>
								<PieceGroup
									label={t("operationsLabel")}
									names={state.operations ?? []}
								/>
								<PieceGroup
									label={t("policiesLabel")}
									names={state.policies ?? []}
								/>
								<PieceGroup
									label={t("fixturesLabel")}
									names={state.fixtures ?? []}
								/>
							</div>
						</div>
					)}
				</section>
			)}
		</div>
	);
}
