"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_LAYERS, FACET_NAME } from "@/lib/facetcomplete";
import { type CompletenessView, checkAction } from "./actions";

/**
 * FacetCompletenessPanel makes the /facet-completeness route action-capable (ui-completeness
 * law, CLAUDE.md §7): the FK04 facet-aware completeness has ONE control bound to it — RUN THE
 * LAW (optionally with a FAULT-INJECTION: remove a facet's living pair) — reachable AND
 * executable from the screen. With the conformant demo cut it returns COMPLETE; remove an
 * instantiated facet's pair and a MONSTER appears (a security hole, a perf regression…).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/facetcomplete, never
 * an LLM — same cut → same verdict. THE WALL (§2): it WRITES NOTHING — it computes the verdict
 * over a projection. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: CompletenessView = {
	ok: false,
	facetMonsters: [],
	advisory: [],
};

// The (layer, facet) pairs the demo cut has a LIVING mirror for — the ones removable.
const REMOVABLE: { layerId: string; facet: string }[] = [
	{ layerId: "op-checkout", facet: "F" },
	{ layerId: "op-checkout", facet: "S" },
	{ layerId: "op-checkout", facet: "B" },
	{ layerId: "view-cart", facet: "F" },
];

function Submit() {
	const t = useTranslations("facetCompleteness");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="check-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("checkCta")}
		</button>
	);
}

export function FacetCompletenessPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("facetCompleteness");
	const [state, action] = useActionState(checkAction, initial);

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

			{/* The demo cut: the layers and the facets each INSTANTIATES (each demands a pair). */}
			<section data-testid="cut" className="space-y-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("cutHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("cutHint")}</p>
				<ul className="space-y-2">
					{DEMO_LAYERS.map((l) => (
						<li
							key={l.layerId}
							data-testid={`layer-${l.layerId}`}
							className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs"
						>
							<span className="font-semibold text-foreground">{l.layerId}</span>
							<span className="text-muted-foreground">({l.kind})</span>
							{l.facets.map((f) => (
								<span
									key={f}
									data-testid={`layer-${l.layerId}-facet-${f}`}
									className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 ring-1 ring-border"
								>
									<span className="font-semibold text-primary">{f}</span>
									<span className="text-muted-foreground">{FACET_NAME[f]}</span>
								</span>
							))}
						</li>
					))}
				</ul>
			</section>

			{/* The action-capable control: run the law, optionally fault-inject a removed pair. */}
			<form action={action} className="space-y-4">
				<div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("faultLabel")}
						</span>
						<select
							name="removeFacet"
							data-testid="remove-facet"
							defaultValue=""
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="">{t("faultNone")}</option>
							{REMOVABLE.map((r) => (
								<option
									key={`${r.layerId}-${r.facet}`}
									value={r.facet}
									data-layer={r.layerId}
								>
									{r.layerId} × {r.facet} —{" "}
									{FACET_NAME[r.facet as never] ?? r.facet}
								</option>
							))}
						</select>
					</label>
					{/* The layer of the removed pair travels with the facet (hidden, kept in sync). */}
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("layerLabel")}
						</span>
						<select
							name="removeLayer"
							data-testid="remove-layer"
							defaultValue=""
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="">{t("faultNone")}</option>
							{DEMO_LAYERS.map((l) => (
								<option key={l.layerId} value={l.layerId}>
									{l.layerId}
								</option>
							))}
						</select>
					</label>
					<Submit />
				</div>
				<p className="text-xs text-muted-foreground">{t("faultNote")}</p>
			</form>

			{state.error && (
				<p data-testid="check-error" className="text-sm text-destructive">
					{state.error}
				</p>
			)}

			{state.ok && (
				<section
					data-testid="result"
					className="space-y-5 rounded-xl border border-border bg-card p-4"
				>
					{/* The verdict. */}
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("verdictHeading")}
						</h2>
						<span
							data-testid="verdict"
							data-verdict={state.verdict}
							className={
								state.verdict === "COMPLETE"
									? "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
									: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-sm font-semibold text-destructive"
							}
						>
							{state.verdict === "COMPLETE"
								? t("verdictComplete")
								: t("verdictMonster")}
						</span>
						{state.removed && (
							<span
								data-testid="removed-pair"
								className="font-mono text-xs text-muted-foreground"
							>
								{t("removedPrefix")} {state.removed.layerId}×
								{state.removed.facet}
							</span>
						)}
					</div>

					{/* The HARD facet monsters (a missing/divergent pair on a non-soft facet). */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("monstersHeading")}
						</h3>
						{state.facetMonsters.length === 0 ? (
							<p
								data-testid="monsters-empty"
								className="text-sm text-muted-foreground"
							>
								{t("monstersEmpty")}
							</p>
						) : (
							<ul data-testid="facet-monsters" className="flex flex-wrap gap-2">
								{state.facetMonsters.map((m) => (
									<li
										key={`${m.layerId}-${m.facet}`}
										data-testid={`monster-${m.layerId}-${m.facet}`}
										className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-xs text-destructive"
									>
										<span className="font-semibold">{m.layerId}</span>
										<span>×</span>
										<span className="font-semibold">{m.facet}</span>
										<span>{m.facetName}</span>
									</li>
								))}
							</ul>
						)}
						<p className="text-xs text-muted-foreground">{t("monstersNote")}</p>
					</div>

					{/* The soft-X advisories (informational, never blocking). */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("advisoryHeading")}
						</h3>
						{state.advisory.length === 0 ? (
							<p
								data-testid="advisory-empty"
								className="text-sm text-muted-foreground"
							>
								{t("advisoryEmpty")}
							</p>
						) : (
							<ul data-testid="advisory-list" className="flex flex-wrap gap-2">
								{state.advisory.map((m) => (
									<li
										key={`${m.layerId}-${m.facet}`}
										data-testid={`advisory-${m.layerId}-${m.facet}`}
										className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-700 dark:text-amber-300"
									>
										<span className="font-semibold">{m.layerId}</span>
										<span>×</span>
										<span className="font-semibold">{m.facet}</span>
										<span>{m.facetName}</span>
									</li>
								))}
							</ul>
						)}
						<p className="text-xs text-muted-foreground">{t("advisoryNote")}</p>
					</div>
				</section>
			)}
		</div>
	);
}
