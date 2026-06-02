import { getTranslations } from "next-intl/server";
import { AGENT_WRITE_ABOVE_WATERLINE } from "@/lib/wall";

/**
 * WallTeach makes the /wall screen self-teaching (ui-completeness law — « chaque
 * écran est auto-pédagogique : tutoriel + exemple »). It ADDS two read-only,
 * concept-first sections above the waterline panel.
 *
 *   1. Tutoriel (data-testid="tutorial") — explains, in the ubiquitous language,
 *      what the wall is: the single permission boundary (waterline), defense in
 *      depth (PreToolUse hook + Postgres GRANTs), the actionable BlockReason, and
 *      the only door (idea → mirror → /goal → approval).
 *   2. Exemple (data-testid="example") — a concrete wall refusal: the agent tries
 *      to write a kernel file, the verdict is deny with code
 *      AGENT_WRITE_ABOVE_WATERLINE. Read-only; no control.
 *
 * The wall is enforced by the Go hook (level 1) + Postgres GRANTs (level 2), not
 * from a screen — so the action-capable clause of ui-completeness is vacuously
 * satisfied: there is no headless capability hidden here, there is none.
 *
 * Server component: strings via next-intl getTranslations (ADR 0011), tokens only
 * (ADR 0010).
 */
export async function WallTeach() {
	const t = await getTranslations("wall");
	const tutorialSteps = ["t1", "t2", "t3", "t4"] as const;

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Tutoriel — what the wall is */}
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

			{/* Exemple — a concrete wall refusal */}
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

				<p className="mt-4 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
					{t("example.bodyLabel")}
				</p>
				<pre
					data-testid="example-body"
					className="mt-1 overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-[0.7rem] leading-relaxed text-foreground"
				>
					{t("example.verdictDeny")}
					{"\n"}
					{AGENT_WRITE_ABOVE_WATERLINE}
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
