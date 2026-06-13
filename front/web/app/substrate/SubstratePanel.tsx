"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ENVIRONMENTS } from "@/lib/environments";
import {
	emitFragments,
	type ServiceFragmentView,
	type SubstrateView,
} from "./actions";

/**
 * SubstratePanel renders the DP15 DATA-SUBSTRATE service fragments of the emitted
 * app — the FOUR data-layer services (Postgres datastore/core, Doltgres
 * non-prod/opt-in, Valkey cache/core, PgBouncer pooler/core) each carried with its
 * image, internal port, named bind volume, healthcheck, depends_on, profile and the
 * project it is isolated to. An ENV SELECTOR re-emits via the AUTHORITATIVE Go
 * (cmd/aidosdatafragments): off prod the four fragments appear; in PROD the DP06
 * gate REFUSES doltgres (DOLTGRES_NOT_ALLOWED_IN_PROD, surfaced verbatim) and it
 * disappears from the emitted set, leaving the three core services.
 *
 * THE WALL (§2): the screen renders a below-the-line projection — it writes NOTHING
 * (no kernel/mirrors/fitness). Themed on ADR 0010 tokens; strings via next-intl
 * (ADR 0011, FR first). DETERMINISM-FIRST: the Go is authoritative; the panel only
 * displays its deterministic output.
 */
export function SubstratePanel({
	activeProjectId,
	initial,
	onEnvChange,
}: {
	activeProjectId: string | null;
	initial: SubstrateView;
	/** notifies a parent (the async twin) when the env selector changes, so the two
	 * substrate slices (data + async) re-emit for the SAME (project, env) in step. */
	onEnvChange?: (env: string) => void;
}) {
	const t = useTranslations("substrate");
	const [view, setView] = useState<SubstrateView>(initial);
	const [env, setEnv] = useState<string>(initial.env);
	const [pending, startTransition] = useTransition();

	function selectEnv(next: string) {
		setEnv(next);
		onEnvChange?.(next);
		startTransition(async () => {
			const v = await emitFragments(activeProjectId, next);
			setView(v);
		});
	}

	const isProd = view.env === "prod";
	// In prod the full door refuses doltgres; the emitted set is the core slice. Off
	// prod it is the four full fragments. The panel always renders the EMITTED set.
	const emitted: ServiceFragmentView[] = view.full_ok ? view.full : view.core;
	// Doltgres is the gated, non-prod-only fragment — present off prod, absent in prod.
	const doltgresEmitted = emitted.some((f) => f.key === "doltgres");

	return (
		<div className="space-y-8">
			{/* the active project + the env selector — the gesture */}
			<section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
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
				<div className="flex flex-wrap items-center gap-2">
					<label
						htmlFor="substrate-env"
						className="text-xs font-medium text-foreground"
					>
						{t("envLabel")}
					</label>
					<select
						id="substrate-env"
						data-testid="substrate-env"
						value={env}
						disabled={pending}
						onChange={(e) => selectEnv(e.target.value)}
						className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
					>
						{ENVIRONMENTS.map((e) => (
							<option key={e} value={e}>
								{e}
							</option>
						))}
					</select>
					{pending ? (
						<span className="text-xs text-muted-foreground">
							{t("emitting")}
						</span>
					) : null}
				</div>
			</section>

			{/* the DP06 refusal in prod — surfaced verbatim, never re-coined */}
			{isProd && view.refusal ? (
				<section
					data-testid="doltgres-refusal"
					data-code={view.refusal.code}
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-destructive">
						{t("refusalHeading")}
					</h2>
					<p className="mt-1 font-mono text-xs font-bold text-destructive">
						{view.refusal.code}
					</p>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						{view.refusal.message}
					</p>
				</section>
			) : null}

			{view.error ? (
				<section
					data-testid="substrate-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{view.error}
				</section>
			) : null}

			{/* the emitted data services — the DP15 fragments */}
			<section
				data-testid="substrate-services"
				data-env={view.env}
				data-count={emitted.length}
				className="grid gap-4 sm:grid-cols-2"
			>
				{emitted.map((f) => (
					<ServiceCard key={f.key} f={f} isProd={isProd} t={t} />
				))}
			</section>

			{/* an honest note: in prod doltgres is absent (gated), not a defect */}
			<section
				data-testid="substrate-note"
				className="rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("noteHeading")}
				</h2>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					{isProd
						? t("noteProd")
						: doltgresEmitted
							? t("noteNonProd")
							: t("noteNonProd")}
				</p>
			</section>
		</div>
	);
}

function ServiceCard({
	f,
	isProd,
	t,
}: {
	f: ServiceFragmentView;
	isProd: boolean;
	t: ReturnType<typeof useTranslations>;
}) {
	const isDoltgres = f.key === "doltgres";
	const roleKey = `role_${f.service.role}`;
	return (
		<article
			data-testid="substrate-service"
			data-key={f.key}
			data-profile={f.service.profile}
			data-role={f.service.role}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<header className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{f.service.name}
				</h3>
				{/* the role badge (datastore / cache / pooler) */}
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t(roleKey)}
				</span>
				{/* the profile badge — `core` (prod) or `non-prod` (opt-in, « hors prod ») */}
				<span
					data-testid="service-profile"
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
						f.service.profile === "core"
							? "bg-primary/10 text-primary"
							: "bg-amber-500/15 text-amber-600 dark:text-amber-400"
					}`}
				>
					{f.service.profile === "core"
						? t("profileCore")
						: t("profileNonProd")}
				</span>
				{/* the « hors prod » marker for the opt-in non-prod datastore */}
				{isDoltgres ? (
					<span
						data-testid="badge-hors-prod"
						className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400"
					>
						{t("horsProd")}
					</span>
				) : null}
			</header>

			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
				<dt className="font-medium text-muted-foreground">{t("image")}</dt>
				<dd data-testid="service-image" className="font-mono text-foreground">
					{f.service.image}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("port")}</dt>
				<dd data-testid="service-port" className="font-mono text-foreground">
					{f.service.internal_port}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("volume")}</dt>
				<dd data-testid="service-volume" className="font-mono text-foreground">
					{f.volumes.map((v) => v.name).join(", ") || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">
					{t("healthcheck")}
				</dt>
				<dd
					data-testid="service-healthcheck"
					className="font-mono text-foreground"
				>
					{f.service.healthcheck || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("dependsOn")}</dt>
				<dd className="font-mono text-foreground">
					{f.service.depends_on?.length ? f.service.depends_on.join(", ") : "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("project")}</dt>
				<dd className="font-mono text-foreground">{f.project_id}</dd>

				<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
				<dd className="truncate font-mono text-muted-foreground" title={f.hash}>
					{f.hash.slice(0, 12)}
				</dd>
			</dl>

			{isDoltgres && !isProd ? (
				<p className="text-[0.7rem] leading-relaxed text-amber-600 dark:text-amber-400">
					{t("doltgresOptIn")}
				</p>
			) : null}
		</article>
	);
}
