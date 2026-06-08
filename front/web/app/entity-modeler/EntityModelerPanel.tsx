"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_DRAFT } from "@/lib/entity-modeler";
import {
	type MergeView,
	mergeAction,
	type ProposeView,
	proposeAction,
} from "./actions";

/**
 * EntityModelerPanel makes the /entity-modeler route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S75 modeler has TWO controls bound to the REAL engine, reachable AND
 * executable from the screen —
 *   1. PROPOSE — model Customer↔Order and produce a `proposed` (DRAFT) ChangeSet (propose →
 *      ChangeSet → approval), with the entity-map (the live schema) + its content address.
 *   2. MERGE — two editors fork the canvas, each adds a node concurrently, and the merge
 *      keeps BOTH (no silent overwrite) — the draft-level concurrency guarantee.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both controls run the PURE twin lib/entity-modeler
 * (validate + schemaHash + propose + mergeDrafts), never an LLM. THE WALL (§2): the screen
 * WRITES NOTHING — propose returns a DRAFT changeset; the `aidos` CLI applies it only after
 * human approval; a reject leaves the kernel intact. Themed on the ADR 0010 tokens; strings
 * via next-intl (0011).
 */

const proposeInitial: ProposeView = { ok: false, draft: null };
const mergeInitial: MergeView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("entityModeler");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function EntityModelerPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("entityModeler");
	const [proposeState, doPropose] = useActionState(
		proposeAction,
		proposeInitial,
	);
	const [mergeState, doMerge] = useActionState(mergeAction, mergeInitial);

	const proposed = proposeState.ok && proposeState.proposal?.ok === true;
	const refused = proposeState.ok && proposeState.block !== undefined;

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* The canvas: the modeled entity nodes (the schema being shaped). */}
			<section
				data-testid="canvas"
				className="space-y-3 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("canvasHeading")}
				</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					{DEMO_DRAFT.nodes.map((n) => (
						<div
							key={n.entity.name}
							data-entity={n.entity.name}
							className="space-y-1 rounded-lg border border-border bg-card p-3"
						>
							<p className="font-mono text-sm font-semibold text-foreground">
								{n.entity.name}
							</p>
							<ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
								{n.entity.attributes.map((a) => (
									<li key={a.name}>
										{a.name}: {a.type}
										{a.identifier ? " (id)" : ""}
									</li>
								))}
								{n.relations.map((r) => (
									<li
										key={r.name}
										data-relation={r.name}
										className="text-primary"
									>
										{r.name} ──{r.cardinality} {r.semantic}──▶ {r.target}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</section>

			{/* CONTROL 1 — model Customer↔Order and PROPOSE (propose → ChangeSet → approval). */}
			<form
				action={doPropose}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>
				<input type="hidden" name="project" value="shop" />
				<input type="hidden" name="parentPhase" value="phase-0" />
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("relTargetLabel")}
					</span>
					<input
						name="relTarget"
						data-testid="rel-target"
						defaultValue="Customer"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("proposeButton")} testId="propose-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{proposed && proposeState.proposal?.changeset && (
					<section
						data-testid="propose-result"
						data-verdict="proposed"
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="changeset-status"
								className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
							>
								{proposeState.proposal.changeset.status}
							</span>
							<p className="text-sm font-medium text-primary">
								{t("messages.proposed")}
							</p>
						</div>
						<dl className="space-y-1 font-mono text-xs">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">schema_hash:</dt>
								<dd
									data-testid="schema-hash"
									className="break-all text-foreground"
								>
									{proposeState.schemaHash}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">target:</dt>
								<dd
									data-testid="spec-target"
									className="break-all text-foreground"
								>
									{proposeState.proposal.changeset.spec_delta.target}
								</dd>
							</div>
						</dl>
						{/* the entity-map: the live proposed schema (the approved-then-visible view). */}
						<div
							data-testid="entity-map"
							className="space-y-1 rounded-lg border border-border bg-card p-3"
						>
							<p className="text-xs font-semibold text-foreground">
								{t("entityMapHeading")}
							</p>
							{proposeState.draft?.nodes.map((n) => (
								<p
									key={n.entity.name}
									data-map-entity={n.entity.name}
									className="font-mono text-xs text-foreground"
								>
									{n.entity.name}
									{n.relations.map((r) => ` ──▶ ${r.target}`).join("")}
								</p>
							))}
						</div>
					</section>
				)}

				{refused && proposeState.block && (
					<section
						data-testid="propose-result"
						data-verdict="refused"
						className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="block-code"
								className="font-mono text-sm font-semibold text-destructive"
							>
								{proposeState.block.code}
							</span>
						</div>
						<p className="text-xs leading-relaxed text-destructive">
							{proposeState.block.explanation}
						</p>
						<ul
							data-testid="how-to-fix"
							className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
						>
							{proposeState.block.how_to_fix.map((fix) => (
								<li key={fix} className="font-mono text-destructive">
									{fix}
								</li>
							))}
						</ul>
					</section>
				)}
			</form>

			{/* CONTROL 2 — two editors edit concurrently and DO NOT overwrite each other. */}
			<form
				action={doMerge}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("mergeHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("mergeBody")}</p>
				<Submit label={t("mergeButton")} testId="merge-submit" />

				{mergeState.ok && mergeState.outcome && (
					<section
						data-testid="merge-result"
						className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<p className="text-sm font-medium text-primary">
							{t("messages.merged")}
						</p>
						<div data-testid="merged-nodes" className="flex flex-wrap gap-2">
							{mergeState.outcome.merged.nodes.map((n) => (
								<span
									key={n.entity.name}
									data-merged-entity={n.entity.name}
									className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
								>
									{n.entity.name}
								</span>
							))}
						</div>
						<dl className="space-y-1 font-mono text-xs text-muted-foreground">
							<div className="flex gap-2">
								<dt>added_by_a:</dt>
								<dd data-testid="added-by-a" className="text-foreground">
									{mergeState.outcome.added_by_a.join(", ") || "—"}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt>added_by_b:</dt>
								<dd data-testid="added-by-b" className="text-foreground">
									{mergeState.outcome.added_by_b.join(", ") || "—"}
								</dd>
							</div>
						</dl>
					</section>
				)}
			</form>
		</div>
	);
}
