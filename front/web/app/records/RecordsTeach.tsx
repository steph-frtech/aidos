import { getTranslations } from "next-intl/server";
import { compactBody, EXAMPLE_BODY } from "@/lib/records-types";

/**
 * RecordsTeach makes the /records screen self-teaching (ui-completeness law —
 * « chaque écran est auto-pédagogique : tutoriel + exemple »). It ADDS two
 * read-only, concept-first sections above the read panel; it touches no existing
 * control, action, read-projection, data-testid, theme token or i18n key.
 *
 *   1. Tutoriel (data-testid="tutorial") — a <Steps>-like ordered list that
 *      explains, in the ubiquitous language, the concepts the KRDCore records
 *      embody: the seven kinds (ideas.idea, kernel.truth/layer/link,
 *      mirrors.mirror, changesets.changeset, dag.phase), content-addressed truth
 *      (id = SHA-256 of the canonical JSONB), the append-only law (superseded_by;
 *      a body is never modified, the head moves by INSERT), « version = empreinte
 *      = licence de changer », and THE WALL: these tables are above the line, the
 *      agent role is SELECT-only, so any truth-write goes through propose →
 *      ChangeSet → approval (« à venir S20 ») — the screen never writes truth.
 *   2. Exemple (data-testid="example") — a concrete, illustrative record: the
 *      SHAPE of a `kernel.truth` head (id/version/superseded_by/created_at + a
 *      compact JSONB body, leaning on records-types EXAMPLE_BODY), so one can see
 *      what a record looks like without having to write one. The propose controls
 *      below stay « à venir S20 »; the read projection is untouched.
 *
 * Server component: strings via next-intl getTranslations (ADR 0011), tokens only
 * (ADR 0010). The example body is the client-safe EXAMPLE_BODY constant rendered
 * read-only; nothing here writes a record.
 */
export async function RecordsTeach() {
	const t = await getTranslations("records");

	const tutorialSteps = ["t1", "t2", "t3", "t4", "t5"] as const;

	// The illustrative record's body: the canonical kernel.truth shape, pre-filled
	// with example values so the form of a record is concrete. Read-only display;
	// EXAMPLE_BODY is the client-safe constant that also feeds the demo fallback.
	const exampleBody = {
		...EXAMPLE_BODY.truth,
		statement: t("example.body.statement"),
		truth_kind: "invariant",
		scope: "kernel.records",
		verifiability: "decidable",
		authority: "human",
	};
	const bodyPreview = compactBody(exampleBody, 200);

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Tutoriel — the concepts the KRDCore records embody */}
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

			{/* Exemple — the concrete SHAPE of a kernel.truth record */}
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

				{/* The record envelope: the four addressing/lifecycle columns */}
				<dl
					data-testid="example-record"
					className="mt-4 space-y-px overflow-hidden rounded-lg border border-border bg-border text-xs"
				>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("idLabel")}</dt>
						<dd>
							<code className="font-mono text-card-foreground">
								{t("example.idHash")}
							</code>
						</dd>
						<dd className="ml-auto text-muted-foreground">
							{t("example.idNote")}
						</dd>
					</div>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("versionLabel")}</dt>
						<dd>
							<code className="font-mono text-card-foreground">
								{t("example.versionHash")}
							</code>
						</dd>
						<dd className="ml-auto text-muted-foreground">
							{t("example.versionNote")}
						</dd>
					</div>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">{t("supersededLabel")}</dt>
						<dd>
							<code className="font-mono text-card-foreground">∅</code>
						</dd>
						<dd className="ml-auto text-muted-foreground">
							{t("example.supersededNote")}
						</dd>
					</div>
					<div className="flex flex-wrap items-center gap-2 bg-card px-3 py-2">
						<dt className="text-muted-foreground">created_at</dt>
						<dd>
							<code className="font-mono text-card-foreground">
								2026-05-31T09:00:00Z
							</code>
						</dd>
					</div>
				</dl>

				{/* The JSONB body — the canonical kernel.truth shape, pre-filled */}
				<p className="mt-3 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
					{t("example.bodyLabel")}
				</p>
				<pre
					data-testid="example-body"
					className="mt-1 overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-[0.7rem] leading-relaxed text-foreground"
				>
					{bodyPreview}
				</pre>

				<p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
					{t("example.takeaway")}
				</p>
			</section>
		</div>
	);
}
