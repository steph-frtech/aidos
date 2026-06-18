"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_SCHEMA } from "@/lib/relation-emitter";
import { type EmitView, emitAction } from "./actions";

/**
 * RelationEmitterPanel makes the /relation-emitter route action-capable (ui-completeness
 * law, CLAUDE.md §7): the S74 emitters have ONE control bound to the REAL engine, reachable
 * AND executable from the screen — pick a target (DDL / TS / Worker) + whether to include
 * the async op, and emit. The DDL shows the FK columns, the N-N join table and the outbox;
 * the TS shows the typed associations + navigation SDK; the worker drains the outbox.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/relation-emitter,
 * never an LLM — same schema → byte-identical output. THE WALL (§2): it WRITES NOTHING —
 * the emitted bytes are a projection. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: EmitView = { ok: false, target: null, withAsync: true };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("relationEmitter");
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

export function RelationEmitterPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("relationEmitter");
	const [state, action] = useActionState(emitAction, initial);
	const refused = state.ok && state.block !== undefined;
	const emitted = state.ok && state.output !== undefined;

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

			{/* The multi-entity demo schema being projected. */}
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
							{(e.relations ?? []).map((r) => (
								<span key={r.name} className="ml-1 text-muted-foreground">
									·{r.name}({r.cardinality})
								</span>
							))}
						</span>
					))}
					{(DEMO_SCHEMA.asyncOps ?? []).map((a) => (
						<span
							key={a.name}
							data-async={a.name}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							async:{a.name}({a.kind})
						</span>
					))}
				</div>
			</section>

			{/* Pick a target + emit (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("targetLabel")}
					</span>
					<select
						name="target"
						data-testid="emit-target"
						defaultValue="ddl"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="ddl">{t("targetDDL")}</option>
						<option value="ts">{t("targetTS")}</option>
						<option value="worker">{t("targetWorker")}</option>
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						name="withAsync"
						data-testid="emit-async"
						defaultChecked
						className="h-4 w-4 rounded border-input"
					/>
					<span className="text-foreground">{t("asyncLabel")}</span>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="emit-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{emitted && (
					<section
						data-testid="emit-result"
						data-verdict="emitted"
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
							>
								{t("emittedBadge")}
							</span>
							{state.source ? (
								<span
									data-testid="source-badge"
									data-source={state.source}
									title={
										state.source === "live"
											? t("sourceLiveTitle")
											: t("sourceDemoTitle")
									}
									className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
										state.source === "live"
											? "bg-primary/15 text-primary"
											: "bg-muted text-muted-foreground"
									}`}
								>
									{state.source === "live" ? t("sourceLive") : t("sourceDemo")}
								</span>
							) : null}
							<span className="font-mono text-xs text-muted-foreground">
								{t("hashLabel")}:{" "}
								<span data-testid="emit-hash">{state.hash?.slice(0, 16)}…</span>
							</span>
						</div>
						<pre
							data-testid="emit-output"
							className="overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed text-foreground"
						>
							{state.output}
						</pre>
					</section>
				)}

				{refused && (
					<section
						data-testid="emit-result"
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
