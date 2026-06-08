"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_SCHEMA } from "@/lib/relation-emitter";
import { type RegenView, regenAction } from "./actions";

/**
 * AppRegeneratorPanel makes the /app-regenerator route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S78 regeneration has ONE control bound to the REAL engine, reachable AND
 * executable from the screen — run « Régénérer mon app » over the demo project, choosing a
 * FAITHFUL tree (→ a Plan classifying stale/fresh/unchanged) or a HAND-EDITED tree (→ refused
 * with GEN_FILE_HAND_EDITED, proving the tree is never silently overwritten).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/app-regenerator,
 * never an LLM — same project → byte-identical artifacts. THE WALL (§2): it WRITES NOTHING —
 * gen/ is a projection. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: RegenView = { ok: false, scenario: null };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("appRegenerator");
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

export function AppRegeneratorPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("appRegenerator");
	const [state, action] = useActionState(regenAction, initial);
	const refused = state.ok && state.block !== undefined;
	const regenerated = state.ok && state.plan !== undefined;

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

			{/* The project being regenerated. */}
			<section
				data-testid="schema"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("schemaHeading")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{DEMO_SCHEMA.entities.map((e) => (
						<span
							key={e.name}
							data-entity={e.name}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							{e.name}
						</span>
					))}
					{(DEMO_SCHEMA.asyncOps ?? []).map((a) => (
						<span
							key={a.name}
							data-async={a.name}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							async:{a.name}
						</span>
					))}
				</div>
			</section>

			{/* Run « Régénérer mon app » (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("scenarioLabel")}
					</span>
					<select
						name="scenario"
						data-testid="regen-scenario"
						defaultValue="clean"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="clean">{t("scenarioClean")}</option>
						<option value="handedit">{t("scenarioHandEdit")}</option>
					</select>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="regen-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{regenerated && (
					<section
						data-testid="regen-result"
						data-verdict="regenerated"
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<span
							data-testid="verdict-badge"
							className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
						>
							{t("regeneratedBadge")}
						</span>
						<dl className="grid grid-cols-3 gap-2 text-xs">
							<div className="rounded-lg bg-background p-2 text-center">
								<dt className="text-muted-foreground">{t("freshLabel")}</dt>
								<dd
									data-testid="count-fresh"
									className="font-mono text-foreground"
								>
									{state.plan?.fresh.length ?? 0}
								</dd>
							</div>
							<div className="rounded-lg bg-background p-2 text-center">
								<dt className="text-muted-foreground">{t("staleLabel")}</dt>
								<dd
									data-testid="count-stale"
									className="font-mono text-foreground"
								>
									{state.plan?.stale.length ?? 0}
								</dd>
							</div>
							<div className="rounded-lg bg-background p-2 text-center">
								<dt className="text-muted-foreground">{t("unchangedLabel")}</dt>
								<dd
									data-testid="count-unchanged"
									className="font-mono text-foreground"
								>
									{state.plan?.unchanged.length ?? 0}
								</dd>
							</div>
						</dl>
						<ul
							data-testid="artifact-list"
							className="space-y-1 font-mono text-xs text-foreground"
						>
							{state.plan?.artifacts.map((a) => (
								<li key={a.path} data-artifact={a.path}>
									<span className="text-muted-foreground">[{a.target}]</span>{" "}
									{a.path}{" "}
									<span className="text-muted-foreground">
										#{a.outputHash.slice(0, 8)}
									</span>
								</li>
							))}
						</ul>
					</section>
				)}

				{refused && (
					<section
						data-testid="regen-result"
						data-verdict="refused"
						className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
					>
						<span
							data-testid="verdict-badge"
							className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-xs font-medium text-destructive-foreground"
						>
							{t("refusedBadge")}
						</span>
						<p
							data-testid="block-code"
							className="font-mono text-xs text-destructive"
						>
							{state.block?.code}
						</p>
						<p
							data-testid="block-explanation"
							className="text-sm text-foreground"
						>
							{state.block?.explanation}
						</p>
						<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
							{state.block?.how_to_fix.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
					</section>
				)}
			</form>

			<p className="text-xs text-muted-foreground">{t("footer")}</p>
		</div>
	);
}
