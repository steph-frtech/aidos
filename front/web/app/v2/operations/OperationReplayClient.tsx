"use client";

import { useMachine } from "@xstate/react";
import { Background, type Edge, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import {
	type OperationFixture,
	stateGraph,
	verdict,
} from "@/lib/v2/operations";
import {
	initialReplayContext,
	operationReplayMachine,
} from "./OperationReplayMachine";

/**
 * WB2-12 — le REJOU d'une fixture Operation DSL, client-only (XState + React Flow + le twin pur).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — il EXÉCUTE :
 *   - AVANCER → joue le pas suivant (les events apparaissent un à un) ;
 *   - REJOUER TOUT → joue jusqu'au bout (l'état final + tous les events) ;
 *   - RECOMMENCER → revient à l'état initial.
 * Le GRAPHE D'ÉTATS (React Flow) montre les nœuds (états) et les arêtes (commandes) ; le nœud courant
 * est mis en évidence au fil du rejeu. Tout est DÉLÉGUÉ au twin pur (frames, stateGraph, verdict).
 *
 * LE MUR (§2) : rejouer une fixture n'écrit AUCUNE vérité — c'est une lecture du comportement.
 */

type Strings = Record<string, string>;

/** Le style d'un nœud selon son type d'état (thème ADR 0010, jamais de hex en dur via tokens CSS). */
function nodeStyle(kind: string, current: boolean): React.CSSProperties {
	const base: React.CSSProperties = {
		borderRadius: 8,
		padding: "6px 10px",
		fontSize: 11,
		fontFamily: "var(--font-geist-mono, monospace)",
		border: "1px solid var(--border)",
		background: "var(--card)",
		color: "var(--card-foreground)",
	};
	if (current) {
		base.border = "2px solid var(--primary)";
		base.background = "color-mix(in oklab, var(--primary) 12%, transparent)";
	}
	if (kind === "denied") {
		base.border = current
			? "2px solid var(--destructive)"
			: "1px solid var(--destructive)";
		base.color = "var(--destructive)";
	}
	return base;
}

export function OperationReplayClient({
	fixture,
	t,
}: {
	fixture: OperationFixture;
	t: Strings;
}) {
	const [state, send] = useMachine(operationReplayMachine, {
		input: initialReplayContext(fixture),
	});
	const { allFrames, cursor } = state.context;
	const frame = allFrames[cursor];
	const v = useMemo(() => verdict(fixture), [fixture]);
	const graph = useMemo(() => stateGraph(fixture), [fixture]);

	// Le graphe React Flow : les nœuds positionnés verticalement (déterministe), le nœud courant surligné.
	const nodes: Node[] = useMemo(
		() =>
			graph.nodes.map((n, i) => ({
				id: n.id,
				data: { label: n.label },
				position: { x: 0, y: i * 80 },
				style: nodeStyle(n.kind, n.id === `s${frame.index}`),
				type: "default",
			})),
		[graph.nodes, frame.index],
	);
	const edges: Edge[] = useMemo(
		() =>
			graph.edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				label: e.label,
				animated: false,
				style: { stroke: "var(--border)" },
			})),
		[graph.edges],
	);

	const finished = String(state.value) === "finished";

	return (
		<div data-testid="v2-op-replay" className="space-y-6">
			{/* l'en-tête de la fixture : état → commande → events attendus, + verdict */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<code
						data-testid="v2-op-fixture-id"
						className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground"
					>
						{fixture.id}
					</code>
					<span
						data-testid="v2-op-verdict"
						className={`inline-flex items-center rounded px-2.5 py-1 font-mono text-sm font-semibold ${
							v.pass
								? "bg-primary/10 text-primary"
								: "bg-destructive/10 text-destructive"
						}`}
					>
						{v.pass ? t.pass : t.fail}
					</span>
				</div>
				<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-xs text-muted-foreground">{t.givenLabel}</dt>
						<dd className="font-mono text-xs text-foreground break-all">
							{JSON.stringify(fixture.state)}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">{t.commandLabel}</dt>
						<dd className="font-mono text-xs text-foreground">
							{fixture.command.name} {JSON.stringify(fixture.command.input)}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{t.expectedEventsLabel}
						</dt>
						<dd className="font-mono text-xs text-foreground">
							{fixture.expectedEvents.length > 0
								? fixture.expectedEvents.join(", ")
								: "—"}
						</dd>
					</div>
				</div>
			</div>

			{/* l'état courant du rejeu (la frame) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<h3 className="text-sm font-semibold text-foreground">
						{t.currentStateHeading}
					</h3>
					<span
						data-testid="v2-op-machine-state"
						className="font-mono text-xs text-muted-foreground"
					>
						{t.stateLabel} : {String(state.value)}
					</span>
				</div>
				<p
					data-testid="v2-op-current-step"
					className="font-mono text-sm text-foreground"
				>
					{frame.index < 0
						? t.initState
						: `${frame.index + 1}/${allFrames.length - 1} · ${frame.command}`}{" "}
					<span
						data-state-kind={frame.kind}
						className={
							frame.kind === "denied"
								? "rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive"
								: "rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
						}
					>
						{frame.kind}
					</span>
				</p>

				{/* les events émis jusqu'ici (cumulés) */}
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">{t.emittedLabel}</p>
					<ol
						data-testid="v2-op-events"
						className="flex flex-wrap items-center gap-2"
					>
						{frame.events.length === 0 ? (
							<li
								data-testid="v2-op-no-events"
								className="text-xs text-muted-foreground"
							>
								—
							</li>
						) : (
							frame.events.map((ev, i) => (
								<li key={ev} className="flex items-center">
									<code
										data-testid={`v2-op-event-${i}`}
										className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary"
									>
										{ev}
									</code>
								</li>
							))
						)}
					</ol>
				</div>
			</div>

			{/* le GRAPHE D'ÉTATS (React Flow) */}
			<div className="rounded-xl border border-border bg-card p-2">
				<div data-testid="v2-op-graph" style={{ height: 360, width: "100%" }}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						fitView
						proOptions={{ hideAttribution: true }}
						nodesDraggable={false}
						nodesConnectable={false}
						elementsSelectable={false}
					>
						<Background />
					</ReactFlow>
				</div>
			</div>

			{/* les COMMANDES — transitions XState bound à des contrôles (action-capable) */}
			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="v2-op-step"
					disabled={finished}
					onClick={() => send({ type: "AVANCER" })}
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
				>
					{t.stepBtn}
				</button>
				<button
					type="button"
					data-testid="v2-op-replay-all"
					disabled={finished}
					onClick={() => send({ type: "REJOUER_TOUT" })}
					className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-40"
				>
					{t.replayAllBtn}
				</button>
				<button
					type="button"
					data-testid="v2-op-restart"
					onClick={() => send({ type: "RECOMMENCER" })}
					className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
				>
					{t.restartBtn}
				</button>
			</div>
		</div>
	);
}
