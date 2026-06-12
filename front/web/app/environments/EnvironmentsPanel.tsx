"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Binding } from "@/lib/environments";
import { DATASTORES, ENVIRONMENTS } from "@/lib/environments";
import { gateAction } from "./actions";
import { GATE_INITIAL, type GateView } from "./view";

/**
 * EnvironmentsPanel renders the DP06 projection: the FIVE closed environments
 * (scope.Environments() — the S15 trio + the DP06 additive local/future_cloud,
 * ADR 0065) with their DECLARED connection bindings — default + allowed
 * datastores, ${VAR} URL pattern (references, never values), TLS, network,
 * managed — and the Go-authoritative content address of the whole projection.
 *
 * ONE control (« tester la liaison », ui-completeness CLAUDE.md §7) runs the
 * PURE A1 gate over the picked (environment, datastore) pair — proving from
 * the screen that prod + doltgres is REFUSED (DOLTGRES_NOT_ALLOWED_IN_PROD,
 * SPEC-stack-2026 verbatim) while doltgres stays opt-in off prod — and
 * re-measures the projection's hash against the seeded Go address. It writes
 * NOTHING (the wall, §2). Themed on ADR 0010 tokens; strings via next-intl
 * (ADR 0011, FR first).
 */

function GateSubmit() {
	const t = useTranslations("environments");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="gate-test"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("gateTest")}
		</button>
	);
}

function BindingRow({ b }: { b: Binding }) {
	const t = useTranslations("environments");
	return (
		<tr
			data-testid={`env-row-${b.environment}`}
			className="border-b border-border last:border-b-0"
		>
			<td className="px-3 py-2 font-mono text-xs font-medium text-foreground">
				{b.environment}
			</td>
			<td className="px-3 py-2 font-mono text-xs text-foreground">
				{b.default_datastore}
			</td>
			<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
				{b.allowed_datastores.join(" · ")}
			</td>
			<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
				{b.url_pattern}
			</td>
			<td className="px-3 py-2 text-xs text-muted-foreground">
				{b.tls ? "TLS" : "—"}
			</td>
			<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
				{b.network}
			</td>
			<td className="px-3 py-2 text-xs text-muted-foreground">
				{b.managed ? t("managedYes") : "—"}
			</td>
		</tr>
	);
}

export function EnvironmentsPanel({
	activeProjectId,
	bindings,
	seededHash,
}: {
	activeProjectId: string | null;
	bindings: Binding[];
	seededHash: string;
}) {
	const t = useTranslations("environments");
	const [state, action] = useActionState<GateView, FormData>(
		gateAction,
		GATE_INITIAL,
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

			{/* the five declared bindings — the below-the-line projection */}
			<section
				data-testid="bindings-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("bindingsHeading")}
					</h2>
					<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{t("bindingsCount", { count: bindings.length })}
					</span>
				</div>
				<div className="mt-4 overflow-x-auto">
					<table
						data-testid="environments-table"
						className="w-full border-collapse text-left"
					>
						<thead>
							<tr className="border-b border-border text-xs font-medium text-muted-foreground">
								<th className="px-3 py-2">{t("envCol")}</th>
								<th className="px-3 py-2">{t("defaultDsCol")}</th>
								<th className="px-3 py-2">{t("allowedDsCol")}</th>
								<th className="px-3 py-2">{t("urlCol")}</th>
								<th className="px-3 py-2">TLS</th>
								<th className="px-3 py-2">{t("networkCol")}</th>
								<th className="px-3 py-2">{t("managedCol")}</th>
							</tr>
						</thead>
						<tbody>
							{bindings.map((b) => (
								<BindingRow key={b.environment} b={b} />
							))}
						</tbody>
					</table>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
					<span className="font-medium text-muted-foreground">
						{t("hashLabel")}:
					</span>
					<code
						data-testid="bindings-hash"
						className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground"
					>
						{seededHash}
					</code>
				</div>
				<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>

			{/* the ONE control — the pure A1 gate, executable from the screen */}
			<section
				data-testid="gate-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("gateHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("gateBody")}
				</p>
				<form action={action} className="mt-4 flex flex-wrap items-end gap-3">
					<input type="hidden" name="seededHash" value={seededHash} />
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("envCol")}
						<select
							name="environment"
							data-testid="gate-env"
							className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{ENVIRONMENTS.map((e) => (
								<option key={e} value={e}>
									{e}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{t("datastoreLabel")}
						<select
							name="datastore"
							data-testid="gate-datastore"
							className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{DATASTORES.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
					</label>
					<GateSubmit />
				</form>

				{state.refusal ? (
					<div
						data-testid="gate-refusal"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-destructive">
								{t("refused")}
							</span>
							<code
								data-testid="gate-code"
								className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-medium text-destructive"
							>
								{state.refusal.code}
							</code>
						</div>
						<p className="mt-2 text-xs leading-relaxed text-destructive/90">
							{state.refusal.message}
						</p>
					</div>
				) : null}

				{state.ok && state.binding ? (
					<div
						data-testid="gate-verdict"
						className="mt-4 rounded-lg border border-border bg-muted/40 p-4"
					>
						<p className="text-xs font-medium text-foreground">
							{t("admitted", {
								environment: state.environment ?? "",
								datastore: state.datastore ?? "",
							})}
						</p>
						<dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
							<div className="flex gap-2">
								<dt className="font-medium">{t("urlCol")}:</dt>
								<dd data-testid="verdict-url" className="font-mono">
									{state.binding.url_pattern}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-medium">{t("hashLabel")}:</dt>
								<dd data-testid="verdict-hash" className="font-mono">
									{state.hash}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="font-medium">{t("sameAsSeededLabel")}:</dt>
								<dd data-testid="verdict-same" className="font-mono">
									{state.sameAsSeeded ? t("sameYes") : t("sameNo")}
								</dd>
							</div>
						</dl>
					</div>
				) : null}
			</section>
		</div>
	);
}
