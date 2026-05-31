import { getTranslations } from "next-intl/server";

/**
 * StoreTeach makes the /store screen self-teaching (ui-completeness law — « chaque
 * écran est auto-pédagogique : tutoriel + exemple »). It ADDS two read-only,
 * concept-first sections above the read panel; it touches no existing control,
 * action, read-projection, data-testid, theme token or i18n key.
 *
 *   1. Tutoriel (data-testid="tutorial") — a <Steps>-like ordered list that
 *      explains, in the ubiquitous language, the concepts the content store
 *      embodies: content-addressing, the SHA-256 fingerprint, an object
 *      (immutable content), the head (mutable key→hash pointer), the append-only
 *      history, idempotent Put, and the "editing makes a NEW fingerprint; the old
 *      one stays readable; nothing is destroyed" rule.
 *   2. Exemple (data-testid="example") — a worked « essayez ceci » walkthrough that
 *      leans on the Put / Set head controls already present below, demonstrating
 *      the operation end-to-end (store `hello` → point the `doc` head → store
 *      `hello v2`: a new fingerprint, the head moves, the history lists both, the
 *      original fingerprint stays readable).
 *
 * Server component: strings via next-intl getTranslations (ADR 0011), tokens only
 * (ADR 0010). No interactivity needed.
 */
export async function StoreTeach() {
	const t = await getTranslations("store");

	const tutorialSteps = ["t1", "t2", "t3", "t4", "t5"] as const;
	const exampleSteps = ["e1", "e2", "e3"] as const;

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Tutoriel — the concepts the screen embodies */}
			<section
				data-testid="tutorial"
				aria-label={t("tutorial.heading")}
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="mb-1 flex items-center gap-2">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
						{t("tutorial.badge")}
					</span>
				</div>
				<h2 className="text-base font-semibold text-card-foreground">
					{t("tutorial.heading")}
				</h2>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("tutorial.lead")}
				</p>
				<ol className="mt-4 space-y-3">
					{tutorialSteps.map((key, idx) => (
						<li
							key={key}
							data-testid={`tutorial-step-${idx}`}
							className="flex gap-3"
						>
							<span
								aria-hidden="true"
								className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums"
							>
								{idx + 1}
							</span>
							<div className="space-y-0.5">
								<p className="text-sm font-medium text-card-foreground">
									{t(`tutorial.${key}.title`)}
								</p>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{t(`tutorial.${key}.body`)}
								</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* Exemple — a worked « essayez ceci » walkthrough */}
			<section
				data-testid="example"
				aria-label={t("example.heading")}
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="mb-1 flex items-center gap-2">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
						{t("example.badge")}
					</span>
				</div>
				<h2 className="text-base font-semibold text-card-foreground">
					{t("example.heading")}
				</h2>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("example.lead")}
				</p>
				<ol className="mt-4 space-y-3">
					{exampleSteps.map((key, idx) => (
						<li
							key={key}
							data-testid={`example-step-${idx}`}
							className="rounded-lg border border-border bg-muted/40 p-3"
						>
							<p className="text-xs font-semibold text-card-foreground">
								{t(`example.${key}.title`)}
							</p>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								{t.rich(`example.${key}.body`, {
									code: (chunks) => (
										<code className="rounded bg-background px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
											{chunks}
										</code>
									),
								})}
							</p>
						</li>
					))}
				</ol>
				<p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
					{t("example.takeaway")}
				</p>
			</section>
		</div>
	);
}
