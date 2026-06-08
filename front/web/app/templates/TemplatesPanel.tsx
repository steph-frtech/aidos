"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	forkAction,
	instantiateAction,
	type StarterView,
	type TemplateSummary,
} from "./actions";

/**
 * TemplatesPanel makes the /templates route action-capable (ui-completeness law, CLAUDE.md §7): the
 * S81 curated template catalogue has its controls bound to the REAL deterministic engine, reachable
 * AND executable from the screen — INSTANTIATE (duplicate-from-template → a deterministic GREEN
 * starter) and FORK (fork this app at a stable phase).
 *
 * DETERMINISM-FIRST (§6/§8): both controls run the PURE twin lib/templates (the byte-twin of the Go
 * package), never an LLM. THE WALL (§2): the screen WRITES NOTHING — instantiate/fork are dry-run value
 * computations; landing the starter's truths is the legal door (propose → approve). Themed on the ADR
 * 0010 tokens; strings via next-intl (0011).
 */

const initial: StarterView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("templates");
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

function StarterResult({
	state,
	testId,
}: {
	state: StarterView;
	testId: string;
}) {
	const t = useTranslations("templates");
	if (!state.ok) return null;
	if (state.error) {
		return (
			<p data-testid={`${testId}-error`} className="text-sm text-destructive">
				{state.error}
			</p>
		);
	}
	if (!state.starterId) return null;
	return (
		<div
			data-testid={`${testId}-result`}
			data-starter-id={state.starterId}
			className="space-y-3 rounded-lg border border-border bg-muted p-4"
		>
			<p className="text-sm font-semibold text-foreground">
				{state.forked ? t("forkedHeading") : t("instantiatedHeading")}
			</p>
			<p className="font-mono text-xs text-muted-foreground">
				{`template=${state.template} · target=${state.target}${
					state.parentPhase ? ` · from=${state.parentPhase}` : ""
				} · starter=${state.starterId.slice(0, 12)}…`}
			</p>
			<p className="text-xs text-muted-foreground">
				{t("pieceCount", { n: state.pieceCount ?? 0 })}
				{state.hasAppAuth ? ` · ${t("withAppAuth")}` : ""}
			</p>
			<ul className="max-h-48 space-y-0.5 overflow-auto">
				{(state.pieces ?? []).map((p) => (
					<li key={p} className="font-mono text-xs text-muted-foreground">
						{p}
					</li>
				))}
			</ul>
		</div>
	);
}

export function TemplatesPanel({
	templates,
}: {
	templates: TemplateSummary[];
}) {
	const t = useTranslations("templates");
	const [instState, doInstantiate] = useActionState(instantiateAction, initial);
	const [forkState, doFork] = useActionState(forkAction, initial);

	return (
		<div className="space-y-10">
			{/* CATALOGUE — the curated bundles */}
			<section className="space-y-4">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("catalogueHeading")}
				</h2>
				<div className="grid gap-4 sm:grid-cols-3" data-testid="catalogue">
					{templates.map((b) => (
						<div
							key={b.id}
							data-testid={`tpl-${b.id}`}
							className="space-y-2 rounded-xl border border-border bg-card p-4"
						>
							<p className="text-sm font-semibold text-foreground">
								{b.labelFr}
							</p>
							<p className="font-mono text-xs text-muted-foreground">{b.id}</p>
							<p className="text-xs text-muted-foreground">
								{t("bundleShape", {
									e: b.entities,
									r: b.relations,
									o: b.operations,
									m: b.mirrors,
								})}
							</p>
							<p className="font-mono text-[10px] text-muted-foreground">
								{b.bundleId.slice(0, 12)}…
							</p>
						</div>
					))}
				</div>
			</section>

			{/* INSTANTIATE — duplicate-from-template */}
			<form
				action={doInstantiate}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("instantiateHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("instantiateIntro")}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("templateLabel")}
						</span>
						<select
							name="template"
							data-testid="instantiate-template"
							defaultValue="ecommerce"
							className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							{templates.map((b) => (
								<option key={b.id} value={b.id}>
									{b.id}
								</option>
							))}
						</select>
					</label>
					<label className="flex-1 space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("targetLabel")}
						</span>
						<input
							name="target"
							data-testid="instantiate-target"
							defaultValue="shop-app"
							placeholder="shop-app"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<Submit label={t("instantiateButton")} testId="instantiate-submit" />
				</div>
				<StarterResult state={instState} testId="instantiate" />
			</form>

			{/* FORK — fork this app at a stable phase */}
			<form
				action={doFork}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("forkHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("forkIntro")}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("templateLabel")}
						</span>
						<select
							name="template"
							data-testid="fork-template"
							defaultValue="ecommerce"
							className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							{templates.map((b) => (
								<option key={b.id} value={b.id}>
									{b.id}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("targetLabel")}
						</span>
						<input
							name="target"
							data-testid="fork-target"
							defaultValue="shop-fork"
							className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("phaseLabel")}
						</span>
						<input
							name="parentPhase"
							data-testid="fork-phase"
							defaultValue="phase-stable-1"
							className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<Submit label={t("forkButton")} testId="fork-submit" />
				</div>
				<StarterResult state={forkState} testId="fork" />
			</form>
		</div>
	);
}
