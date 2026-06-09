"use client";

import { useMemo, useState } from "react";
import {
	type AccountReleasePack,
	assemble,
	CLI_SURFACE,
} from "@/lib/account-release";
import { ACCOUNT_SCENARIOS } from "@/lib/account-release-data";

export interface AccountReleaseLabels {
	scenarioLabel: string;
	assembleButton: string;
	packTitle: string;
	accountLabel: string;
	projectsTitle: string;
	realBadge: string;
	demoBadge: string;
	cliSurfaceTitle: string;
	coreBadge: string;
	gatewayBadge: string;
	routesTitle: string;
	docsTitle: string;
	testInventoryTitle: string;
	changelogTitle: string;
	knownLimitsTitle: string;
	nextTierTitle: string;
	currentLabel: string;
	nextLabel: string;
	allGreenBadge: string;
	assembleOnlyNote: string;
	emptyNote: string;
	scenarioStarter: string;
	scenarioKernel: string;
	scenarioEmpty: string;
}

const ASSEMBLED_AT = 1_700_000_000;

export function AccountReleasePanel({
	labels,
}: {
	labels: AccountReleaseLabels;
}) {
	const [scenarioId, setScenarioId] = useState(ACCOUNT_SCENARIOS[0].id);
	const [pack, setPack] = useState<AccountReleasePack | null>(null);

	const scenario = useMemo(
		() =>
			ACCOUNT_SCENARIOS.find((s) => s.id === scenarioId) ??
			ACCOUNT_SCENARIOS[0],
		[scenarioId],
	);

	// The ACTION: assemble the per-account release pack by running the SAME pure twin
	// the Go package runs. Assemble-only — it installs nothing, ships nothing, writes no
	// truth (the wall). The button BINDS this control to the assemble operation.
	function onAssemble() {
		setPack(assemble(scenario.view, ASSEMBLED_AT));
	}

	function scenarioLabel(key: string): string {
		const m: Record<string, string> = {
			scenarioStarter: labels.scenarioStarter,
			scenarioKernel: labels.scenarioKernel,
			scenarioEmpty: labels.scenarioEmpty,
		};
		return m[key] ?? key;
	}

	return (
		<div className="mt-8 space-y-6">
			<div className="flex flex-wrap items-end gap-3">
				<div>
					<label
						htmlFor="ar-scenario"
						className="block text-sm font-medium text-foreground"
					>
						{labels.scenarioLabel}
					</label>
					<select
						id="ar-scenario"
						data-testid="ar-scenario"
						value={scenarioId}
						onChange={(e) => {
							setScenarioId(e.target.value);
							setPack(null);
						}}
						className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
					>
						{ACCOUNT_SCENARIOS.map((s) => (
							<option key={s.id} value={s.id}>
								{scenarioLabel(s.labelKey)}
							</option>
						))}
					</select>
				</div>
				<button
					type="button"
					data-testid="ar-assemble"
					onClick={onAssemble}
					className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
				>
					{labels.assembleButton}
				</button>
			</div>

			<p className="text-xs text-muted-foreground">{labels.assembleOnlyNote}</p>

			{pack && (
				<div data-testid="ar-pack" className="space-y-6">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.packTitle}
					</h2>
					<div className="text-sm text-foreground">
						<span className="font-medium">{labels.accountLabel} : </span>
						<code
							data-testid="ar-account"
							className="rounded bg-muted px-1.5 py-0.5"
						>
							{pack.account}
						</code>
						<span className="ml-3 text-muted-foreground">
							id: <code className="text-xs">{pack.id}</code>
						</span>
					</div>

					{/* PROJECTS — each with its HONEST demo-vs-real status. */}
					<section>
						<h3 className="text-sm font-semibold text-foreground">
							{labels.projectsTitle}
						</h3>
						{pack.projects.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{labels.emptyNote}
							</p>
						) : (
							<ul className="mt-2 space-y-1">
								{pack.projects.map((p) => (
									<li
										key={p.id}
										data-testid={`ar-project-${p.id}`}
										className="flex items-center gap-2 text-sm text-foreground"
									>
										<code className="rounded bg-muted px-1.5 py-0.5">
											{p.id}
										</code>
										<span>{p.name}</span>
										<span
											data-testid={`ar-status-${p.id}`}
											className={
												p.status === "real"
													? "rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
													: "rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{p.status === "real"
												? labels.realBadge
												: labels.demoBadge}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>

					{/* CLI SURFACE — the completed surface (core + S117 gateway verbs). */}
					<section>
						<h3 className="text-sm font-semibold text-foreground">
							{labels.cliSurfaceTitle}
						</h3>
						<ul className="mt-2 flex flex-wrap gap-2">
							{CLI_SURFACE.map((v) => (
								<li
									key={v.name}
									data-testid={`ar-verb-${v.name}`}
									className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground"
								>
									<code>aidos {v.name}</code>
									<span
										className={
											v.kind === "gateway"
												? "rounded bg-primary/10 px-1 text-primary"
												: "rounded bg-muted px-1 text-muted-foreground"
										}
									>
										{v.kind === "gateway"
											? labels.gatewayBadge
											: labels.coreBadge}
									</span>
								</li>
							))}
						</ul>
					</section>

					{/* KNOWN LIMITS — honest plan caveats, enumerated never editorialised. */}
					<section>
						<h3 className="text-sm font-semibold text-foreground">
							{labels.knownLimitsTitle}
						</h3>
						{pack.knownLimits.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{labels.emptyNote}
							</p>
						) : (
							<ul className="mt-2 space-y-1">
								{pack.knownLimits.map((l) => (
									<li
										key={l.ref}
										data-testid={`ar-limit-${l.ref}`}
										className="text-sm text-foreground"
									>
										<code className="rounded bg-muted px-1.5 py-0.5">
											{l.ref}
										</code>{" "}
										{l.description}
									</li>
								))}
							</ul>
						)}
					</section>

					{/* DOCS + TEST INVENTORY + CHANGELOG — the rest of the honest inventory. */}
					<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								{labels.docsTitle}
							</h3>
							<p className="text-sm text-muted-foreground">
								{pack.docsIndex.length}
							</p>
						</div>
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								{labels.testInventoryTitle}
							</h3>
							<p
								data-testid="ar-test-count"
								className="text-sm text-muted-foreground"
							>
								{pack.testInventory.length}
							</p>
						</div>
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								{labels.changelogTitle}
							</h3>
							<p className="text-sm text-muted-foreground">
								{pack.changelog.length}
							</p>
						</div>
					</section>

					{/* NEXT TIER — the adoption ladder advice (advises, installs nothing). */}
					<section className="rounded-md border border-border p-4">
						<h3 className="text-sm font-semibold text-foreground">
							{labels.nextTierTitle}
						</h3>
						<p className="mt-1 text-sm text-foreground">
							<span className="font-medium">{labels.currentLabel} : </span>
							<code
								data-testid="ar-current"
								className="rounded bg-muted px-1.5 py-0.5"
							>
								{pack.adoptionPlan.current || "—"}
							</code>
						</p>
						{pack.adoptionPlan.allSatisfied ? (
							<p
								data-testid="ar-all-green"
								className="mt-1 text-sm font-medium text-primary"
							>
								{labels.allGreenBadge}
							</p>
						) : (
							<p className="mt-1 text-sm text-foreground">
								<span className="font-medium">{labels.nextLabel} : </span>
								<code
									data-testid="ar-next"
									className="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
								>
									{pack.adoptionPlan.next}
								</code>
							</p>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
