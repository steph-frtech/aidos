"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * FirstAppGuide — the interactive, guided checklist for building your first AIDOS
 * application (the onboarding tutorial, /first-app). It walks the KRD verticale from
 * intention to a clickable button: each step is checkable, the progress bar fills, and
 * every step DEEP-LINKS to the real Workbench panel where you actually do it
 * (ui-completeness — « tout se fait par écran »). Progress is persisted in localStorage
 * so the guide survives a reload; it writes no truth and touches no kernel.
 *
 * Client component (interactivity only). All strings arrive translated from the server
 * (next-intl, ADR 0011); tokens only (ADR 0010). Hydration-safe: the completed set starts
 * empty and is loaded in an effect, so server and first client render match.
 */
export type GuideStep = {
	n: number;
	title: string;
	body: string;
	gesture: string;
	doneWhen: string;
	panelLabel: string;
	href: string;
};

export type GuideLabels = {
	progress: string;
	open: string;
	gestureLabel: string;
	doneWhenLabel: string;
	reset: string;
	complete: string;
	completeBody: string;
};

const STORAGE_KEY = "aidos:first-app:done";

export function FirstAppGuide({
	steps,
	labels,
}: {
	steps: GuideStep[];
	labels: GuideLabels;
}) {
	const [done, setDone] = useState<number[]>([]);
	const [hydrated, setHydrated] = useState(false);

	// Load persisted progress after mount (avoids a hydration mismatch).
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					setDone(parsed.filter((x) => typeof x === "number"));
				}
			}
		} catch {
			// ignore corrupt storage — start fresh
		}
		setHydrated(true);
	}, []);

	function persist(next: number[]) {
		setDone(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// storage unavailable (private mode) — progress stays in-memory only
		}
	}

	function toggle(n: number) {
		persist(done.includes(n) ? done.filter((x) => x !== n) : [...done, n]);
	}

	const completed = done.length;
	const total = steps.length;
	const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
	const allDone = hydrated && completed === total && total > 0;

	return (
		<section data-testid="first-app-guide" className="space-y-6">
			{/* Progress */}
			<div className="rounded-xl border border-border bg-card p-4">
				<div className="flex items-center justify-between gap-3">
					<p className="text-sm font-medium text-card-foreground">
						{labels.progress}
					</p>
					<div className="flex items-center gap-3">
						<span
							data-testid="guide-progress"
							className="text-sm font-semibold tabular-nums text-primary"
						>
							{completed} / {total}
						</span>
						<button
							type="button"
							data-testid="guide-reset"
							onClick={() => persist([])}
							className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							{labels.reset}
						</button>
					</div>
				</div>
				<div
					className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuenow={pct}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						data-testid="guide-progress-bar"
						className="h-full rounded-full bg-primary transition-all duration-300"
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>

			{/* Completion banner */}
			{allDone ? (
				<div
					data-testid="guide-complete"
					className="rounded-xl border border-primary/40 bg-primary/10 p-5 text-sm text-primary"
				>
					<p className="font-semibold">{labels.complete}</p>
					<p className="mt-1 leading-relaxed">{labels.completeBody}</p>
				</div>
			) : null}

			{/* Steps */}
			<ol className="space-y-4">
				{steps.map((step) => {
					const isDone = done.includes(step.n);
					return (
						<li
							key={step.n}
							data-testid={`guide-step-${step.n}`}
							data-done={isDone ? "true" : "false"}
							className={
								isDone
									? "rounded-xl border border-primary/40 bg-primary/5 p-5 transition-colors"
									: "rounded-xl border border-border bg-card p-5 transition-colors"
							}
						>
							<div className="flex items-start gap-4">
								<button
									type="button"
									data-testid={`step-toggle-${step.n}`}
									aria-pressed={isDone}
									onClick={() => toggle(step.n)}
									className={
										isDone
											? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums transition-colors"
											: "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground tabular-nums transition-colors hover:border-primary/50 hover:text-primary"
									}
								>
									{isDone ? "✓" : step.n}
								</button>

								<div className="min-w-0 flex-1 space-y-2">
									<h3 className="text-base font-semibold text-card-foreground">
										{step.title}
									</h3>
									<p className="text-sm leading-relaxed text-muted-foreground">
										{step.body}
									</p>

									<div className="flex flex-wrap items-center gap-2 pt-1">
										<span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
											<span className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
												{labels.gestureLabel}
											</span>
											{step.gesture}
										</span>
										<Link
											href={step.href}
											data-testid={`step-open-${step.n}`}
											className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
										>
											{step.panelLabel}
											<span aria-hidden="true">→</span>
										</Link>
									</div>

									<p className="flex gap-1.5 pt-1 text-xs leading-relaxed text-muted-foreground">
										<span className="font-semibold text-card-foreground">
											{labels.doneWhenLabel}
										</span>
										{step.doneWhen}
									</p>
								</div>
							</div>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
