"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FACETS } from "@/lib/facets";
import { type FacetFilterView, filterAction } from "./actions";

/**
 * FacetsPanel makes the /facets route action-capable (ui-completeness law, CLAUDE.md §7):
 * the FK02 facet-set has ONE control bound to it — a FILTER BY FACET (the done-criterion
 * "panel filtre par facette") — reachable AND executable from the screen. Each kernel's
 * collapsible facet-set is validated; the validity badge (🟢/🔴) shows whether it is a
 * monster (no F, empty facet, or a declared facet missing its proof pair). The
 * content-addressed signature proves the round-trip is stable.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/facets, never an
 * LLM — same facet-set → same verdict, same hash. THE WALL (§2): it WRITES NOTHING — the
 * facet-set is a value the validator judges. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: FacetFilterView = {
	ok: false,
	filter: "all",
	kernels: [],
	total: 0,
};

function Submit() {
	const t = useTranslations("facets");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="filter-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("filterCta")}
		</button>
	);
}

export function FacetsPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("facets");
	const [state, action] = useActionState(filterAction, initial);

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

			{/* The octuor of the eight facets (F→X), the reference lenses. */}
			<section
				data-testid="octuor"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("octuorHeading")}
				</h2>
				<ol className="flex flex-wrap gap-2">
					{FACETS.map((f) => (
						<li
							key={f.letter}
							data-testid={`facet-${f.letter}`}
							className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-mono text-xs text-foreground ring-1 ring-border"
						>
							<span className="font-semibold text-primary">{f.letter}</span>
							<span>{t(`facet.${f.letter}`)}</span>
							{f.soft && (
								<span className="text-amber-600 dark:text-amber-400">
									{t("soft")}
								</span>
							)}
						</li>
					))}
				</ol>
			</section>

			{/* The action-capable control: filter kernels by instantiated facet. */}
			<form action={action} className="space-y-4">
				<div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("filterLabel")}
						</span>
						<select
							name="filter"
							data-testid="filter-select"
							defaultValue="all"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="all">{t("filterAll")}</option>
							{FACETS.map((f) => (
								<option key={f.letter} value={f.letter}>
									{f.letter} — {t(`facet.${f.letter}`)}
								</option>
							))}
						</select>
					</label>
					<Submit />
				</div>
			</form>

			{/* The filtered kernels, each with its facet-set, validity badge + signature. */}
			{state.ok && (
				<section
					data-testid="results"
					className="space-y-3 rounded-xl border border-border bg-card p-4"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("resultsHeading")}
						</h2>
						<span
							data-testid="results-count"
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
						>
							{state.kernels.length} / {state.total}
						</span>
					</div>
					{state.kernels.length === 0 ? (
						<p
							data-testid="results-empty"
							className="text-sm text-muted-foreground"
						>
							{t("resultsEmpty")}
						</p>
					) : (
						<ul className="space-y-2">
							{state.kernels.map((k) => (
								<li
									key={k.id}
									data-testid={`kernel-${k.id}`}
									data-valid={k.valid ? "true" : "false"}
									className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
								>
									<span className="text-foreground">{t(`kernel.${k.id}`)}</span>
									<span className="flex flex-wrap gap-1">
										{k.facets.map((f) => (
											<span
												key={f}
												className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground"
											>
												{f}
											</span>
										))}
									</span>
									<span
										data-testid={`signature-${k.id}`}
										className="font-mono text-[10px] text-muted-foreground"
									>
										{k.signature}
									</span>
									<span
										data-testid={`validity-${k.id}`}
										data-valid={k.valid ? "true" : "false"}
										title={k.valid ? t("validValid") : t("validMonster")}
										className={
											k.valid
												? "ml-auto inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
												: "ml-auto inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
										}
									>
										{k.valid ? t("validValid") : t("validMonster")}
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</div>
	);
}
