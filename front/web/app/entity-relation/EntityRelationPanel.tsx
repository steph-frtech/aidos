"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CARDINALITIES, DEMO_ENTITIES, SEMANTICS } from "@/lib/entity-relation";
import { type RelationResolveView, resolveAction } from "./actions";

/**
 * EntityRelationPanel makes the /entity-relation route action-capable (ui-completeness
 * law, CLAUDE.md §7): the S71 relation node has ONE control bound to the REAL engine,
 * reachable AND executable from the screen — pin a relation (name/target/cardinality/
 * semantic) and resolve+content-address it. A declared target yields its content address
 * (the round-trip); an undeclared target yields UNKNOWN_RELATION_TARGET (never guessed).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/entity-relation
 * (resolve + relationId), never an LLM. THE WALL (§2): it WRITES NOTHING — it validates,
 * resolves and hashes a node. Themed on the ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: RelationResolveView = {
	ok: false,
	relation: null,
	known: [...DEMO_ENTITIES],
};

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("entityRelation");
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

export function EntityRelationPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("entityRelation");
	const [state, action] = useActionState(resolveAction, initial);
	const refused = state.ok && state.block !== undefined;
	const resolved = state.ok && state.id !== undefined;

	return (
		<div className="space-y-8">
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

			{/* The declared entity set the target resolves against. */}
			<section
				data-testid="declared-set"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("declaredHeading")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{DEMO_ENTITIES.map((e) => (
						<span
							key={e}
							data-entity={e}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							{e}
						</span>
					))}
				</div>
			</section>

			{/* Pin a relation + resolve/content-address it (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("nameLabel")}
						</span>
						<input
							name="name"
							data-testid="relation-name"
							defaultValue="customer"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("targetLabel")}
						</span>
						<input
							name="target"
							data-testid="relation-target"
							defaultValue="Customer"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("cardinalityLabel")}
						</span>
						<select
							name="cardinality"
							data-testid="relation-cardinality"
							defaultValue="1-N"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{CARDINALITIES.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("semanticLabel")}
						</span>
						<select
							name="semantic"
							data-testid="relation-semantic"
							defaultValue="fk"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{SEMANTICS.map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</label>
				</div>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						name="required"
						data-testid="relation-required"
						defaultChecked
						className="h-4 w-4 rounded border-input"
					/>
					<span className="text-foreground">{t("requiredLabel")}</span>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="relation-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{resolved && (
					<section
						data-testid="relation-result"
						data-verdict="resolved"
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
							>
								{t("resolvedBadge")}
							</span>
							<p className="text-sm font-medium text-primary">
								{t("messages.resolved", {
									target: state.relation?.target ?? "",
								})}
							</p>
						</div>
						<dl className="space-y-1 font-mono text-xs">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">id:</dt>
								<dd
									data-testid="relation-id"
									className="break-all text-foreground"
								>
									{state.id}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">body:</dt>
								<dd
									data-testid="relation-body"
									className="break-all text-foreground"
								>
									{state.body}
								</dd>
							</div>
						</dl>
					</section>
				)}

				{refused && state.block && (
					<section
						data-testid="relation-result"
						data-verdict="refused"
						className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-xs font-medium text-destructive-foreground"
							>
								{t("refusedBadge")}
							</span>
							<span
								data-testid="block-code"
								data-code={
									state.block.explanation.includes("UNKNOWN_RELATION_TARGET")
										? "UNKNOWN_RELATION_TARGET"
										: "UNKNOWN_RELATION_KIND"
								}
								className="font-mono text-sm font-semibold text-destructive"
							>
								{state.block.explanation.includes("UNKNOWN_RELATION_TARGET")
									? "UNKNOWN_RELATION_TARGET"
									: "UNKNOWN_RELATION_KIND"}
							</span>
						</div>
						<p className="text-xs leading-relaxed text-destructive">
							{state.block.explanation}
						</p>
						<ul
							data-testid="how-to-fix"
							className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
						>
							{state.block.how_to_fix.map((fix) => (
								<li key={fix} className="font-mono text-destructive">
									{fix}
								</li>
							))}
						</ul>
					</section>
				)}
			</form>
		</div>
	);
}
