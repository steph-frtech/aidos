"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RecordsSnapshot, RecordTypeView } from "@/lib/records-types";
import { shortHash } from "@/lib/records-types";
import { ProposeControl } from "./ProposeControl";

/**
 * RecordsPanel renders the read-only projection of the seven KRDCore record
 * schemas (ideas.idea, kernel.truth/layer/link, mirrors.mirror,
 * changesets.changeset, dag.phase). It lists the record types as cards — per
 * type a count, a waterline badge (above/below the wall), and the head rows
 * (id/version/superseded_by/created_at + a compact JSONB body preview).
 *
 * THE WALL (CLAUDE.md §2). These tables are TRUTH; the screen only READS them.
 * Each above-the-line type carries the governed write control (ProposeControl):
 * « Proposer un enregistrement / Ouvrir un ChangeSet », PRESENT but disabled and
 * marked « à venir (S20) » — the propose → ChangeSet → approval flow is not built
 * yet (S20 changesets / S27 ideas). The panel never writes a record.
 *
 * Themed on the ADR 0010 design tokens; labels via next-intl (ADR 0011).
 */
export function RecordsPanel({ snapshot }: { snapshot: RecordsSnapshot }) {
	const t = useTranslations("records");
	const first = snapshot.types[0]?.kind ?? null;
	const [selected, setSelected] = useState<string | null>(first);

	const active =
		snapshot.types.find((tp) => tp.kind === selected) ?? snapshot.types[0];

	return (
		<div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
			{/* Left: the seven record types, one selectable card each */}
			<section aria-label={t("typesHeading", { count: snapshot.types.length })}>
				<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("typesHeading", { count: snapshot.types.length })}
				</h2>
				<ul
					data-testid="record-types"
					className="space-y-px overflow-hidden rounded-xl border border-border bg-border"
				>
					{snapshot.types.map((tp) => (
						<li key={tp.kind}>
							<button
								type="button"
								data-testid={`record-type-${tp.kind}`}
								onClick={() => setSelected(tp.kind)}
								className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									active?.kind === tp.kind
										? "bg-primary/10 text-primary"
										: "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
								}`}
							>
								<span className="flex flex-col gap-0.5">
									<span className="text-sm font-medium">
										{t(`kind.${tp.kind}`)}
									</span>
									<code className="font-mono text-[0.7rem] text-muted-foreground">
										{tp.table}
									</code>
								</span>
								<span className="flex items-center gap-2">
									<span
										data-testid={`record-authority-${tp.kind}`}
										className={
											tp.authority === "above"
												? "rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary"
												: "rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
										}
										title={
											tp.authority === "above"
												? t("aboveTitle")
												: t("belowTitle")
										}
									>
										{tp.authority === "above"
											? t("aboveBadge")
											: t("belowBadge")}
									</span>
									<span
										data-testid={`record-count-${tp.kind}`}
										className="tabular-nums text-xs text-muted-foreground"
									>
										{tp.count}
									</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			</section>

			{/* Right: the selected type's head rows + its governed write control */}
			{active && <RecordTypeDetail type={active} />}
		</div>
	);
}

function RecordTypeDetail({ type }: { type: RecordTypeView }) {
	const t = useTranslations("records");

	return (
		<section
			data-testid={`record-detail-${type.kind}`}
			aria-label={t(`kind.${type.kind}`)}
			className="space-y-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-sm font-semibold text-foreground">
					{t(`kind.${type.kind}`)}{" "}
					<code className="ml-1 font-mono text-xs font-normal text-muted-foreground">
						{type.table}
					</code>
				</h2>
				<span className="text-xs text-muted-foreground">
					{t("headCount", { count: type.heads.length, total: type.count })}
				</span>
			</div>

			{type.heads.length === 0 ? (
				<p
					data-testid={`record-empty-${type.kind}`}
					className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
				>
					{t("emptyTable")}
				</p>
			) : (
				<ol
					data-testid={`record-rows-${type.kind}`}
					className="space-y-px overflow-hidden rounded-xl border border-border bg-border"
				>
					{type.heads.map((row, idx) => (
						<li
							key={row.id}
							data-testid={`record-row-${type.kind}-${idx}`}
							className="space-y-2 bg-card px-4 py-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
								<span className="flex items-center gap-2">
									<span className="text-muted-foreground">{t("idLabel")}</span>
									<code className="font-mono text-card-foreground">
										{shortHash(row.id)}…
									</code>
								</span>
								<span className="flex items-center gap-2 text-muted-foreground">
									<span>{t("supersededLabel")}</span>
									<code className="font-mono">
										{row.supersededBy ? `${shortHash(row.supersededBy)}…` : "∅"}
									</code>
								</span>
							</div>
							<div className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
								<span>{t("versionLabel")}</span>
								<code className="font-mono">{shortHash(row.version)}…</code>
								<span className="ml-auto tabular-nums">{row.createdAt}</span>
							</div>
							<pre
								data-testid={`record-body-${type.kind}-${idx}`}
								className="overflow-x-auto rounded-lg bg-muted p-2.5 font-mono text-[0.7rem] leading-relaxed text-foreground"
							>
								{row.bodyPreview}
							</pre>
						</li>
					))}
				</ol>
			)}

			<ProposeControl kind={type.kind} authority={type.authority} />
		</section>
	);
}
