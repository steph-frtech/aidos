"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RecordKind } from "@/lib/records-types";

/**
 * ProposeControl is the governed write-path control for a record type, per the
 * wall (CLAUDE.md §2) and the ui-completeness law: a truth-write is reachable
 * from the UI only as a **propose → ChangeSet → human-approval** flow, NEVER a
 * direct write from the screen.
 *
 * That flow is not built yet (S20 changesets / S27 ideas). So this control is
 * PRESENT — it makes the write capability reachable — but **disabled** and
 * marked « à venir (S20) ». It writes NOTHING: clicking the (enabled) info
 * affordance only reveals the forward-dependency note. No kernel / mirrors /
 * ideas / changesets / dag row is ever written from the Workbench.
 *
 * For an Idea (below the waterline) the same rule holds at this step: even the
 * candidate-truth on-ramp is the S27 idea-intake → ChangeSet path, so the
 * control is gated identically until the engine exists.
 *
 * Themed on the ADR 0010 design tokens; strings via next-intl (ADR 0011).
 */
export function ProposeControl({
	kind,
	authority,
}: {
	kind: RecordKind;
	authority: "above" | "below";
}) {
	const t = useTranslations("records");
	const [open, setOpen] = useState(false);

	return (
		<div
			data-testid={`propose-${kind}`}
			data-authority={authority}
			data-available="false"
			className="rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold text-card-foreground">
						{t("proposeHeading")}
					</h3>
					<p className="text-xs text-muted-foreground">{t("proposeHint")}</p>
				</div>
				<div className="flex items-center gap-2">
					<span
						data-testid={`propose-soon-${kind}`}
						className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
					>
						<span
							aria-hidden="true"
							className="size-1.5 rounded-full bg-muted-foreground"
						/>
						{t("soonBadge")}
					</span>
					<button
						type="button"
						data-testid={`propose-submit-${kind}`}
						disabled
						aria-disabled="true"
						title={t("soonTitle")}
						className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50"
					>
						{t("proposeSubmit")}
					</button>
				</div>
			</div>

			<button
				type="button"
				data-testid={`propose-why-${kind}`}
				onClick={() => setOpen((v) => !v)}
				className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{t("proposeWhy")}
			</button>

			{open && (
				<p
					data-testid={`propose-note-${kind}`}
					className="mt-2 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground"
				>
					{t("proposeNote")}
				</p>
			)}
		</div>
	);
}
