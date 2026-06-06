"use client";

import { useState } from "react";
import {
	allLevels,
	type Level,
	levels,
	nextLevel,
	outgoingRef,
	outOfScopeLevels,
	type ParseResult,
	parseLevel,
	specOf,
	transversalBands,
} from "@/lib/besoin-grammar";

/**
 * BesoinGrammarPanel — the action-capable /compound-besoin-grammar panel (EL02). The human EXECUTES
 * the grammar FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Lister la grammaire" runs levels()/transversalBands()/outOfScopeLevels() and renders the closed
 *    total order (the 7 SOURCE rungs with their NextLevel + outgoing ref), the 2 transversal bands,
 *    and the 3 declared out-of-scope-v1 layers.
 *  - "Analyser le niveau" runs parseLevel(input) and shows the verdict — a valid level resolves; an
 *    out-of-grammar string is a HARD refusal; saga/temporal/globalinvariant are refused as
 *    out-of-scope (never aliased).
 *
 * Every verdict is COMPUTED by lib/besoin-grammar.ts (the deterministic twin of
 * back/runtime/besoin/grammar.go), never an LLM and never re-implemented here. ABOVE the wall and
 * read-only against truth: EL02 fixes the grammar shape, it writes no kernel/mirror/fitness. Themed
 * (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	listCta: string;
	parseCta: string;
	parsePlaceholder: string;
	pending: string;
	orderHeading: string;
	bandsHeading: string;
	oosHeading: string;
	colRung: string;
	colNext: string;
	colRef: string;
	colFields: string;
	leaf: string;
	none: string;
	parseHeading: string;
	parseOk: string;
	parseUnknown: string;
	parseOutOfScope: string;
}

export function BesoinGrammarPanel({ labels }: { labels: Labels }) {
	const [listed, setListed] = useState<Level[] | null>(null);
	const [raw, setRaw] = useState("");
	const [parsed, setParsed] = useState<{
		input: string;
		result: ParseResult;
	} | null>(null);

	function runList() {
		setListed(allLevels());
	}

	function runParse() {
		setParsed({ input: raw, result: parseLevel(raw.trim()) });
	}

	return (
		<div className="space-y-8" data-testid="besoin-grammar-panel">
			{/* Control 1 — list the closed grammar */}
			<div className="space-y-4">
				<button
					type="button"
					onClick={runList}
					data-testid="list-grammar"
					className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{labels.listCta}
				</button>

				{listed === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="list-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-6" data-testid="grammar-result">
						{/* SOURCE rungs (total order) */}
						<section className="space-y-2">
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.orderHeading}
							</h3>
							<div className="overflow-hidden rounded-xl border border-border">
								<table className="w-full text-left text-sm">
									<thead className="bg-muted/60 text-xs text-muted-foreground uppercase">
										<tr>
											<th className="px-3 py-2 font-medium">
												{labels.colRung}
											</th>
											<th className="px-3 py-2 font-medium">
												{labels.colNext}
											</th>
											<th className="px-3 py-2 font-medium">{labels.colRef}</th>
											<th className="px-3 py-2 font-medium">
												{labels.colFields}
											</th>
										</tr>
									</thead>
									<tbody>
										{levels().map((l, i) => {
											const nl = nextLevel(l);
											const ref = outgoingRef(l);
											const spec = specOf(l);
											return (
												<tr
													key={l}
													data-testid={`rung-${l}`}
													className="border-t border-border"
												>
													<td className="px-3 py-2 font-mono text-foreground">
														<span className="text-muted-foreground">
															{i + 1}.
														</span>{" "}
														{l}
													</td>
													<td className="px-3 py-2 font-mono text-muted-foreground">
														{nl ?? labels.leaf}
													</td>
													<td className="px-3 py-2 font-mono text-muted-foreground">
														{ref
															? `${ref.refField} → ${ref.refTo}`
															: labels.none}
													</td>
													<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
														{spec?.requiredFields.join(", ")}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</section>

						{/* Transversal bands */}
						<section className="space-y-2">
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.bandsHeading}
							</h3>
							<div className="flex flex-wrap gap-2" data-testid="bands">
								{transversalBands().map((b) => (
									<span
										key={b}
										data-testid={`band-${b}`}
										className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-foreground"
									>
										{b}
									</span>
								))}
							</div>
						</section>

						{/* Out-of-scope v1 (declared) */}
						<section className="space-y-2">
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.oosHeading}
							</h3>
							<div className="flex flex-wrap gap-2" data-testid="out-of-scope">
								{outOfScopeLevels().map((o) => (
									<span
										key={o}
										data-testid={`oos-${o}`}
										className="inline-flex items-center rounded-full border border-dashed border-border bg-muted px-3 py-1 font-mono text-xs text-muted-foreground line-through"
									>
										{o}
									</span>
								))}
							</div>
						</section>
					</div>
				)}
			</div>

			{/* Control 2 — parse a level (hard refusal of out-of-grammar) */}
			<div className="space-y-3 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.parseHeading}
				</h3>
				<div className="flex flex-wrap items-center gap-2">
					<input
						type="text"
						value={raw}
						onChange={(e) => setRaw(e.target.value)}
						placeholder={labels.parsePlaceholder}
						data-testid="parse-input"
						className="w-56 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					/>
					<button
						type="button"
						onClick={runParse}
						data-testid="parse-level"
						className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.parseCta}
					</button>
				</div>

				{parsed && (
					<div data-testid="parse-result">
						{parsed.result.ok ? (
							<span
								data-testid="parse-ok"
								className="inline-flex items-center gap-2 rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
							>
								{labels.parseOk}:{" "}
								<span className="font-mono">{parsed.result.level}</span>
							</span>
						) : (
							<span
								data-testid="parse-refused"
								className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
							>
								{parsed.result.error === "out_of_scope"
									? labels.parseOutOfScope
									: labels.parseUnknown}
								: <span className="font-mono">{parsed.input}</span>
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
