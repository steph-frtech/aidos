"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CarveView,
	type RefactorView,
	runRefactorAction,
	startStranglerAction,
} from "./actions";

/**
 * StranglerPanel makes the /strangler route action-capable (ui-completeness law, CLAUDE.md §7):
 * S104 has TWO controls bound to the REAL strangler engine, reachable AND executable from the
 * screen —
 *
 *   1. START A STRANGLER CELL — carve a cell around the legacy and FREEZE its current behaviour
 *      into characterization mirrors (the done-criterion's "UI pour démarrer une cellule
 *      strangler").
 *   2. RUN THE REFACTOR inside the frozen cell, with two toggles: "break behaviour" (a
 *      characterization drift) and "break contract" — a preserving + contract-honoring refactor
 *      is ACCEPTED; a drift or a broken contract is REFUSED with its BlockReason.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both controls run the PURE twin lib/strangler, never an
 * LLM — same input → identical result. THE WALL (§2): they WRITE NOTHING — the StranglerCell +
 * its characterization mirrors are a value (the ChangeSet proposes them above the line). Themed
 * on ADR 0010 tokens; strings via next-intl (0011).
 */

const carveInitial: CarveView = { ok: false };
const refactorInitial: RefactorView = {
	ok: false,
	brokeBehaviour: false,
	brokeContract: false,
};

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("strangler");
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

export function StranglerPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("strangler");
	const [carved, carveDispatch] = useActionState(
		startStranglerAction,
		carveInitial,
	);
	const [ref, refDispatch] = useActionState(runRefactorAction, refactorInitial);

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

			{/* ── 1. Start a strangler cell (carve + freeze) ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("carveHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("carveBody")}
				</p>
				<form action={carveDispatch}>
					<Submit label={t("startStrangler")} testId="start-strangler" />
				</form>

				{carved.ok && carved.cell ? (
					<div
						data-testid="carve-result"
						className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className="font-medium text-foreground">
								{t("cellLabel")}:
							</span>
							<span
								data-testid="cell-ref"
								className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary"
							>
								{carved.cell.cell}
							</span>
							<span className="font-medium text-foreground">
								{t("contractLabel")}:
							</span>
							<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
								{carved.cell.publishedContract ?? "—"}
							</span>
						</div>
						<div className="text-xs text-muted-foreground">
							<span className="font-medium text-foreground">
								{t("frozenLabel")}:
							</span>{" "}
							<span data-testid="frozen-count" className="font-mono">
								{(carved.mirrors ?? []).length}
							</span>
						</div>
						<ul className="space-y-1">
							{(carved.mirrors ?? []).map((m) => (
								<li
									key={m.id}
									data-testid={`mirror-${m.scenario.replace(/\s+/g, "-")}`}
									className="flex items-center gap-2 text-xs text-muted-foreground"
								>
									<span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-emerald-600 dark:text-emerald-400">
										{t("characterization")}
									</span>
									<span className="font-mono text-foreground">
										{m.scenario}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : carved.error ? (
					<p data-testid="carve-error" className="text-xs text-destructive">
						{carved.error}
					</p>
				) : null}
			</section>

			{/* ── 2. Refactor inside the frozen cell ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("refactorHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("refactorBody")}
				</p>
				<form action={refDispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="brokeBehaviour"
							data-testid="break-behaviour"
							className="h-4 w-4 rounded border-border"
						/>
						{t("breakBehaviourLabel")}
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="brokeContract"
							data-testid="break-contract"
							className="h-4 w-4 rounded border-border"
						/>
						{t("breakContractLabel")}
					</label>
					<Submit label={t("runRefactor")} testId="run-refactor" />
				</form>

				{ref.ok && ref.verdict ? (
					<div data-testid="refactor-result" className="space-y-3">
						<div className="flex items-center gap-2 text-sm">
							<span className="font-medium text-foreground">
								{t("verdictLabel")}:
							</span>
							<span
								data-testid="refactor-verdict"
								className={
									ref.verdict.accepted
										? "inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
										: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
								}
							>
								{ref.verdict.accepted ? t("accepted") : t("refused")}
							</span>
						</div>
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="pb-2">{t("scenarioColumn")}</th>
									<th className="pb-2">{t("statusColumn")}</th>
								</tr>
							</thead>
							<tbody>
								{ref.verdict.mirrors.map((m) => (
									<tr
										key={m.mirrorId}
										data-testid={`verdict-row-${m.scenario.replace(/\s+/g, "-")}`}
										className="border-t border-border"
									>
										<td className="py-2 font-mono text-foreground">
											{m.scenario}
										</td>
										<td className="py-2">
											<span
												data-testid={`verdict-status-${m.scenario.replace(/\s+/g, "-")}`}
												className={
													m.green
														? "inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
														: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
												}
											>
												{m.green ? t("green") : t("drift")}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{ref.verdict.block ? (
							<div
								data-testid="refactor-block"
								className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
							>
								<div
									data-testid="block-code"
									className="font-mono text-xs font-semibold text-destructive"
								>
									{ref.verdict.block.code}
								</div>
								<p className="text-xs text-muted-foreground">
									{ref.verdict.block.message}
								</p>
							</div>
						) : null}
					</div>
				) : null}
			</section>
		</div>
	);
}
