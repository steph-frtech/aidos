"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type ActionResult,
	archiveProjectAction,
	createProjectAction,
	deleteProjectAction,
	duplicateProjectAction,
	type ProjectSnapshot,
	restoreProjectAction,
} from "./actions";

/**
 * ProjectsPanel makes the /projects route action-capable (ui-completeness law,
 * CLAUDE.md §7): every project op the step develops has a control bound to it,
 * reachable AND executable from the screen.
 *
 *   - Create  — slug + name + owner → content-addressed project + DAG root.
 *   - Archive / Restore / Delete (soft) — per-project lifecycle controls.
 *
 * Every control calls a Server Action (app/projects/actions.ts) that writes the
 * `projects` schema BELOW the wall (append-only; soft delete only). No truth
 * (kernel/mirrors/fitness) is ever written from the screen (CLAUDE.md §2).
 * Themed on the ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

const initial: ActionResult = { ok: false, messageKey: "" };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("projects");
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

function LifecycleBadge({ lc }: { lc: string }) {
	const t = useTranslations("projects");
	const tone =
		lc === "active"
			? "bg-primary/10 text-primary"
			: lc === "archived"
				? "bg-muted text-muted-foreground"
				: "bg-destructive/10 text-destructive";
	return (
		<span
			data-testid="project-lifecycle"
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
		>
			{t(`lifecycle.${lc}`)}
		</span>
	);
}

export function ProjectsPanel({ snapshot }: { snapshot: ProjectSnapshot }) {
	const t = useTranslations("projects");
	const [createResult, createAction] = useActionState(
		createProjectAction,
		initial,
	);
	const [archiveResult, archiveAction] = useActionState(
		archiveProjectAction,
		initial,
	);
	const [restoreResult, restoreAction] = useActionState(
		restoreProjectAction,
		initial,
	);
	const [deleteResult, deleteAction] = useActionState(
		deleteProjectAction,
		initial,
	);
	const [duplicateResult, duplicateAction] = useActionState(
		duplicateProjectAction,
		initial,
	);

	// S57 blank-vs-template: the create flow starts blank; choosing "template"
	// reveals the source project to fork from (the deterministic duplicate path).
	const [mode, setMode] = useState<"blank" | "template">("blank");
	const [sourceId, setSourceId] = useState<string>(
		snapshot.projects.find((p) => p.lifecycle === "active")?.id ?? "",
	);

	const lastResult =
		[
			createResult,
			archiveResult,
			restoreResult,
			deleteResult,
			duplicateResult,
		].find((r) => r.messageKey) ?? initial;

	return (
		<section className="space-y-8">
			{/* Create flow — blank vs template (S57) */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("createHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("createHint")}</p>
				<fieldset
					className="mt-4 inline-flex rounded-lg border border-border p-0.5 text-xs"
					aria-label={t("modeLabel")}
				>
					<button
						type="button"
						data-testid="project-mode-blank"
						aria-pressed={mode === "blank"}
						onClick={() => setMode("blank")}
						className={
							mode === "blank"
								? "rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
								: "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
						}
					>
						{t("modeBlank")}
					</button>
					<button
						type="button"
						data-testid="project-mode-template"
						aria-pressed={mode === "template"}
						onClick={() => setMode("template")}
						className={
							mode === "template"
								? "rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
								: "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
						}
					>
						{t("modeTemplate")}
					</button>
				</fieldset>
				{mode === "template" ? (
					<div className="mt-4 flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("sourceLabel")}</span>
						<select
							data-testid="project-source"
							value={sourceId}
							onChange={(e) => setSourceId(e.target.value)}
							className="max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{snapshot.projects
								.filter((p) => p.lifecycle === "active")
								.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name} ({p.slug})
									</option>
								))}
						</select>
					</div>
				) : null}
				<form
					action={mode === "template" ? duplicateAction : createAction}
					className="mt-4 grid gap-4 sm:grid-cols-3"
				>
					{mode === "template" ? (
						<input type="hidden" name="sourceId" value={sourceId} />
					) : null}
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("slugLabel")}</span>
						<input
							name="slug"
							data-testid="project-slug"
							placeholder={t("slugPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("nameLabel")}</span>
						<input
							name="name"
							data-testid="project-name"
							placeholder={t("namePlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("ownerLabel")}</span>
						<input
							name="owner"
							data-testid="project-owner"
							placeholder={t("ownerPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<div className="sm:col-span-3">
						<Submit
							label={
								mode === "template" ? t("duplicateSubmit") : t("createSubmit")
							}
							testid="project-create-submit"
						/>
					</div>
				</form>
			</div>

			{/* Result line */}
			{lastResult.messageKey ? (
				<p
					data-testid="project-result"
					className={
						lastResult.ok
							? "text-sm font-medium text-primary"
							: "text-sm font-medium text-destructive"
					}
				>
					{t(`result.${lastResult.messageKey}`, {
						slug: lastResult.slug ?? "",
						id: lastResult.id ?? "",
					})}
				</p>
			) : null}

			{/* Project list */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("listHeading", { count: snapshot.projects.length })}
				</h2>
				<ul className="mt-4 space-y-3" data-testid="project-list">
					{snapshot.projects.map((p) => (
						<li
							key={p.id}
							data-testid="project-row"
							data-slug={p.slug}
							className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium text-foreground">{p.name}</span>
									<LifecycleBadge lc={p.lifecycle} />
								</div>
								<div className="mt-1 text-xs text-muted-foreground">
									<code className="font-mono">{p.slug}</code>
									{" · "}
									{t("ownerLabel")}: {p.ownerRef}
									{" · "}
									<span title={t("rootNodeTitle")}>
										{t("rootNode")}: {p.rootNodeId.slice(0, 16)}…
									</span>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{p.lifecycle === "active" ? (
									<form action={archiveAction}>
										<input type="hidden" name="id" value={p.id} />
										<button
											type="submit"
											data-testid="project-archive"
											className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
										>
											{t("archive")}
										</button>
									</form>
								) : null}
								{p.lifecycle === "archived" ? (
									<form action={restoreAction}>
										<input type="hidden" name="id" value={p.id} />
										<button
											type="submit"
											data-testid="project-restore"
											className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
										>
											{t("restore")}
										</button>
									</form>
								) : null}
								{p.lifecycle !== "deleted" ? (
									<form action={deleteAction}>
										<input type="hidden" name="id" value={p.id} />
										<button
											type="submit"
											data-testid="project-delete"
											className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
										>
											{t("delete")}
										</button>
									</form>
								) : null}
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
