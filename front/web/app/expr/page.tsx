import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the Expr AST shape, the closed catalogue, the seeded sample
// ASTs and the pure evaluator are a static, declared registry in lib/expr.ts
// (mirroring back/kernel/expr), covered by lib/expr.test.ts. This Server
// Component only renders it — no I/O, no clock, no rng — so /expr shows exactly
// the AST kinds the Go Parse accepts, the catalogue it allows, and the evaluated
// visible_when result the fixture mirror proves.
import {
	CATALOGUE,
	type ExprSample,
	flatten,
	NODE_KINDS,
	rootsOf,
	SAMPLES,
	sampleResult,
} from "@/lib/expr";

export const metadata: Metadata = {
	title: "Expr DSL — AIDOS Workbench",
	description:
		"Read-only panel of the Expr DSL: the typed JSON AST (lit/ref/call/obj/arr), the closed function catalogue, and the evaluated visible_when result of $.cart.items.length > 0 against a sample Env.",
};

const KIND_GLOSS: Record<string, string> = {
	lit: "literal",
	ref: "$-rooted ref",
	call: "catalogue fn",
	obj: "object composer",
	arr: "array composer",
};

function SampleCard({
	sample,
	resultLabel,
	rootsLabel,
	astLabel,
	envLabel,
}: {
	sample: ExprSample;
	resultLabel: string;
	rootsLabel: string;
	astLabel: string;
	envLabel: string;
}) {
	const flat = flatten(sample.ast);
	const result = sampleResult(sample);
	const roots = rootsOf(sample.ast);
	return (
		<article
			data-testid={`expr-sample-${sample.id}`}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-2">
				<code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
					{sample.source}
				</code>
			</div>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{sample.role}
			</p>

			{/* The typed AST node tree */}
			<div className="space-y-1">
				<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
					{astLabel}
				</p>
				<ul
					data-testid={`expr-tree-${sample.id}`}
					className="font-mono text-xs"
				>
					{flat.map((n) => (
						<li
							key={n.id}
							className="flex items-center gap-2 py-0.5"
							style={{ paddingLeft: `${n.depth * 1.1}rem` }}
						>
							<span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-primary">
								{n.kind}
							</span>
							<span className="text-card-foreground">{n.label}</span>
						</li>
					))}
				</ul>
			</div>

			{/* Resolved roots */}
			{roots.length > 0 && (
				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{rootsLabel}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{roots.map((r) => (
							<code
								key={r}
								className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground"
							>
								{r}
							</code>
						))}
					</div>
				</div>
			)}

			{/* Env + evaluated result */}
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{envLabel}
					</p>
					<code className="block rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
						{JSON.stringify(sample.env)}
					</code>
				</div>
				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{resultLabel}
					</p>
					<code
						data-testid={`expr-result-${sample.id}`}
						className="inline-flex items-center rounded bg-primary/10 px-2.5 py-1 font-mono text-sm font-semibold text-primary"
					>
						{result}
					</code>
				</div>
			</div>
		</article>
	);
}

/**
 * /expr — the Expr DSL panel (S08). Visualizes the comportement-as-artifact
 * (KRD §24.5): the typed JSON AST (lit/ref/call/obj/arr), the CLOSED function
 * catalogue, and the evaluated visible_when result of $.cart.items.length > 0
 * against a sample Env (true for a non-empty cart, false for an empty one).
 * Source is kernel.expr; the page PROJECTS it (the live SELECT wiring is a later
 * tooth; the seeded samples render meanwhile, mirroring the fixture mirror).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): an Expr AST is truth, written only by
 * the aidos CLI through an approved ChangeSet — never from a screen. Read-only is
 * therefore correct; there is no headless capability hidden here. Themed on ADR
 * 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ExprPage() {
	const t = await getTranslations("expr");

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

				{/* Tutorial — how to read an Expr (ui-completeness mandate) */}
				<section
					aria-label={t("tutorialHeading")}
					data-testid="expr-tutorial"
					className="mt-10 space-y-3 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("tutorialLead")}</p>
					<ul className="space-y-2 text-sm leading-relaxed text-card-foreground">
						<li>{t("tutorialSteps.kinds")}</li>
						<li>{t("tutorialSteps.catalogue")}</li>
						<li>{t("tutorialSteps.roots")}</li>
						<li>{t("tutorialSteps.example")}</li>
					</ul>
				</section>

				{/* The five node kinds */}
				<section aria-label={t("kindsHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("kindsHeading")}
					</h2>
					<div className="flex flex-wrap gap-2" data-testid="expr-kinds">
						{NODE_KINDS.map((k) => (
							<span
								key={k}
								className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
							>
								<code className="font-mono font-semibold text-card-foreground">
									{k}
								</code>
								<span className="text-xs text-muted-foreground">
									{KIND_GLOSS[k]}
								</span>
							</span>
						))}
					</div>
				</section>

				{/* The closed catalogue */}
				<section aria-label={t("catalogueHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("catalogueHeading")}
					</h2>
					<div className="flex flex-wrap gap-2" data-testid="expr-catalogue">
						{CATALOGUE.map((c) => (
							<code
								key={c.name}
								className="rounded bg-muted px-2 py-1 font-mono text-sm text-card-foreground"
							>
								{c.name}
							</code>
						))}
					</div>
				</section>

				{/* The sample ASTs + evaluated visible_when */}
				<section aria-label={t("samplesHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("samplesHeading")}
					</h2>
					<div className="grid gap-4">
						{SAMPLES.map((s) => (
							<SampleCard
								key={s.id}
								sample={s}
								resultLabel={t("resultLabel")}
								rootsLabel={t("rootsLabel")}
								astLabel={t("astLabel")}
								envLabel={t("envLabel")}
							/>
						))}
					</div>
				</section>

				{/* The rejection: a non-catalogue function (no free-code escape) */}
				<section aria-label={t("rejectedHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("rejectedHeading")}
					</h2>
					<article
						data-testid="expr-rejected"
						className="space-y-2 rounded-xl border border-border bg-card p-5"
					>
						<p className="text-sm leading-relaxed text-card-foreground">
							{t("rejectedExplain")}
						</p>
						<code className="block rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">
							{t("rejectedExample")}
						</code>
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
