import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the Operation AST shape, the six-verb set, the §93
// createOrder anchor, the pipeline projection and the fixture interpreter are a
// static, declared registry in lib/operation.ts (mirroring back/kernel/operation),
// covered by lib/operation.test.ts. This Server Component only renders it — no I/O,
// no clock, no rng — so /operation shows exactly the pipeline Go walks and the
// event trace the fixture mirror proves.
import {
	CREATE_ORDER,
	createOrderHappyTrace,
	HAPPY_STATE,
	pipeline,
	STEP_KINDS,
} from "@/lib/operation";

export const metadata: Metadata = {
	title: "Operation DSL — AIDOS Workbench",
	description:
		"Read-only panel of the Operation DSL: the createOrder step pipeline (KRD §24.3, §93) and the createOrder/happy fixture trace (state → command → events) with a PASS/FAIL badge.",
};

const VERB_KEYS = STEP_KINDS;

function ChipArrow() {
	return (
		<span aria-hidden className="px-1 text-muted-foreground">
			→
		</span>
	);
}

/**
 * /operation — the Operation DSL panel (S10). Visualizes workflow-as-artifact
 * (KRD §24.3, §93): the createOrder step pipeline as ordered typed chips
 * (validate → authorize → read → mutate → mutate → return, read from the operation
 * AST shape), the six verbs, and the createOrder/happy fixture event trace — the
 * given state, the createOrder command, the resulting ordered events OrderCreated
 * then CartCleared, the return {status, total}, and a PASS/FAIL badge.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /operation is a visualization; it
 * projects the kernel.operation AST and the fixture RESULT — it runs no truth
 * writes and exposes no capability. An operation AST is written only by the aidos
 * CLI through an approved ChangeSet; a mutate reaches the world only through an
 * injected Mutator seam (below the waterline). There is no headless capability
 * hidden here; read-only is correct. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function OperationPage() {
	const t = await getTranslations("operation");
	const chips = pipeline(CREATE_ORDER);
	const trace = createOrderHappyTrace();

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
							{t("kernelBadge")}
						</span>
						<span
							data-testid="operation-authority"
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{t("authorityBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("subtitle")}
					</p>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial — how to read an operation (ui-completeness mandate) */}
				<section
					aria-label={t("tutorialHeading")}
					data-testid="operation-tutorial"
					className="mt-10 space-y-3 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("tutorialLead")}</p>
					<ul className="space-y-2 text-sm leading-relaxed text-card-foreground">
						<li>{t("tutorialSteps.pipeline")}</li>
						<li>{t("tutorialSteps.authorize")}</li>
						<li>{t("tutorialSteps.events")}</li>
						<li>{t("tutorialSteps.fixture")}</li>
					</ul>
				</section>

				{/* The createOrder pipeline: ordered typed chips */}
				<section aria-label={t("pipelineHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("pipelineHeading")}
					</h2>
					<article
						data-testid="operation-anchor"
						className="space-y-4 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
								operation &quot;{CREATE_ORDER.name}&quot;
							</code>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{t("inputLabel")}:{" "}
								<code className="font-mono">{CREATE_ORDER.input}</code>
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{t("emitsLabel")}:{" "}
								<code className="font-mono">
									{CREATE_ORDER.emits.join(", ")}
								</code>
							</span>
						</div>

						<ol
							data-testid="operation-pipeline"
							className="flex flex-wrap items-center gap-y-2"
						>
							{chips.map((c, i) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: chips are a fixed ordered pipeline; index IS the stable position
									key={i}
									data-testid={`operation-chip-${i}`}
									className="flex items-center"
								>
									<span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs">
										<span className="font-semibold uppercase text-primary">
											{c.kind}
										</span>
										<span className="text-card-foreground">{c.label}</span>
									</span>
									{i < chips.length - 1 ? <ChipArrow /> : null}
								</li>
							))}
						</ol>
					</article>
				</section>

				{/* The six verbs */}
				<section aria-label={t("verbsHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("verbsHeading")}
					</h2>
					<div className="flex flex-wrap gap-2" data-testid="operation-verbs">
						{VERB_KEYS.map((k) => (
							<span
								key={k}
								className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
							>
								<code className="font-mono font-semibold text-card-foreground">
									{k}
								</code>
								<span className="text-xs text-muted-foreground">
									{t(`verbs.${k}`)}
								</span>
							</span>
						))}
					</div>
				</section>

				{/* The fixture event trace + PASS/FAIL badge */}
				<section aria-label={t("traceHeading")} className="mt-12 space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("traceHeading")}
						</h2>
						<span
							data-testid="operation-fixture-badge"
							className={`inline-flex items-center rounded px-2.5 py-1 font-mono text-sm font-semibold ${
								trace.pass
									? "bg-primary/10 text-primary"
									: "bg-destructive/10 text-destructive"
							}`}
						>
							{trace.pass ? t("passLabel") : t("failLabel")}
						</span>
					</div>
					<p className="text-sm text-muted-foreground">{t("traceLead")}</p>

					<article
						data-testid="operation-trace"
						className="space-y-4 rounded-xl border border-border bg-card p-5"
					>
						{/* given state */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("givenLabel")}
							</p>
							<code className="block break-all rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
								{JSON.stringify(HAPPY_STATE)}
							</code>
						</div>

						{/* command */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("commandLabel")}
							</p>
							<code className="block rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
								createOrder {`{ cartId: "c1" }`}
							</code>
						</div>

						{/* ordered events */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("eventsLabel")}
							</p>
							<ol
								data-testid="operation-events"
								className="flex flex-wrap items-center gap-y-2"
							>
								{trace.events.map((ev, i) => (
									<li key={ev} className="flex items-center">
										<code
											data-testid={`operation-event-${i}`}
											className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary"
										>
											{ev}
										</code>
										{i < trace.events.length - 1 ? <ChipArrow /> : null}
									</li>
								))}
							</ol>
						</div>

						{/* return ref */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("returnLabel")}
							</p>
							<code
								data-testid="operation-return"
								className="block rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground"
							>
								{JSON.stringify({ status: trace.status, total: trace.total })}
							</code>
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
