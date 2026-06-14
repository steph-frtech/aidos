"use client";

import { useActionState } from "react";
import { basculeAction } from "./actions";
import { type BasculeView, emptyBascule } from "./types";

/**
 * EvidenceBascule — the FK16 action-capable E0-E7 panel (la bascule, contract half). It renders the
 * E0-E7 ladder AND a RELABEL-THE-CORPUS control (CLAUDE.md §7 ui-completeness): submit a sample
 * N-typed corpus, throw the switch, and watch each mirror gain its DERIVED E while keeping (and
 * deprecating, never deleting) its N. The NoLoss verdict + the E histogram render.
 *
 * Client component (form state only); strings arrive translated from the server (next-intl, ADR
 * 0011), design tokens only (ADR 0010). THE WALL: the action derives, it writes no truth.
 */

export interface ELadderItem {
	level: number;
	name: string;
	desc: string;
}

export interface BasculeLabels {
	ladderTitle: string;
	relabelTitle: string;
	relabelHint: string;
	corpusLabel: string;
	relabelBtn: string;
	noLossOk: string;
	noLossBad: string;
	colMirror: string;
	colN: string;
	colLifecycle: string;
	colE: string;
	histTitle: string;
	deprecatedNote: string;
}

export function EvidenceBascule({
	ladder,
	labels,
}: {
	ladder: ELadderItem[];
	labels: BasculeLabels;
}) {
	const [state, formAction, pending] = useActionState<BasculeView, FormData>(
		basculeAction,
		emptyBascule,
	);

	return (
		<section data-testid="evidence-bascule" className="space-y-8">
			{/* The E0-E7 ladder */}
			<div className="space-y-2">
				<h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
					{labels.ladderTitle}
				</h2>
				<ol className="space-y-2">
					{ladder.map((e) => (
						<li
							key={e.level}
							data-testid={`e-level-${e.level}`}
							className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary tabular-nums">
								E{e.level}
							</span>
							<div className="min-w-0">
								<p className="font-semibold text-card-foreground">{e.name}</p>
								<p className="text-xs text-muted-foreground">{e.desc}</p>
							</div>
						</li>
					))}
				</ol>
			</div>

			{/* The action-capable bascule control */}
			<form
				action={formAction}
				className="space-y-3 rounded-xl border border-primary/30 bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-card-foreground">
					{labels.relabelTitle}
				</h2>
				<p className="text-xs text-muted-foreground">{labels.relabelHint}</p>
				<label className="block text-xs font-medium text-muted-foreground">
					{labels.corpusLabel}
					<textarea
						name="corpus"
						data-testid="corpus-input"
						rows={4}
						placeholder='[{"mirrorId":"m1","testKind":"property","certLanguage":"rapid","n":"N1"}]'
						className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs text-foreground"
					/>
				</label>
				<button
					type="submit"
					data-testid="bascule-btn"
					disabled={pending}
					className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
				>
					{labels.relabelBtn}
				</button>

				{state.error ? (
					<p data-testid="bascule-error" className="text-sm text-destructive">
						{state.error}
					</p>
				) : null}

				{state.ok ? (
					<div
						data-testid="bascule-result"
						className="space-y-4 border-t border-border pt-4"
					>
						<p
							data-testid="no-loss"
							className={
								state.noLoss
									? "rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
									: "rounded-lg bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive"
							}
						>
							{state.noLoss ? labels.noLossOk : labels.noLossBad}
						</p>

						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
									<th className="py-1 pr-2">{labels.colMirror}</th>
									<th className="py-1 pr-2">{labels.colN}</th>
									<th className="py-1 pr-2">{labels.colLifecycle}</th>
									<th className="py-1">{labels.colE}</th>
								</tr>
							</thead>
							<tbody>
								{state.tags.map((t) => (
									<tr
										key={t.mirrorId}
										data-testid={`tag-row-${t.mirrorId}`}
										className="border-b border-border/50"
									>
										<td className="py-1 pr-2 font-mono text-xs">
											{t.mirrorId}
										</td>
										<td className="py-1 pr-2 font-mono text-xs text-muted-foreground">
											{t.n}
										</td>
										<td className="py-1 pr-2">
											<span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
												{t.nLifecycle}
											</span>
										</td>
										<td className="py-1">
											<code
												data-testid={`tag-e-${t.mirrorId}`}
												className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary"
											>
												E{t.e}
											</code>
										</td>
									</tr>
								))}
							</tbody>
						</table>

						<div>
							<h3 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.histTitle}
							</h3>
							<div className="flex flex-wrap gap-1.5">
								{state.histogram.map((b) => (
									<span
										key={b.level}
										data-testid={`hist-${b.level}`}
										className="rounded-md border border-border bg-card/60 px-2 py-1 text-xs tabular-nums"
									>
										E{b.level}: {b.count}
									</span>
								))}
							</div>
						</div>

						<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
							{labels.deprecatedNote}
						</p>
					</div>
				) : null}
			</form>
		</section>
	);
}
