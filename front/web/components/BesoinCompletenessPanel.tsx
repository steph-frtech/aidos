"use client";

import { useMemo, useState } from "react";
import {
	type BesoinLevelMirror,
	besoinCompleteness,
	type CompletenessNode,
	type CompletenessReport,
} from "@/lib/besoin-completeness";

/**
 * BesoinCompletenessPanel — the action-capable /compound-besoin-completeness panel (EL09). The human
 * EXECUTES the completeness law FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Vérifier la complétude" runs besoinCompleteness → { complete, monsters[] };
 *  - "Casser le lien (retirer le miroir)" fault-injects direction 1 → NEED_LEVEL_WITHOUT_MIRROR;
 *  - "Casser le lien (miroir orphelin)" fault-injects direction 2 → ORPHAN_NEED_MIRROR;
 *  - "Réinitialiser" restores the intact link.
 *
 * Monster detection is COMPUTED by the deterministic twin (lib/besoin-completeness.ts), never an LLM,
 * never re-implemented here. ABOVE the wall: reads a node set + a declared NEED-side level-mirror set,
 * writes NO real mirror and no truth (§2). Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	checkCta: string;
	breakMirrorCta: string;
	orphanCta: string;
	resetCta: string;
	caseLabel: string;
	caseIntact: string;
	mirrorsHeading: string;
	verdictHeading: string;
	complete: string;
	incomplete: string;
	monstersHeading: string;
	none: string;
	pending: string;
}

// LinkState is the in-memory NEED-side level-mirror set the human mutates from the screen (the only way
// to fault-inject the node↔mirror link). "intact" = the right-form mirror; "broken" = removed;
// "orphan" = an extra mirror reflecting a non-resolved rung.
type LinkState = "intact" | "broken" | "orphan";

// NODES is the declared, deterministic node set (a single resolved product) — the closed input the
// twin reads. It mirrors the Go fixture (completeness_fixture_test.go).
const NODES: CompletenessNode[] = [{ level: "product", status: "resolved" }];
const META: Record<string, boolean> = { product: true };

const PRODUCT_MIRROR: BesoinLevelMirror = {
	reflects: "product",
	form: "gherkin_n0",
};
const ORPHAN_MIRROR: BesoinLevelMirror = {
	reflects: "entity",
	form: "property_n1",
};

function mirrorsFor(link: LinkState): BesoinLevelMirror[] {
	switch (link) {
		case "intact":
			return [PRODUCT_MIRROR];
		case "broken":
			return [];
		case "orphan":
			return [PRODUCT_MIRROR, ORPHAN_MIRROR];
	}
}

export function BesoinCompletenessPanel({ labels }: { labels: Labels }) {
	const [link, setLink] = useState<LinkState>("intact");
	const [report, setReport] = useState<CompletenessReport | null>(null);

	const mirrors = useMemo(() => mirrorsFor(link), [link]);

	function runCheck() {
		setReport(besoinCompleteness(NODES, mirrors, META));
	}
	function breakMirror() {
		setLink("broken");
		setReport(besoinCompleteness(NODES, mirrorsFor("broken"), META));
	}
	function makeOrphan() {
		setLink("orphan");
		setReport(besoinCompleteness(NODES, mirrorsFor("orphan"), META));
	}
	function reset() {
		setLink("intact");
		setReport(null);
	}

	return (
		<div className="space-y-8">
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<div className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.caseLabel}
						</span>
						<span
							data-testid="link-state"
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{link === "intact"
								? labels.caseIntact
								: link === "broken"
									? labels.breakMirrorCta
									: labels.orphanCta}
						</span>
					</div>
					<button
						type="button"
						data-testid="check-cta"
						onClick={runCheck}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.checkCta}
					</button>
					<button
						type="button"
						data-testid="break-mirror-cta"
						onClick={breakMirror}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.breakMirrorCta}
					</button>
					<button
						type="button"
						data-testid="orphan-cta"
						onClick={makeOrphan}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.orphanCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={reset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
			</section>

			{/* The declared NEED-side level-mirror set */}
			<section
				aria-label={labels.mirrorsHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.mirrorsHeading}
				</h2>
				<ul className="space-y-1" data-testid="mirrors-list">
					{mirrors.length === 0 ? (
						<li
							className="text-sm text-muted-foreground"
							data-testid="mirrors-none"
						>
							{labels.none}
						</li>
					) : (
						mirrors.map((m) => (
							<li
								key={`${m.reflects}-${m.form}`}
								data-testid={`mirror-${m.reflects}`}
								className="font-mono text-sm text-foreground"
							>
								{m.reflects} → {m.form}
							</li>
						))
					)}
				</ul>
			</section>

			{/* The completeness verdict + monsters */}
			<section
				aria-label={labels.verdictHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.verdictHeading}
				</h2>
				{report === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="verdict-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-3" data-testid="verdict">
						<p
							data-testid="verdict-complete"
							data-complete={report.complete ? "true" : "false"}
							className={
								report.complete
									? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
							}
						>
							{report.complete ? labels.complete : labels.incomplete}
						</p>
						{report.monsters.length > 0 && (
							<div>
								<h3 className="mb-2 text-xs font-semibold tracking-tight text-foreground uppercase">
									{labels.monstersHeading}
								</h3>
								<ul data-testid="monsters" className="space-y-2">
									{report.monsters.map((mo) => (
										<li
											key={`${mo.code}-${mo.level}`}
											data-testid={`monster-${mo.code}`}
											className="rounded-md border border-border bg-muted/40 p-3"
										>
											<p className="font-mono text-xs text-foreground">
												{mo.code}
												{mo.level ? ` · ${mo.level}` : ""}
											</p>
											<p className="mt-1 text-sm text-muted-foreground">
												{mo.explanation}
											</p>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
}
