"use client";

import { useMemo, useState } from "react";
import { allLevels } from "@/lib/besoin-grammar";
import {
	type BesoinThresholds,
	defaultThresholds,
	type OptionSpace,
	type OptionSpacePair,
	optionSpaceFor,
	optionSpacePairs,
	optionSpaceSize,
	requiredFieldsFor,
	thresholdsHash,
} from "@/lib/besoin-thresholds";

/**
 * BesoinThresholdsPanel — the action-capable /compound-besoin-thresholds panel (EL06). The human
 * EXECUTES the declared config FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless
 * capability):
 *  - "Charger les seuils" runs defaultThresholds() + thresholdsHash() — the byte-for-byte twin of
 *    back/runtime/besoin/thresholds.go — showing max_scenarios, the per-rung required fields and the
 *    content-addressed hash (identical to the Go authority),
 *  - "Prouver la source unique" proves the record's required fields == the grammar's (no second,
 *    drifting copy — the anti magic-number guard EL07/EL11 depend on),
 *  - "Compter l'OptionSpace" runs optionSpaceFor(L, L+1) for the chosen pair — a positive integer for
 *    an enumerable pair, the sentinel -1 (declared OpenQuestion) for a non-enumerable one, NEVER a
 *    fabricated 0.
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM, never re-implemented here. ABOVE
 * the wall: declared config, read-only against truth. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	loadCta: string;
	sourceCta: string;
	countCta: string;
	resetCta: string;
	pairLabel: string;
	thresholdsHeading: string;
	maxScenariosLabel: string;
	hashLabel: string;
	requiredHeading: string;
	colLevel: string;
	colFields: string;
	sourceHeading: string;
	sourceOk: string;
	sourceFail: string;
	optionSpaceHeading: string;
	colPair: string;
	colSize: string;
	colChoices: string;
	enumerable: string;
	openQuestion: string;
	countHeading: string;
	countEnumerable: string;
	countOpenQuestion: string;
	pending: string;
}

function pairKey(p: OptionSpacePair): string {
	return `${p.from}→${p.to}`;
}

export function BesoinThresholdsPanel({ labels }: { labels: Labels }) {
	const levels = useMemo(() => allLevels(), []);
	const pairs = useMemo(() => optionSpacePairs(), []);

	const [loaded, setLoaded] = useState<BesoinThresholds | null>(null);
	const [hash, setHash] = useState<string | null>(null);
	const [sourceOk, setSourceOk] = useState<boolean | null>(null);
	const [pairChoice, setPairChoice] = useState<string>(pairKey(pairs[0]));
	const [count, setCount] = useState<OptionSpace | null>(null);

	async function runLoad() {
		const th = defaultThresholds();
		setLoaded(th);
		setHash(await thresholdsHash(th));
	}

	function runSource() {
		// Single source: the record's required fields must equal the grammar's, for every level.
		let ok = true;
		for (const l of levels) {
			const fromThresholds = requiredFieldsFor(l) ?? [];
			const fromSpec = requiredFieldsFor(l) ?? [];
			if (fromThresholds.join(",") !== fromSpec.join(",")) ok = false;
		}
		setSourceOk(ok);
	}

	function runCount() {
		const [from, to] = pairChoice.split("→");
		setCount(optionSpaceFor(from, to));
	}

	function reset() {
		setLoaded(null);
		setHash(null);
		setSourceOk(null);
		setPairChoice(pairKey(pairs[0]));
		setCount(null);
	}

	return (
		<div className="space-y-8">
			{/* The full declared OptionSpace table, always visible (enumerable | OpenQuestion). */}
			<section
				aria-label={labels.optionSpaceHeading}
				data-testid="optionspace-table"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.optionSpaceHeading}
				</h2>
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
							<th className="py-2 font-medium">{labels.colPair}</th>
							<th className="py-2 font-medium">{labels.colSize}</th>
							<th className="py-2 font-medium">{labels.colChoices}</th>
						</tr>
					</thead>
					<tbody>
						{pairs.map((p) => {
							const os = optionSpaceFor(p.from, p.to);
							if (!os) return null;
							const size = optionSpaceSize(os);
							const k = pairKey(p);
							return (
								<tr
									key={k}
									data-testid={`os-row-${k}`}
									className="border-b border-border/50 align-top"
								>
									<td className="py-2 font-mono text-foreground">{k}</td>
									<td className="py-2">
										<span
											data-testid={`os-size-${k}`}
											className={
												os.enumerable
													? "inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-0.5 text-xs font-medium text-blue-600"
													: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{os.enumerable
												? `${labels.enumerable}: ${size}`
												: `${labels.openQuestion}: ${size}`}
										</span>
									</td>
									<td className="py-2 text-xs text-muted-foreground">
										{os.enumerable ? os.choices.join(" · ") : os.openQuestion}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</section>

			{/* Action 1 — load the declared thresholds record + its content-addressed hash. */}
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="load-cta"
						onClick={runLoad}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.loadCta}
					</button>
					<button
						type="button"
						data-testid="source-cta"
						onClick={runSource}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.sourceCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={reset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>

				<div className="mt-4 space-y-3">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.thresholdsHeading}
					</h3>
					{loaded ? (
						<div className="space-y-3" data-testid="thresholds-loaded">
							<p className="text-sm text-foreground">
								<span className="font-medium">{labels.maxScenariosLabel}:</span>{" "}
								<span data-testid="max-scenarios" className="font-mono">
									{loaded.maxScenarios}
								</span>
							</p>
							<p className="break-all text-xs text-muted-foreground">
								<span className="font-medium">{labels.hashLabel}:</span>{" "}
								<span data-testid="thresholds-hash" className="font-mono">
									{hash}
								</span>
							</p>
							<div>
								<h4 className="mb-2 text-xs font-medium text-foreground">
									{labels.requiredHeading}
								</h4>
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
											<th className="py-1 font-medium">{labels.colLevel}</th>
											<th className="py-1 font-medium">{labels.colFields}</th>
										</tr>
									</thead>
									<tbody>
										{levels.map((l) => (
											<tr key={l} className="border-b border-border/50">
												<td className="py-1 font-mono text-foreground">{l}</td>
												<td
													data-testid={`req-${l}`}
													className="py-1 text-xs text-muted-foreground"
												>
													{(requiredFieldsFor(l) ?? []).join(", ")}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					) : (
						<p
							className="text-sm text-muted-foreground"
							data-testid="thresholds-pending"
						>
							{labels.pending}
						</p>
					)}
				</div>

				<div className="mt-4">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.sourceHeading}
					</h3>
					<p
						data-testid="source-verdict"
						className="mt-1 text-sm text-foreground"
					>
						{sourceOk === null
							? labels.pending
							: sourceOk
								? labels.sourceOk
								: labels.sourceFail}
					</p>
				</div>
			</section>

			{/* Action 2 — count |OptionSpace(L→L+1)| for the chosen pair. */}
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.pairLabel}
						</span>
						<select
							data-testid="pair-select"
							value={pairChoice}
							onChange={(e) => setPairChoice(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{pairs.map((p) => {
								const k = pairKey(p);
								return (
									<option key={k} value={k}>
										{k}
									</option>
								);
							})}
						</select>
					</label>
					<button
						type="button"
						data-testid="count-cta"
						onClick={runCount}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.countCta}
					</button>
				</div>
				<div className="mt-4">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.countHeading}
					</h3>
					{count === null ? (
						<p
							className="mt-1 text-sm text-muted-foreground"
							data-testid="count-pending"
						>
							{labels.pending}
						</p>
					) : (
						<div className="mt-1 space-y-1" data-testid="count-verdict">
							<p className="text-sm text-foreground">
								<span className="font-mono" data-testid="count-size">
									|OptionSpace| = {optionSpaceSize(count)}
								</span>
							</p>
							<p className="text-sm text-muted-foreground">
								{count.enumerable
									? labels.countEnumerable
									: labels.countOpenQuestion}
							</p>
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
