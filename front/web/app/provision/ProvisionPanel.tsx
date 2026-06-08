"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DECLARED_IMAGES } from "@/lib/provision";
import { planAction } from "./actions";
import { PLAN_INITIAL, type PlanView } from "./view";

/**
 * ProvisionPanel makes the /provision route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S89 datastore provisioner has ONE control bound to the REAL
 * pure engine, reachable AND executable from the screen — pick a target
 * (plain-postgres default / doltgres opt-in), toggle vector search + a historical-
 * impact migration, and PLAN. The screen shows the resolved target, image, the
 * per-project isolated database + namespace, sidecars, `as of` support, the DDL,
 * the Pulumi resource, the content-address, and the deterministic reasons — OR the
 * BlockReason when the opt-in gate / human-gate refuses.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/provision,
 * never an LLM — plan = resolution. THE WALL (§2): it WRITES NOTHING — the Plan is a
 * record (a projection). Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("provision");
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

export function ProvisionPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("provision");
	const [state, action] = useActionState<PlanView, FormData>(
		planAction,
		PLAN_INITIAL,
	);
	const planned = state.ok && state.plan !== undefined;
	const p = state.plan;

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

			{/* Declared images — above the line, never learned. */}
			<section
				data-testid="images"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("imagesHeading")}
				</h2>
				<div className="flex flex-wrap gap-2 font-mono text-xs">
					{Object.entries(DECLARED_IMAGES).map(([k, v]) => (
						<span
							key={k}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 text-foreground"
						>
							{k} = {v}
						</span>
					))}
				</div>
			</section>

			{/* The action-capable control: pick a target + options → plan. */}
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("specHeading")}
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fieldProjectId")}</span>
						<input
							type="text"
							name="projectId"
							data-testid="field-project"
							defaultValue="demo-app"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fieldTarget")}</span>
						<select
							name="target"
							data-testid="field-target"
							defaultValue="plain-postgres"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="plain-postgres">plain-postgres (défaut)</option>
							<option value="doltgres">doltgres (opt-in)</option>
						</select>
					</label>
				</div>
				<div className="flex flex-col gap-2">
					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							name="needsVector"
							data-testid="field-vector"
							className="size-4 rounded border-border"
						/>
						{t("fieldNeedsVector")}
					</label>
					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							name="historical"
							data-testid="field-historical"
							className="size-4 rounded border-border"
						/>
						{t("fieldHistorical")}
					</label>
					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							name="migrationDeclared"
							data-testid="field-migration"
							className="size-4 rounded border-border"
						/>
						{t("fieldMigrationDeclared")}
					</label>
				</div>
				<Submit label={t("provision")} testId="provision-submit" />
			</form>

			{!state.ok && state.blockCode && (
				<section
					data-testid="block"
					data-block-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-destructive">
						{t("blockedHeading")}
					</h2>
					<p className="font-mono text-xs text-destructive">
						{state.blockCode}
					</p>
					<p className="text-xs text-muted-foreground">{t("blockedBody")}</p>
				</section>
			)}

			{planned && p && (
				<section
					data-testid="plan"
					data-target={p.target}
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<span
							data-testid="plan-target"
							className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase text-primary"
						>
							{p.target}
						</span>
						{p.supportsAsOf && (
							<span
								data-testid="as-of"
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
							>
								{t("asOfBadge")}
							</span>
						)}
					</div>

					<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground">{t("databaseLabel")}</dt>
							<dd
								data-testid="plan-database"
								className="font-mono text-foreground"
							>
								{p.database}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("namespaceLabel")}</dt>
							<dd
								data-testid="plan-namespace"
								className="font-mono text-foreground"
							>
								{p.namespace}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("imageLabel")}</dt>
							<dd
								data-testid="plan-image"
								className="font-mono text-foreground"
							>
								{p.image}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("sidecarsLabel")}</dt>
							<dd
								data-testid="plan-sidecars"
								className="font-mono text-foreground"
							>
								{p.sidecars.length > 0
									? p.sidecars.map((s) => s.kind).join(", ")
									: "—"}
							</dd>
						</div>
					</dl>

					<div>
						<p className="mb-1 text-xs text-muted-foreground">
							{t("ddlLabel")}
						</p>
						<pre
							data-testid="plan-ddl"
							className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground"
						>
							{p.ddl}
						</pre>
					</div>

					<div>
						<p className="mb-1 text-xs text-muted-foreground">
							{t("resourceLabel")}
						</p>
						<pre
							data-testid="plan-resource"
							className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground"
						>
							{JSON.stringify(p.resource, null, 2)}
						</pre>
					</div>

					<p className="font-mono text-xs text-muted-foreground">
						{t("contentAddressLabel")}:{" "}
						<span data-testid="plan-id">{p.id.slice(0, 16)}</span>
					</p>
					<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
						{p.reasons.map((r) => (
							<li key={r} data-testid="reason">
								{r}
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
