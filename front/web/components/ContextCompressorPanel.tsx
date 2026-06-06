"use client";

import { useState } from "react";
import {
	type Compacted,
	compress,
	type GateVerdict,
	gateInvariant,
	type Handle,
	type ReplayEconomy,
	reduction,
	replayEconomy,
	retrieve,
} from "@/lib/context-compressor";

/**
 * ContextCompressorPanel — the action-capable /context-compression panel (HR02). The human RUNS
 * the ContextCompressor port FROM THE SCREEN, calling the SAME pure twin the Go port runs
 * (back/runtime/context.ReferenceCompressor): paste/keep an LLM-input prompt, click COMPRESSER →
 * the compacted text + the reduction ratio appear; click RÉCUPÉRER → retrieve re-expands the
 * handle back to the original, proving losslessness on screen.
 *
 * DETERMINISM-FIRST: the compression is COMPUTED by lib/context-compressor.ts (the deterministic
 * twin), never an LLM, never re-implemented here. THE WALL (the wall): pure, below the line —
 * reads the prompt, writes NO truth; it extends the margin UNDER the budget cap, never relieves
 * the cap. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	promptLabel: string;
	compressCta: string;
	retrieveCta: string;
	compactedHeading: string;
	retrievedHeading: string;
	handleHeading: string;
	reductionLabel: string;
	losslessOk: string;
	losslessFail: string;
	pending: string;
	gateCta: string;
	gateHeading: string;
	gateInvariantOk: string;
	gateInvariantFail: string;
	gateOriginalLabel: string;
	gateCompressedLabel: string;
	gateAllowed: string;
	gateDenied: string;
	replayCta: string;
	replayHeading: string;
	replaySameVerdicts: string;
	replayDiffVerdicts: string;
	replayTokensPlain: string;
	replayTokensCompressed: string;
	replayTokensSaved: string;
	replayCapLabel: string;
	replayCapNeverRaised: string;
	replayFitsUnderCap: string;
}

const DEFAULT_PROMPT = `# CONTEXT PACK — goal: checkout-apply-promo (branch: main)
You are working the red goal "checkout-apply-promo" in the bounded context "checkout".
Red mirrors (your stop condition): promo-field.fixture, applyPromo.workflow
Crossed PUBLIC contracts: checkout-api@hash, PaymentGateway@hash
allowed_paths: /src/checkout/**
forbidden_paths: /kernel/**, /mirror/**
The wall: you NEVER write /kernel/** or /mirror/**. To change a truth you open an idea,
write its mirror, open a /goal. Writing /kernel/** is refused. Writing /mirror/** is refused.
Stop condition: red_set_green AND previous_green_intact AND aggregate_complete
pack_hash: 0x9f3a-checkout-apply-promo-main`;

export function ContextCompressorPanel({ labels }: { labels: Labels }) {
	const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
	const [compacted, setCompacted] = useState<Compacted | null>(null);
	const [handle, setHandle] = useState<Handle | null>(null);
	const [retrieved, setRetrieved] = useState<string | null>(null);
	const [gate, setGate] = useState<{
		original: GateVerdict;
		compressed: GateVerdict;
		invariant: boolean;
	} | null>(null);
	const [replay, setReplay] = useState<ReplayEconomy | null>(null);

	const ratio =
		compacted !== null
			? Math.round(reduction(prompt, compacted) * 1000) / 10
			: 0;
	const lossless =
		retrieved !== null
			? retrieved ===
				prompt
					.split(/\s+/)
					.filter((t) => t.length > 0)
					.join(" ")
			: null;

	return (
		<div className="space-y-6" data-testid="context-compressor-panel">
			<div className="space-y-3 rounded-xl border border-border bg-card p-5">
				<label className="block space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						{labels.promptLabel}
					</span>
					<textarea
						data-testid="prompt-input"
						value={prompt}
						onChange={(e) => {
							setPrompt(e.target.value);
							setCompacted(null);
							setHandle(null);
							setRetrieved(null);
							setGate(null);
							setReplay(null);
						}}
						rows={10}
						className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
					/>
				</label>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="run-compress"
						onClick={() => {
							const r = compress(prompt);
							setCompacted(r.compacted);
							setHandle(r.handle);
							setRetrieved(null);
						}}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.compressCta}
					</button>
					<button
						type="button"
						data-testid="run-retrieve"
						disabled={handle === null}
						onClick={() => {
							if (handle !== null) setRetrieved(retrieve(handle));
						}}
						className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/70 disabled:opacity-40"
					>
						{labels.retrieveCta}
					</button>
					<button
						type="button"
						data-testid="run-gate-check"
						onClick={() => setGate(gateInvariant(prompt))}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.gateCta}
					</button>
					<button
						type="button"
						data-testid="run-replay-economy"
						onClick={() => {
							// HR04: replay the SAME turn (this prompt) with and without compression.
							// A cap strictly between the two costs proves the run breaches WITHOUT
							// compression and fits WITH it — under the SAME (never-raised) cap.
							const probe = replayEconomy([prompt], Number.MAX_SAFE_INTEGER);
							const cap =
								probe.tokensSaved > 0
									? Math.floor((probe.tokensCompressed + probe.tokensPlain) / 2)
									: probe.tokensPlain;
							setReplay(replayEconomy([prompt], cap));
						}}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.replayCta}
					</button>
				</div>
			</div>

			{replay !== null ? (
				<section
					data-testid="replay-panel"
					className="space-y-3 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.replayHeading}
						</h2>
						<span
							data-testid="replay-verdicts-badge"
							data-same={replay.verdictsSame ? "true" : "false"}
							className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
								replay.verdictsSame
									? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
									: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
							}`}
						>
							{replay.verdictsSame
								? labels.replaySameVerdicts
								: labels.replayDiffVerdicts}
						</span>
						<span
							data-testid="replay-cap-badge"
							data-cap-raised={replay.capRaised ? "true" : "false"}
							className="inline-flex items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
						>
							{labels.replayCapNeverRaised}
						</span>
					</div>
					<dl className="grid gap-3 font-mono text-xs sm:grid-cols-3">
						<div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
							<dt className="text-muted-foreground">
								{labels.replayTokensPlain}
							</dt>
							<dd
								data-testid="replay-tokens-plain"
								className="text-foreground/80"
							>
								{replay.tokensPlain}
							</dd>
						</div>
						<div className="space-y-1 rounded-md border border-emerald-500/30 bg-muted/40 p-3">
							<dt className="text-muted-foreground">
								{labels.replayTokensCompressed}
							</dt>
							<dd
								data-testid="replay-tokens-compressed"
								className="text-foreground/80"
							>
								{replay.tokensCompressed}
							</dd>
						</div>
						<div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
							<dt className="text-muted-foreground">
								{labels.replayTokensSaved}
							</dt>
							<dd
								data-testid="replay-tokens-saved"
								className="text-blue-700 dark:text-blue-300"
							>
								{replay.tokensSaved}
							</dd>
						</div>
					</dl>
					<p className="text-xs text-muted-foreground" data-testid="replay-cap">
						<span className="font-medium">{labels.replayCapLabel} </span>
						<code className="font-mono text-foreground">{replay.cap}</code>
						{replay.compressedWithinCap && !replay.plainWithinCap ? (
							<span
								data-testid="replay-fits-under-cap"
								className="ml-2 text-emerald-700 dark:text-emerald-300"
							>
								{labels.replayFitsUnderCap}
							</span>
						) : null}
					</p>
				</section>
			) : null}

			{gate !== null ? (
				<section
					data-testid="gate-panel"
					className="space-y-3 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.gateHeading}
						</h2>
						<span
							data-testid="gate-invariant-badge"
							data-invariant={gate.invariant ? "true" : "false"}
							className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
								gate.invariant
									? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
									: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
							}`}
						>
							{gate.invariant
								? labels.gateInvariantOk
								: labels.gateInvariantFail}
						</span>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{(
							[
								["original", labels.gateOriginalLabel, gate.original],
								["compressed", labels.gateCompressedLabel, gate.compressed],
							] as const
						).map(([key, label, v]) => (
							<div
								key={key}
								data-testid={`gate-verdict-${key}`}
								className="space-y-1 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
							>
								<p className="text-muted-foreground">{label}</p>
								<p
									data-testid={`gate-${key}-allowed`}
									className="text-foreground/80"
								>
									{v.allowed
										? labels.gateAllowed
										: `${labels.gateDenied} (${v.deniedAxis}: ${v.blockReason})`}
								</p>
							</div>
						))}
					</div>
				</section>
			) : null}

			{compacted ? (
				<div className="grid gap-6 lg:grid-cols-2">
					<section
						data-testid="compacted-panel"
						className="space-y-3 rounded-xl border border-emerald-500/30 bg-card p-5"
					>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.compactedHeading}
						</h2>
						<p
							className="text-xs text-muted-foreground"
							data-testid="reduction"
						>
							<span className="font-medium">{labels.reductionLabel} </span>
							<code className="font-mono text-foreground">{ratio}%</code>
						</p>
						<pre
							data-testid="compacted-text"
							className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground/80"
						>
							{compacted.text}
						</pre>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.handleHeading}
							</p>
							<ul className="space-y-1" data-testid="handle-dict">
								{Object.entries(handle?.dictionary ?? {}).map(([h, span]) => (
									<li
										key={h}
										data-testid="handle-entry"
										className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs"
									>
										<span className="text-blue-700 dark:text-blue-300">
											{h}
										</span>
										<span className="text-muted-foreground">→</span>
										<span className="text-foreground/80">{span}</span>
									</li>
								))}
							</ul>
						</div>
					</section>

					<section
						data-testid="retrieved-panel"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.retrievedHeading}
						</h2>
						{retrieved !== null ? (
							<>
								<span
									data-testid="lossless-badge"
									data-lossless={lossless ? "true" : "false"}
									className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
										lossless
											? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
											: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
									}`}
								>
									{lossless ? labels.losslessOk : labels.losslessFail}
								</span>
								<pre
									data-testid="retrieved-text"
									className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground/80"
								>
									{retrieved}
								</pre>
							</>
						) : (
							<p
								className="text-xs italic text-muted-foreground"
								data-testid="retrieve-pending"
							>
								{labels.pending}
							</p>
						)}
					</section>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="compress-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}
