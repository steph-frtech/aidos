"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Divergence } from "@/lib/docmirror";
import { compareAction } from "./actions";
import { type DocMirrorView, emptyView, SCENARIOS } from "./fixtures";

/**
 * DocMirrorPanel makes the /doc-mirror route action-capable (ui-completeness, CLAUDE.md §7):
 * the FK07 comparator Compare(s2, s9) has ONE control bound to it — COMPARER — reachable AND
 * executable from the screen. Pick a scenario, run the comparator, and the verdict appears:
 * the blocking structural divergences (concepts/behaviours/errors present on one side only)
 * and the advisory prose drifts (never blocking). The judge is a CALCULATION (§8): a
 * structural divergence is RED, a prose-only edit stays GREEN with an advisory.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/docmirror, never an
 * LLM — same pair → same verdict (shown by the determinism badge). THE WALL (§2): it WRITES
 * NOTHING — the report is a projection. Themed on ADR 0010 tokens; strings via next-intl
 * (ADR 0011).
 */

function Submit() {
	const t = useTranslations("docMirror");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="compare-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("compareCta")}
		</button>
	);
}

function DivergenceRow({ d }: { d: Divergence }) {
	const t = useTranslations("docMirror");
	const sideLabel =
		d.side === "code_missing"
			? t("sideCodeMissing")
			: d.side === "human_missing"
				? t("sideHumanMissing")
				: "";
	return (
		<li
			data-testid="divergence"
			data-plane={d.plane}
			data-section={d.section}
			data-key={d.key}
			data-side={d.side ?? ""}
			className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
					{d.section}
				</span>
				<code className="font-mono text-xs text-foreground">{d.key}</code>
				{sideLabel ? (
					<span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
						{sideLabel}
					</span>
				) : null}
			</div>
			{d.plane === "prose" ? (
				<div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
					<p>
						<span className="font-medium">s2 :</span> {d.human_prose}
					</p>
					<p>
						<span className="font-medium">s9 :</span> {d.code_prose}
					</p>
				</div>
			) : null}
		</li>
	);
}

export function DocMirrorPanel() {
	const t = useTranslations("docMirror");
	const [state, formAction] = useActionState<DocMirrorView, FormData>(
		compareAction,
		emptyView,
	);

	return (
		<section
			aria-label={t("panelHeading")}
			data-testid="doc-mirror-panel"
			className="mt-10 space-y-6"
		>
			<form action={formAction} className="space-y-4">
				<label
					htmlFor="scenarioId"
					className="block text-sm font-medium text-foreground"
				>
					{t("scenarioLabel")}
				</label>
				<select
					id="scenarioId"
					name="scenarioId"
					data-testid="scenario-select"
					defaultValue={SCENARIOS[0]?.id}
					className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{SCENARIOS.map((s) => (
						<option key={s.id} value={s.id}>
							{s.label}
						</option>
					))}
				</select>
				<Submit />
			</form>

			{state.error ? (
				<p data-testid="compare-error" className="text-sm text-destructive">
					{state.error}
				</p>
			) : null}

			{state.ok ? (
				<div data-testid="report" className="space-y-6">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm text-muted-foreground">
							{t("kernelIdLabel")}
						</span>
						<code
							data-testid="kernel-id"
							className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
						>
							{state.kernelId}
						</code>
						<span
							data-testid="verdict-badge"
							data-verdict={state.verdict}
							className={
								state.verdict === "green"
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
							}
						>
							{state.verdict === "green" ? t("verdictGreen") : t("verdictRed")}
						</span>
						<span
							data-testid="determinism-badge"
							data-deterministic={state.deterministic ? "true" : "false"}
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{state.deterministic
								? t("deterministicYes")
								: t("deterministicNo")}
						</span>
					</div>

					<div data-testid="structural" className="space-y-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("structuralHeading")}{" "}
							<span className="text-muted-foreground">
								({state.structural.length})
							</span>
						</h3>
						{state.structural.length === 0 ? (
							<p
								data-testid="structural-empty"
								className="text-sm text-muted-foreground"
							>
								{t("structuralEmpty")}
							</p>
						) : (
							<ul className="space-y-1.5">
								{state.structural.map((d) => (
									<DivergenceRow
										key={`${d.section}:${d.key}:${d.side}`}
										d={d}
									/>
								))}
							</ul>
						)}
					</div>

					<div data-testid="advisories" className="space-y-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("advisoriesHeading")}{" "}
							<span className="text-muted-foreground">
								({state.advisories.length})
							</span>
						</h3>
						{state.advisories.length === 0 ? (
							<p
								data-testid="advisories-empty"
								className="text-sm text-muted-foreground"
							>
								{t("advisoriesEmpty")}
							</p>
						) : (
							<ul className="space-y-1.5">
								{state.advisories.map((d) => (
									<DivergenceRow key={`prose:${d.key}`} d={d} />
								))}
							</ul>
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
