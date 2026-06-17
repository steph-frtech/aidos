"use client";

import { useState } from "react";
import type { Source } from "@/lib/gateway-sdk";
import type { KernelFacet } from "@/lib/v3/kernels-data";
import { shortHash } from "@/lib/v3/kernels-data";
import type { KernelTruthRow } from "./actions";

/**
 * KernelsClient — la lentille « vérités du noyau » rendue EN PROPRE dans le shell V3 (ADR 0060) :
 * la liste des vérités lues par hash (chacune avec sa source honnête « en direct » / « démo », ADR
 * 0074), un panneau de corps JSONB pour la vérité sélectionnée, et le contrôle GATÉ « proposer une
 * vérité » (le mur : aucune écriture depuis l'écran).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — on SÉLECTIONNE
 * une vérité (le corps s'affiche), et le contrôle « proposer » rend la capacité d'écriture VISIBLE
 * mais désactivée (le chemin gouverné propose → ChangeSet → /goal n'est pas atteint d'ici).
 *
 * DÉTERMINISME-FIRST : aucune logique ici — les vues sont décodées côté serveur (loadKernelsAction)
 * et passées en props ; ce composant ne fait que du rendu. LE MUR (§2) : lecture seule.
 */

interface Labels {
	listHeading: string;
	listIntro: string;
	empty: string;
	bodyHeading: string;
	bodyIntro: string;
	bodyEmpty: string;
	hashLabel: string;
	facetLabel: string;
	select: string;
	selected: string;
	matchOk: string;
	matchOff: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	wallNote: string;
	proposeBtn: string;
	proposeHint: string;
	facet: Record<KernelFacet, string>;
}

/** SourceBadge — le badge honnête « en direct » / « démo » (ADR 0074), thémé sur les tokens. */
function SourceBadge({
	source,
	live,
	demo,
	liveTitle,
	demoTitle,
	testid,
}: {
	source: Source;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	testid: string;
}) {
	const isLive = source === "live";
	return (
		<span
			data-testid={testid}
			data-source={source}
			className={
				isLive
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
			}
			title={isLive ? liveTitle : demoTitle}
		>
			<span
				aria-hidden="true"
				className={
					isLive
						? "size-1.5 rounded-full bg-primary"
						: "size-1.5 rounded-full bg-muted-foreground"
				}
			/>
			{isLive ? live : demo}
		</span>
	);
}

export function KernelsClient({
	rows,
	source,
	labels,
}: {
	rows: KernelTruthRow[];
	source: Source;
	labels: Labels;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(
		rows[0]?.id ?? null,
	);
	const selected = rows.find((r) => r.id === selectedId) ?? null;

	return (
		<div className="space-y-6" data-testid="v3-kernels-lens">
			{/* LA LISTE des vérités lues par hash — chacune avec sa source + sa facette. */}
			<section
				aria-label={labels.listHeading}
				data-testid="v3-kernels-list-section"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.listHeading}
					</h2>
					<SourceBadge
						source={source}
						live={labels.live}
						demo={labels.demo}
						liveTitle={labels.liveTitle}
						demoTitle={labels.demoTitle}
						testid="v3-kernels-source"
					/>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.listIntro}
				</p>

				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.empty}</p>
				) : (
					<ul className="space-y-2" data-testid="v3-kernels-list">
						{rows.map((row) => {
							const active = row.id === selectedId;
							return (
								<li key={row.id}>
									<button
										type="button"
										data-testid="v3-kernels-item"
										data-id={row.id}
										data-source={row.source}
										data-matches={row.bodyMatches ? "true" : "false"}
										aria-current={active ? "true" : undefined}
										onClick={() => setSelectedId(row.id)}
										className={[
											"flex w-full flex-col gap-1.5 rounded-lg border px-4 py-3 text-left transition-colors",
											active
												? "border-primary/40 bg-primary/5"
												: "border-border bg-background hover:bg-muted",
										].join(" ")}
									>
										<span className="flex flex-wrap items-center gap-2">
											<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
												{labels.facet[row.facet]}
											</span>
											<span className="font-medium text-foreground">
												{row.statement}
											</span>
										</span>
										<span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
											<span className="font-mono">
												{labels.hashLabel}: {shortHash(row.hash)}
											</span>
											<SourceBadge
												source={row.source}
												live={labels.live}
												demo={labels.demo}
												liveTitle={labels.liveTitle}
												demoTitle={labels.demoTitle}
												testid="v3-kernels-item-source"
											/>
											<span
												data-testid="v3-kernels-item-match"
												className={
													row.bodyMatches
														? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"
														: "inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
												}
											>
												{row.bodyMatches ? labels.matchOk : labels.matchOff}
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			{/* LE CORPS JSONB de la vérité sélectionnée — l'image adressée par contenu. */}
			<section
				aria-label={labels.bodyHeading}
				data-testid="v3-kernels-body-section"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.bodyHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.bodyIntro}
				</p>
				{selected === null ? (
					<p className="text-sm text-muted-foreground">{labels.bodyEmpty}</p>
				) : (
					<div className="space-y-2">
						<p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<span className="font-medium text-foreground">
								{labels.selected}:
							</span>
							<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
								{labels.facet[selected.facet]}
							</span>
							<span className="font-mono">
								{labels.hashLabel}: {shortHash(selected.hash)}
							</span>
						</p>
						<pre
							data-testid="v3-kernels-body"
							data-id={selected.id}
							className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs text-foreground"
						>
							{selected.body}
						</pre>
					</div>
				)}
			</section>

			{/* LE MUR (§2) : le contrôle d'écriture rendu VISIBLE mais désactivé (propose → ChangeSet). */}
			<section
				data-testid="v3-kernels-wall-section"
				className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-5"
			>
				<p className="text-sm text-primary" data-testid="v3-kernels-wall-note">
					{labels.wallNote}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="v3-kernels-propose"
						disabled
						title={labels.proposeHint}
						className="cursor-not-allowed rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground opacity-60"
					>
						{labels.proposeBtn}
					</button>
					<p className="text-xs text-muted-foreground">{labels.proposeHint}</p>
				</div>
			</section>
		</div>
	);
}
