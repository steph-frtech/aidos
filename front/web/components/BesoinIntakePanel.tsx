"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
	type BesoinSchemaView,
	type BesoinStateView,
	projectionAction,
	schemaAction,
	stateAction,
} from "@/app/besoin-intake/actions";
import type { CaptureProjection, LevelSchema } from "@/lib/besoin-intake";

/**
 * BesoinIntakePanel — the action-capable /besoin-intake panel (EL15). The besoin-intake MCP is the
 * SINGLE capability door over the BesoinGraph (the NEED store ABOVE the wall §2). After the ADR 0092
 * batch-4A FLIP the panel reads its DISPLAYED graph-state LIVE from the Go besoin-intake MCP server
 * through the passerelle (`stateAction` → `readVia(scope, "besoin_graph_state", …)`), with the TS twin
 * preserved ONLY as the deterministic demo fallback (`source:"live"|"demo"`, the honest badge). The
 * panel itself imports the twin's TYPES ONLY (`LevelSchema`, `CaptureProjection`) — every twin COMPUTE
 * lives server-side behind the `readVia` frontier in actions.ts (the T5 cliquet stays GREEN; no twin as
 * a live path).
 *
 * The human EXECUTES the door FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless capability):
 *  - "Lire l'état du graphe" runs the LIVE besoin_graph_state read (RLS-scoped to the active project):
 *    the enterable level (EL07), the persisted node row count, whether the need is resolved;
 *  - "Lire le schéma du niveau" runs schemaAction (the besoin_level_schema projection — required fields
 *    + EL05 mapping; the closed-grammar projection the Go MCP reproduces byte-for-byte);
 *  - "Projeter la capture" runs projectionAction (the capture tool + whether it EMITS an Idea or NOT —
 *    a NoEmit rung: journey/view/invariant — no silent cast).
 *  - the full tool inventory is enumerated so every backend op (ADR 0009) is reachable from a screen.
 *
 * ABOVE the wall (CLAUDE.md §2): the door writes no truth; a capture emits an Idea via the legal
 * idea_capture door (EL05), a kernel write is always refused (GRANT). The RLS-scoped read carries the
 * active project (the project boundary, S55). Themed (ADR 0010), bilingual (ADR 0011) — labels in.
 */

interface Labels {
	stateCta: string;
	schemaCta: string;
	projectCta: string;
	resetCta: string;
	levelLabel: string;
	stateHeading: string;
	enterableLabel: string;
	rowCountLabel: string;
	doneLabel: string;
	doneYes: string;
	doneNo: string;
	graphCompleteLabel: string;
	schemaHeading: string;
	requiredFieldsLabel: string;
	mappingLabel: string;
	outgoingRefLabel: string;
	projectionHeading: string;
	toolLabel: string;
	emitsLabel: string;
	emitsYes: string;
	emitsNo: string;
	proposesLabel: string;
	toolsHeading: string;
	readToolsLabel: string;
	captureToolsLabel: string;
	validateToolsLabel: string;
	noEmitNote: string;
	pending: string;
	sourceLive: string;
	sourceDemo: string;
	sourceLiveTitle: string;
	sourceDemoTitle: string;
}

const STATE_INITIAL: BesoinStateView = {
	ran: false,
	state: {
		project: "",
		graphHash: "",
		nodeRowCount: 0,
		enterableLevel: "",
		done: false,
		verdicts: [],
	},
	source: "demo",
};

const SCHEMA_INITIAL: BesoinSchemaView = {
	ran: false,
	level: "product",
	schema: null,
};

/** SourceBadge — the honest live/demo provenance pill (ADR 0074: never a silent broken-live). */
function SourceBadge({
	source,
	labels,
}: {
	source: "live" | "demo";
	labels: Labels;
}) {
	return (
		<span
			data-testid="state-source"
			data-source={source}
			title={
				source === "live" ? labels.sourceLiveTitle : labels.sourceDemoTitle
			}
			className={
				source === "live"
					? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
					: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
			}
		>
			{source === "live" ? labels.sourceLive : labels.sourceDemo}
		</span>
	);
}

function StateSubmit({
	label,
	pendingLabel,
}: {
	label: string;
	pendingLabel: string;
}) {
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="state-cta"
			disabled={pending}
			className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
		>
			{pending ? pendingLabel : label}
		</button>
	);
}

export function BesoinIntakePanel({
	labels,
	levels,
	captureProjections,
	readTools,
	validateTools,
}: {
	labels: Labels;
	levels: string[];
	captureProjections: CaptureProjection[];
	readTools: string[];
	validateTools: string[];
}) {
	const [level, setLevel] = useState<string>("product");
	const [stateView, stateFormAction] = useActionState(
		stateAction,
		STATE_INITIAL,
	);
	const [schemaView, schemaFormAction] = useActionState(
		schemaAction,
		SCHEMA_INITIAL,
	);
	const [projection, setProjection] = useState<CaptureProjection | null>(null);
	const [isProjecting, startProjection] = useTransition();

	const schema: LevelSchema | null = schemaView.ran ? schemaView.schema : null;

	function onProject() {
		startProjection(async () => {
			setProjection(await projectionAction(level));
		});
	}
	function onReset() {
		setProjection(null);
		setLevel("product");
	}

	return (
		<div className="space-y-8">
			{/* LIVE graph-state read (RLS-scoped to the active project) — the besoin_graph_state tool */}
			<form
				action={stateFormAction}
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.stateHeading}
					</h2>
					{stateView.ran ? (
						<SourceBadge source={stateView.source} labels={labels} />
					) : null}
				</div>
				<StateSubmit label={labels.stateCta} pendingLabel={labels.pending} />
				{stateView.ran ? (
					<dl
						data-testid="state-result"
						className="space-y-1 pt-1 text-sm text-muted-foreground"
					>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.enterableLabel}
							</dt>
							<dd data-testid="state-enterable">
								{stateView.state.enterableLevel || labels.graphCompleteLabel}
							</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.rowCountLabel}
							</dt>
							<dd data-testid="state-rowcount">
								{stateView.state.nodeRowCount}
							</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.doneLabel}
							</dt>
							<dd data-testid="state-done">
								{stateView.state.done ? labels.doneYes : labels.doneNo}
							</dd>
						</div>
					</dl>
				) : null}
			</form>

			{/* level picker + the schema (server action) + the projection (server action) controls */}
			<div className="space-y-4 rounded-xl border border-border bg-card p-5">
				<label
					className="block text-sm font-medium text-foreground"
					htmlFor="level-select"
				>
					{labels.levelLabel}
				</label>
				<select
					id="level-select"
					data-testid="level-select"
					value={level}
					onChange={(e) => setLevel(e.target.value)}
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
				>
					{levels.map((l) => (
						<option key={l} value={l}>
							{l}
						</option>
					))}
				</select>

				<div className="flex flex-wrap gap-3">
					<form action={schemaFormAction} className="contents">
						<input type="hidden" name="level" value={level} />
						<button
							type="submit"
							data-testid="schema-cta"
							className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							{labels.schemaCta}
						</button>
					</form>
					<button
						type="button"
						data-testid="project-cta"
						onClick={onProject}
						disabled={isProjecting}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
					>
						{labels.projectCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={onReset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
			</div>

			{/* besoin_level_schema result */}
			<section
				aria-label={labels.schemaHeading}
				data-testid="schema-result"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.schemaHeading}
				</h2>
				{schema === null ? (
					<p className="text-sm text-muted-foreground">{labels.pending}</p>
				) : (
					<dl className="space-y-1 text-sm text-muted-foreground">
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.requiredFieldsLabel}
							</dt>
							<dd data-testid="schema-required">
								{schema.requiredFields.join(", ")}
							</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.mappingLabel}
							</dt>
							<dd data-testid="schema-mapping">{schema.mapping}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.outgoingRefLabel}
							</dt>
							<dd data-testid="schema-ref">
								{schema.outgoingRefTo
									? `${schema.outgoingRefField} → ${schema.outgoingRefTo}`
									: "—"}
							</dd>
						</div>
					</dl>
				)}
			</section>

			{/* captureProjection result */}
			<section
				aria-label={labels.projectionHeading}
				data-testid="projection-result"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.projectionHeading}
				</h2>
				{projection === null ? (
					<p className="text-sm text-muted-foreground">{labels.pending}</p>
				) : (
					<dl className="space-y-1 text-sm text-muted-foreground">
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.toolLabel}
							</dt>
							<dd data-testid="projection-tool">{projection.tool}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.emitsLabel}
							</dt>
							<dd data-testid="projection-emits">
								{projection.emits ? labels.emitsYes : labels.emitsNo}
							</dd>
						</div>
						<div className="flex gap-2">
							<dt className="font-medium text-foreground">
								{labels.proposesLabel}
							</dt>
							<dd data-testid="projection-proposes">
								{projection.proposes ?? "—"}
							</dd>
						</div>
						{!projection.emits ? (
							<p
								data-testid="no-emit-note"
								className="pt-1 text-xs text-muted-foreground"
							>
								{labels.noEmitNote}
							</p>
						) : null}
					</dl>
				)}
			</section>

			{/* the full tool inventory — every backend op reachable from a screen (ADR 0009) */}
			<section
				aria-label={labels.toolsHeading}
				data-testid="tools-inventory"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.toolsHeading}
				</h2>
				<div className="text-sm text-muted-foreground">
					<p className="font-medium text-foreground">{labels.readToolsLabel}</p>
					<ul className="ml-4 list-disc">
						{readTools.map((tool) => (
							<li key={tool}>{tool}</li>
						))}
					</ul>
				</div>
				<div className="text-sm text-muted-foreground">
					<p className="font-medium text-foreground">
						{labels.captureToolsLabel}
					</p>
					<ul className="ml-4 list-disc">
						{captureProjections.map((p) => (
							<li key={`${p.level}:${p.tool}`} data-testid={`tool-${p.level}`}>
								{p.tool} —{" "}
								{p.emits
									? `${labels.emitsYes} (${p.proposes})`
									: labels.emitsNo}
							</li>
						))}
					</ul>
				</div>
				<div className="text-sm text-muted-foreground">
					<p className="font-medium text-foreground">
						{labels.validateToolsLabel}
					</p>
					<ul className="ml-4 list-disc">
						{validateTools.map((tool) => (
							<li key={tool}>{tool}</li>
						))}
					</ul>
				</div>
			</section>
		</div>
	);
}
