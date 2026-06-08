"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type WatchResultView, watchAction } from "./actions";

/**
 * MirrorWatchPanel makes the /mirror-watch route action-capable (ui-completeness law, CLAUDE.md §7):
 * the S69 « watch it fail » path has ONE control bound to the REAL engine, reachable AND executable
 * from the screen — author a mirror, materialize it toward its runner, and run it. A code-presence
 * toggle drives the verdict: OFF ⇒ the mirror runs RED against absent code (watch it fail); ON ⇒ a
 * stub turns it GREEN. The live run stream (queued → materialized → running → verdict) renders below.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/mirror-watch (materialize +
 * runStream), never an LLM. THE WALL (§2): running WRITES NOTHING — S69 only RUNS the authored,
 * above-the-line mirror; freezing stays the propose → ChangeSet → approval path (S68/S20). Themed on
 * the ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: WatchResultView = { ok: false, messageKey: "" };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("mirrorWatch");
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

export function MirrorWatchPanel({
	activeProjectId,
	natures,
}: {
	activeProjectId: string | null;
	natures: string[];
}) {
	const t = useTranslations("mirrorWatch");
	const [state, action] = useActionState(watchAction, initial);

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

			{/* Author + materialize + run control (action-capable). */}
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
							{t("natureLabel")}
						</span>
						<select
							name="nature"
							data-testid="watch-nature"
							defaultValue="acceptance"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{natures.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("reflectsLabel")}
						</span>
						<input
							name="reflects"
							data-testid="watch-reflects"
							defaultValue="Order.place"
							placeholder={t("reflectsPlaceholder")}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("sourceLabel")}
					</span>
					<textarea
						name="source"
						data-testid="watch-source"
						rows={5}
						defaultValue={
							"Scenario: place an order\nGiven a cart with an item\nWhen I place the order\nThen an order exists"
						}
						className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						name="codePresent"
						data-testid="watch-code-present"
						className="h-4 w-4 rounded border-input"
					/>
					<span className="font-medium text-foreground">
						{t("codePresentLabel")}
					</span>
					<span className="text-xs text-muted-foreground">
						{t("codePresentNote")}
					</span>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="watch-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{state.messageKey !== "" && (
					<section
						data-testid="watch-result"
						data-ok={state.ok ? "true" : "false"}
						data-red={state.red ? "true" : "false"}
						className={`space-y-3 rounded-xl border p-4 ${
							!state.ok
								? "border-destructive/40 bg-destructive/5"
								: state.red
									? "border-destructive/40 bg-destructive/5"
									: "border-primary/40 bg-primary/5"
						}`}
					>
						<div className="flex flex-wrap items-center gap-2">
							{state.ok && (
								<span
									data-testid="verdict-badge"
									className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${
										state.red
											? "bg-destructive text-destructive-foreground"
											: "bg-primary text-primary-foreground"
									}`}
								>
									{state.red ? t("redBadge") : t("greenBadge")}
								</span>
							)}
							<p
								className={`text-sm font-medium ${
									!state.ok || state.red ? "text-destructive" : "text-primary"
								}`}
							>
								{t(`messages.${state.messageKey}`)}
							</p>
						</div>

						{!state.ok && state.error && (
							<p
								data-testid="watch-error"
								className="font-mono text-xs text-destructive"
							>
								{state.error}
							</p>
						)}

						{state.ok && (
							<div className="space-y-3 text-xs">
								<div className="flex flex-wrap items-center gap-2 text-muted-foreground">
									<span>
										{t("runnerLabel")}:{" "}
										<span data-testid="watch-runner" className="font-mono">
											{state.runner}
										</span>
									</span>
									<span>·</span>
									<span>
										{t("shapeLabel")}:{" "}
										<span className="font-mono">{state.shape}</span>
									</span>
								</div>

								{/* The live run stream — the "watch it fail" feed. */}
								<ol
									data-testid="watch-stream"
									className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3"
								>
									{state.events?.map((e) => (
										<li
											key={e.phase}
											data-phase={e.phase}
											data-status={e.status}
											className="flex items-center gap-2 font-mono"
										>
											<span
												className={`inline-flex h-2 w-2 rounded-full ${
													e.phase === "verdict"
														? e.status === "dead"
															? "bg-destructive"
															: "bg-primary"
														: "bg-muted-foreground"
												}`}
											/>
											<span className="font-semibold text-foreground">
												{e.phase}
											</span>
											<span className="text-muted-foreground">{e.detail}</span>
										</li>
									))}
								</ol>

								<details className="rounded-lg border border-border bg-muted/40 p-3">
									<summary className="cursor-pointer font-medium text-muted-foreground">
										{t("materializedLabel")}
									</summary>
									<pre
										data-testid="materialized-source"
										className="mt-2 whitespace-pre-wrap break-all font-mono text-foreground"
									>
										{state.materializedSource}
									</pre>
								</details>
							</div>
						)}
					</section>
				)}
			</form>
		</div>
	);
}
