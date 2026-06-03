"use client";

import { useState } from "react";

/**
 * FirstAppBuilder — the HANDS-ON guided builder for /first-app. Instead of reading the
 * KRD loop, the user DOES it: at each stage an arrow ("Cliquez ici") points at the one
 * highlighted button, the user clicks, the pipeline (Idée → … → Bouton) fills, and the
 * last stage is the real clickable checkout button they just built — clicking it places
 * the order. A guided coach-mark walkthrough, not a concept page.
 *
 * Client component (interaction only); all strings arrive translated from the server
 * (next-intl, ADR 0011), design tokens only (ADR 0010). It writes no truth and simulates
 * the loop locally — the real panels are linked separately on the page.
 */
export type BuilderStage = {
	n: number;
	action: string;
	active: string;
	done: string;
	node: string;
};

export type BuilderLabels = {
	arrow: string;
	restart: string;
	progress: string;
	intentionLabel: string;
	intention: string;
	complete: string;
	completeBody: string;
	orderPlaced: string;
};

export function FirstAppBuilder({
	stages,
	labels,
}: {
	stages: BuilderStage[];
	labels: BuilderLabels;
}) {
	const total = stages.length;
	const [done, setDone] = useState(0); // number of completed stages (0..total)
	const allDone = done >= total;
	const activeN = done + 1; // the stage whose action is currently highlighted

	return (
		<section data-testid="first-app-builder" className="space-y-6">
			{/* The intention + progress */}
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
				<div>
					<p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
						{labels.intentionLabel}
					</p>
					<p className="mt-0.5 text-sm font-medium text-card-foreground">
						« {labels.intention} »
					</p>
				</div>
				<div className="flex items-center gap-3">
					<span
						data-testid="builder-progress"
						className="text-sm font-semibold tabular-nums text-primary"
					>
						{done} / {total}
					</span>
					<button
						type="button"
						data-testid="builder-restart"
						onClick={() => setDone(0)}
						className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{labels.restart}
					</button>
				</div>
			</div>

			{/* Pipeline — fills Idée → … → Bouton as you go */}
			<div
				data-testid="builder-pipeline"
				className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-3"
			>
				{stages.map((s, i) => {
					const reached = s.n <= done;
					const isActive = s.n === activeN && !allDone;
					return (
						<div key={s.n} className="flex items-center gap-1">
							<div
								data-testid={`pipeline-node-${s.n}`}
								data-done={reached ? "true" : "false"}
								className={
									reached
										? "flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
										: isActive
											? "flex items-center gap-1.5 rounded-full border border-primary/50 px-2.5 py-1 text-xs font-medium text-primary"
											: "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground"
								}
							>
								<span className="tabular-nums">{reached ? "✓" : s.n}</span>
								{s.node}
							</div>
							{i < stages.length - 1 ? (
								<span
									aria-hidden="true"
									className={
										s.n < done ? "text-primary" : "text-muted-foreground/40"
									}
								>
									→
								</span>
							) : null}
						</div>
					);
				})}
			</div>

			{/* Completion banner */}
			{allDone ? (
				<div
					data-testid="builder-complete"
					className="rounded-xl border border-primary/40 bg-primary/10 p-5 text-sm text-primary"
				>
					<p className="font-semibold">{labels.complete}</p>
					<p className="mt-1 leading-relaxed">{labels.completeBody}</p>
				</div>
			) : null}

			{/* Stages */}
			<ol className="space-y-3">
				{stages.map((s) => {
					const isDone = s.n <= done;
					const isActive = s.n === activeN && !allDone;
					const isLast = s.n === total;

					return (
						<li
							key={s.n}
							data-testid={`builder-stage-${s.n}`}
							data-state={isDone ? "done" : isActive ? "active" : "todo"}
							className={
								isActive
									? "rounded-xl border-2 border-primary/50 bg-card p-5 shadow-sm"
									: isDone
										? "rounded-xl border border-primary/30 bg-primary/5 p-4"
										: "rounded-xl border border-border bg-card/40 p-4 opacity-60"
							}
						>
							<div className="flex items-start gap-4">
								<span
									className={
										isDone
											? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
											: isActive
												? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary text-sm font-semibold text-primary tabular-nums"
												: "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground tabular-nums"
									}
								>
									{isDone ? "✓" : s.n}
								</span>

								<div className="min-w-0 flex-1">
									<h3
										className={
											isActive || isDone
												? "text-base font-semibold text-card-foreground"
												: "text-base font-semibold text-muted-foreground"
										}
									>
										{s.node} — {s.action}
									</h3>

									{isDone ? (
										<p className="mt-1 text-sm leading-relaxed text-primary">
											{s.done}
										</p>
									) : isActive ? (
										<>
											<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
												{s.active}
											</p>

											{/* The arrow + the highlighted action */}
											<div className="mt-4 flex flex-wrap items-center gap-3">
												<span
													data-testid="builder-arrow"
													className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
												>
													{labels.arrow}
													<span aria-hidden="true" className="text-base">
														→
													</span>
												</span>

												{isLast ? (
													// The built app: the real clickable checkout button
													<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
														<span className="text-xs text-muted-foreground">
															🛒 2 × article
														</span>
														<button
															type="button"
															data-testid={`builder-action-${s.n}`}
															onClick={() => setDone(s.n)}
															className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm ring-2 ring-primary ring-offset-2 ring-offset-background transition-colors hover:bg-primary/80"
														>
															{s.action}
														</button>
													</div>
												) : (
													<button
														type="button"
														data-testid={`builder-action-${s.n}`}
														onClick={() => setDone(s.n)}
														className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm ring-2 ring-primary ring-offset-2 ring-offset-background transition-colors hover:bg-primary/80"
													>
														{s.action}
													</button>
												)}
											</div>
										</>
									) : (
										<p className="mt-1 text-sm text-muted-foreground/70">
											{s.active}
										</p>
									)}
								</div>
							</div>
						</li>
					);
				})}
			</ol>

			{/* Order-placed confirmation (the result of clicking the built button) */}
			{allDone ? (
				<div
					data-testid="order-placed"
					className="rounded-xl border border-primary/40 bg-card p-4 text-sm font-medium text-primary"
				>
					{labels.orderPlaced}
				</div>
			) : null}
		</section>
	);
}
