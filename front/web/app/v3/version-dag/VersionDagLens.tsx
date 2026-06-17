import type { LiveGraphView, LiveHeadsView } from "./actions";

/**
 * VersionDagLens — la lentille DAG de versions rendue EN PROPRE dans le shell V3 (ADR 0060) :
 * une lecture EN DIRECT de l'espace des versions du projet actif. Elle montre, stratifié par la
 * ligne de flottaison (§124, vérité humaine au-dessus / variantes évolutives en dessous) :
 *   - les TÊTES courantes du DAG (lues via `dag_heads`), surlignées ;
 *   - le DAG ENTIER (nœuds + arêtes ChangeSets, lus via `dag_get`), les têtes surlignées,
 *     les nœuds hors-tête estompés (l'ajout-seul rendu visible — une ligne abandonnée reste).
 * Chaque bloc porte un badge de source honnête (« en direct » / « démo », ADR 0074).
 *
 * Server Component (les vues sont passées déjà décodées par la page). LECTURE seule (le mur,
 * §2) : enregistrer un nœud/une arête passe par le rôle `aidos` via le MCP dag, jamais ici.
 * Thémé sur les tokens ADR 0010 (0 hex/zinc) ; bilingue via next-intl (ADR 0011, libellés
 * passés en props par la page serveur).
 */

interface Labels {
	headsHeading: string;
	headsIntro: string;
	headsEmpty: string;
	graphHeading: string;
	graphIntro: string;
	graphEmpty: string;
	aboveBand: string;
	belowBand: string;
	headBadge: string;
	edgesHeading: string;
	live: string;
	demo: string;
	liveHeadsTitle: string;
	demoHeadsTitle: string;
	liveGraphTitle: string;
	demoGraphTitle: string;
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
	source: "live" | "demo";
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

export function VersionDagLens({
	heads,
	graph,
	labels,
}: {
	heads: LiveHeadsView;
	graph: LiveGraphView;
	labels: Labels;
}) {
	const headSet = new Set(graph.heads);
	const above = graph.nodes.filter((n) => n.stratum === "above");
	const below = graph.nodes.filter((n) => n.stratum !== "above");

	const band = (title: string, nodes: typeof graph.nodes, key: string) =>
		nodes.length === 0 ? null : (
			<div className="space-y-2" data-testid={`v3-dag-band-${key}`}>
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{title}
				</p>
				<ul className="flex flex-wrap gap-2">
					{nodes.map((n) => {
						const isHead = headSet.has(n.id);
						return (
							<li
								key={n.id}
								data-head={isHead ? "true" : "false"}
								className={
									isHead
										? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-[0.7rem] font-semibold text-primary"
										: "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[0.7rem] text-muted-foreground"
								}
							>
								{n.id}
								{n.label ? (
									<span className="opacity-70">· {n.label}</span>
								) : null}
								{isHead ? (
									<span className="rounded-full bg-primary/20 px-1.5 text-[0.6rem]">
										{labels.headBadge}
									</span>
								) : null}
							</li>
						);
					})}
				</ul>
			</div>
		);

	return (
		<div className="space-y-6" data-testid="v3-version-dag-lens">
			{/* Les TÊTES courantes — lues en direct via dag_heads */}
			<section
				aria-label={labels.headsHeading}
				data-testid="v3-dag-heads"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.headsHeading}
					</h2>
					<SourceBadge
						source={heads.source}
						live={labels.live}
						demo={labels.demo}
						liveTitle={labels.liveHeadsTitle}
						demoTitle={labels.demoHeadsTitle}
						testid="v3-dag-heads-source"
					/>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.headsIntro}
				</p>
				{heads.heads.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.headsEmpty}</p>
				) : (
					<ul className="flex flex-wrap gap-2" data-testid="v3-dag-heads-list">
						{heads.heads.map((h) => (
							<li
								key={h}
								className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 font-mono text-[0.7rem] text-foreground"
							>
								{h}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Le DAG ENTIER — lu en direct via dag_get, stratifié par la ligne de flottaison */}
			<section
				aria-label={labels.graphHeading}
				data-testid="v3-dag-graph"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.graphHeading}
					</h2>
					<SourceBadge
						source={graph.source}
						live={labels.live}
						demo={labels.demo}
						liveTitle={labels.liveGraphTitle}
						demoTitle={labels.demoGraphTitle}
						testid="v3-dag-graph-source"
					/>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.graphIntro}
				</p>

				{graph.nodes.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.graphEmpty}</p>
				) : (
					<div className="space-y-4">
						{band(labels.aboveBand, above, "above")}
						{band(labels.belowBand, below, "below")}

						{graph.edges.length > 0 ? (
							<div className="space-y-2">
								<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									{labels.edgesHeading}
								</p>
								<ul className="space-y-1" data-testid="v3-dag-graph-edges">
									{graph.edges.map((e) => (
										<li
											key={`${e.from}->${e.to}`}
											className="font-mono text-[0.7rem] text-muted-foreground"
										>
											{e.from} → {e.to}{" "}
											<span className="opacity-70">({e.changeset})</span>
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				)}
			</section>
		</div>
	);
}
