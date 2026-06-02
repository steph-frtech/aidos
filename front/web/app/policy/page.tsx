import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the Policy AST shape, the scope/rule-kind sets, the §93
// canPlaceOrder anchor, the canonical serializer and the pure evaluator are a
// static, declared registry in lib/policy.ts (mirroring back/kernel/policy),
// covered by lib/policy.test.ts. This Server Component only renders it — no I/O,
// no clock, no rng — so /policy shows exactly the rule tree Go evaluates and the
// ALLOW/DENY verdict the property + fixture mirrors prove.
import {
	CAN_PLACE_ORDER,
	canonicalize,
	flatten,
	type PolicySample,
	RULE_KINDS,
	SAMPLES,
	SCOPES,
	sampleDecision,
} from "@/lib/policy";

export const metadata: Metadata = {
	title: "Policy DSL — AIDOS Workbench",
	description:
		"Read-only panel of the Policy DSL: the ALLOW/DENY rule tree (KRD §24.4, §93), the canPlaceOrder anchor (scope OPERATION createOrder), and its evaluated decision against sample authorization contexts.",
};

const RULE_GLOSS: Record<string, string> = {
	all: "all hold (∧)",
	any: "some holds (∨)",
	not: "negation",
	eq: "equals",
	gt: "greater than",
	lt: "less than",
	exists: "selector resolves",
	matches: "string matches",
};

/** The content-address of canPlaceOrder: SHA-256 of the canonical AST (== Go id). */
function contentAddress(): string {
	return createHash("sha256")
		.update(canonicalize(CAN_PLACE_ORDER))
		.digest("hex");
}

function DecisionBadge({ decision }: { decision: "ALLOW" | "DENY" }) {
	const allow = decision === "ALLOW";
	return (
		<code
			className={`inline-flex items-center rounded px-2.5 py-1 font-mono text-sm font-semibold ${
				allow
					? "bg-primary/10 text-primary"
					: "bg-destructive/10 text-destructive"
			}`}
		>
			{decision}
		</code>
	);
}

function SampleCard({
	sample,
	ctxLabel,
	decisionLabel,
}: {
	sample: PolicySample;
	ctxLabel: string;
	decisionLabel: string;
}) {
	const decision = sampleDecision(sample);
	return (
		<article
			data-testid={`policy-sample-${sample.id}`}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<p className="text-sm leading-relaxed text-card-foreground">
				{sample.role}
			</p>
			<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{ctxLabel}
					</p>
					<code className="block rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
						{JSON.stringify(sample.ctx)}
					</code>
				</div>
				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{decisionLabel}
					</p>
					<span data-testid={`policy-decision-${sample.id}`}>
						<DecisionBadge decision={decision} />
					</span>
				</div>
			</div>
		</article>
	);
}

/**
 * /policy — the Policy DSL panel (S09). Visualizes authorization-as-artifact
 * (KRD §24.4, §93): the canPlaceOrder ALLOW/DENY rule tree (the all([…]) node + its
 * three named leaves), its scope/effect, its content-address id + above-the-line
 * authority badge, and a "try a context" panel showing the evaluated ALLOW/DENY
 * decision (authed + matching non-empty cart → ALLOW; missing auth or empty cart →
 * DENY). Source is kernel.policy; the page PROJECTS it (the live SELECT wiring is a
 * later tooth; the seeded anchor + samples render meanwhile, mirroring the fixture
 * mirror).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): a Policy AST is truth, written only by
 * the aidos CLI through an approved ChangeSet — never from a screen. Read-only is
 * therefore correct; there is no headless capability hidden here. Themed on ADR
 * 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function PolicyPage() {
	const t = await getTranslations("policy");
	const id = contentAddress();
	const flat = flatten(CAN_PLACE_ORDER.rule);

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
							data-testid="policy-authority"
							className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
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

				{/* Tutorial — how to read a policy (ui-completeness mandate) */}
				<section
					aria-label={t("tutorialHeading")}
					data-testid="policy-tutorial"
					className="mt-10 space-y-3 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("tutorialLead")}</p>
					<ul className="space-y-2 text-sm leading-relaxed text-card-foreground">
						<li>{t("tutorialSteps.scope")}</li>
						<li>{t("tutorialSteps.rule")}</li>
						<li>{t("tutorialSteps.effect")}</li>
						<li>{t("tutorialSteps.example")}</li>
					</ul>
				</section>

				{/* The canPlaceOrder anchor: scope, effect, rule tree, content address */}
				<section aria-label={t("anchorHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("anchorHeading")}
					</h2>
					<article
						data-testid="policy-anchor"
						className="space-y-4 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
								policy &quot;canPlaceOrder&quot;
							</code>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{t("scopeLabel")}:{" "}
								<code className="font-mono">OPERATION createOrder</code>
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
								{t("effectLabel")}: ALLOW
							</span>
						</div>

						{/* The typed rule tree */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("ruleLabel")}
							</p>
							<ul data-testid="policy-rule-tree" className="font-mono text-xs">
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

						{/* The content address */}
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("idLabel")}
							</p>
							<code
								data-testid="policy-id"
								className="block break-all rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground"
							>
								{id}
							</code>
						</div>
					</article>
				</section>

				{/* The four scopes */}
				<section aria-label={t("scopesHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("scopesHeading")}
					</h2>
					<div className="flex flex-wrap gap-2" data-testid="policy-scopes">
						{SCOPES.map((s) => (
							<code
								key={s}
								className="rounded bg-muted px-2 py-1 font-mono text-sm text-card-foreground"
							>
								{s}
							</code>
						))}
					</div>
				</section>

				{/* The eight rule kinds */}
				<section aria-label={t("kindsHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("kindsHeading")}
					</h2>
					<div className="flex flex-wrap gap-2" data-testid="policy-kinds">
						{RULE_KINDS.map((k) => (
							<span
								key={k}
								className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
							>
								<code className="font-mono font-semibold text-card-foreground">
									{k}
								</code>
								<span className="text-xs text-muted-foreground">
									{RULE_GLOSS[k]}
								</span>
							</span>
						))}
					</div>
				</section>

				{/* Try a context → ALLOW/DENY decision */}
				<section aria-label={t("tryHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tryHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("tryLead")}</p>
					<div className="grid gap-4">
						{SAMPLES.map((s) => (
							<SampleCard
								key={s.id}
								sample={s}
								ctxLabel={t("ctxLabel")}
								decisionLabel={t("decisionLabel")}
							/>
						))}
					</div>
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
