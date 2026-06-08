"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type BlockReason,
	buildPlan,
	type Change,
	type ChangeKind,
	type DataTruthScope,
	isBlock,
	type Plan,
} from "@/lib/datamigrate";

/**
 * DataMigratePanel makes the /data-migrate route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S95 breaking-data-migration planner has a control bound to the REAL pure
 * twin (lib/datamigrate), reachable AND executable from the screen.
 *
 * The single action — PLAN — runs the PURE twin: pick a breaking-change kind (rename / split /
 * cardinality), fill its body, toggle the declared backfill, click « Planifier la migration ».
 * The screen renders the EXPAND → BACKFILL → CONTRACT staged steps (the backfill preserves the
 * real rows), the COMPUTED 'preserves all data' badge, and the honest refusal when no backfill
 * is declared (BREAKING_MIGRATION_NO_BACKFILL).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): planning runs the PURE twin, never an LLM. THE WALL
 * (§2): planning WRITES NO TRUTH — the plan is driver-neutral (emitted SQL + a content
 * address). Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const BACKFILL: DataTruthScope = {
	appliesTo: ["existing_records"],
	migrationRequired: true,
	strategy: "expand_contract",
	preserveOldTruth: true,
};

export function DataMigratePanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("dataMigrate");
	const [kind, setKind] = useState<ChangeKind>("rename");
	const [withBackfill, setWithBackfill] = useState(true);
	const [plan, setPlan] = useState<Plan | null>(null);
	const [block, setBlock] = useState<BlockReason | null>(null);

	// rename fields
	const [entity, setEntity] = useState("order");
	const [from, setFrom] = useState("ref");
	const [to, setTo] = useState("reference");
	// split fields
	const [source, setSource] = useState("order");
	const [newEntity, setNewEntity] = useState("shipment");
	const [column, setColumn] = useState("address");
	// cardinality fields
	const [cSource, setCSource] = useState("order");
	const [cTarget, setCTarget] = useState("label");
	const [relation, setRelation] = useState("tag");

	function onPlan(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const change: Change = {
			project: activeProjectId ?? "shop",
			kind,
			scope: withBackfill ? BACKFILL : undefined,
		};
		if (kind === "rename") change.rename = { entity, from, to, type: "text" };
		else if (kind === "split")
			change.split = { source, newEntity, column, type: "text" };
		else
			change.cardinality = {
				source: cSource,
				target: cTarget,
				relation,
				from: "1-N",
				to: "N-N",
			};

		const r = buildPlan(change);
		if (isBlock(r)) {
			setBlock(r);
			setPlan(null);
		} else {
			setPlan(r);
			setBlock(null);
		}
	}

	const input =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<section className="mt-10 space-y-6">
			<form
				onSubmit={onPlan}
				data-testid="plan-form"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("projectLabel")}
						</span>
						<input
							data-testid="project"
							className={input}
							value={activeProjectId ?? "shop"}
							readOnly
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("kindLabel")}
						</span>
						<select
							data-testid="kind"
							className={input}
							value={kind}
							onChange={(e) => setKind(e.target.value as ChangeKind)}
						>
							<option value="rename">{t("kindRename")}</option>
							<option value="split">{t("kindSplit")}</option>
							<option value="cardinality">{t("kindCardinality")}</option>
						</select>
					</label>
				</div>

				{kind === "rename" && (
					<div
						className="grid gap-4 sm:grid-cols-3"
						data-testid="rename-fields"
					>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("entityLabel")}
							</span>
							<input
								className={input}
								value={entity}
								onChange={(e) => setEntity(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("fromLabel")}
							</span>
							<input
								className={input}
								value={from}
								onChange={(e) => setFrom(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("toLabel")}
							</span>
							<input
								className={input}
								value={to}
								onChange={(e) => setTo(e.target.value)}
							/>
						</label>
					</div>
				)}

				{kind === "split" && (
					<div className="grid gap-4 sm:grid-cols-3" data-testid="split-fields">
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("sourceLabel")}
							</span>
							<input
								className={input}
								value={source}
								onChange={(e) => setSource(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("newEntityLabel")}
							</span>
							<input
								className={input}
								value={newEntity}
								onChange={(e) => setNewEntity(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("columnLabel")}
							</span>
							<input
								className={input}
								value={column}
								onChange={(e) => setColumn(e.target.value)}
							/>
						</label>
					</div>
				)}

				{kind === "cardinality" && (
					<div
						className="grid gap-4 sm:grid-cols-3"
						data-testid="cardinality-fields"
					>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("sourceLabel")}
							</span>
							<input
								className={input}
								value={cSource}
								onChange={(e) => setCSource(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("targetLabel")}
							</span>
							<input
								className={input}
								value={cTarget}
								onChange={(e) => setCTarget(e.target.value)}
							/>
						</label>
						<label className="space-y-1.5 text-sm">
							<span className="font-medium text-foreground">
								{t("relationLabel")}
							</span>
							<input
								className={input}
								value={relation}
								onChange={(e) => setRelation(e.target.value)}
							/>
						</label>
					</div>
				)}

				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						data-testid="backfill-toggle"
						checked={withBackfill}
						onChange={(e) => setWithBackfill(e.target.checked)}
						className="h-4 w-4 rounded border-border"
					/>
					<span>{t("backfillLabel")}</span>
				</label>

				<button
					type="submit"
					data-testid="plan-button"
					className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					{t("buildLabel")}
				</button>
			</form>

			{block && (
				<div
					data-testid="block"
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")}
					</h2>
					<p
						className="font-mono text-xs text-destructive"
						data-testid="block-code"
					>
						{block.code}
					</p>
					<p className="text-sm text-muted-foreground">{block.explanation}</p>
					<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						{block.how_to_fix.map((fix) => (
							<li key={fix}>{fix}</li>
						))}
					</ul>
				</div>
			)}

			{plan && (
				<div
					data-testid="plan"
					className="space-y-4 rounded-xl border border-border bg-card p-6"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t("planHeading")}
					</h2>
					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground">{t("descriptionLabel")}</dt>
							<dd
								data-testid="plan-description"
								className="font-mono text-foreground"
							>
								{plan.description}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("planIdLabel")}</dt>
							<dd data-testid="plan-id" className="font-mono text-foreground">
								{plan.id}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("preservesLabel")}</dt>
							<dd
								data-testid="preserves"
								className={
									plan.preservesAllData
										? "font-medium text-emerald-600 dark:text-emerald-400"
										: "font-medium text-destructive"
								}
							>
								{plan.preservesAllData ? t("yes") : t("no")}
							</dd>
						</div>
					</dl>

					<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t("stepsHeading")}
					</h3>
					<ol className="space-y-3" data-testid="steps">
						{plan.steps.map((s, i) => (
							<li
								key={s.stage}
								data-testid={`step-${s.stage}`}
								className="space-y-1 rounded-lg border border-border bg-muted/30 p-3"
							>
								<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
									{i + 1}. {s.stage}
								</span>
								<pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
									{s.sql}
								</pre>
								<p className="text-xs text-muted-foreground">{s.note}</p>
							</li>
						))}
					</ol>
				</div>
			)}
		</section>
	);
}
