"use client";

import { useMemo, useState } from "react";
import {
	contractJSON,
	type Entity,
	emitAPI,
	emitContract,
	methodRoute,
	type Operation,
	verifyContract,
} from "@/lib/api-projection";

/**
 * ApiProjectionPanel — the action-capable /api-projection panel (S36). The human RUNS the
 * API projection FROM THE SCREEN: read the two SOURCES (the createOrder operation + the
 * Order entity it touches) on the left, read the EMITTED Go handler (read-only, protected
 * header + source_hash) with its method + route (POST /orders) and request/response JSON
 * shapes in the center, then on the right the Pact CONTRACT body + a PASS/FAIL badge. Two
 * actions: RE-EMIT (the byte-identical check — same output_hash, determinism visible) and
 * VERIFY CONTRACT (provider verification → PASS: the createOrder route passes its contract
 * test — the done criterion, visible). Everything is COMPUTED by the deterministic twin
 * lib/api-projection.ts (byte-identical to back/runtime/generators) — no LLM, no I/O.
 * READ-ONLY against truth (the wall): the operation + entity are SOURCES above the line;
 * back/gen/api is never hand-edited; a contract row is written via propose → ChangeSet →
 * approval, never from a screen. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	sourcesTitle: string;
	operationLabel: string;
	entityLabel: string;
	emitsLabel: string;
	stepsLabel: string;
	handlerTitle: string;
	contractTitle: string;
	methodRouteLabel: string;
	requestLabel: string;
	responseLabel: string;
	sourceHashLabel: string;
	outputHashLabel: string;
	derivedBadge: string;
	protectedBadge: string;
	reemitCta: string;
	verifyCta: string;
	byteIdenticalOk: string;
	passBadge: string;
	failBadge: string;
	notVerifiedBadge: string;
	contractBodyLabel: string;
	pathLabel: string;
}

interface Props {
	operation: Operation;
	entity: Entity;
	labels: Labels;
}

function short(h: string): string {
	return h.slice(0, 16);
}

export function ApiProjectionPanel({ operation, entity, labels }: Props) {
	const artifact = useMemo(
		() => emitAPI(operation, entity),
		[operation, entity],
	);
	const contract = useMemo(
		() => emitContract(operation, entity),
		[operation, entity],
	);
	const { method, route } = useMemo(() => methodRoute(entity.name), [entity]);
	const contractBody = useMemo(() => contractJSON(contract), [contract]);

	const [reemitOk, setReemitOk] = useState<boolean | null>(null);
	const [verified, setVerified] = useState<boolean | null>(null);

	function reEmit() {
		const fresh = emitAPI(operation, entity);
		setReemitOk(fresh.output_hash === artifact.output_hash);
	}

	function verify() {
		setVerified(verifyContract(contract, entity).pass);
	}

	const interaction = contract.interactions[0];

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
			{/* ── The two SOURCES (left) ─────────────────────────────────── */}
			<section aria-label={labels.sourcesTitle} className="space-y-4">
				<h2 className="text-lg font-semibold text-foreground">
					{labels.sourcesTitle}
				</h2>
				<article className="rounded-lg border border-border bg-card p-4">
					<h3 className="font-medium text-foreground">
						{labels.operationLabel}
					</h3>
					<p className="mt-1">
						<code className="font-mono text-sm text-foreground">
							{operation.name}
						</code>
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						{labels.stepsLabel}:
					</p>
					<ul className="mt-1 flex flex-wrap gap-1.5">
						{operation.steps.map((s) => (
							<li
								key={`${s.kind}-${s.schema ?? s.policy ?? s.entity ?? s.ref ?? ""}`}
								className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
							>
								{s.kind}
							</li>
						))}
					</ul>
					<p className="mt-2 text-xs text-muted-foreground">
						{labels.emitsLabel}:{" "}
						<code className="font-mono text-foreground">
							{operation.emits.join(", ")}
						</code>
					</p>
				</article>
				<article className="rounded-lg border border-border bg-card p-4">
					<h3 className="font-medium text-foreground">{labels.entityLabel}</h3>
					<p className="mt-1">
						<code className="font-mono text-sm text-foreground">
							{entity.name}
						</code>
					</p>
					<ul className="mt-2 space-y-1.5">
						{entity.attributes.map((a) => (
							<li
								key={a.name}
								className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
							>
								<code className="font-mono font-medium text-foreground">
									{a.name}
								</code>
								<span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">
									{a.type}
								</span>
								{a.identifier ? (
									<span className="rounded bg-blue-600 px-1.5 py-0.5 font-medium text-white">
										id
									</span>
								) : null}
							</li>
						))}
					</ul>
				</article>
			</section>

			{/* ── The emitted handler + the contract (right) ─────────────── */}
			<section className="space-y-4">
				{/* The emitted Go handler. */}
				<article
					data-handler="order"
					className="rounded-lg border border-border bg-card p-4"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<h2 className="text-lg font-semibold text-foreground">
								{labels.handlerTitle}
							</h2>
							<span className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
								{labels.derivedBadge}
							</span>
							<span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
								{labels.protectedBadge}
							</span>
						</div>
						<button
							type="button"
							onClick={reEmit}
							className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
						>
							{labels.reemitCta}
						</button>
					</div>
					<dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
						<div>
							{labels.methodRouteLabel}:{" "}
							<code
								data-method-route
								className="font-mono font-medium text-foreground"
							>
								{method} {route}
							</code>
						</div>
						<div>
							{labels.pathLabel}:{" "}
							<code className="font-mono text-foreground">{artifact.path}</code>
						</div>
						<div>
							{labels.sourceHashLabel}:{" "}
							<code className="font-mono text-foreground">
								{short(artifact.source_hash)}
							</code>
						</div>
						<div>
							{labels.outputHashLabel}:{" "}
							<code className="font-mono text-foreground">
								{short(artifact.output_hash)}
							</code>
						</div>
					</dl>
					{reemitOk !== null ? (
						<p
							data-reemit-result
							className={`mt-2 text-xs font-medium ${reemitOk ? "text-emerald-600" : "text-red-600"}`}
						>
							{reemitOk ? labels.byteIdenticalOk : "—"}
						</p>
					) : null}
					<pre className="mt-2 max-h-96 overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed text-foreground">
						<code data-handler-bytes>{artifact.bytes}</code>
					</pre>
				</article>

				{/* The Pact contract + verification. */}
				<article
					data-contract="createOrder"
					className="rounded-lg border border-border bg-card p-4"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.contractTitle}
						</h2>
						<button
							type="button"
							onClick={verify}
							className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
						>
							{labels.verifyCta}
						</button>
					</div>
					<div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<p className="text-xs text-muted-foreground">
								{labels.requestLabel}
							</p>
							<pre className="mt-1 overflow-x-auto rounded-md bg-background p-2 text-xs text-foreground">
								<code>{JSON.stringify(interaction.request.body, null, 2)}</code>
							</pre>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">
								{labels.responseLabel} ({interaction.response.status})
							</p>
							<pre className="mt-1 overflow-x-auto rounded-md bg-background p-2 text-xs text-foreground">
								<code>
									{JSON.stringify(interaction.response.body, null, 2)}
								</code>
							</pre>
						</div>
					</div>
					<p
						data-verify-badge
						data-pass={verified === true ? "true" : "false"}
						className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
							verified === true
								? "bg-emerald-500/15 text-emerald-600"
								: verified === false
									? "bg-red-500/15 text-red-600"
									: "bg-muted text-muted-foreground"
						}`}
					>
						{verified === true
							? labels.passBadge
							: verified === false
								? labels.failBadge
								: labels.notVerifiedBadge}
					</p>
					<details className="mt-3">
						<summary className="cursor-pointer text-xs text-muted-foreground">
							{labels.contractBodyLabel}
						</summary>
						<pre className="mt-2 max-h-72 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">
							<code data-contract-body>{contractBody}</code>
						</pre>
					</details>
				</article>
			</section>
		</div>
	);
}
