"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FACETS, RUNGS } from "@/lib/grid";
import { type ResolveView, resolveAction } from "./actions";

/**
 * GridPanel makes the /grid route action-capable (ui-completeness law, CLAUDE.md §7): the FK03
 * grille has ONE control bound to it — RESOLVE & MARK (pick a verticale rung + an FK02 facet)
 * — reachable AND executable from the screen. It resolves the truth to its deterministic cell
 * (LAW 1), marks the source rungs ABOVE it stale with the facet held constant (LAW 2 — the
 * verticale couples), and shows the seven OTHER facets untouched (LAW 3 — orthogonality).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/grid, never an LLM —
 * same coordinate → same cell, same blast radius. THE WALL (§2): it WRITES NOTHING — a cell is
 * a coordinate the router exposes. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: ResolveView = {
	ok: false,
	staleCells: [],
	untouchedFacets: [],
	column: [],
};

function Submit() {
	const t = useTranslations("grid");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="resolve-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("resolveCta")}
		</button>
	);
}

export function GridPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("grid");
	const [state, action] = useActionState(resolveAction, initial);

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

			{/* The two axes side by side: the verticale (coupling) + the facette octuor (separating). */}
			<section data-testid="axes" className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("verticaleHeading")}
					</h2>
					<p className="text-xs text-muted-foreground">{t("verticaleHint")}</p>
					<ol data-testid="verticale" className="space-y-1">
						{RUNGS.map((r, i) => (
							<li
								key={r}
								data-testid={`rung-${r}`}
								className="flex items-center gap-2 font-mono text-xs text-foreground"
							>
								<span className="text-muted-foreground">{i}</span>
								<span className="font-semibold text-primary">{r}</span>
								<span className="text-muted-foreground">{t(`rung.${r}`)}</span>
							</li>
						))}
					</ol>
				</div>
				<div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("facetteHeading")}
					</h2>
					<p className="text-xs text-muted-foreground">{t("facetteHint")}</p>
					<ol data-testid="octuor" className="flex flex-wrap gap-2">
						{FACETS.map((f) => (
							<li
								key={f}
								data-testid={`facet-${f}`}
								className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-mono text-xs text-foreground ring-1 ring-border"
							>
								<span className="font-semibold text-primary">{f}</span>
								<span>{t(`facet.${f}`)}</span>
							</li>
						))}
					</ol>
				</div>
			</section>

			{/* The action-capable control: resolve a truth's cell + mark its blast radius. */}
			<form action={action} className="space-y-4">
				<div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("rungLabel")}
						</span>
						<select
							name="rung"
							data-testid="rung-select"
							defaultValue="entity"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{RUNGS.map((r) => (
								<option key={r} value={r}>
									{r} — {t(`rung.${r}`)}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("facetLabel")}
						</span>
						<select
							name="facet"
							data-testid="facet-select"
							defaultValue="S"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{FACETS.map((f) => (
								<option key={f} value={f}>
									{f} — {t(`facet.${f}`)}
								</option>
							))}
						</select>
					</label>
					<Submit />
				</div>
			</form>

			{state.error && (
				<p data-testid="resolve-error" className="text-sm text-destructive">
					{state.error}
				</p>
			)}

			{state.ok && (
				<section
					data-testid="result"
					className="space-y-5 rounded-xl border border-border bg-card p-4"
				>
					{/* LAW 1 — the resolved cell + content address. */}
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("cellHeading")}
						</h2>
						<span
							data-testid="resolved-cell"
							className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-primary"
						>
							{state.cell}
						</span>
						<span
							data-testid="resolved-hash"
							className="font-mono text-[10px] text-muted-foreground"
						>
							{state.hash}
						</span>
					</div>

					{/* LAW 2 — lateral coupling: the source rungs above, facet held constant. */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("staleHeading")}
						</h3>
						{state.staleCells.length === 0 ? (
							<p
								data-testid="stale-empty"
								className="text-sm text-muted-foreground"
							>
								{t("staleEmpty")}
							</p>
						) : (
							<ul data-testid="stale-cells" className="flex flex-wrap gap-2">
								{state.staleCells.map((c) => (
									<li
										key={c.cell}
										data-testid={`stale-${c.rung}`}
										data-facet={c.facet}
										className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-700 dark:text-amber-300"
									>
										{c.cell}
									</li>
								))}
							</ul>
						)}
						<p className="text-xs text-muted-foreground">{t("staleNote")}</p>
					</div>

					{/* LAW 3 — orthogonality: the other facets untouched. */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("untouchedHeading")}
						</h3>
						<ul data-testid="untouched-facets" className="flex flex-wrap gap-2">
							{state.untouchedFacets.map((f) => (
								<li
									key={f.letter}
									data-testid={`untouched-${f.letter}`}
									className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"
								>
									<span className="font-semibold">{f.letter}</span>
									<span>{f.name}</span>
								</li>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">
							{t("untouchedNote")}
						</p>
					</div>

					{/* The chosen facet's COLUMN of demo truths (top-down), to show it stays whole. */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("columnHeading")}
						</h3>
						{state.column.length === 0 ? (
							<p
								data-testid="column-empty"
								className="text-sm text-muted-foreground"
							>
								{t("columnEmpty")}
							</p>
						) : (
							<ul data-testid="facet-column" className="space-y-1">
								{state.column.map((c) => (
									<li
										key={c.id}
										data-testid={`column-${c.id}`}
										className="flex items-center gap-2 font-mono text-xs text-foreground"
									>
										<span className="text-muted-foreground">{c.rung}</span>
										<span>{c.id}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
