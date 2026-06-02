import type { AuthorityGraph } from "@/lib/authority";

/**
 * AuthorityGraphCard — the read-only header card of the /authorities panel (S16). It names
 * the checkout-regulatory graph (KRD §13.8): its domain, its truth_kind, and the three role
 * lists (approvers / veto / escalation) as labelled chips.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the graph; it triggers no operation
 * and writes no truth (the wall — truth-writes / reauthorizes go via propose → ChangeSet →
 * approval, SemanticDiff change_type `reauthorize`).
 */

interface Labels {
	domainLabel: string;
	truthKindLabel: string;
	approversLabel: string;
	vetoLabel: string;
	escalationLabel: string;
}

function RoleList({
	heading,
	roles,
	tone,
	testid,
}: {
	heading: string;
	roles: string[];
	tone: "approver" | "veto" | "escalation";
	testid: string;
}) {
	const toneClass: Record<typeof tone, string> = {
		approver:
			"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
		veto: "border-destructive/40 bg-destructive/10 text-destructive",
		escalation:
			"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	};
	return (
		<div className="space-y-1.5" data-testid={testid}>
			<h3 className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
				{heading}
			</h3>
			<div className="flex flex-wrap gap-1.5">
				{roles.length === 0 ? (
					<span className="font-mono text-xs text-muted-foreground">—</span>
				) : (
					roles.map((r) => (
						<span
							key={r}
							data-testid="role-chip"
							data-role={r}
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs ${toneClass[tone]}`}
						>
							{r}
						</span>
					))
				)}
			</div>
		</div>
	);
}

export function AuthorityGraphCard({
	graph,
	labels,
}: {
	graph: AuthorityGraph;
	labels: Labels;
}) {
	return (
		<div
			data-testid="authority-graph-card"
			className="space-y-5 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap gap-2">
				<span
					data-testid="graph-domain"
					className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
				>
					<span className="text-muted-foreground">{labels.domainLabel}:</span>
					<span>{graph.domain}</span>
				</span>
				<span
					data-testid="graph-truth-kind"
					className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
				>
					<span className="text-muted-foreground">
						{labels.truthKindLabel}:
					</span>
					<span>{graph.truthKind}</span>
				</span>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<RoleList
					heading={labels.approversLabel}
					roles={graph.approvers}
					tone="approver"
					testid="approvers"
				/>
				<RoleList
					heading={labels.vetoLabel}
					roles={graph.veto}
					tone="veto"
					testid="veto"
				/>
				<RoleList
					heading={labels.escalationLabel}
					roles={graph.escalation}
					tone="escalation"
					testid="escalation"
				/>
			</div>
		</div>
	);
}
