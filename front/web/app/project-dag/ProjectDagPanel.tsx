"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	archiveAction,
	branchAction,
	type DagView,
	duplicateAction,
	mergeGuardAction,
	restoreAction,
} from "./actions";

/**
 * ProjectDagPanel — the action-capable client surface of /project-dag (S56). It lets the
 * user EXECUTE the per-project version space: cut a phase inside a project's frontier
 * (branch), guard a merge against another project (CROSS_PROJECT_MERGE), fork an isolated
 * root (duplicate-from-template), and archive/restore a project's DAG (mask without
 * destroying). No truth is written — recording a node rides the S24 dag MCP (CLAUDE.md §2).
 * Themed (ADR 0010) + bilingual (ADR 0011).
 */

interface RefusalShape {
	blockCode?: string;
	explanation?: string;
	howToFix?: string[];
}

function Refusal({
	code,
	explanation,
	howToFix,
}: {
	code?: string;
	explanation?: string;
	howToFix?: string[];
}) {
	if (!code) return null;
	return (
		<div
			data-testid="refusal"
			className="mt-4 rounded-md bg-destructive/10 p-4 text-sm text-destructive"
		>
			<p className="font-mono text-xs font-semibold" data-testid="refusal-code">
				{code}
			</p>
			<p className="mt-2 text-foreground">{explanation}</p>
			{howToFix && (
				<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
					{howToFix.map((h) => (
						<li key={h}>{h}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function Heads({ view }: { view: DagView }) {
	return (
		<div
			className="mt-4 rounded-md bg-muted/40 p-3 text-sm"
			data-testid="dag-view"
		>
			<p className="text-xs uppercase tracking-wide text-muted-foreground">
				project/{view.projectId}/
			</p>
			<p className="mt-1 text-foreground" data-testid="heads-count">
				heads: {view.heads.length} · kept: {view.keptCount}
				{view.masked ? " · masked" : ""}
			</p>
			<ul className="mt-1 list-disc pl-5 font-mono text-xs text-muted-foreground">
				{view.heads.map((h) => (
					<li key={h.id}>{h.label || h.id}</li>
				))}
			</ul>
		</div>
	);
}

export function ProjectDagPanel({
	codes,
}: {
	codes: { merge: string; node: string };
}) {
	const t = useTranslations("projectDag");
	const [pending, setPending] = useState<string | null>(null);

	// branch
	const [branchProject, setBranchProject] = useState("proj-a");
	const [branchFrom, setBranchFrom] = useState("");
	const [branchLabel, setBranchLabel] = useState("feature-x");
	const [branchView, setBranchView] = useState<DagView | null>(null);

	// merge guard
	const [mergeLeft, setMergeLeft] = useState("proj-a");
	const [mergeRight, setMergeRight] = useState("proj-b");
	const [mergeResult, setMergeResult] = useState<
		({ allowed: boolean } & RefusalShape) | null
	>(null);

	// duplicate
	const [dupProject, setDupProject] = useState("my-new-shop");
	const [dupResult, setDupResult] = useState<{
		fork: DagView;
		isolated: boolean;
	} | null>(null);

	// archive / restore
	const [archProject, setArchProject] = useState("proj-a");
	const [archView, setArchView] = useState<DagView | null>(null);

	async function run(key: string, fn: () => Promise<void>) {
		setPending(key);
		try {
			await fn();
		} finally {
			setPending(null);
		}
	}

	const genesisId = (p: string) => `${p}-genesis`;

	return (
		<div className="space-y-10">
			{/* legend */}
			<section
				aria-labelledby="codes-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="codes-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("codesHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("codesIntro")}</p>
				<dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
					<div>
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("codeMergeLabel")}
						</dt>
						<dd
							className="mt-0.5 break-all font-mono text-sm text-foreground"
							data-testid="code-merge"
						>
							{codes.merge}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("codeNodeLabel")}
						</dt>
						<dd
							className="mt-0.5 break-all font-mono text-sm text-foreground"
							data-testid="code-node"
						>
							{codes.node}
						</dd>
					</div>
				</dl>
			</section>

			{/* branch — in-frontier phase cut */}
			<section aria-labelledby="branch-heading" className="space-y-4">
				<div>
					<h2
						id="branch-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("branchHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("branchIntro")}
					</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Field
							id="branch-project"
							label={t("fieldProject")}
							value={branchProject}
							onChange={setBranchProject}
						/>
						<Field
							id="branch-from"
							label={t("fieldFrom")}
							value={branchFrom}
							onChange={setBranchFrom}
						/>
						<Field
							id="branch-label"
							label={t("fieldLabel")}
							value={branchLabel}
							onChange={setBranchLabel}
						/>
					</div>
					<button
						type="button"
						data-testid="branch-button"
						disabled={pending !== null}
						onClick={() =>
							run("branch", async () => {
								setBranchView(
									await branchAction(
										branchProject,
										genesisId(branchProject),
										branchFrom,
										branchLabel,
									),
								);
							})
						}
						className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
					>
						{pending === "branch" ? t("running") : t("branchButton")}
					</button>
					{branchView && (
						<>
							<Heads view={branchView} />
							<Refusal
								code={branchView.blockCode}
								explanation={branchView.explanation}
								howToFix={branchView.howToFix}
							/>
						</>
					)}
				</div>
			</section>

			{/* merge guard — cross-project refusal */}
			<section aria-labelledby="merge-heading" className="space-y-4">
				<div>
					<h2
						id="merge-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("mergeHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("mergeIntro")}
					</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field
							id="merge-left"
							label={t("fieldMergeLeft")}
							value={mergeLeft}
							onChange={setMergeLeft}
						/>
						<Field
							id="merge-right"
							label={t("fieldMergeRight")}
							value={mergeRight}
							onChange={setMergeRight}
						/>
					</div>
					<button
						type="button"
						data-testid="merge-button"
						disabled={pending !== null}
						onClick={() =>
							run("merge", async () => {
								setMergeResult(await mergeGuardAction(mergeLeft, mergeRight));
							})
						}
						className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
					>
						{pending === "merge" ? t("running") : t("mergeButton")}
					</button>
					{mergeResult &&
						(mergeResult.allowed ? (
							<p
								data-testid="merge-allow"
								className="mt-4 rounded-md bg-primary/10 p-3 text-sm text-foreground"
							>
								{t("mergeAllowed")}
							</p>
						) : (
							<Refusal
								code={mergeResult.blockCode}
								explanation={mergeResult.explanation}
								howToFix={mergeResult.howToFix}
							/>
						))}
				</div>
			</section>

			{/* duplicate — isolated fork */}
			<section aria-labelledby="dup-heading" className="space-y-4">
				<div>
					<h2
						id="dup-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("dupHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("dupIntro")}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-6">
					<Field
						id="dup-project"
						label={t("fieldNewProject")}
						value={dupProject}
						onChange={setDupProject}
					/>
					<button
						type="button"
						data-testid="dup-button"
						disabled={pending !== null}
						onClick={() =>
							run("dup", async () => {
								setDupResult(await duplicateAction(dupProject));
							})
						}
						className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
					>
						{pending === "dup" ? t("running") : t("dupButton")}
					</button>
					{dupResult && (
						<div className="mt-4">
							<p
								data-testid="dup-isolated"
								className="rounded-md bg-primary/10 p-3 text-sm text-foreground"
							>
								{dupResult.isolated ? t("dupIsolated") : t("dupNotIsolated")}
							</p>
							<Heads view={dupResult.fork} />
						</div>
					)}
				</div>
			</section>

			{/* archive / restore — mask without destroying */}
			<section aria-labelledby="arch-heading" className="space-y-4">
				<div>
					<h2
						id="arch-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("archHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("archIntro")}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-6">
					<Field
						id="arch-project"
						label={t("fieldProject")}
						value={archProject}
						onChange={setArchProject}
					/>
					<div className="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							data-testid="archive-button"
							disabled={pending !== null}
							onClick={() =>
								run("archive", async () => {
									setArchView(
										await archiveAction(archProject, genesisId(archProject)),
									);
								})
							}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{pending === "archive" ? t("running") : t("archiveButton")}
						</button>
						<button
							type="button"
							data-testid="restore-button"
							disabled={pending !== null}
							onClick={() =>
								run("restore", async () => {
									setArchView(
										await restoreAction(archProject, genesisId(archProject)),
									);
								})
							}
							className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
						>
							{pending === "restore" ? t("running") : t("restoreButton")}
						</button>
					</div>
					{archView && <Heads view={archView} />}
				</div>
			</section>
		</div>
	);
}

function Field({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="text-xs uppercase tracking-wide text-muted-foreground"
			>
				{label}
			</label>
			<input
				id={id}
				data-testid={`field-${id}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
			/>
		</div>
	);
}
