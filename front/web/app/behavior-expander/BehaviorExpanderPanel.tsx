"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { catalogue } from "@/lib/behavior-expander";
import { type ProposeView, proposeAction } from "./actions";

/**
 * BehaviorExpanderPanel makes the /behavior-expander route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S76 expander has ONE control bound to the REAL engine, reachable AND executable
 * from the screen — PROPOSE: own/version/tag/localise a behavior record, attach it to an entity, run
 * the ONE Expand and produce a `proposed` (DRAFT) ChangeSet carrying the attributes / relations /
 * operations / policies / fixtures it implies, with the expansion + record content addresses.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/behavior-expander (the ONE
 * compound expander + propose), never an LLM. THE WALL (§2): the screen WRITES NOTHING — propose
 * returns a DRAFT changeset; the `aidos` CLI applies it only after human approval; a reject leaves
 * the kernel intact. Themed on the ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: ProposeView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("behaviorExpander");
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

function PieceList({ heading, names }: { heading: string; names: string[] }) {
	if (names.length === 0) return null;
	return (
		<div className="space-y-1">
			<p className="text-xs font-semibold tracking-tight text-foreground">
				{heading}
			</p>
			<ul className="space-y-0.5">
				{names.map((n) => (
					<li key={n} className="font-mono text-xs text-muted-foreground">
						{n}
					</li>
				))}
			</ul>
		</div>
	);
}

export function BehaviorExpanderPanel() {
	const t = useTranslations("behaviorExpander");
	const [state, doPropose] = useActionState(proposeAction, initial);

	const kinds = catalogue();
	const proposed = state.ok && state.proposal?.ok === true;
	const refused = state.ok && state.error !== undefined;
	const e = state.proposal?.expansion;
	const cs = state.proposal?.changeset;

	return (
		<div className="space-y-10">
			<form
				action={doPropose}
				className="space-y-5 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("behaviorLabel")}
						</span>
						<select
							name="behavior"
							data-testid="behavior-select"
							defaultValue="ownable"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							{kinds.map((k) => (
								<option key={k} value={k}>
									{k}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("entityLabel")}
						</span>
						<input
							name="entity"
							data-testid="entity-input"
							defaultValue="Order"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("ownerLabel")}
						</span>
						<input
							name="owner"
							data-testid="owner-input"
							defaultValue="alice"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("versionLabel")}
						</span>
						<input
							name="version"
							type="number"
							min={1}
							data-testid="version-input"
							defaultValue={1}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("tagsLabel")}
						</span>
						<input
							name="tags"
							data-testid="tags-input"
							defaultValue="scoping, security"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("labelFrLabel")}
						</span>
						<input
							name="labelFr"
							data-testid="label-fr-input"
							defaultValue="propriété"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
				</div>
				<input type="hidden" name="parentPhase" value="phase-0" />

				<Submit label={t("proposeButton")} testId="propose-button" />
			</form>

			{proposed && e && cs ? (
				<div
					data-testid="proposal-result"
					className="space-y-5 rounded-xl border border-border bg-muted/40 p-6"
				>
					<div className="flex flex-wrap items-center gap-2">
						<span
							data-testid="changeset-status"
							className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
						>
							{t("draftBadge")}: {cs.status}
						</span>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("pieceCount")}: {e.pieceCount}
						</span>
					</div>
					<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
					<dl className="grid gap-2 text-xs sm:grid-cols-2">
						<div>
							<dt className="font-semibold text-foreground">
								{t("expansionId")}
							</dt>
							<dd
								data-testid="expansion-id"
								className="break-all font-mono text-muted-foreground"
							>
								{e.expansionId}
							</dd>
						</div>
						<div>
							<dt className="font-semibold text-foreground">{t("recordId")}</dt>
							<dd
								data-testid="record-id"
								className="break-all font-mono text-muted-foreground"
							>
								{state.proposal?.record_id}
							</dd>
						</div>
					</dl>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<PieceList
							heading={t("attributes")}
							names={e.attributes.map((x) => x.name)}
						/>
						<PieceList
							heading={t("relations")}
							names={e.relations.map((x) => x.name)}
						/>
						<PieceList
							heading={t("operations")}
							names={e.operations.map((x) => x.name)}
						/>
						<PieceList
							heading={t("policies")}
							names={e.policies.map((x) => x.name)}
						/>
						<PieceList
							heading={t("fixtures")}
							names={e.fixtures.map((x) => x.name)}
						/>
					</div>
				</div>
			) : null}

			{refused ? (
				<div
					data-testid="proposal-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{state.error}
				</div>
			) : null}
		</div>
	);
}
