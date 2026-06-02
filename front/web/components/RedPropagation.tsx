import {
	activationOf,
	fireParent,
	type Verdict,
	validateWeight,
	type Weight,
} from "@/lib/red-propagation";
import {
	ADMISSION_ROWS,
	buildCartGraph,
	CART_EDGES,
	CART_PARENT_ID,
	FIRE_ROWS,
} from "@/lib/red-propagation-data";

/**
 * RedPropagation — the read-only /red-propagation panel (S19). It renders the KRD §114 "cart"
 * composition (view "cart" composes checkout-button{load-bearing}, promo-field{load-bearing},
 * help-link{cosmetic}, declared activation_threshold 1): each composes edge drawn by its weight
 * thickness (cosmetic thin, load-bearing thick, critical thickest — §2362 "épaisseur du lien"),
 * the parent threshold, a live FIRE table (the §114 changed-set rows with computed activation +
 * aggregate verdict via the pure fireParent of lib/red-propagation.ts, the projection of
 * back/kernel/propagation), and an ADMISSION table (validateWeight verdicts).
 *
 * With the canonical example: the help-link (cosmetic) change row shows the cart aggregate GREEN
 * (activation 0 < threshold 1); the checkout-button (load-bearing) change row shows it RED
 * (activation 1 ≥ 1, emergent invariant re-opened); the critical-without-evidence declaration row
 * shows REJECTED with CRITICAL_WEIGHT_WITHOUT_EVIDENCE + how_to_fix; the critical-with-evidence row
 * shows ACCEPTED.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the fire/admission verdicts computed by the
 * pure functions; it writes no truth (the wall — weights/thresholds go via propose → ChangeSet →
 * approval). Server Component — no client state needed (the scenarios are declared, the verdicts
 * computed). Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	treeHeading: string;
	thresholdLabel: string;
	weightLabel: string;
	weightCosmetic: string;
	weightLoadBearing: string;
	weightCritical: string;
	fireHeading: string;
	fireScenario: string;
	fireActivation: string;
	fireVerdict: string;
	fireCosmetic: string;
	fireLoadBearing: string;
	fireNone: string;
	fireMixed: string;
	admissionHeading: string;
	admissionWeight: string;
	admissionEvidence: string;
	admissionResult: string;
	admissionReason: string;
	admissionAccepted: string;
	admissionRejected: string;
	admissionNoEvidence: string;
	badgeGreen: string;
	badgeRed: string;
}

const verdictBadge: Record<Verdict, string> = {
	GREEN:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	RED: "border-destructive/40 bg-destructive/10 text-destructive",
};

// §2362 — link thickness encodes the declared weight (cosmetic thin → critical thickest).
const weightThickness: Record<Weight, string> = {
	cosmetic: "h-0.5",
	"load-bearing": "h-1.5",
	critical: "h-2.5",
};

export function RedPropagation({ labels }: { labels: Labels }) {
	const weightText: Record<Weight, string> = {
		cosmetic: labels.weightCosmetic,
		"load-bearing": labels.weightLoadBearing,
		critical: labels.weightCritical,
	};
	const fireLabel = {
		fireCosmetic: labels.fireCosmetic,
		fireLoadBearing: labels.fireLoadBearing,
		fireNone: labels.fireNone,
		fireMixed: labels.fireMixed,
	} as const;

	return (
		<div className="space-y-8">
			{/* The weighted composition tree — each composes edge drawn by its weight thickness */}
			<section aria-label={labels.treeHeading} className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.treeHeading}
				</h2>
				<div
					data-testid="cart-parent"
					data-threshold="1"
					className="rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<span className="font-mono text-sm font-semibold text-foreground">
							view: {CART_PARENT_ID}@v1
						</span>
						<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
							{labels.thresholdLabel}: 1
						</span>
					</div>
					<ul className="mt-4 space-y-3">
						{CART_EDGES.map((edge) => (
							<li
								key={edge.child.id}
								data-testid="composes-edge"
								data-child={edge.child.id}
								data-weight={edge.weight}
								className="flex flex-wrap items-center gap-3"
							>
								<span
									aria-hidden
									className={`w-12 rounded-full bg-foreground/70 ${weightThickness[edge.weight]}`}
								/>
								<span className="font-mono text-xs text-card-foreground">
									{edge.child.id}@{edge.child.version}
								</span>
								<span
									data-testid="edge-weight"
									data-weight={edge.weight}
									className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
								>
									{weightText[edge.weight]}
								</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* The fire table — §114 changed-set rows with computed activation + aggregate verdict */}
			<section aria-label={labels.fireHeading} className="space-y-2">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.fireHeading}
				</h2>
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border bg-muted/40 text-[0.7rem] tracking-wider text-muted-foreground uppercase">
								<th className="px-4 py-3 font-medium">{labels.fireScenario}</th>
								<th className="px-4 py-3 font-medium">
									{labels.fireActivation}
								</th>
								<th className="px-4 py-3 font-medium">
									{labels.thresholdLabel}
								</th>
								<th className="px-4 py-3 font-medium">{labels.fireVerdict}</th>
							</tr>
						</thead>
						<tbody>
							{FIRE_ROWS.map((row) => {
								const graph = buildCartGraph(row.changed);
								const act = activationOf(graph, CART_PARENT_ID);
								const verdict = fireParent(graph, CART_PARENT_ID);
								return (
									<tr
										key={row.id}
										data-testid="fire-row"
										data-row={row.id}
										data-verdict={verdict}
										className="border-b border-border align-top last:border-0"
									>
										<td className="px-4 py-3 text-card-foreground">
											{fireLabel[row.labelKey]}
										</td>
										<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
											{act}
										</td>
										<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
											1
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${verdictBadge[verdict]}`}
											>
												{verdict === "GREEN"
													? labels.badgeGreen
													: labels.badgeRed}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{/* The admission table — validateWeight verdicts (critical needs evidence) */}
			<section aria-label={labels.admissionHeading} className="space-y-2">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.admissionHeading}
				</h2>
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border bg-muted/40 text-[0.7rem] tracking-wider text-muted-foreground uppercase">
								<th className="px-4 py-3 font-medium">
									{labels.admissionWeight}
								</th>
								<th className="px-4 py-3 font-medium">
									{labels.admissionEvidence}
								</th>
								<th className="px-4 py-3 font-medium">
									{labels.admissionResult}
								</th>
								<th className="px-4 py-3 font-medium">
									{labels.admissionReason}
								</th>
							</tr>
						</thead>
						<tbody>
							{ADMISSION_ROWS.map((row) => {
								const br = validateWeight(row);
								const accepted = br === null;
								return (
									<tr
										key={row.id}
										data-testid="admission-row"
										data-row={row.id}
										data-result={accepted ? "accepted" : "rejected"}
										data-code={br?.code ?? ""}
										className="border-b border-border align-top last:border-0"
									>
										<td className="px-4 py-3">
											<span
												data-testid="admission-weight"
												data-weight={row.weight}
												className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
											>
												{weightText[row.weight]}
											</span>
										</td>
										<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
											{row.weightEvidence ?? labels.admissionNoEvidence}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${
													accepted ? verdictBadge.GREEN : verdictBadge.RED
												}`}
											>
												{accepted
													? labels.admissionAccepted
													: labels.admissionRejected}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{br ? (
												<div className="space-y-1">
													<span
														data-testid="block-code"
														className="font-mono text-destructive"
													>
														{br.code}
													</span>
													<div className="flex flex-wrap gap-1.5">
														{br.howToFix.map((fix) => (
															<span
																key={fix}
																data-testid="how-to-fix"
																className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground"
															>
																{fix}
															</span>
														))}
													</div>
												</div>
											) : (
												<span>—</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
