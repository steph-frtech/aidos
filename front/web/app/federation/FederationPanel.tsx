"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type FanOutView,
	fanOutAction,
	runSagaAction,
	type SagaView,
} from "./actions";

/**
 * FederationPanel makes the /federation route action-capable (ui-completeness law, CLAUDE.md
 * §7): S103 has TWO controls bound to the REAL composition engine, reachable AND executable
 * from the screen —
 *
 *   1. RUN THE SAGA over the two REAL cells order + payment, with a "break a leg" toggle: the
 *      happy path is satisfied; a broken leg triggers the declared compensation (refundPayment),
 *      after which the saga is satisfied VIA compensation (§51).
 *   2. FIRE THE GLOBAL POLICY ("tout PII oubliable") expressed ONCE: it fans out to a
 *      RedWorkQueue PER CELL — order + payment are reddened, shipping (non-violating) stays GREEN.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both controls run the PURE twin lib/federation, never an
 * LLM — same input → identical result. THE WALL (§2): they WRITE NOTHING — the per-cell queue
 * rows are a projection (the S22 hook does the INSERT below the waterline). Themed on ADR 0010
 * tokens; strings via next-intl (0011).
 */

const sagaInitial: SagaView = { ok: false, brokenLeg: false };
const fanOutInitial: FanOutView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("federation");
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

export function FederationPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("federation");
	const [saga, sagaDispatch] = useActionState(runSagaAction, sagaInitial);
	const [fan, fanDispatch] = useActionState(fanOutAction, fanOutInitial);

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

			{/* ── 1. Saga over two real cells ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("sagaHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("sagaBody")}
				</p>
				<form action={sagaDispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="brokenLeg"
							data-testid="break-leg"
							className="h-4 w-4 rounded border-border"
						/>
						{t("breakLegLabel")}
					</label>
					<Submit label={t("runSaga")} testId="run-saga" />
				</form>

				{saga.ok && saga.run ? (
					<div
						data-testid="saga-result"
						className="space-y-2 rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="flex items-center gap-2 text-sm">
							<span className="font-medium text-foreground">
								{t("legLabel")}:
							</span>
							<span
								data-testid="saga-leg"
								className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary"
							>
								{saga.run.leg}
							</span>
							<span
								data-testid="saga-outcome"
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
							>
								{saga.run.outcome}
							</span>
						</div>
						{saga.run.compensation.length > 0 ? (
							<div
								data-testid="saga-compensation"
								className="text-xs text-muted-foreground"
							>
								<span className="font-medium text-foreground">
									{t("compensationLabel")}:
								</span>{" "}
								<span className="font-mono">
									{saga.run.compensation.join(" → ")}
								</span>
							</div>
						) : null}
					</div>
				) : null}
			</section>

			{/* ── 2. Global-policy fan-out ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("fanOutHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("fanOutBody")}
				</p>
				<form action={fanDispatch}>
					<Submit label={t("runFanOut")} testId="run-fanout" />
				</form>

				{fan.ok && fan.waves ? (
					<div data-testid="fanout-result" className="space-y-3">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="pb-2">{t("cellColumn")}</th>
									<th className="pb-2">{t("statusColumn")}</th>
									<th className="pb-2">{t("queueColumn")}</th>
								</tr>
							</thead>
							<tbody>
								{fan.waves.map((w) => (
									<tr
										key={w.cell}
										data-testid={`cell-row-${w.cell}`}
										className="border-t border-border"
									>
										<td className="py-2 font-mono text-foreground">{w.cell}</td>
										<td className="py-2">
											<span
												data-testid={`cell-status-${w.cell}`}
												className={
													w.reddened
														? "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
														: "inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
												}
											>
												{w.reddened ? t("reddened") : t("green")}
											</span>
										</td>
										<td className="py-2 font-mono text-xs text-muted-foreground">
											{w.queue.length > 0 ? w.queue.join(", ") : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<p
							data-testid="fanout-affected"
							className="text-xs text-muted-foreground"
						>
							<span className="font-medium text-foreground">
								{t("affectedLabel")}:
							</span>{" "}
							<span className="font-mono">
								{(fan.affected ?? []).join(", ") || "—"}
							</span>
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
