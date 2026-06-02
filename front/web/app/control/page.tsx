import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the control-spec / action-spec shapes, the §24.1/§24.2 anchors,
// EvalState and planAction are a static, declared registry in lib/control.ts
// (mirroring back/kernel/control + back/kernel/action), covered by lib/control.test.ts.
// This Server Component only renders it — no I/O, no clock, no rng — so /control shows
// exactly the button state Go computes and the bind the action fixture proves.
import { CHECKOUT_BUTTON, CHECKOUT_SUBMIT, controlTrace } from "@/lib/control";

export const metadata: Metadata = {
	title: "Control & Action — AIDOS Workbench",
	description:
		"Read-only panel of the control-spec (button-as-source) and the action-spec that binds it to an operation (KRD §24.1, §24.2, §94): the checkout-button control, the checkout-submit action → invoke operation createOrder, and the button state fixture (given → visible/enabled) with a PASS/FAIL badge.",
};

function ArrowSep() {
	return (
		<span aria-hidden className="px-1 text-muted-foreground">
			→
		</span>
	);
}

/**
 * /control — the control-spec + action-spec panel (S11). Visualizes
 * behaviour-as-artifact ALL THE WAY DOWN TO THE BUTTON (KRD §24.1/§24.2/§94): the
 * checkout-button control (view/label, its visible_when/enabled_when Expr conditions,
 * its triggers → action link), the checkout-submit action (on click, its
 * invoke/binds → operation createOrder with {cart,user}, its on_success/on_error
 * effects), and the live state-fixture table (the three given rows with their
 * computed visible/enabled) plus a PASS/FAIL badge.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /control is a visualization; it projects
 * the kernel.control / kernel.action AST and the fixture RESULT — it runs no truth
 * writes and exposes no capability. The control/action ASTs are written only by the
 * aidos CLI through an approved ChangeSet; the rendered button + onClick handler are
 * a later projection (S38). There is no headless capability hidden here — the
 * interpreter is a pure lib, no backend op to bind — so read-only is correct. Themed
 * on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ControlPage() {
	const t = await getTranslations("control");
	const trace = controlTrace();

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
							data-testid="control-authority"
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

				{/* Tutorial — how to read a control and its action (ui-completeness) */}
				<section
					aria-label={t("tutorialHeading")}
					data-testid="control-tutorial"
					className="mt-10 space-y-3 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("tutorialLead")}</p>
					<ul className="space-y-2 text-sm leading-relaxed text-card-foreground">
						<li>{t("tutorialSteps.control")}</li>
						<li>{t("tutorialSteps.triggers")}</li>
						<li>{t("tutorialSteps.binds")}</li>
						<li>{t("tutorialSteps.fixture")}</li>
					</ul>
				</section>

				{/* The control-spec card */}
				<section aria-label={t("controlHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("controlHeading")}
					</h2>
					<article
						data-testid="control-card"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
								control &quot;{CHECKOUT_BUTTON.name}&quot;
							</code>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{t("viewLabel")}:{" "}
								<code className="font-mono">{CHECKOUT_BUTTON.view}</code>
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{t("labelLabel")}:{" "}
								<code className="font-mono">{CHECKOUT_BUTTON.label}</code>
							</span>
						</div>
						<dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
							<dt className="font-medium text-muted-foreground">
								{t("visibleWhenLabel")}
							</dt>
							<dd>
								<code className="font-mono text-xs text-card-foreground">
									{CHECKOUT_BUTTON.visibleWhenSrc}
								</code>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("enabledWhenLabel")}
							</dt>
							<dd>
								<code className="font-mono text-xs text-card-foreground">
									{CHECKOUT_BUTTON.enabledWhenSrc}
								</code>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("triggersLabel")}
							</dt>
							<dd
								data-testid="control-triggers"
								className="flex items-center font-mono text-xs text-card-foreground"
							>
								<code>{CHECKOUT_BUTTON.name}</code>
								<ArrowSep />
								<code>{CHECKOUT_BUTTON.triggers}</code>
							</dd>
						</dl>
					</article>
				</section>

				{/* The action-spec card (the bind) */}
				<section aria-label={t("actionHeading")} className="mt-12 space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("actionHeading")}
						</h2>
						<span
							data-testid="control-fixture-badge"
							className={`inline-flex items-center rounded px-2.5 py-1 font-mono text-sm font-semibold ${
								trace.pass
									? "bg-primary/10 text-primary"
									: "bg-destructive/10 text-destructive"
							}`}
						>
							{trace.pass ? t("passLabel") : t("failLabel")}
						</span>
					</div>
					<article
						data-testid="action-card"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<code className="inline-block rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
							action &quot;{CHECKOUT_SUBMIT.name}&quot;
						</code>
						<dl className="grid gap-2 text-sm sm:grid-cols-[14rem_1fr]">
							<dt className="font-medium text-muted-foreground">
								{t("onLabel")}
							</dt>
							<dd>
								<code className="font-mono text-xs text-card-foreground">
									{CHECKOUT_SUBMIT.on.kind}(&quot;
									{CHECKOUT_SUBMIT.on.control}&quot;)
								</code>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("invokeLabel")}
							</dt>
							<dd
								data-testid="action-invoke"
								className="flex items-center font-mono text-xs text-card-foreground"
							>
								<code>{CHECKOUT_SUBMIT.name}</code>
								<ArrowSep />
								<code className="font-semibold text-primary">
									operation &quot;{CHECKOUT_SUBMIT.invoke}&quot;
								</code>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("withLabel")}
							</dt>
							<dd>
								<code className="font-mono text-xs text-card-foreground">
									{`{ ${Object.entries(CHECKOUT_SUBMIT.withArgs)
										.map(([k, v]) => `${k}: ${v}`)
										.join(", ")} }`}
								</code>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("onSuccessLabel")}
							</dt>
							<dd className="space-x-1.5">
								{CHECKOUT_SUBMIT.onSuccess.map((e) => (
									<code
										key={e.verb}
										className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary"
									>
										{e.verb}({e.arg})
									</code>
								))}
							</dd>
							<dt className="font-medium text-muted-foreground">
								{t("onErrorLabel")}
							</dt>
							<dd className="space-x-1.5">
								{CHECKOUT_SUBMIT.onError.map((e) => (
									<code
										key={e.verb}
										className="inline-flex items-center rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive"
									>
										{e.verb}({e.arg})
									</code>
								))}
							</dd>
						</dl>
					</article>
				</section>

				{/* The state-fixture table */}
				<section aria-label={t("fixtureHeading")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("fixtureHeading")}
					</h2>
					<p className="text-sm text-muted-foreground">{t("fixtureLead")}</p>
					<div className="overflow-x-auto rounded-xl border border-border">
						<table
							data-testid="control-fixture-table"
							className="w-full border-collapse text-sm"
						>
							<thead>
								<tr className="bg-muted/60 text-left">
									<th className="px-4 py-2 font-medium text-muted-foreground">
										{t("colGiven")}
									</th>
									<th className="px-4 py-2 font-medium text-muted-foreground">
										{t("colVisible")}
									</th>
									<th className="px-4 py-2 font-medium text-muted-foreground">
										{t("colEnabled")}
									</th>
								</tr>
							</thead>
							<tbody>
								{trace.rows.map((r) => (
									<tr
										key={r.id}
										data-testid={`control-row-${r.id}`}
										className="border-t border-border"
									>
										<td className="px-4 py-2">
											<code className="font-mono text-xs text-card-foreground">
												{r.givenLabel}
											</code>
										</td>
										<td className="px-4 py-2">
											<span
												data-testid={`control-visible-${r.id}`}
												className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold ${
													r.state.visible
														? "bg-primary/10 text-primary"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{String(r.state.visible)}
											</span>
										</td>
										<td className="px-4 py-2">
											<span
												data-testid={`control-enabled-${r.id}`}
												className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold ${
													r.state.enabled
														? "bg-primary/10 text-primary"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{String(r.state.enabled)}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
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
