import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the completeness gate + the sample cuts are a static, declared
// projection in lib/completeness.ts (mirroring back/hooks/stop +
// back/kernel/mirror/completeness), covered by lib/completeness.test.ts. This Server
// Component only renders it — no I/O, no clock, no rng — so /completeness shows
// exactly the verdict, the monster set, and the MONSTER BlockReason the Go Stop hook
// produces.
import {
	type CompletenessRun,
	type Monster,
	SAMPLE_BLOCK_EVENTS,
	SAMPLE_BLOCKED_CUT,
	SAMPLE_COMPLETE_CUT,
} from "@/lib/completeness";

export const metadata: Metadata = {
	title: "Complétude / monstre — AIDOS Workbench",
	description:
		"Read-only panel of the Stop completeness gate: the current-cut verdict (COMPLETE / BLOCKED — MONSTER), the monster set with each reason (no_truth_without_mirror; no_orphan_mirror with liveness dead) and a how_to_fix, and a feed of recent Stop block events — the law that forbids monsters, made mechanical.",
};

function VerdictBadge({
	verdict,
	label,
}: {
	verdict: "block" | "pass";
	label: string;
}) {
	const blocked = verdict === "block";
	return (
		<span
			data-testid="current-verdict"
			data-verdict={verdict}
			className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
				blocked
					? "bg-destructive/10 text-destructive"
					: "bg-primary/10 text-primary"
			}`}
		>
			<span
				aria-hidden="true"
				className={`inline-block size-2 rounded-full ${
					blocked ? "bg-destructive" : "bg-primary"
				}`}
			/>
			{label}
		</span>
	);
}

async function MonsterCard({ monster }: { monster: Monster }) {
	const t = await getTranslations("completeness");
	return (
		<article
			data-testid={`monster-${monster.reason}`}
			className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<code
					data-testid="monster-reason"
					className="w-fit rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
				>
					{monster.reason}
				</code>
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t("kindLabel")}: {monster.kind}
				</span>
				{monster.liveness ? (
					<span
						data-testid="monster-liveness"
						className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[0.65rem] font-semibold text-destructive"
					>
						{t("livenessLabel")}: {monster.liveness}
					</span>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span>
					{t("refLabel")}:{" "}
					<code className="font-mono text-card-foreground">{monster.ref}</code>
				</span>
				{monster.missingTestKind ? (
					<span>
						{t("missingTestKindLabel")}:{" "}
						<code className="font-mono text-card-foreground">
							{monster.missingTestKind}
						</code>
					</span>
				) : null}
			</div>
			<div className="space-y-1">
				<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
					{t("howToFixLabel")}
				</p>
				<p className="text-sm leading-relaxed text-card-foreground">
					{monster.howToFix}
				</p>
			</div>
		</article>
	);
}

function BlockEventRow({ run }: { run: CompletenessRun }) {
	return (
		<li
			data-testid="block-event"
			className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
		>
			<span className="flex items-center gap-2">
				<code className="rounded bg-destructive/10 px-2 py-0.5 font-mono text-xs font-semibold text-destructive">
					{run.verdict}
				</code>
				<span className="text-muted-foreground">
					{run.monsterCount} ·{" "}
					<code className="font-mono text-xs">{run.cutHash}</code>
				</span>
			</span>
			<span className="font-mono text-xs text-muted-foreground">{run.at}</span>
		</li>
	);
}

/**
 * /completeness — the completeness-gate panel (S12). Visualizes the Stop hook's
 * verdict over the current cut of mirrors ⋈ kernel (KRD §29, LIVRE XXII): the
 * current-cut verdict (COMPLETE / BLOCKED — MONSTER), the monster set with each
 * reason + how_to_fix, and a feed of recent Stop block events. Source is
 * runtime.completeness_runs; the page PROJECTS it, never re-encodes the law (the
 * live wiring is OQ-S12-3; the seeded sample renders meanwhile).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): the gate is enforced by the
 * harness-invoked Stop Go hook, never from a screen. Read-only is therefore
 * correct — there is no headless capability hidden here, there is none
 * (rerun-on-demand is OQ-S12-1). Themed on ADR 0010 tokens; bilingual via next-intl
 * (ADR 0011).
 */
export default async function CompletenessPage() {
	const t = await getTranslations("completeness");
	// The live cut the panel reports as the current verdict (a BLOCKED cut here, so
	// the law's enforcement is visible). The COMPLETE cut is shown alongside.
	const current = SAMPLE_BLOCKED_CUT;
	const complete = SAMPLE_COMPLETE_CUT;

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("gateBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* The current-cut verdict */}
				<section
					aria-label={t("currentVerdictHeading")}
					className="mt-10 space-y-4"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("currentVerdictHeading")}
					</h2>
					<article className="space-y-3 rounded-xl border border-border bg-card p-5">
						<div className="flex flex-wrap items-center gap-3">
							<VerdictBadge
								verdict={current.verdict}
								label={t(`verdict.${current.verdict}`)}
							/>
							<span className="text-xs text-muted-foreground">
								{t("monsterCountLabel")}: {current.monsterCount}
							</span>
							<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
								{t("cutHashLabel")}: {current.cutHash}
							</code>
						</div>
					</article>
				</section>

				{/* The monster set */}
				<section
					aria-label={t("monsterSetHeading")}
					data-testid="monster-set"
					className="mt-12 space-y-4"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("monsterSetHeading")}
					</h2>
					{current.monsters.length === 0 ? (
						<p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
							{t("emptyMonsterSet")}
						</p>
					) : (
						<div className="grid gap-3 sm:grid-cols-2">
							{current.monsters.map((m) => (
								<MonsterCard key={`${m.reason}-${m.ref}`} monster={m} />
							))}
						</div>
					)}
				</section>

				{/* The current-cut BlockReason */}
				{current.blockReason ? (
					<section
						aria-label={t("blockReasonHeading")}
						className="mt-12 space-y-4"
					>
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("blockReasonHeading")}
						</h2>
						<article
							data-testid="block-reason"
							className="space-y-3 rounded-xl border border-border bg-card p-5"
						>
							<div className="flex flex-wrap items-center gap-2">
								<code
									data-testid="block-reason-code"
									className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
								>
									{current.blockReason.code}
								</code>
								<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
									{t("severityLabel")}: {current.blockReason.severity}
								</span>
							</div>
							<div className="space-y-1">
								<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
									{t("explanationLabel")}
								</p>
								<p className="text-sm leading-relaxed text-card-foreground">
									{current.blockReason.explanation}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
									{t("howToFixLabel")}
								</p>
								<ol
									data-testid="block-reason-howtofix"
									className="list-decimal space-y-1 pl-5 text-sm text-card-foreground"
								>
									{current.blockReason.howToFix.map((step) => (
										<li key={step} className="leading-relaxed">
											{step}
										</li>
									))}
								</ol>
							</div>
						</article>
					</section>
				) : null}

				{/* A complete cut — the negative control: empty set, COMPLETE */}
				<section aria-label={t("completeHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("completeHeading")}
					</h2>
					<article
						data-testid="complete-cut"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-3">
							<span
								data-testid="complete-verdict"
								data-verdict={complete.verdict}
								className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
							>
								<span
									aria-hidden="true"
									className="inline-block size-2 rounded-full bg-primary"
								/>
								{t(`verdict.${complete.verdict}`)}
							</span>
							<span className="text-xs text-muted-foreground">
								{t("monsterCountLabel")}: {complete.monsterCount}
							</span>
						</div>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("completeBody")}
						</p>
					</article>
				</section>

				{/* Block-event feed */}
				<section aria-label={t("eventsAria")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("eventsHeading")}
					</h2>
					<article className="rounded-xl border border-border bg-card p-5">
						<ul className="divide-y divide-border">
							{SAMPLE_BLOCK_EVENTS.map((run) => (
								<BlockEventRow key={run.runId} run={run} />
							))}
						</ul>
					</article>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
