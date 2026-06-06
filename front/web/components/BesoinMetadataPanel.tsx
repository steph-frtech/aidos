"use client";

import { useState } from "react";
import {
	type AuthorityGraph,
	certifyMetadata,
	type Metadata,
	type NodeStatus,
	REGIONS,
	TRUTH_KINDS,
	truthKindIsCoherent,
	VERIFIABILITY_LEVELS,
} from "@/lib/besoin-metadata";

/**
 * BesoinMetadataPanel — the action-capable /compound-besoin-metadata panel (EL04). The human EXECUTES
 * the per-truth metadata certification FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless
 * capability):
 *  - choose the node status + the FOUR metadata (truth_kind, verifiability, scope region, authority),
 *  - "Certifier les métadonnées" runs certifyMetadata(status, metadata) — the byte-for-byte twin of
 *    back/runtime/besoin/metadata.go — and surfaces complete / the gaps (one per missing metadata),
 *  - the /spike routing chip shows when an unverifiable node is routed idea_capture→grill→spike,
 *  - "Prouver la source unique d'enum" runs truthKindIsCoherent(canonical) — truth_kind is ONE enum.
 *
 * Every verdict is COMPUTED by the deterministic twin (reusing the logic of the three kernel packages
 * truthtyping/scope/authority), never an LLM, never re-implemented here. ABOVE the wall: EL04 attaches
 * metadata to a NEED node; it writes no kernel/mirrors/fitness. Themed (ADR 0010), bilingual (ADR
 * 0011) — labels passed in.
 */

interface Labels {
	statusLabel: string;
	truthKindLabel: string;
	verifiabilityLabel: string;
	regionLabel: string;
	authorityLabel: string;
	authNone: string;
	authMissingGrant: string;
	authGranted: string;
	certifyCta: string;
	coherenceCta: string;
	resetCta: string;
	verdictHeading: string;
	complete: string;
	incomplete: string;
	gapsHeading: string;
	routingHeading: string;
	routeSpike: string;
	routeKernel: string;
	routeOther: string;
	coherenceHeading: string;
	coherenceOk: string;
	coherenceFail: string;
	pending: string;
	none: string;
}

const CANONICAL_KINDS = [
	"behavioral",
	"structural",
	"experiential",
	"economic",
	"regulatory",
	"statistical",
	"exploratory",
];

// authority presets exercised from the screen (the regulatory done case + its fix).
type AuthPreset = "none" | "missing-grant" | "granted";

function buildAuthority(preset: AuthPreset): {
	authority?: AuthorityGraph;
	granted?: string[];
} {
	if (preset === "none") return {};
	const authority: AuthorityGraph = {
		domain: "gdpr",
		truthKind: "regulatory",
		approvers: ["legal"],
	};
	return {
		authority,
		granted: preset === "granted" ? ["legal"] : [],
	};
}

export function BesoinMetadataPanel({ labels }: { labels: Labels }) {
	const [status, setStatus] = useState<NodeStatus>("resolved");
	const [truthKind, setTruthKind] = useState("behavioral");
	const [verifiability, setVerifiability] = useState("deterministic");
	const [region, setRegion] = useState("*");
	const [authPreset, setAuthPreset] = useState<AuthPreset>("none");

	const [verdict, setVerdict] = useState<ReturnType<
		typeof certifyMetadata
	> | null>(null);
	const [coherence, setCoherence] = useState<boolean | null>(null);

	function runCertify() {
		const meta: Metadata = {
			truthKind,
			verifiability,
			scope: { region },
			...buildAuthority(authPreset),
		};
		setVerdict(certifyMetadata(status, meta));
	}

	function runCoherence() {
		setCoherence(truthKindIsCoherent(CANONICAL_KINDS));
	}

	function runReset() {
		setStatus("resolved");
		setTruthKind("behavioral");
		setVerifiability("deterministic");
		setRegion("*");
		setAuthPreset("none");
		setVerdict(null);
		setCoherence(null);
	}

	const routingLabel = (r: string | undefined): string => {
		if (r === "/spike") return labels.routeSpike;
		if (r === "kernel") return labels.routeKernel;
		return labels.routeOther;
	};

	return (
		<div className="space-y-8" data-testid="besoin-metadata-panel">
			{/* Metadata form */}
			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.statusLabel}
						<select
							value={status}
							onChange={(e) => setStatus(e.target.value as NodeStatus)}
							data-testid="status-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{["empty", "drafting", "resolved"].map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.truthKindLabel}
						<select
							value={truthKind}
							onChange={(e) => setTruthKind(e.target.value)}
							data-testid="truth-kind-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<option value="">—</option>
							{TRUTH_KINDS.map((k) => (
								<option key={k} value={k}>
									{k}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.verifiabilityLabel}
						<select
							value={verifiability}
							onChange={(e) => setVerifiability(e.target.value)}
							data-testid="verifiability-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<option value="">—</option>
							{VERIFIABILITY_LEVELS.map((l) => (
								<option key={l} value={l}>
									{l}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.regionLabel}
						<select
							value={region}
							onChange={(e) => setRegion(e.target.value)}
							data-testid="region-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<option value="">—</option>
							{REGIONS.map((r) => (
								<option key={r} value={r}>
									{r}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
						{labels.authorityLabel}
						<select
							value={authPreset}
							onChange={(e) => setAuthPreset(e.target.value as AuthPreset)}
							data-testid="authority-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<option value="none">{labels.authNone}</option>
							<option value="missing-grant">{labels.authMissingGrant}</option>
							<option value="granted">{labels.authGranted}</option>
						</select>
					</label>
				</div>

				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={runCertify}
						data-testid="certify"
						className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.certifyCta}
					</button>
					<button
						type="button"
						onClick={runCoherence}
						data-testid="coherence"
						className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.coherenceCta}
					</button>
					<button
						type="button"
						onClick={runReset}
						data-testid="reset"
						className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.resetCta}
					</button>
				</div>
			</div>

			{/* Verdict */}
			<section className="space-y-3 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.verdictHeading}
				</h3>
				{verdict === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="verdict-pending"
					>
						{labels.pending}
					</p>
				) : (
					<>
						<p
							data-testid="verdict-result"
							className={
								verdict.complete
									? "inline-flex items-center rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
									: "inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
							}
							data-complete={verdict.complete ? "true" : "false"}
						>
							{verdict.complete ? labels.complete : labels.incomplete}
						</p>

						{verdict.gaps.length > 0 && (
							<div className="space-y-2">
								<h4 className="text-xs font-semibold tracking-tight text-muted-foreground uppercase">
									{labels.gapsHeading}
								</h4>
								<ul className="space-y-2">
									{verdict.gaps.map((g) => (
										<li
											key={g.code}
											data-testid={`gap-${g.code}`}
											className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
										>
											<code className="font-mono text-xs text-foreground">
												{g.code}
											</code>
											<span className="ml-2 text-muted-foreground">
												{g.explanation}
											</span>
											<span className="mt-1 block font-mono text-xs text-muted-foreground">
												{g.howToFix.join(" · ")}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						<div className="space-y-1">
							<h4 className="text-xs font-semibold tracking-tight text-muted-foreground uppercase">
								{labels.routingHeading}
							</h4>
							<p
								data-testid="routing-result"
								data-route-spike={verdict.routeToSpike ? "true" : "false"}
								className={
									verdict.routeToSpike
										? "inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400"
										: "inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground"
								}
							>
								{routingLabel(verdict.routing)}
							</p>
						</div>
					</>
				)}
			</section>

			{/* Single enum source */}
			<section className="space-y-2 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.coherenceHeading}
				</h3>
				{coherence === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="coherence-pending"
					>
						{labels.pending}
					</p>
				) : (
					<p
						data-testid="coherence-result"
						className={
							coherence
								? "inline-flex items-center rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
								: "inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
						}
					>
						{coherence ? labels.coherenceOk : labels.coherenceFail}
					</p>
				)}
			</section>
		</div>
	);
}
