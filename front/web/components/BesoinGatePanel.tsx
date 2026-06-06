"use client";

import { useMemo, useState } from "react";
import type { NodeInput } from "@/lib/besoin-candescend";
import {
	type BesoinLevelMirror,
	type CompletenessNode,
	levelMirrorForm,
} from "@/lib/besoin-completeness";
import { decide, type GateDecision, type GateSession } from "@/lib/besoin-gate";

/**
 * BesoinGatePanel — the action-capable /compound-besoin-gate panel (EL11). The human EXECUTES the
 * Stop:besoin-gate decision FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless capability):
 *  - "Évaluer la porte" runs decide() on the current session and renders the verdict (no_op|allow|block);
 *  - "Casser le right-sizing" fault-injects the metadata of the current rung → ¬enough (disjunct 1);
 *  - "Casser le miroir-de-niveau" removes the level-mirror of the resolved rung → monster (disjunct 2);
 *  - "Détacher le BesoinGraph" drops the session → NO-OP (the §5 scoping — no over-firing);
 *  - "Réinitialiser" restores a right-sized, monster-free, attached session.
 *
 * The verdict is COMPUTED by the deterministic twin (lib/besoin-gate.ts, which COMPOSES the EL07
 * canDescend + EL09 besoinCompleteness twins), never an LLM, never re-implemented here. ABOVE the wall:
 * reads the BesoinGraph, writes NO truth and no mirror (§2 — the hook REINFORCES the wall). Themed
 * (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	stateHeading: string;
	sessionAttached: string;
	sessionDetached: string;
	currentLevel: string;
	metaComplete: string;
	mirrorPresent: string;
	yes: string;
	no: string;
	evaluateCta: string;
	breakRightSizingCta: string;
	breakMirrorCta: string;
	detachCta: string;
	resetCta: string;
	verdictHeading: string;
	verdictNoOp: string;
	verdictAllow: string;
	verdictBlock: string;
	notEnoughLabel: string;
	hasMonsterLabel: string;
	reasonsHeading: string;
	pending: string;
}

function rightSizedProductNode(): NodeInput {
	return {
		level: "product",
		body: {
			intent: "Un suivi de tâches simple",
			scenarios: ["créer une tâche", "cocher une tâche"],
			selects: ["onboarding", "core-task"],
		},
		refsTo: ["journey"],
		present: true,
	};
}

function productMirror(): BesoinLevelMirror {
	const form = levelMirrorForm("product");
	// product always has a declared form (EL10 table is total); fall back defensively.
	return { reflects: "product", form: form ?? "gherkin_n0" };
}

function baseSession(): GateSession {
	const nodes: CompletenessNode[] = [{ level: "product", status: "resolved" }];
	return {
		project: "demo",
		level: "product",
		node: rightSizedProductNode(),
		metaComplete: true,
		nodes,
		mirrors: [productMirror()],
		metaCompleteByLevel: { product: true },
	};
}

export function BesoinGatePanel({ labels }: { labels: Labels }) {
	// session === null models a DETACHED session (no BesoinGraph) → the gate no-ops.
	const [session, setSession] = useState<GateSession | null>(baseSession());
	const [decision, setDecision] = useState<GateDecision | null>(null);

	const attached = session !== null;
	const metaComplete = session?.metaComplete ?? false;
	const mirrorPresent = (session?.mirrors.length ?? 0) > 0;

	// breakRightSizing — fault-inject the current rung's BODY so it narrows nothing (empty `selects`)
	// → anti-vacuity fails → ¬enough (disjunct 1). The node is set to `drafting` (a rung being
	// elicited, not yet resolved) so it carries NO completeness obligation — proving ¬enough fires
	// WITHOUT a monster (the OU, not the ET). Metadata stays complete.
	function breakRightSizing() {
		setSession((s) =>
			s === null
				? s
				: {
						...s,
						node: { ...s.node, body: { ...s.node.body, selects: [] } },
						nodes: s.nodes.map((n) =>
							n.level === s.level ? { ...n, status: "drafting" as const } : n,
						),
						// a drafting rung carries no mirror obligation; drop its level-mirror so the
						// EL09 orphan check does not fire — isolating the ¬enough disjunct (the OU).
						mirrors: s.mirrors.filter((m) => m.reflects !== s.level),
					},
		);
		setDecision(null);
	}

	// breakMirror — remove the level-mirror of the resolved rung → monster (disjunct 2).
	function breakMirror() {
		setSession((s) => (s === null ? s : { ...s, mirrors: [] }));
		setDecision(null);
	}

	// detach — drop the BesoinGraph session → NO-OP (the §5 scoping).
	function detach() {
		setSession(null);
		setDecision(null);
	}

	function reset() {
		setSession(baseSession());
		setDecision(null);
	}

	function evaluate() {
		setDecision(decide(session));
	}

	const verdictText = useMemo(() => {
		if (decision === null) return labels.pending;
		switch (decision.verdict) {
			case "no_op":
				return labels.verdictNoOp;
			case "allow":
				return labels.verdictAllow;
			default:
				return labels.verdictBlock;
		}
	}, [decision, labels]);

	const verdictTone =
		decision === null
			? "text-muted-foreground"
			: decision.verdict === "block"
				? "text-red-600 dark:text-red-400"
				: decision.verdict === "allow"
					? "text-blue-600 dark:text-blue-400"
					: "text-muted-foreground";

	return (
		<div className="space-y-8">
			<section
				data-testid="gate-state"
				aria-label={labels.stateHeading}
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.stateHeading}
				</h2>
				<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
					<div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<dt className="text-muted-foreground">{labels.sessionAttached}</dt>
						<dd
							data-testid="session-attached"
							className="font-medium text-foreground"
						>
							{attached ? labels.yes : labels.no}
						</dd>
					</div>
					<div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<dt className="text-muted-foreground">{labels.currentLevel}</dt>
						<dd
							data-testid="current-level"
							className="font-mono text-foreground"
						>
							{session?.level ?? labels.sessionDetached}
						</dd>
					</div>
					<div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<dt className="text-muted-foreground">{labels.metaComplete}</dt>
						<dd
							data-testid="meta-complete"
							className="font-medium text-foreground"
						>
							{attached ? (metaComplete ? labels.yes : labels.no) : "—"}
						</dd>
					</div>
					<div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<dt className="text-muted-foreground">{labels.mirrorPresent}</dt>
						<dd
							data-testid="mirror-present"
							className="font-medium text-foreground"
						>
							{attached ? (mirrorPresent ? labels.yes : labels.no) : "—"}
						</dd>
					</div>
				</dl>
			</section>

			<section className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="evaluate"
					onClick={evaluate}
					className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.evaluateCta}
				</button>
				<button
					type="button"
					data-testid="break-right-sizing"
					onClick={breakRightSizing}
					disabled={!attached}
					className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					{labels.breakRightSizingCta}
				</button>
				<button
					type="button"
					data-testid="break-mirror"
					onClick={breakMirror}
					disabled={!attached}
					className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					{labels.breakMirrorCta}
				</button>
				<button
					type="button"
					data-testid="detach"
					onClick={detach}
					className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
				>
					{labels.detachCta}
				</button>
				<button
					type="button"
					data-testid="reset"
					onClick={reset}
					className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
				>
					{labels.resetCta}
				</button>
			</section>

			<section
				data-testid="gate-verdict"
				aria-label={labels.verdictHeading}
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.verdictHeading}
				</h2>
				<p
					data-testid="verdict"
					data-verdict={decision === null ? "pending" : decision.verdict}
					className={`text-lg font-semibold ${verdictTone}`}
				>
					{verdictText}
				</p>
				{decision !== null && decision.verdict !== "no_op" && (
					<div className="flex flex-wrap gap-2 text-xs">
						<span
							data-testid="not-enough-flag"
							className={`rounded-full px-2.5 py-0.5 font-medium ${decision.notEnough ? "bg-red-600/15 text-red-700 dark:text-red-300" : "bg-muted text-muted-foreground"}`}
						>
							{labels.notEnoughLabel}:{" "}
							{decision.notEnough ? labels.yes : labels.no}
						</span>
						<span
							data-testid="has-monster-flag"
							className={`rounded-full px-2.5 py-0.5 font-medium ${decision.hasMonster ? "bg-red-600/15 text-red-700 dark:text-red-300" : "bg-muted text-muted-foreground"}`}
						>
							{labels.hasMonsterLabel}:{" "}
							{decision.hasMonster ? labels.yes : labels.no}
						</span>
					</div>
				)}
				{decision !== null && decision.blockReasons.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.reasonsHeading}
						</h3>
						<ul data-testid="block-reasons" className="space-y-2">
							{decision.blockReasons.map((r) => (
								<li
									key={`${r.code}-${r.explanation.slice(0, 24)}`}
									className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
								>
									<p className="font-mono text-xs text-red-700 dark:text-red-300">
										{r.code}
									</p>
									<p className="mt-1 text-foreground">{r.explanation}</p>
									<ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
										{r.howToFix.map((f) => (
											<li key={f}>{f}</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					</div>
				)}
			</section>
		</div>
	);
}
