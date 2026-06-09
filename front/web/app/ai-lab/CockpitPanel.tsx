"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type GridCell, MIRROR_PAIRS } from "@/lib/ai-lab";
import type { Facet } from "@/lib/facetwire";
import { generateSpecsAction } from "./actions";
import { emptyLab, GRID_FACETS, type LabView } from "./fixtures";

/**
 * CockpitPanel makes /ai-lab action-capable (ui-completeness, CLAUDE.md §7): the corrected
 * FKE-38 AI Lab — a SPEC GENERATOR with TWO panes, not a navigation cockpit.
 *  - GAUCHE : a natural-language chat. A message GENERATES the specs across the 6 mirror-pairs of
 *    the selected facet (a column of the 6×6), ABOVE the wall (amber, proposed — never a truth).
 *    A direct truth-write is REFUSED at the wall (§2) ; the only door is idea → mirror → /goal.
 *  - DROITE : the 6×6 grid — 6 mirror-pairs (rows) × facets (columns). Each cell shows the
 *    generated SPEC (above the wall) and its MACHINE (the mirror/test, below the wall) with the
 *    live conscience voyant 🟢/🔴/🟡. « Les machines que ça change » = exactly these mirrors.
 *
 * DETERMINISM-FIRST (§6/§8): the control runs the PURE twin lib/ai-lab (generateSpecs + buildGrid),
 * never an LLM — same message → same grid. THE WALL (§2): the chat generates above, the machines
 * below are read-only ; a truth-write is refused ; promotion is /goal. Themed ADR 0010, i18n 0011.
 */

function voyantDot(v: GridCell["voyant"]): string {
	if (v === "green") return "bg-green-500";
	if (v === "red") return "bg-destructive";
	return "bg-amber-500";
}

function GenerateButton({
	label,
	working,
}: {
	label: string;
	working: string;
}) {
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			disabled={pending}
			data-testid="generate"
			className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
		>
			{pending ? working : label}
		</button>
	);
}

export function CockpitPanel() {
	const t = useTranslations("aiLab");
	const [view, action] = useActionState<LabView, FormData>(
		generateSpecsAction,
		emptyLab(),
	);

	const specCount = view.specs?.length ?? 0;
	const cells = view.cells ?? [];
	// index cells by pairId@facet for the grid render
	const byKey = new Map(cells.map((c) => [c.key, c]));

	return (
		<div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
			{/* ─────────────── GAUCHE — the chat (generates specs) ─────────────── */}
			<section
				aria-label={t("leftHeading")}
				className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="space-y-1">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("leftHeading")}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t("leftHelp")}
					</p>
				</div>

				<form action={action} className="flex flex-col gap-3">
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("facetLabel")}
						<select
							name="facet"
							defaultValue={view.selectedFacet ?? "F"}
							data-testid="facet"
							className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
						>
							{GRID_FACETS.map((f: Facet) => (
								<option key={f} value={f}>
									{f} — {t(`facet_${f}`)}
								</option>
							))}
						</select>
					</label>

					<textarea
						name="message"
						rows={3}
						required
						data-testid="chat"
						placeholder={t("chatPlaceholder")}
						className="resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
					/>
					<GenerateButton label={t("generateCta")} working={t("working")} />
				</form>

				{view.refusal ? (
					<div
						data-testid="wall-refused"
						className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs"
					>
						<p className="font-semibold text-destructive">{t("wallRefused")}</p>
						<p className="text-muted-foreground">{view.refusal.explanation}</p>
						<ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
							{view.refusal.howToFix.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
					</div>
				) : null}

				{view.transcript && view.transcript.length > 0 ? (
					<div className="space-y-2">
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{t("transcriptHeading")}
						</h3>
						<ul className="space-y-1.5" data-testid="transcript">
							{view.transcript.map((m) => (
								<li
									key={m.id}
									className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground"
								>
									{m.text}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</section>

			{/* ─────────── DROITE — the 6×6 grid (specs above, machines below) ─────────── */}
			<section
				aria-label={t("gridHeading")}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("gridHeading")}
					</h2>
					<span
						data-testid="spec-count"
						className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{t("specsCount", { n: specCount })}
					</span>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full border-separate border-spacing-1 text-xs">
						<thead>
							<tr>
								<th className="p-1 text-left font-medium text-muted-foreground">
									{t("pairColHeading")}
								</th>
								{GRID_FACETS.map((f) => (
									<th
										key={f}
										className="p-1 text-center font-semibold text-foreground"
										title={t(`facet_${f}`)}
									>
										{f}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{MIRROR_PAIRS.map((p) => (
								<tr key={p.id}>
									<th className="whitespace-nowrap p-1 text-left align-middle font-normal">
										<span className="font-medium text-foreground">
											{p.above}
										</span>
										<span className="text-muted-foreground"> ↔ {p.below}</span>
									</th>
									{GRID_FACETS.map((f) => {
										const cell = byKey.get(`${p.id}@${f}`);
										const v = cell?.voyant ?? "amber";
										const hasSpec = Boolean(cell?.spec);
										return (
											<td key={f} className="p-0.5">
												<div
													data-testid={`cell-${p.id}-${f}`}
													data-voyant={v}
													data-spec={hasSpec ? "1" : "0"}
													title={
														cell?.spec
															? `${t("aboveWall")}: ${cell.spec.text}\n${t("belowWall")}: ${p.below} — ${v}`
															: `${p.below} — ${v}`
													}
													className="flex flex-col overflow-hidden rounded-md border border-border"
												>
													{/* ABOVE the wall — the generated spec */}
													<div
														className={`h-5 ${hasSpec ? "bg-amber-500/25" : "bg-muted/40"}`}
													/>
													{/* the wall */}
													<div className="h-px bg-foreground/40" />
													{/* BELOW the wall — the machine voyant */}
													<div className="flex h-5 items-center justify-center bg-background">
														<span
															className={`inline-block h-2.5 w-2.5 rounded-full ${voyantDot(v)}`}
														/>
													</div>
												</div>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* legend + the wall reading */}
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-3 w-3 rounded-sm bg-amber-500/25 ring-1 ring-border" />
						{t("legendSpec")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
						{t("legendGreen")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
						{t("legendRed")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
						{t("legendAmber")}
					</span>
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>
		</div>
	);
}
