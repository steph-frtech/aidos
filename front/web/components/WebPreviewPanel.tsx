"use client";

import { useMemo, useState } from "react";
import { CheckoutButton } from "@/app/web-preview/_generated/checkout-button";
import { evalState } from "@/lib/aidos-expr";
import { emitWeb } from "@/lib/web-projection";
import {
	CHECKOUT_BUTTON,
	CHECKOUT_FIXTURE,
	CHECKOUT_SUBMIT,
	EXPECTED_INVOKE,
	type FixtureRow,
} from "@/lib/web-projection-data";

/**
 * WebPreviewPanel — the action-capable /web-preview panel (S38). The human DRIVES the web
 * projection FROM THE SCREEN: pick a control-spec state-fixture row (the S11 `given`),
 * render the EMITTED Next component (imported from _generated/, never hand-authored), and
 * see live whether the rendered DOM RESPECTS the fixture (visible/enabled match
 * EvalState(control, given)) and whether a click DECLARES the bound operation
 * (Plan(action, click).invoke == createOrder). Two actions, both COMPUTED by the
 * deterministic twin lib/web-projection.ts (byte-identical to back/runtime/generators/
 * webcomponent — no LLM, no I/O): RE-EMIT (the byte-identical determinism check vs the
 * materialized file) and CLICK (captures the declared invoke). A respects-fixture badge
 * (live DOM == fixture?) and a stale badge (source_hash == the materialized head?).
 *
 * READ-ONLY against truth (the wall): the control + action are SOURCES above the line;
 * _generated/ is never hand-edited; a ledger row is written via propose → ChangeSet →
 * approval, never from a screen. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	sourcesTitle: string;
	controlLabel: string;
	actionLabel: string;
	triggersLabel: string;
	invokeLabel: string;
	fixtureTitle: string;
	givenLabel: string;
	expectVisibleLabel: string;
	expectEnabledLabel: string;
	renderTitle: string;
	liveVisibleLabel: string;
	liveEnabledLabel: string;
	respectsOk: string;
	respectsFail: string;
	hiddenLabel: string;
	sourceHashLabel: string;
	pathLabel: string;
	derivedBadge: string;
	protectedBadge: string;
	staleOk: string;
	staleFail: string;
	reemitCta: string;
	clickCta: string;
	byteIdenticalOk: string;
	byteIdenticalFail: string;
	invokeDeclared: string;
	invokeNone: string;
	yes: string;
	no: string;
}

const MATERIALIZED_SOURCE_HASH =
	"8ebfb46ff10c0dc68ee53be000e9965466e7effa666703f870fce027fbae5cf6";
const MATERIALIZED_OUTPUT_HASH =
	"5b428d00a19c01d565697f076bf2770f34c3ab0ce32c379233e3f6fd68030f76";

export function WebPreviewPanel({ labels }: { labels: Labels }) {
	const [rowId, setRowId] = useState<string>(CHECKOUT_FIXTURE[0].id);
	const [reemit, setReemit] = useState<"idle" | "ok" | "fail">("idle");
	const [invoked, setInvoked] = useState<string | null>(null);

	const row = useMemo<FixtureRow>(
		() => CHECKOUT_FIXTURE.find((r) => r.id === rowId) ?? CHECKOUT_FIXTURE[0],
		[rowId],
	);

	const art = useMemo(() => emitWeb(CHECKOUT_BUTTON, CHECKOUT_SUBMIT), []);

	// The live, computed button state for the chosen given (the same evalState the
	// emitted component runs) — the panel re-derives it to compare against the fixture.
	const live = useMemo(
		() =>
			evalState(
				CHECKOUT_BUTTON.visible_when,
				CHECKOUT_BUTTON.enabled_when,
				row.given,
			),
		[row],
	);

	const respects =
		live.visible === row.wantVisible && live.enabled === row.wantEnabled;
	const stale = art.source_hash !== MATERIALIZED_SOURCE_HASH;

	const onReemit = () => {
		const a2 = emitWeb(CHECKOUT_BUTTON, CHECKOUT_SUBMIT);
		setReemit(a2.output_hash === MATERIALIZED_OUTPUT_HASH ? "ok" : "fail");
	};

	const badge = (ok: boolean, okText: string, failText: string) => (
		<span
			data-testid={ok ? "badge-ok" : "badge-fail"}
			className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
				ok
					? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
					: "bg-destructive/15 text-destructive"
			}`}
		>
			{ok ? okText : failText}
		</span>
	);

	return (
		<div className="grid gap-6 md:grid-cols-2">
			{/* Left — the sources + the fixture table. */}
			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className="text-sm font-semibold text-foreground">
					{labels.sourcesTitle}
				</h3>
				<dl className="mt-3 space-y-1.5 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.controlLabel}</dt>
						<dd className="font-mono text-foreground">
							{CHECKOUT_BUTTON.name}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.actionLabel}</dt>
						<dd className="font-mono text-foreground">
							{CHECKOUT_SUBMIT.name}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.triggersLabel}</dt>
						<dd className="font-mono text-foreground">
							{CHECKOUT_BUTTON.triggers}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.invokeLabel}</dt>
						<dd className="font-mono text-foreground">
							{CHECKOUT_SUBMIT.invoke}
						</dd>
					</div>
				</dl>

				<h4 className="mt-5 text-sm font-semibold text-foreground">
					{labels.fixtureTitle}
				</h4>
				<table className="mt-2 w-full text-left text-xs">
					<thead className="text-muted-foreground">
						<tr>
							<th className="py-1 pr-2 font-medium">{labels.givenLabel}</th>
							<th className="py-1 pr-2 font-medium">
								{labels.expectVisibleLabel}
							</th>
							<th className="py-1 font-medium">{labels.expectEnabledLabel}</th>
						</tr>
					</thead>
					<tbody className="font-mono">
						{CHECKOUT_FIXTURE.map((r) => (
							<tr
								key={r.id}
								data-testid={`fixture-row-${r.id}`}
								className={`cursor-pointer border-t border-border ${
									r.id === rowId ? "bg-accent" : ""
								}`}
								onClick={() => {
									setRowId(r.id);
									setInvoked(null);
								}}
							>
								<td className="py-1 pr-2 text-foreground">{r.id}</td>
								<td className="py-1 pr-2 text-foreground">
									{r.wantVisible ? labels.yes : labels.no}
								</td>
								<td className="py-1 text-foreground">
									{r.wantEnabled ? labels.yes : labels.no}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* Right — the emitted component live + the badges + the actions. */}
			<section className="rounded-lg border border-border bg-card p-5">
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-sm font-semibold text-foreground">
						{labels.renderTitle}
					</h3>
					<div className="flex gap-1.5">
						<span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
							{labels.derivedBadge}
						</span>
						<span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
							{labels.protectedBadge}
						</span>
					</div>
				</div>

				{/* The EMITTED component, rendered against the chosen given. */}
				<div
					data-testid="rendered-control"
					className="mt-4 flex min-h-16 items-center justify-center rounded-md border border-dashed border-border bg-background p-4"
				>
					<CheckoutButton given={row.given} onInvoke={(i) => setInvoked(i)} />
					{!live.visible && (
						<span
							data-testid="hidden-marker"
							className="text-xs italic text-muted-foreground"
						>
							{labels.hiddenLabel}
						</span>
					)}
				</div>

				<dl className="mt-4 space-y-1.5 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.liveVisibleLabel}</dt>
						<dd
							data-testid="live-visible"
							className="font-mono text-foreground"
						>
							{live.visible ? labels.yes : labels.no}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{labels.liveEnabledLabel}</dt>
						<dd
							data-testid="live-enabled"
							className="font-mono text-foreground"
						>
							{live.enabled ? labels.yes : labels.no}
						</dd>
					</div>
				</dl>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{labels.respectsFail.split(":")[0]}
					</span>
					<span data-testid="respects-badge">
						{badge(respects, labels.respectsOk, labels.respectsFail)}
					</span>
					<span data-testid="stale-badge">
						{badge(!stale, labels.staleOk, labels.staleFail)}
					</span>
				</div>

				<div className="mt-4 space-y-1 border-t border-border pt-3 text-xs">
					<div className="flex justify-between gap-4">
						<span className="text-muted-foreground">{labels.pathLabel}</span>
						<span className="truncate font-mono text-foreground">
							{art.path}
						</span>
					</div>
					<div className="flex justify-between gap-4">
						<span className="text-muted-foreground">
							{labels.sourceHashLabel}
						</span>
						<span
							data-testid="source-hash"
							className="truncate font-mono text-foreground"
						>
							{art.source_hash.slice(0, 16)}…
						</span>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="reemit-cta"
						onClick={onReemit}
						className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{labels.reemitCta}
					</button>
					{reemit === "ok" && (
						<span data-testid="reemit-ok">
							{badge(true, labels.byteIdenticalOk, labels.byteIdenticalFail)}
						</span>
					)}
					{reemit === "fail" && (
						<span data-testid="reemit-fail">
							{badge(false, labels.byteIdenticalOk, labels.byteIdenticalFail)}
						</span>
					)}
				</div>

				<div className="mt-3 text-xs">
					<p data-testid="invoke-state" className="text-muted-foreground">
						{invoked
							? `${labels.invokeDeclared}: ${invoked}`
							: labels.invokeNone}
					</p>
					{invoked && invoked !== EXPECTED_INVOKE && (
						<p className="text-destructive">unexpected invoke</p>
					)}
				</div>
			</section>
		</div>
	);
}
