"use client";

import { useMemo, useState } from "react";
import { allLevels, type Level } from "@/lib/besoin-grammar";
import {
	allCaptureProjections,
	BESOIN_READ_TOOLS,
	BESOIN_VALIDATE_TOOLS,
	besoinLevelSchema,
	type CaptureProjection,
	captureProjection,
	type LevelSchema,
} from "@/lib/besoin-intake";

/**
 * BesoinIntakePanel — the action-capable /besoin-intake panel (EL15). The besoin-intake MCP is the
 * capability door over the BesoinGraph; its deterministic read/state/schema decisions are the TWIN
 * lib/besoin-intake.ts (byte-identical to back/mcp/besoin-intake/main.go). The human EXECUTES the door
 * FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless capability):
 *  - "Lire le schéma du niveau" runs besoinLevelSchema(level) — the besoin_level_schema tool: the
 *    required fields a client renders + the EL05 mapping (it invents no field);
 *  - "Projeter la capture" runs captureProjection(level) — the capture tool + whether it EMITS an Idea
 *    (a MAPPING rung) or NOT (a NoEmit rung: journey/view/invariant — no silent cast).
 *  - the full tool inventory is enumerated so every backend op (ADR 0009) is reachable from a screen.
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM. ABOVE the wall (CLAUDE.md §2):
 * the door writes no truth; a capture emits an Idea via the legal idea_capture door (EL05), a kernel
 * write is always refused (GRANT). Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	schemaCta: string;
	projectCta: string;
	resetCta: string;
	levelLabel: string;
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
}

export function BesoinIntakePanel({ labels }: { labels: Labels }) {
	const [level, setLevel] = useState<Level>("product");
	const [schema, setSchema] = useState<LevelSchema | null>(null);
	const [projection, setProjection] = useState<CaptureProjection | null>(null);

	const captureProjections = useMemo(() => allCaptureProjections(), []);

	function onReadSchema() {
		setSchema(besoinLevelSchema(level));
	}
	function onProject() {
		setProjection(captureProjection(level));
	}
	function onReset() {
		setSchema(null);
		setProjection(null);
		setLevel("product");
	}

	return (
		<div className="space-y-8">
			{/* level picker + the two executable controls */}
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
					onChange={(e) => setLevel(e.target.value as Level)}
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
				>
					{allLevels().map((l) => (
						<option key={l} value={l}>
							{l}
						</option>
					))}
				</select>

				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="schema-cta"
						onClick={onReadSchema}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{labels.schemaCta}
					</button>
					<button
						type="button"
						data-testid="project-cta"
						onClick={onProject}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
						{BESOIN_READ_TOOLS.map((tool) => (
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
						{BESOIN_VALIDATE_TOOLS.map((tool) => (
							<li key={tool}>{tool}</li>
						))}
					</ul>
				</div>
			</section>
		</div>
	);
}
