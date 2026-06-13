"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { StackManifest } from "@/lib/bootstrap";
import { bootstrapRunAction } from "./actions";
import { BOOTSTRAP_INITIAL, type BootstrapRunView } from "./view";

/**
 * BootstrapPanel rend l'émetteur bootstrap one-shot déterministe DP12 :
 * l'action « amorcer la stack » (data-testid=bootstrap-run) émet la séquence
 * ordonnée d'events (data-testid=bootstrap-events / bootstrap-event[data-step]),
 * les URLs imprimées (data-testid=bootstrap-urls) et — sur le scénario secret
 * manquant — le BlockReason MISSING_SECRET_AT_BOOT (data-testid=bootstrap-block).
 *
 * NOTE HONNÊTE (CLAUDE.md §6/§8). L'exécution docker réelle est GATÉE (comme le
 * spike DP10) : l'écran montre la SÉQUENCE déterministe émise (une projection
 * plan-as-data), jamais un run docker live. Le .env concret + les secrets vivent
 * dans l'appliance au boot (chmod 600, gitignored), JAMAIS dans le source émis —
 * la projection ne porte que des NOMS et des réfs ${VAR} (le mur §2). Thème ADR
 * 0010 ; strings via next-intl (ADR 0011, FR d'abord).
 */

function RunSubmit({ scenario, testid }: { scenario: string; testid: string }) {
	const t = useTranslations("bootstrap");
	const { pending } = useFormStatus();
	const primary = scenario === "nominal";
	return (
		<button
			type="submit"
			name="scenario"
			value={scenario}
			data-testid={testid}
			disabled={pending}
			className={
				primary
					? "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
					: "inline-flex items-center justify-center rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
			}
		>
			{pending
				? t("working")
				: primary
					? t("runNominal")
					: t("runSecretMissing")}
		</button>
	);
}

export function BootstrapPanel({
	activeProjectId,
	bundle,
}: {
	activeProjectId: string | null;
	bundle: StackManifest;
}) {
	const t = useTranslations("bootstrap");
	const [state, action] = useActionState<BootstrapRunView, FormData>(
		bootstrapRunAction,
		BOOTSTRAP_INITIAL,
	);

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* le bundle émis sur lequel on amorce (la source DP02, lecture seule) */}
			<section
				data-testid="bundle-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("bundleHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("bundleNote")}</p>
				<table className="mt-3 w-full text-left text-xs">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-1 pr-3 font-medium">{t("svcName")}</th>
							<th className="py-1 pr-3 font-medium">{t("svcRole")}</th>
							<th className="py-1 font-medium">{t("svcPort")}</th>
						</tr>
					</thead>
					<tbody data-testid="bundle-services">
						{bundle.services.map((s) => (
							<tr key={s.name} className="border-b border-border/50">
								<td className="py-1 pr-3 font-mono text-foreground">
									{s.name}
								</td>
								<td className="py-1 pr-3 font-mono text-muted-foreground">
									{s.role}
								</td>
								<td className="py-1 font-mono text-muted-foreground">
									{s.internalPort}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="mt-3 text-xs text-muted-foreground">
					{t("scopesLabel")}:{" "}
					<span className="font-mono">
						{(bundle.connectorScopes ?? []).join(", ") || t("noScopes")}
					</span>
				</p>
			</section>

			{/* l'action — amorcer la stack (les deux scénarios, ui-completeness §7) */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("runNote")}</p>
				<form
					action={action}
					className="mt-3 flex flex-wrap items-center gap-3"
				>
					<RunSubmit scenario="nominal" testid="bootstrap-run" />
					<RunSubmit
						scenario="secret-missing"
						testid="bootstrap-run-secret-missing"
					/>
				</form>
				{/* la note honnête : l'exécution docker réelle reste gatée */}
				<p
					data-testid="gated-note"
					className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
				>
					{t("gatedNote")}
				</p>
			</section>

			{/* le BlockReason fail-closed — MISSING_SECRET_AT_BOOT (le mur en action) */}
			{state.ok && state.block !== undefined && (
				<section
					data-testid="bootstrap-block"
					data-code={state.block.code}
					className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("blockHeading")}
						</h2>
						<span
							data-testid="bootstrap-block-code"
							className="inline-flex items-center rounded-full bg-destructive px-3 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground"
						>
							{state.block.code}
						</span>
					</div>
					<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
						{state.block.explanation}
					</p>
					<ul className="mt-3 space-y-1">
						{state.block.howToFix.map((h) => (
							<li
								key={h}
								className="font-mono text-xs leading-relaxed text-muted-foreground"
							>
								→ {h}
							</li>
						))}
					</ul>
				</section>
			)}

			{/* le LOG d'events ORDONNÉ — la séquence déterministe émise */}
			{state.ok && state.sequence !== undefined && (
				<section
					data-testid="sequence-card"
					className="rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("sequenceHeading")}
					</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("resolvedPortLabel")}:{" "}
						<span
							data-testid="resolved-port"
							className="font-mono text-foreground"
						>
							{state.sequence.resolvedPort}
						</span>
					</p>
					<ol data-testid="bootstrap-events" className="mt-3 space-y-1.5">
						{state.sequence.events.map((e) => (
							<li
								key={e.seq}
								data-testid="bootstrap-event"
								data-step={e.kind}
								data-seq={e.seq}
								className="flex flex-wrap items-baseline gap-2 font-mono text-xs"
							>
								<span className="inline-flex min-w-[1.5rem] items-center justify-center rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
									{e.seq}
								</span>
								<span className="font-semibold text-foreground">{e.kind}</span>
								<span className="text-muted-foreground">{e.detail}</span>
							</li>
						))}
					</ol>
					{/* les URLs imprimées (réfs ${VAR} — jamais un endpoint en dur) */}
					<p className="mt-4 text-xs text-muted-foreground">
						{t("urlsLabel")}:{" "}
						<span data-testid="bootstrap-urls" className="font-mono">
							{state.sequence.events.find((e) => e.kind === "urls-printed")
								?.detail ?? ""}
						</span>
					</p>
					<p className="mt-3 text-xs text-muted-foreground">
						{t("sequenceHashLabel")}:{" "}
						<span data-testid="sequence-hash" className="font-mono break-all">
							{state.sequenceHash}
						</span>
					</p>
				</section>
			)}
		</div>
	);
}
