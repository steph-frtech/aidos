"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type DeriveResultView,
	deriveShapeAction,
	type MergeResultView,
	mergeEditsAction,
	type ProposeResultView,
	proposeMirrorAction,
} from "./actions";

/**
 * ShapeEditorPanel makes the /shape-editor route action-capable (ui-completeness law, CLAUDE.md §7):
 * the S68 three-shape mirror editor has THREE controls bound to the REAL engine, reachable AND
 * executable from the screen:
 *
 *   - Derive box   — pick a truth-nature → the DERIVED form (the closed table, never a guess).
 *   - Author box   — pick a nature + reflected layer + type a source → a red, project-scoped mirror
 *                    proposed as a DRAFT ChangeSet. An unparseable source is refused with a message.
 *   - Concurrency  — two authors edit the same draft field → MERGE or LOCK (never last-write-wins).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every control runs the PURE twin lib/shape-editor (deriveShape
 * + the parsers + mergeEdits), never an LLM. THE WALL (§2): authoring WRITES NOTHING — the proposal is
 * a DRAFT ChangeSet for human approval; the screen PROPOSES, never writes the mirrors schema. Themed on
 * the ADR 0010 tokens; strings via next-intl (0011).
 */

const deriveInitial: DeriveResultView = { ok: false, messageKey: "" };
const proposeInitial: ProposeResultView = { ok: false, messageKey: "" };
const mergeInitial: MergeResultView = { ok: false, messageKey: "" };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("shapeEditor");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function ShapeEditorPanel({
	activeProjectId,
	natures,
}: {
	activeProjectId: string | null;
	natures: string[];
}) {
	const t = useTranslations("shapeEditor");
	const [derive, deriveAction] = useActionState(
		deriveShapeAction,
		deriveInitial,
	);
	const [propose, proposeAction] = useActionState(
		proposeMirrorAction,
		proposeInitial,
	);
	const [merge, mergeAction] = useActionState(mergeEditsAction, mergeInitial);

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

			{/* Derive control. */}
			<form
				action={deriveAction}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("deriveHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("natureLabel")}
					</span>
					<select
						name="nature"
						data-testid="derive-nature"
						defaultValue={natures[0] ?? ""}
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{natures.map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("deriveButton")} testId="derive-submit" />
					<span className="text-xs text-muted-foreground">
						{t("deriveNote")}
					</span>
				</div>
				{derive.messageKey !== "" && (
					<div
						data-testid="derive-result"
						data-ok={derive.ok ? "true" : "false"}
						className="text-sm"
					>
						{derive.ok ? (
							<p className="text-primary">
								{t("derivedShapeLabel")}:{" "}
								<span
									data-testid="derived-shape"
									className="font-mono font-semibold"
								>
									{derive.shape}
								</span>{" "}
								<span className="text-muted-foreground">
									({derive.testKind} · {derive.certLanguage})
								</span>
							</p>
						) : (
							<p className="text-destructive">
								{t(`messages.${derive.messageKey}`)}
							</p>
						)}
					</div>
				)}
			</form>

			{/* Author control (action-capable). */}
			<form
				action={proposeAction}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("authorHeading")}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("natureLabel")}
						</span>
						<select
							name="nature"
							data-testid="author-nature"
							defaultValue="workflow"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{natures.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("reflectsLabel")}
						</span>
						<input
							name="reflects"
							data-testid="reflects"
							defaultValue="Order.discount"
							placeholder={t("reflectsPlaceholder")}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("sourceLabel")}
					</span>
					<textarea
						name="source"
						data-testid="source"
						rows={5}
						defaultValue={
							"fixture: discount applied\nstate: cart with item\ncommand: apply discount\nevent: discount applied"
						}
						className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("authorButton")} testId="propose-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{propose.messageKey !== "" && (
					<section
						data-testid="propose-result"
						data-ok={propose.ok ? "true" : "false"}
						className={`space-y-3 rounded-xl border p-4 ${
							propose.ok
								? "border-primary/40 bg-primary/5"
								: "border-destructive/40 bg-destructive/5"
						}`}
					>
						<p
							className={`text-sm font-medium ${propose.ok ? "text-primary" : "text-destructive"}`}
						>
							{t(`messages.${propose.messageKey}`)}
						</p>
						{!propose.ok && propose.error && (
							<p
								data-testid="propose-error"
								className="font-mono text-xs text-destructive"
							>
								{propose.error}
							</p>
						)}
						{propose.ok && (
							<div className="space-y-2 text-xs">
								<div className="flex flex-wrap items-center gap-2">
									<span
										data-testid="draft-badge"
										className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground"
									>
										{t("draftBadge")} {propose.changeSetStatus}
									</span>
									<span
										data-testid="red-badge"
										className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 font-medium text-destructive-foreground"
									>
										{t("redBadge")}
									</span>
									<span className="text-muted-foreground">
										{propose.testKind} · {propose.certLanguage}
									</span>
								</div>
								<div className="space-y-1">
									<p className="font-medium text-muted-foreground">
										{t("mirrorIdLabel")}
									</p>
									<p
										data-testid="mirror-id"
										className="break-all rounded-md bg-muted px-2 py-1 font-mono text-foreground"
									>
										{propose.mirrorId}
									</p>
								</div>
							</div>
						)}
					</section>
				)}
			</form>

			{/* Concurrency control (draft-level, never last-write-wins). */}
			<form
				action={mergeAction}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("concurrencyHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("concurrencyBody")}</p>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("authorATitle")}
						</span>
						<input
							name="titleA"
							data-testid="title-a"
							defaultValue="Alice title"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("authorBTitle")}
						</span>
						<input
							name="titleB"
							data-testid="title-b"
							defaultValue="Bob title"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<Submit label={t("mergeButton")} testId="merge-submit" />
				{merge.messageKey !== "" && (
					<section
						data-testid="merge-result"
						data-locked={merge.locked ? "true" : "false"}
						className={`space-y-2 rounded-xl border p-4 ${
							merge.locked
								? "border-amber-500/40 bg-amber-500/5"
								: "border-primary/40 bg-primary/5"
						}`}
					>
						<p
							className={`text-sm font-medium ${merge.locked ? "text-amber-600" : "text-primary"}`}
						>
							{t(`messages.${merge.messageKey}`)}
						</p>
						{merge.locked && (
							<div
								className="space-y-1 text-xs text-muted-foreground"
								data-testid="conflict"
							>
								<p>
									<span className="font-mono">{merge.conflictField}</span>: «{" "}
									{merge.valueA} » vs « {merge.valueB} »
								</p>
							</div>
						)}
						{!merge.locked && (
							<p className="text-xs text-muted-foreground">
								{t("mergedVersionLabel")}:{" "}
								<span data-testid="merged-version" className="font-mono">
									{merge.mergedVersion}
								</span>
							</p>
						)}
					</section>
				)}
			</form>
		</div>
	);
}
