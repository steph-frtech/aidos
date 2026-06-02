import {
	apply,
	type BlockReason,
	type ChangeSet,
	edit,
	revert,
	type Status,
	stampReverted,
} from "@/lib/changeset";
import {
	ADD_ORDER_DISCOUNT,
	EXAMPLE_APPLIED_AT,
	INVERSE_ID,
	SPEC_WITHOUT_MIRROR,
} from "@/lib/changeset-data";

/**
 * ChangeSetPanel — the read-only /changeset panel (S20). It renders the KRD §98 "add order discount"
 * ChangeSet lifecycle: the atomic spec_delta + mirror_delta shown TOGETHER as one envelope (so it is
 * visible they cannot drift), a status badge (DRAFT/APPLIED/REVERTED), applied_at, and the revert
 * lineage (the source cs-A stamped REVERTED but still present, linked to the inverse cs-B via
 * reverts). Each lifecycle row's verdict is computed by the pure functions of lib/changeset.ts (the
 * projection of back/archive/changeset) — the incomplete-apply row renders RED with
 * INCOMPLETE_CHANGESET + how_to_fix; the edit-after-apply row renders RED with APPLIED_IS_IMMUTABLE.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): it renders the lifecycle the state machine
 * computes; a real apply/revert goes through the changeset MCP / the commit-gate (propose →
 * ChangeSet → approval), never a direct write from the screen. Server Component — the scenarios are
 * declared, the verdicts computed. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	envelopeHeading: string;
	envelopeIntro: string;
	specDeltaLabel: string;
	mirrorDeltaLabel: string;
	atomicNote: string;
	parentPhaseLabel: string;
	appliedAtLabel: string;
	lifecycleHeading: string;
	stepLabel: string;
	commandLabel: string;
	resultLabel: string;
	rowOpen: string;
	rowApply: string;
	rowApplyIncomplete: string;
	rowEdit: string;
	rowRevert: string;
	rowApplyInverse: string;
	rowDiscard: string;
	lineageHeading: string;
	lineageIntro: string;
	sourceLabel: string;
	inverseLabel: string;
	revertsLabel: string;
	stillPresentNote: string;
	statusDraft: string;
	statusApplied: string;
	statusReverted: string;
	blocked: string;
	howToFixLabel: string;
}

const statusBadge: Record<Status, string> = {
	DRAFT: "border-blue-600/40 bg-blue-600/10 text-blue-600 dark:text-blue-400",
	APPLIED:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	REVERTED:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function StatusBadge({ status, labels }: { status: Status; labels: Labels }) {
	const text =
		status === "DRAFT"
			? labels.statusDraft
			: status === "APPLIED"
				? labels.statusApplied
				: labels.statusReverted;
	return (
		<span
			data-testid={`status-${status}`}
			className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge[status]}`}
		>
			{text}
		</span>
	);
}

function DeltaCell({
	delta,
}: {
	delta: { kind: string; target: string } | null;
}) {
	if (delta === null) {
		return <span className="font-mono text-xs text-destructive">none</span>;
	}
	return (
		<span className="font-mono text-xs text-foreground">
			{delta.kind} {delta.target}
		</span>
	);
}

function BlockedCell({
	block,
	labels,
}: {
	block: BlockReason;
	labels: Labels;
}) {
	return (
		<div
			data-testid={`block-${block.code}`}
			className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive"
		>
			<div className="text-xs font-semibold">
				{labels.blocked} · {block.code}
			</div>
			<div className="mt-1 text-xs">{block.explanation}</div>
			<div className="mt-1 text-[11px]">
				{labels.howToFixLabel}:{" "}
				<span className="font-mono">{block.howToFix.join(", ")}</span>
			</div>
		</div>
	);
}

export function ChangeSetPanel({ labels }: { labels: Labels }) {
	// Compute the canonical lifecycle with the pure functions (the projection of the Go machine).
	const draft = ADD_ORDER_DISCOUNT;
	const applied = apply(draft, EXAMPLE_APPLIED_AT).applied;
	const incompleteBlock = apply(SPEC_WITHOUT_MIRROR, EXAMPLE_APPLIED_AT)
		.block as BlockReason;
	const editBlock = edit(applied) as BlockReason;
	const reverted = revert(applied, INVERSE_ID);
	const inverse = reverted.inverse as ChangeSet;
	const sourceAfterInverseApplied = stampReverted(applied);

	return (
		<div className="flex flex-col gap-10">
			{/* ── The atomic envelope card ── */}
			<section>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.envelopeHeading}
				</h2>
				<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
					{labels.envelopeIntro}
				</p>
				<div
					data-testid="envelope-card"
					className="mt-4 rounded-lg border border-border bg-card p-4"
				>
					<div className="flex items-center justify-between gap-4">
						<span className="font-mono text-sm font-medium text-foreground">
							{draft.label}
						</span>
						<StatusBadge status={draft.status} labels={labels} />
					</div>
					{/* spec + mirror shown TOGETHER — the atomic pair (they cannot drift). */}
					<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="rounded-md border border-border bg-background p-3">
							<div className="text-xs font-semibold text-muted-foreground">
								{labels.specDeltaLabel}
							</div>
							<div className="mt-1">
								<DeltaCell delta={draft.specDelta} />
							</div>
						</div>
						<div className="rounded-md border border-border bg-background p-3">
							<div className="text-xs font-semibold text-muted-foreground">
								{labels.mirrorDeltaLabel}
							</div>
							<div className="mt-1">
								<DeltaCell delta={draft.mirrorDelta} />
							</div>
						</div>
					</div>
					<p className="mt-3 text-xs italic text-muted-foreground">
						{labels.atomicNote}
					</p>
					<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
						<div>
							<dt className="text-muted-foreground">
								{labels.parentPhaseLabel}
							</dt>
							<dd className="font-mono text-foreground">{draft.parentPhase}</dd>
						</div>
					</dl>
				</div>
			</section>

			{/* ── The lifecycle table (state → command → result), computed per row ── */}
			<section>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.lifecycleHeading}
				</h2>
				<div className="mt-4 overflow-hidden rounded-lg border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
							<tr>
								<th className="px-4 py-2 font-medium">{labels.commandLabel}</th>
								<th className="px-4 py-2 font-medium">{labels.resultLabel}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowOpen}
								</td>
								<td className="px-4 py-3">
									<StatusBadge status="DRAFT" labels={labels} />
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowApply}
								</td>
								<td className="px-4 py-3">
									<div className="flex items-center gap-2">
										<StatusBadge status={applied.status} labels={labels} />
										<span
											data-testid="applied-at"
											className="font-mono text-xs text-muted-foreground"
										>
											{labels.appliedAtLabel}: {applied.appliedAt}
										</span>
									</div>
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowApplyIncomplete}
								</td>
								<td className="px-4 py-3">
									<BlockedCell block={incompleteBlock} labels={labels} />
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowEdit}
								</td>
								<td className="px-4 py-3">
									<BlockedCell block={editBlock} labels={labels} />
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowRevert}
								</td>
								<td className="px-4 py-3 text-xs text-muted-foreground">
									→{" "}
									<span className="font-mono text-foreground">
										{inverse.label}
									</span>{" "}
									(
									<StatusBadge status="DRAFT" labels={labels} />)
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowApplyInverse}
								</td>
								<td className="px-4 py-3">
									<StatusBadge
										status={sourceAfterInverseApplied.status}
										labels={labels}
									/>
								</td>
							</tr>
							<tr>
								<td className="px-4 py-3 font-mono text-xs">
									{labels.rowDiscard}
								</td>
								<td className="px-4 py-3 text-xs text-muted-foreground">
									— removed (no FAILED)
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			{/* ── The revert lineage (append-only inverse; source still present) ── */}
			<section>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.lineageHeading}
				</h2>
				<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
					{labels.lineageIntro}
				</p>
				<div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
					<div
						data-testid="lineage-source"
						className="flex-1 rounded-lg border border-border bg-card p-4"
					>
						<div className="text-xs font-semibold text-muted-foreground">
							{labels.sourceLabel}
						</div>
						<div className="mt-1 flex items-center justify-between gap-2">
							<span className="font-mono text-sm text-foreground">
								{applied.id}
							</span>
							<StatusBadge
								status={sourceAfterInverseApplied.status}
								labels={labels}
							/>
						</div>
						<p className="mt-2 text-[11px] italic text-muted-foreground">
							{labels.stillPresentNote}
						</p>
					</div>
					<div className="text-center font-mono text-xs text-muted-foreground sm:px-2">
						{labels.revertsLabel} ↑
					</div>
					<div
						data-testid="lineage-inverse"
						className="flex-1 rounded-lg border border-border bg-card p-4"
					>
						<div className="text-xs font-semibold text-muted-foreground">
							{labels.inverseLabel}
						</div>
						<div className="mt-1 flex items-center justify-between gap-2">
							<span className="font-mono text-sm text-foreground">
								{inverse.id}
							</span>
							<StatusBadge status="APPLIED" labels={labels} />
						</div>
						<div className="mt-2 font-mono text-[11px] text-muted-foreground">
							{labels.revertsLabel}: {inverse.reverts}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
