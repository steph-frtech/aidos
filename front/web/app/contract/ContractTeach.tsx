import { getTranslations } from "next-intl/server";

/**
 * ContractTeach makes the /contract screen self-teaching (ui-completeness law —
 * « chaque écran est auto-pédagogique : tutoriel + exemple »). It ADDS two
 * read-only, concept-first sections above the checklist projection; it touches no
 * existing data-testid, theme token or i18n key on the page.
 *
 *   1. Tutoriel (data-testid="tutorial") — an ordered list explaining, in the
 *      ubiquitous language, the concepts the execution contract embodies: one file
 *      two readers (the YAML machine block + the prose projection), the nine-phase
 *      per-step loop, the computational|human gate, the five granularity properties,
 *      and « done est calculé, jamais déclaré » (a change goes via ChangeSet + semver;
 *      the screen never writes).
 *   2. Exemple (data-testid="example") — the concrete SHAPE of a single `phase`
 *      entry of the machine block (id / label / gate) so one can see what the
 *      contract encodes without reading the whole file. Read-only; no control.
 *
 * S00 is a docs/data step: there is NO backend operation to bind here, so the
 * action-capable clause of ui-completeness is vacuously satisfied (no headless
 * capability is hidden — there is none). The screen teaches; it writes nothing.
 *
 * Server component: strings via next-intl getTranslations (ADR 0011), tokens only
 * (ADR 0010).
 */
export async function ContractTeach() {
	const t = await getTranslations("contract");

	const tutorialSteps = ["t1", "t2", "t3", "t4", "t5"] as const;

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Tutoriel — the concepts the execution contract embodies */}
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
									{t.rich(`tutorial.${key}.body`, {
										code: (chunks) => (
											<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
												{chunks}
											</code>
										),
									})}
								</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* Exemple — the concrete SHAPE of one phase entry of the machine block */}
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
					{t.rich("example.lead", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</p>

				{/* The phase envelope: the three fields every phase entry carries */}
				<dl
					data-testid="example-phase"
					className="mt-4 space-y-px overflow-hidden rounded-lg border border-border bg-border text-xs"
				>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("example.idLabel")}</dt>
						<dd>
							<code className="font-mono text-card-foreground">
								{t("example.idValue")}
							</code>
						</dd>
						<dd className="ml-auto text-muted-foreground">
							{t("example.idNote")}
						</dd>
					</div>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("example.labelLabel")}</dt>
						<dd>
							<code className="font-mono text-card-foreground">
								{t("example.labelValue")}
							</code>
						</dd>
					</div>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("example.gateLabel")}</dt>
						<dd>
							<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
								{t("example.gateValue")}
							</span>
						</dd>
						<dd className="ml-auto text-muted-foreground">
							{t("example.gateNote")}
						</dd>
					</div>
				</dl>

				{/* The raw machine block — the canonical YAML shape of one phase */}
				<p className="mt-3 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
					{t("example.bodyLabel")}
				</p>
				<pre
					data-testid="example-body"
					className="mt-1 overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-[0.7rem] leading-relaxed text-foreground"
				>
					{t("example.body")}
				</pre>

				<p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
					{t.rich("example.takeaway", {
						code: (chunks) => (
							<code className="rounded bg-background/40 px-1 py-0.5 font-mono text-[0.7rem]">
								{chunks}
							</code>
						),
					})}
				</p>
			</section>
		</div>
	);
}
