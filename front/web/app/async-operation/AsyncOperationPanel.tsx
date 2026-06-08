"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_ASYNC, DEMO_OP_NAME } from "@/lib/async-operation";
import { runScheduleAction, type ScheduleRunView } from "./actions";

/**
 * AsyncOperationPanel makes the /async-operation route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S73 async/scheduled node has ONE control bound to the REAL engine,
 * reachable AND executable from the screen — pin an injected clock instant and run. The
 * action TICKS the schedule (does the cron fire at this clock?), drives the OUTBOX through
 * the crash → replay path (deliver once, then suppress the redelivery), and shows the
 * observable delivery count stays exactly 1 (exactly-once relative).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/async-operation
 * (tick + dispatch + effectId), never an LLM. THE WALL (§2): it WRITES NOTHING — the
 * outbox is a runtime seam. Themed (ADR 0010); next-intl (0011).
 */

const initial: ScheduleRunView = {
	ok: false,
	now: "",
	effectId: "",
	triggerKind: DEMO_ASYNC.trigger.kind,
	echeance: DEMO_ASYNC.trigger.at ?? "",
	fired: false,
	firedNames: [],
	delivered: 0,
	suppressed: [],
	observable: 0,
};

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("asyncOperation");
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

export function AsyncOperationPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("asyncOperation");
	const [state, action] = useActionState(runScheduleAction, initial);
	const ran = state.ok && state.now !== "";
	const refused = state.ok && state.block !== undefined;

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

			{/* The declared async node: trigger + effect (the third dimension). */}
			<section
				data-testid="declared-node"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("declaredHeading")}
				</h2>
				<p className="font-mono text-xs text-foreground">
					{t("opLabel")}: <span data-testid="op-name">{DEMO_OP_NAME}</span>
				</p>
				<div className="flex flex-wrap gap-2">
					<span
						data-testid="trigger-kind"
						className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
					>
						trigger: {DEMO_ASYNC.trigger.kind}
					</span>
					<span
						data-testid="echeance"
						className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
					>
						at: {DEMO_ASYNC.trigger.at}
					</span>
					<span
						data-testid="effect-kind"
						className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
					>
						effect: {DEMO_ASYNC.effects[0].kind} →{" "}
						{DEMO_ASYNC.effects[0].target}
					</span>
				</div>
			</section>

			{/* Pin an injected clock + run (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">{t("clockLabel")}</span>
					<input
						name="now"
						data-testid="clock-now"
						defaultValue="2026-06-08T09:00:00Z"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="run-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{ran && !refused && (
					<section
						data-testid="run-result"
						data-fired={String(state.fired)}
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="fired-badge"
								className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
							>
								{state.fired ? t("firedBadge") : t("notFiredBadge")}
							</span>
							<p className="text-sm font-medium text-primary">
								{state.fired ? t("messages.fired") : t("messages.notFired")}
							</p>
						</div>
						<dl className="space-y-1 font-mono text-xs">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{t("effectIdLabel")}:</dt>
								<dd
									data-testid="effect-id"
									className="break-all text-foreground"
								>
									{state.effectId}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{t("deliveredLabel")}:
								</dt>
								<dd data-testid="delivered" className="text-foreground">
									{state.delivered}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{t("suppressedLabel")}:
								</dt>
								<dd
									data-testid="suppressed"
									className="break-all text-foreground"
								>
									{state.suppressed.length}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{t("observableLabel")}:
								</dt>
								<dd
									data-testid="observable"
									data-count={String(state.observable)}
									className="font-semibold text-primary"
								>
									{state.observable}
								</dd>
							</div>
						</dl>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t("exactlyOnceNote")}
						</p>
					</section>
				)}

				{refused && state.block && (
					<section
						data-testid="run-result"
						data-verdict="refused"
						className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
					>
						<span
							data-testid="block-code"
							data-code={state.block.code}
							className="font-mono text-sm font-semibold text-destructive"
						>
							{state.block.code}
						</span>
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
