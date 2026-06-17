"use client";

import type { CockpitSnapshot } from "@/lib/federation-cockpit";
import type { Source } from "@/lib/gateway-sdk";

/**
 * /v3/cellules — LA FÉDÉRATION DES CELLULES (bounded contexts §49) + la vague de rouge §51, client.
 *
 * L'écran NE FAIT PAS que lister : il MONTRE comment une règle transverse se propage. Une policy
 * globale exprimée UNE FOIS rougit exactement les cellules qui la violent (la « vague de rouge ») ;
 * une cellule contractée mais non-violante reste VERTE et continue de LIVRER pendant que sa
 * voisine est rouge (le §43 fractal : la stabilité locale livre même quand la fédération est en
 * flux). Chaque cellule porte ses DEUX cliquets — comportemental (livre-t-elle ?) + sa file de
 * réconciliation locale (sa RedWorkQueue). Les contrats inter-cellules sont les arêtes.
 *
 * DÉTERMINISME-FIRST : la donnée vient de l'instantané PUR (assembleSnapshot, composé sur la vague
 * lue EN DIRECT) — les cliquets, les contrats, la stabilité globale sont COMPUTÉS, jamais ici. Le
 * composant ne fait que rendre. LE MUR (§2) : aucune écriture-vérité ; geler un contrat reste
 * idée → miroir → /goal.
 */

type Labels = {
	cells: string;
	contracts: string;
	globalStable: string;
	globalUnstable: string;
	cellsHeading: string;
	cellsIntro: string;
	contractsHeading: string;
	contractsIntro: string;
	noContracts: string;
	honored: string;
	dishonored: string;
	ships: string;
	doesNotShip: string;
	reddened: string;
	green: string;
	queueHeading: string;
	queueEmpty: string;
	structuralHeading: string;
	structuralState: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	error: string;
};

export function CellulesClient({
	snapshot,
	source,
	error,
	labels,
}: {
	snapshot?: CockpitSnapshot;
	source?: Source;
	error?: string;
	labels: Labels;
}) {
	if (!snapshot) {
		return (
			<p
				data-testid="v3-cellules-error"
				className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
			>
				{labels.error}
				{error ? ` — ${error}` : ""}
			</p>
		);
	}

	const live = source === "live";
	const reddenedCount = snapshot.reddenedCells.length;
	const shippableCount = snapshot.shippableCells.length;

	return (
		<div data-testid="v3-cellules" className="space-y-6">
			{/* Le résumé de la fédération + le badge de source honnête (en direct / démo). */}
			<div
				data-testid="v3-cellules-summary"
				data-cell-count={snapshot.cells.length}
				data-contract-count={snapshot.contracts.length}
				data-reddened={reddenedCount}
				data-shippable={shippableCount}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{snapshot.cells.length} {labels.cells}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{snapshot.contracts.length} {labels.contracts}
				</span>
				<span
					data-testid="v3-cellules-global"
					data-stable={snapshot.globallyStable}
					className={[
						"ml-auto rounded-md px-2 py-1 text-xs font-medium",
						snapshot.globallyStable
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground",
					].join(" ")}
				>
					{snapshot.globallyStable
						? labels.globalStable
						: labels.globalUnstable}
				</span>
				<span
					data-testid="v3-cellules-source"
					data-source={source ?? "demo"}
					title={live ? labels.liveTitle : labels.demoTitle}
					className={[
						"rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide",
						live
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-border bg-muted text-muted-foreground",
					].join(" ")}
				>
					{live ? labels.live : labels.demo}
				</span>
			</div>

			{/* LE GRAPHE DES CELLULES : chaque cellule, son cliquet comportemental, sa vague, sa file. */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{labels.cellsHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{labels.cellsIntro}
					</p>
				</div>
				<ul
					data-testid="v3-cellules-cells"
					className="grid gap-3 sm:grid-cols-2"
				>
					{snapshot.cells.map((c) => (
						<li
							key={c.cell}
							data-testid={`v3-cellules-cell-${c.cell}`}
							data-reddened={c.reddened}
							data-ships={c.ships}
							className={[
								"space-y-2 rounded-xl border bg-card p-4",
								c.reddened ? "border-destructive/40" : "border-border",
							].join(" ")}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-mono text-sm font-semibold text-foreground">
									{c.cell}
								</span>
								<span
									className={[
										"rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
										c.ships
											? "bg-primary/10 text-primary"
											: "bg-destructive/10 text-destructive",
									].join(" ")}
								>
									{c.ships ? labels.ships : labels.doesNotShip}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<span
									className={[
										"rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
										c.reddened
											? "border-destructive/40 bg-destructive/5 text-destructive"
											: "border-primary/30 bg-primary/5 text-primary",
									].join(" ")}
								>
									{c.reddened ? labels.reddened : labels.green}
								</span>
								<span className="font-mono text-[10px] text-muted-foreground">
									{c.behavioural}
								</span>
							</div>
							{/* La file de réconciliation LOCALE de la cellule (sa RedWorkQueue, §51). */}
							<div className="space-y-1">
								<h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
									{labels.queueHeading}
								</h3>
								{c.queue.length === 0 ? (
									<p
										data-testid={`v3-cellules-queue-empty-${c.cell}`}
										className="text-[11px] text-muted-foreground/60"
									>
										{labels.queueEmpty}
									</p>
								) : (
									<ul className="space-y-0.5 font-mono text-[11px] text-foreground">
										{c.queue.map((q) => (
											<li key={q} className="break-all">
												{q}
											</li>
										))}
									</ul>
								)}
							</div>
						</li>
					))}
				</ul>
			</section>

			{/* LES CONTRATS inter-cellules (les arêtes de la fédération, §49). */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{labels.contractsHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{labels.contractsIntro}
					</p>
				</div>
				{snapshot.contracts.length === 0 ? (
					<p
						data-testid="v3-cellules-no-contracts"
						className="text-xs text-muted-foreground"
					>
						{labels.noContracts}
					</p>
				) : (
					<ul
						data-testid="v3-cellules-contracts"
						className="space-y-1 font-mono text-xs"
					>
						{snapshot.contracts.map((e) => (
							<li
								key={`${e.a}->${e.b}`}
								data-testid={`v3-cellules-contract-${e.a}-${e.b}`}
								className="flex items-center gap-2 text-foreground"
							>
								<span className="text-muted-foreground">{e.a}</span>
								<span className="text-primary">⇄</span>
								<span className="text-muted-foreground">{e.b}</span>
								<span
									className={[
										"ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
										e.honored
											? "bg-primary/10 text-primary"
											: "bg-destructive/10 text-destructive",
									].join(" ")}
								>
									{e.honored ? labels.honored : labels.dishonored}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* LE CLIQUET STRUCTUREL (le second cliquet §47) sur la coupe inter-cellules. */}
			<section
				data-testid="v3-cellules-structural"
				className="space-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{labels.structuralHeading}
				</h2>
				<p className="text-foreground">
					{labels.structuralState}{" "}
					<span className="font-mono text-primary">
						{snapshot.structural.state}
					</span>
				</p>
			</section>
		</div>
	);
}
