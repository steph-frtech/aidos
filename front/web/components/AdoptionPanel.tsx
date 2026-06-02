"use client";

import { useMemo, useState } from "react";
import {
	type AdoptionStage,
	assemble,
	type Capability,
	plan,
	STAGES,
} from "@/lib/adoption";
import { SCENARIOS } from "@/lib/adoption-data";

export interface AdoptionLabels {
	scenarioLabel: string;
	ladderTitle: string;
	packTitle: string;
	currentBadge: string;
	nextBadge: string;
	satisfiedBadge: string;
	blockedBadge: string;
	requiresLabel: string;
	grantsLabel: string;
	gapLabel: string;
	noQdNote: string;
	cliSurfaceTitle: string;
	routesTitle: string;
	demoTitle: string;
	docsTitle: string;
	testInventoryTitle: string;
	changelogTitle: string;
	knownLimitsTitle: string;
	emptyPack: string;
	assembleOnlyNote: string;
	allGreenBadge: string;
	scenarioFloor: string;
	scenarioT1Cell: string;
	scenarioT2Reality: string;
	scenarioT4Blocked: string;
	scenarioEmpty: string;
}

const STAGE_TITLE: Record<AdoptionStage, string> = {
	T0: "T0 — tests + mutation",
	T1: "T1 — une cellule KRD",
	T2: "T2 — kernel + mirror",
	T3: "T3 — ContextGraph + Memory",
	T4: "T4 — evolve + QualityDiversity",
};

function CapList({ caps }: { caps: Capability[] }) {
	if (caps.length === 0)
		return <span className="text-muted-foreground">—</span>;
	return (
		<span className="flex flex-wrap gap-1">
			{caps.map((c) => (
				<code
					key={c}
					className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
				>
					{c}
				</code>
			))}
		</span>
	);
}

export function AdoptionPanel({ labels }: { labels: AdoptionLabels }) {
	const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
	const scenario = useMemo(
		() => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
		[scenarioId],
	);
	// Compute the SAME pure twin the Go package runs, live, on the selected scenario.
	const p = useMemo(() => plan(scenario.capabilities), [scenario]);
	const pack = useMemo(
		() => assemble(scenario.view, scenario.capabilities, 1_700_000_000),
		[scenario],
	);

	const isEmptyPack =
		pack.cliSurface.length === 0 &&
		pack.workbenchRoutes.length === 0 &&
		pack.testInventory.length === 0 &&
		pack.changelog.length === 0 &&
		pack.knownLimits.length === 0;

	return (
		<div className="mt-8">
			<label
				htmlFor="ad-scenario"
				className="block text-sm font-medium text-foreground"
			>
				{labels.scenarioLabel}
			</label>
			<select
				id="ad-scenario"
				data-testid="scenario-select"
				value={scenarioId}
				onChange={(e) => setScenarioId(e.target.value)}
				className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
			>
				{SCENARIOS.map((s) => (
					<option key={s.id} value={s.id}>
						{labels[s.titleKey as keyof AdoptionLabels]}
					</option>
				))}
			</select>

			{/* ── The adoption ladder ──────────────────────────────────────── */}
			<section data-testid="adoption-ladder" className="mt-8">
				<h2 className="text-lg font-semibold text-foreground">
					{labels.ladderTitle}
				</h2>
				<ol className="mt-4 space-y-3">
					{STAGES.map((s) => {
						const ts = p.tiers.find((t) => t.stage === s)!;
						const isCurrent = p.current === s;
						const isNext = p.next === s;
						return (
							<li
								key={s}
								data-testid={`tier-${s}`}
								data-satisfiable={ts.satisfiable ? "true" : "false"}
								className={`rounded-lg border p-4 ${
									isCurrent
										? "border-blue-600 bg-blue-600/5 dark:border-blue-400"
										: "border-border bg-card"
								}`}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<h3 className="text-sm font-semibold text-foreground">
										{STAGE_TITLE[s]}
									</h3>
									<span className="flex gap-1">
										{isCurrent && (
											<span
												data-testid={`current-${s}`}
												className="inline-flex items-center rounded-full border border-blue-600 bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
											>
												{labels.currentBadge}
											</span>
										)}
										{isNext && (
											<span
												data-testid={`next-${s}`}
												className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
											>
												{labels.nextBadge}
											</span>
										)}
										<span
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
												ts.satisfiable
													? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
													: "border-destructive/30 bg-destructive/10 text-destructive"
											}`}
										>
											{ts.satisfiable
												? labels.satisfiedBadge
												: labels.blockedBadge}
										</span>
									</span>
								</div>

								<div className="mt-2 grid gap-1 text-sm">
									<div className="flex items-baseline gap-2">
										<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											{labels.requiresLabel}
										</span>
										<CapList caps={ts.requires} />
									</div>
									<div className="flex items-baseline gap-2">
										<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											{labels.grantsLabel}
										</span>
										<CapList caps={ts.grants} />
									</div>
								</div>

								{/* The three load-bearing facts, made visible. */}
								{s === "T1" && (
									<p
										data-testid="t1-no-qd"
										className="mt-2 text-xs text-emerald-600 dark:text-emerald-400"
									>
										{labels.noQdNote}
									</p>
								)}
								{ts.gaps.length > 0 && (
									<ul className="mt-2 space-y-1">
										{ts.gaps.map((g) => (
											<li
												key={g.missing}
												data-testid={`gap-${s}-${g.missing}`}
												className="text-xs text-destructive"
											>
												{labels.gapLabel}: <code>{g.missing}</code> — {g.reason}
											</li>
										))}
									</ul>
								)}
							</li>
						);
					})}
				</ol>
				{p.allSatisfied && (
					<p
						data-testid="all-green"
						className="mt-3 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
					>
						{labels.allGreenBadge}
					</p>
				)}
			</section>

			{/* ── The release pack (assemble only — no install/ship/publish) ── */}
			<section data-testid="release-pack" className="mt-10">
				<h2 className="text-lg font-semibold text-foreground">
					{labels.packTitle}
				</h2>

				{isEmptyPack ? (
					<p
						data-testid="empty-pack"
						className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
					>
						{labels.emptyPack}
					</p>
				) : (
					<div className="mt-4 grid gap-6 lg:grid-cols-2">
						<PackList
							testid="pack-cli"
							title={labels.cliSurfaceTitle}
							items={pack.cliSurface.map((c) => ({
								key: c.name,
								primary: c.name,
								secondary: c.summary,
							}))}
						/>
						<PackList
							testid="pack-routes"
							title={labels.routesTitle}
							items={pack.workbenchRoutes.map((r) => ({
								key: r.path,
								primary: r.path,
								secondary: r.title,
							}))}
						/>
						<PackList
							testid="pack-tests"
							title={labels.testInventoryTitle}
							items={pack.testInventory.map((m) => ({
								key: m.id,
								primary: m.id,
								secondary: m.reflects,
							}))}
						/>
						<PackList
							testid="pack-changelog"
							title={labels.changelogTitle}
							items={pack.changelog.map((c) => ({
								key: c.ref,
								primary: c.ref,
								secondary: c.summary,
							}))}
						/>
						<PackList
							testid="pack-docs"
							title={labels.docsTitle}
							items={pack.docsIndex.map((d) => ({
								key: d.slug,
								primary: d.slug,
								secondary: d.title,
							}))}
						/>
						<PackList
							testid="pack-limits"
							title={labels.knownLimitsTitle}
							items={pack.knownLimits.map((l) => ({
								key: l.ref,
								primary: l.ref,
								secondary: l.description,
							}))}
						/>
						{pack.demoCell.ref && (
							<div data-testid="pack-demo" className="lg:col-span-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{labels.demoTitle}
								</h3>
								<p className="mt-1 text-sm text-foreground">
									<code className="text-blue-600 dark:text-blue-400">
										{pack.demoCell.ref}
									</code>{" "}
									<span className="text-muted-foreground">
										{pack.demoCell.title}
									</span>
								</p>
							</div>
						)}
					</div>
				)}

				<p
					data-testid="assemble-only-note"
					className="mt-6 text-xs text-muted-foreground"
				>
					{labels.assembleOnlyNote}
				</p>
			</section>
		</div>
	);
}

function PackList({
	testid,
	title,
	items,
}: {
	testid: string;
	title: string;
	items: { key: string; primary: string; secondary?: string }[];
}) {
	return (
		<div data-testid={testid}>
			<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{title} <span className="text-foreground">({items.length})</span>
			</h3>
			{items.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">—</p>
			) : (
				<ul className="mt-2 space-y-1">
					{items.map((it) => (
						<li
							key={it.key}
							className="rounded border border-border bg-card px-3 py-1.5 text-sm"
						>
							<code className="font-medium text-foreground">{it.primary}</code>
							{it.secondary && (
								<span className="ml-2 text-muted-foreground">
									{it.secondary}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
