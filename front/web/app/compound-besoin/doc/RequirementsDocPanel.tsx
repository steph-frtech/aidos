"use client";

import { useState } from "react";
import {
	type DocNode,
	emitRequirementsDoc,
	type RequirementsDoc,
} from "@/lib/besoin-requirements-doc";
import type { Edge } from "@/lib/red-backlog";

/**
 * RequirementsDocPanel — the EL19 /compound-besoin/doc generator. It EXECUTES EmitRequirementsDoc
 * (lib/besoin-requirements-doc.ts) over a fixed demo BesoinGraph (product → journey → view → entity,
 * the journey/view being NoEmit anchors) and renders the deterministic markdown + the topo-sorted
 * backlog of Ideas. The graph_hash is stable: re-generating produces byte-identical output (the
 * reproducibility mirror lives in lib/besoin-requirements-doc.test.ts).
 *
 * ui-completeness (CLAUDE.md §7): the "Generate the document" button RUNS the pure projector from the
 * screen. THE WALL: the doc PROPOSES candidate-truth Ideas — HasMirror always false; it writes no
 * kernel. Determinism-first: the render is a pure function, never an LLM. Themed (ADR 0010), bilingual
 * (ADR 0011) — labels passed in.
 */

export interface DocLabels {
	generateCta: string;
	resetCta: string;
	graphHashLabel: string;
	ideaCountLabel: string;
	markdownHeading: string;
	backlogHeading: string;
	wizardLink: string;
}

// The fixed demo graph: product + journey (NoEmit) + view (NoEmit) + entity. product → journey edge;
// product also references the entity (so the backlog topo-sorts product before entity). Two mapping
// rungs (product, entity) → 2 Ideas; the journey/view are anchors only.
const DEMO_NODES: DocNode[] = [
	{
		level: "product",
		status: "resolved",
		utterance: "Permettre à un client de passer commande (checkout)",
		metaComplete: true,
		refs: [{ field: "journeys", to: "journey" }],
	},
	{
		level: "journey",
		status: "resolved",
		utterance: "Given un panier When je paie Then la commande est confirmée",
		metaComplete: true,
	},
	{
		level: "view",
		status: "resolved",
		utterance: "L'écran de récapitulatif et confirmation",
		metaComplete: true,
	},
	{
		level: "entity",
		status: "resolved",
		utterance: "L'entité Commande",
		metaComplete: true,
	},
];

const DEMO_EDGES: Edge[] = [
	{ from: "product", to: "journey", kind: "constrains" },
];

const DEMO_HASH = "el19demographstable";

export function RequirementsDocPanel({ labels }: { labels: DocLabels }) {
	const [doc, setDoc] = useState<RequirementsDoc | null>(null);

	function generate() {
		setDoc(emitRequirementsDoc(DEMO_NODES, DEMO_EDGES, DEMO_HASH));
	}

	return (
		<section data-testid="requirements-doc-panel" className="space-y-6">
			<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
				<button
					type="button"
					data-testid="doc-generate"
					onClick={generate}
					className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/80"
				>
					{labels.generateCta}
				</button>
				<button
					type="button"
					data-testid="doc-reset"
					onClick={() => setDoc(null)}
					className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
				>
					{labels.resetCta}
				</button>
				<a
					href="/compound-besoin"
					data-testid="doc-wizard-link"
					className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
				>
					{labels.wizardLink}
				</a>
			</div>

			{doc ? (
				<div data-testid="doc-output" className="space-y-5">
					<div className="flex flex-wrap items-center gap-3">
						<span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
							{labels.graphHashLabel} :{" "}
							<span data-testid="doc-graph-hash" className="font-mono">
								{doc.graphHash}
							</span>
						</span>
						<span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold tabular-nums text-primary">
							{labels.ideaCountLabel} :{" "}
							<span data-testid="doc-idea-count">{doc.ideaCount}</span>
						</span>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.backlogHeading}
						</h2>
						<ol className="mt-2 space-y-2">
							{doc.backlog.map((item, i) => (
								<li
									key={item.fromLevel}
									data-testid={`doc-idea-${item.fromLevel}`}
									className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
								>
									<span className="tabular-nums text-muted-foreground">
										{i + 1}.
									</span>{" "}
									proposes=
									<span className="font-semibold">{item.proposes}</span> —{" "}
									{item.fromLevel} — miroir : {item.mirrorForm} — «{" "}
									{item.intent} »
								</li>
							))}
						</ol>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.markdownHeading}
						</h2>
						<pre
							data-testid="doc-markdown"
							className="mt-2 overflow-x-auto rounded-lg border border-border bg-card p-4 text-[0.7rem] leading-relaxed text-card-foreground"
						>
							{doc.markdown}
						</pre>
					</div>
				</div>
			) : null}
		</section>
	);
}
