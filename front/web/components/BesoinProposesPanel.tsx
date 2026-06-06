"use client";

import { useMemo, useState } from "react";
import { allLevels } from "@/lib/besoin-grammar";
import {
	emitLevels,
	levelToProposes,
	levelToProposesChecked,
	type Mapping,
	noEmitLevels,
	PROPOSES_KINDS,
} from "@/lib/besoin-proposes";

/**
 * BesoinProposesPanel — the action-capable /compound-besoin-proposes panel (EL05). The human EXECUTES
 * the declared LevelToProposes table FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless
 * capability):
 *  - "Mapper le niveau" runs levelToProposes(level) — the byte-for-byte twin of
 *    back/runtime/besoin/proposes.go — and surfaces Emit<kind> | NoEmit for the chosen level,
 *  - "Prouver la jointure honnête" proves every Emit target ∈ ideas.ProposesKinds() (the closed set)
 *    AND no level silently aliases another (journey→product forbidden),
 *  - "Tester un niveau hors-grammaire" runs levelToProposesChecked on a raw string — out-of-grammar
 *    is a HARD error (never an alias, never an LLM guess).
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM, never re-implemented here. ABOVE
 * the wall: the table decides ONLY the Proposes target; it writes no Idea and no truth. Themed (ADR
 * 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	levelLabel: string;
	mapCta: string;
	joinCta: string;
	checkCta: string;
	rawLabel: string;
	resetCta: string;
	tableHeading: string;
	colLevel: string;
	colMapping: string;
	emit: string;
	noEmit: string;
	verdictHeading: string;
	joinHeading: string;
	joinOk: string;
	joinFail: string;
	checkHeading: string;
	checkHardError: string;
	checkValid: string;
	pending: string;
	closedSetHeading: string;
}

function describeMapping(m: Mapping, emit: string, noEmit: string): string {
	return m.kind === "emit" ? `${emit} → ${m.proposes}` : noEmit;
}

export function BesoinProposesPanel({ labels }: { labels: Labels }) {
	const levels = useMemo(() => allLevels(), []);
	const [level, setLevel] = useState<string>(levels[0]);
	const [verdict, setVerdict] = useState<Mapping | null>(null);
	const [raw, setRaw] = useState<string>("saga");
	const [checkResult, setCheckResult] = useState<"valid" | "hard_error" | null>(
		null,
	);
	const [joinOk, setJoinOk] = useState<boolean | null>(null);

	function runMap() {
		setVerdict(levelToProposes(level));
	}

	function runJoin() {
		// Honest join: every Emit target ∈ closed set AND no silent alias (self-map only).
		const closed = new Set<string>(PROPOSES_KINDS);
		const selfKind: Record<string, string> = {
			control: "control",
			action: "action",
			operation: "operation",
			entity: "entity",
			product: "product",
			policy: "policy",
		};
		let ok = true;
		for (const l of allLevels()) {
			const m = levelToProposes(l);
			if (m.kind === "emit") {
				if (!m.proposes || !closed.has(m.proposes)) ok = false;
				if (selfKind[l] && m.proposes !== selfKind[l]) ok = false;
			} else if (selfKind[l]) {
				ok = false; // a self-kind level must Emit
			}
		}
		setJoinOk(ok);
	}

	function runCheck() {
		const r = levelToProposesChecked(raw);
		setCheckResult(r.ok ? "valid" : "hard_error");
	}

	function reset() {
		setLevel(levels[0]);
		setVerdict(null);
		setRaw("saga");
		setCheckResult(null);
		setJoinOk(null);
	}

	return (
		<div className="space-y-8">
			{/* The full declared table, always visible (the honest join made legible). */}
			<section
				aria-label={labels.tableHeading}
				data-testid="proposes-table"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.tableHeading}
				</h2>
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
							<th className="py-2 font-medium">{labels.colLevel}</th>
							<th className="py-2 font-medium">{labels.colMapping}</th>
						</tr>
					</thead>
					<tbody>
						{levels.map((l) => {
							const m = levelToProposes(l);
							return (
								<tr
									key={l}
									data-testid={`row-${l}`}
									className="border-b border-border/50"
								>
									<td className="py-2 font-mono text-foreground">{l}</td>
									<td className="py-2">
										<span
											data-testid={`mapping-${l}`}
											className={
												m.kind === "emit"
													? "inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-0.5 text-xs font-medium text-blue-600"
													: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{describeMapping(m, labels.emit, labels.noEmit)}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				<p className="mt-3 text-xs text-muted-foreground">
					{labels.closedSetHeading}: {PROPOSES_KINDS.join(" · ")}
				</p>
			</section>

			{/* Action 1 — map one level. */}
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.levelLabel}
						</span>
						<select
							data-testid="level-select"
							value={level}
							onChange={(e) => setLevel(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{levels.map((l) => (
								<option key={l} value={l}>
									{l}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						data-testid="map-cta"
						onClick={runMap}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.mapCta}
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
				<div className="mt-4">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.verdictHeading}
					</h3>
					<p data-testid="map-verdict" className="mt-1 text-sm text-foreground">
						{verdict
							? describeMapping(verdict, labels.emit, labels.noEmit)
							: labels.pending}
					</p>
				</div>
			</section>

			{/* Action 2 — prove the honest join + no alias. */}
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-center gap-4">
					<button
						type="button"
						data-testid="join-cta"
						onClick={runJoin}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.joinCta}
					</button>
					<div>
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.joinHeading}
						</h3>
						<p data-testid="join-verdict" className="mt-1 text-sm">
							{joinOk === null ? (
								<span className="text-muted-foreground">{labels.pending}</span>
							) : joinOk ? (
								<span className="font-medium text-blue-600">
									{labels.joinOk}
								</span>
							) : (
								<span className="font-medium text-destructive">
									{labels.joinFail}
								</span>
							)}
						</p>
					</div>
				</div>
			</section>

			{/* Action 3 — out-of-grammar is a hard error. */}
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.rawLabel}
						</span>
						<input
							data-testid="raw-input"
							value={raw}
							onChange={(e) => setRaw(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
					</label>
					<button
						type="button"
						data-testid="check-cta"
						onClick={runCheck}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.checkCta}
					</button>
					<div>
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.checkHeading}
						</h3>
						<p data-testid="check-verdict" className="mt-1 text-sm">
							{checkResult === null ? (
								<span className="text-muted-foreground">{labels.pending}</span>
							) : checkResult === "hard_error" ? (
								<span className="font-medium text-destructive">
									{labels.checkHardError}
								</span>
							) : (
								<span className="font-medium text-blue-600">
									{labels.checkValid}
								</span>
							)}
						</p>
					</div>
				</div>
			</section>

			{/* The two complementary closed sets, for legibility. */}
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-xl border border-border bg-muted/40 p-4">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.emit}
					</h3>
					<p
						data-testid="emit-levels"
						className="mt-1 font-mono text-sm text-foreground"
					>
						{emitLevels().join(" · ")}
					</p>
				</div>
				<div className="rounded-xl border border-border bg-muted/40 p-4">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.noEmit}
					</h3>
					<p
						data-testid="noemit-levels"
						className="mt-1 font-mono text-sm text-foreground"
					>
						{noEmitLevels().join(" · ")}
					</p>
				</div>
			</section>
		</div>
	);
}
