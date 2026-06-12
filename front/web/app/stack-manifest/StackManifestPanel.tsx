"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { StackManifest, StackManifestRecord } from "@/lib/stack-manifest";
import { PROFILES, ROLES } from "@/lib/stack-manifest";
import { measureAction } from "./actions";
import { MEASURE_INITIAL, type MeasureView } from "./view";

/**
 * StackManifestPanel renders the DP02 first-class Kernel source: the seeded
 * StackManifest (the declared topology — services with their CLOSED role and
 * profile sets, internal ports, volumes as env-var binds, the external
 * traefik network, the connector scopes) and its content address (id ==
 * version == records.Hash(records.Canonicalize(body)), S02 reused).
 *
 * ONE control (« valider & hasher », ui-completeness CLAUDE.md §7) re-runs the
 * PURE validator + hashing over the editable JSON — proving from the screen
 * the refusals UNKNOWN_SERVICE_ROLE / DUPLICATE_INTERNAL_PORT /
 * STACK_HAS_NO_SERVER and the round-trip (same body → same hash). It writes
 * NOTHING (the wall, §2): engraving flows through idea → mirror → /goal.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function MeasureSubmit() {
	const t = useTranslations("stackManifest");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="measure"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("measure")}
		</button>
	);
}

export function StackManifestPanel({
	activeProjectId,
	manifest,
	record,
}: {
	activeProjectId: string | null;
	manifest: StackManifest;
	record: StackManifestRecord;
}) {
	const t = useTranslations("stackManifest");
	const [state, action] = useActionState<MeasureView, FormData>(
		measureAction,
		MEASURE_INITIAL,
	);
	// CONTROLLED textarea: the screen's editable copy of the manifest JSON — React
	// owns the value so a re-render (server-action round-trip) never resets the
	// user's edit back to the seeded default.
	const [manifestJson, setManifestJson] = useState(() =>
		JSON.stringify(manifest, null, 2),
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

			{/* the seeded manifest — the declared topology, read from the source */}
			<section
				data-testid="manifest-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("manifestHeading")}
					</h2>
					<span
						data-testid="app-name"
						className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-medium text-foreground"
					>
						{manifest.app}
					</span>
				</div>

				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-sm" data-testid="services">
						<thead>
							<tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
								<th className="py-2 pr-4 font-medium">{t("serviceCol")}</th>
								<th className="py-2 pr-4 font-medium">{t("roleCol")}</th>
								<th className="py-2 pr-4 font-medium">{t("imageCol")}</th>
								<th className="py-2 pr-4 font-medium">{t("portCol")}</th>
								<th className="py-2 pr-4 font-medium">{t("profileCol")}</th>
								<th className="py-2 font-medium">{t("dependsCol")}</th>
							</tr>
						</thead>
						<tbody>
							{manifest.services.map((s) => (
								<tr
									key={s.name}
									data-testid={`service-${s.name}`}
									className="border-b border-border/50 last:border-0"
								>
									<td className="py-2 pr-4 font-mono text-foreground">
										{s.name}
									</td>
									<td className="py-2 pr-4">
										<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{s.role}
										</span>
									</td>
									<td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
										{s.image || t("emittedImage")}
									</td>
									<td className="py-2 pr-4 font-mono text-muted-foreground">
										{s.internal_port}
									</td>
									<td className="py-2 pr-4 text-muted-foreground">
										{s.profile}
									</td>
									<td className="py-2 font-mono text-xs text-muted-foreground">
										{s.depends_on?.join(", ") ?? "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
					<div className="rounded-lg bg-muted/40 p-3">
						<dt className="font-medium text-muted-foreground">
							{t("volumesLabel")}
						</dt>
						<dd
							data-testid="volumes"
							className="mt-1 font-mono text-foreground"
						>
							{(manifest.volumes ?? [])
								.map((v) => `${v.name} → \${${v.device_var}}`)
								.join(", ") || "—"}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-3">
						<dt className="font-medium text-muted-foreground">
							{t("networkLabel")}
						</dt>
						<dd
							data-testid="network"
							className="mt-1 font-mono text-foreground"
						>
							{manifest.network.name}
							{manifest.network.external ? " (external)" : ""}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-3">
						<dt className="font-medium text-muted-foreground">
							{t("scopesLabel")}
						</dt>
						<dd data-testid="scopes" className="mt-1 font-mono text-foreground">
							{(manifest.connector_scopes ?? []).join(", ") || "—"}
						</dd>
					</div>
				</dl>

				<div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs">
					<span className="font-medium text-muted-foreground">
						{t("hashLabel")}
					</span>
					<p
						data-testid="manifest-hash"
						className="mt-1 break-all font-mono text-foreground"
					>
						{record.id}
					</p>
				</div>
			</section>

			{/* the two closed sets — enumerable, never invented */}
			<section
				data-testid="closed-sets"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("closedSetsHeading")}
				</h2>
				<div className="mt-3 space-y-3 text-xs">
					<div>
						<span className="font-medium text-muted-foreground">
							{t("rolesLabel")} ({ROLES.length})
						</span>
						<p data-testid="roles" className="mt-1 font-mono text-foreground">
							{ROLES.join(" · ")}
						</p>
					</div>
					<div>
						<span className="font-medium text-muted-foreground">
							{t("profilesLabel")} ({PROFILES.length})
						</span>
						<p
							data-testid="profiles"
							className="mt-1 font-mono text-foreground"
						>
							{PROFILES.join(" · ")}
						</p>
					</div>
				</div>
			</section>

			{/* the control — validate & hash, a pure measure (writes nothing) */}
			<section
				data-testid="measure-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("measureHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("measureHint")}
				</p>
				<form action={action} className="mt-4 space-y-4">
					<input type="hidden" name="seededHash" value={record.id} />
					<textarea
						name="manifestJson"
						data-testid="manifest-json"
						rows={10}
						value={manifestJson}
						onChange={(e) => setManifestJson(e.target.value)}
						className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<MeasureSubmit />
				</form>

				{state.ok && state.hash ? (
					<div
						data-testid="measure-result"
						data-outcome="valid"
						className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs"
					>
						<p className="font-medium text-foreground">{t("validVerdict")}</p>
						<p
							data-testid="measured-hash"
							className="mt-1 break-all font-mono text-muted-foreground"
						>
							{state.hash}
						</p>
						<p
							data-testid="hash-compare"
							className="mt-1 text-muted-foreground"
						>
							{state.sameAsSeeded ? t("sameHash") : t("newVersion")}
						</p>
					</div>
				) : null}
				{!state.ok && state.refusal ? (
					<div
						data-testid="measure-result"
						data-outcome="refused"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
					>
						<p
							data-testid="refusal-code"
							className="font-mono font-semibold text-destructive"
						>
							{state.refusal.code}
						</p>
						<p className="mt-1 text-muted-foreground">
							{state.refusal.message}
						</p>
					</div>
				) : null}
				{!state.ok && state.parseError ? (
					<div
						data-testid="measure-result"
						data-outcome="parse-error"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
					>
						<p className="font-mono font-semibold text-destructive">
							INVALID_JSON
						</p>
						<p className="mt-1 text-muted-foreground">{state.parseError}</p>
					</div>
				) : null}
			</section>

			{/* the wall — engraving goes through idea → mirror → /goal */}
			<section
				data-testid="wall-note"
				className="rounded-xl border border-border bg-muted/40 p-5 text-xs leading-relaxed text-muted-foreground"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("wallHeading")}
				</h2>
				<p className="mt-2">{t("wallBody")}</p>
			</section>
		</div>
	);
}
