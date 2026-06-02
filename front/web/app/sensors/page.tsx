import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the computational sensor suite + the sample runs are a static,
// declared registry in lib/sensors.ts (mirroring back/hooks/posttooluse), covered
// by lib/sensors.test.ts. This Server Component only renders it — no I/O, no clock,
// no rng — so /sensors shows exactly the suite the Go hook runs at PostToolUse and
// the SENSOR_FAILED refusal it emits.
import {
	SAMPLE_BLOCK_EVENT,
	SAMPLE_LATEST_RUN,
	type Sensor,
	sensorSuite,
} from "@/lib/sensors";

export const metadata: Metadata = {
	title: "Les sensors — AIDOS Workbench",
	description:
		"Read-only panel of the PostToolUse computational sensors: the suite (gofmt, vet, lint, archtest, affected), the latest run's per-check verdicts, and a feed of SENSOR_FAILED block events — on_fail: block, self-certified on the computational only.",
};

function SensorCard({ sensor }: { sensor: Sensor }) {
	return (
		<article
			data-testid={`sensor-${sensor.name}`}
			className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
					{sensor.name}
				</code>
				<span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{sensor.slot}
				</span>
			</div>
			<code className="font-mono text-xs text-muted-foreground">
				{sensor.tool}
			</code>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{sensor.role}
			</p>
		</article>
	);
}

/**
 * /sensors — the sensors panel (S07). Visualizes the PostToolUse computational
 * drawer (KRD §19): the sensor suite (gofmt, vet, lint, archtest, affected), the
 * latest run with each check's pass/fail + duration, and a feed of SENSOR_FAILED
 * block events. Source is runtime.sensor_runs; the page PROJECTS it, never
 * re-encodes it (the live wiring is OQ-S07-3; the seeded sample renders meanwhile).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): the sensors are enforced by the
 * harness-invoked PostToolUse Go hook, never from a screen. Read-only is therefore
 * correct — there is no headless capability hidden here, there is none (rerun on
 * demand is OQ-S07-1). Themed on ADR 0010 tokens; bilingual via next-intl (ADR
 * 0011).
 */
export default async function SensorsPage() {
	const suite = sensorSuite();
	const latest = SAMPLE_LATEST_RUN;
	const event = SAMPLE_BLOCK_EVENT;
	const t = await getTranslations("sensors");

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
							{t("computationalBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* The computational sensor suite (KRD §74 / §19's per-diff drawer) */}
				<section
					aria-label={t("suiteHeading")}
					data-testid="sensor-suite"
					className="mt-10 space-y-4"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("suiteHeading")}
					</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{suite.map((s) => (
							<SensorCard key={s.name} sensor={s} />
						))}
					</div>
				</section>

				{/* The latest run — per-check verdict + duration */}
				<section aria-label={t("latestHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("latestHeading")}
					</h2>
					<article
						data-testid="latest-run"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
								<span
									aria-hidden="true"
									className="inline-block size-2 rounded-full bg-primary"
								/>
								{t("verdictLabel")}: {t(`verdict.${latest.verdict}`)}
							</span>
							<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
								{latest.target}
							</code>
						</div>
						<ul className="divide-y divide-border">
							{latest.results.map((r) => (
								<li
									key={r.name}
									data-testid={`latest-check-${r.name}`}
									className="flex items-center justify-between py-2 text-sm"
								>
									<span className="flex items-center gap-2">
										<span
											aria-hidden="true"
											className={`inline-block size-2 rounded-full ${
												r.pass ? "bg-primary" : "bg-destructive"
											}`}
										/>
										<code className="font-mono text-card-foreground">
											{r.name}
										</code>
										<span className="text-xs text-muted-foreground">
											{r.pass ? t("checkPass") : t("checkFail")}
										</span>
									</span>
									<span className="font-mono text-xs text-muted-foreground">
										{r.durationMs} ms
									</span>
								</li>
							))}
						</ul>
					</article>
				</section>

				{/* Block-event feed: the SENSOR_FAILED BlockReason the hook returns */}
				<section aria-label={t("eventsAria")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("eventsHeading")}
					</h2>
					<article
						data-testid="block-event"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<code
								data-testid="block-event-code"
								className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
							>
								{event.blockReason?.code}
							</code>
							<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{t("severityLabel")}: {event.blockReason?.severity}
							</span>
							<span
								data-testid="block-event-failing"
								className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
							>
								{t("failingLabel")}:{" "}
								{event.results
									.filter((r) => !r.pass)
									.map((r) => r.name)
									.join(", ")}
							</span>
						</div>
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("explanationLabel")}
							</p>
							<p className="text-sm leading-relaxed text-card-foreground">
								{event.blockReason?.explanation}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("howToFixLabel")}
							</p>
							<ol
								data-testid="block-event-howtofix"
								className="list-decimal space-y-1 pl-5 text-sm text-card-foreground"
							>
								{event.blockReason?.howToFix.map((step) => (
									<li key={step} className="leading-relaxed">
										{step}
									</li>
								))}
							</ol>
						</div>
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
