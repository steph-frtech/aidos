"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	type AppServiceFragmentView,
	type AppServiceSubstrateView,
	emitAppServiceFragments,
} from "./actions";

/**
 * AppServiceSubstratePanel renders the DP18 APP-SERVICE-SUBSTRATE service fragments of the
 * emitted app's OPTIONAL application services (palette DP14) — the THREE optional services:
 * Forgejo (the self-hosted git of the emitted app, role git, profile git), Plane (the tickets
 * of the emitted app, role tickets, profile tickets) and Better-Auth (the RUNTIME auth of the
 * USERS OF THE BUILT APP, role auth, profile core — DISTINCT from the AIDOS users' auth, E3) —
 * each carried with its image, internal port, per-project isolated bind volume, healthcheck,
 * depends_on, profile and the project it is isolated to. It also renders the AUTH CABLING: how
 * the emitted Better-Auth service cables onto the S80 `app-auth` behavior-macro (carrying its
 * ExpansionID, byte-identical via the S76 UNIQUE Expand — never a duplicated expansion), with
 * the operation→min-role grants mapped onto the EMITTED APP'S runtime AuthorityGraph, and a
 * verbatim runtime-authz demo (viewer × manageRoles → DENY, admin → ALLOW). The source is the
 * AUTHORITATIVE Go (cmd/aidosdatafragments -appsvc), re-emitted on the env passed by the parent.
 *
 * THE WALL (§2) — THE CAPITAL INVARIANT: the emitted app's auth maps the AuthorityGraph OF THE
 * EMITTED APP'S RUNTIME, NEVER the AIDOS approvers (separation auth-app ≠ auth-AIDOS). The
 * `auth-app-not-aidos` indicator surfaces this deterministically (computed by the Go oracle,
 * never prose): the binding scope is `emitted-app-runtime`, never `aidos-approvers`, and no
 * fragment / not the binding writes AIDOS truth. The screen renders a below-the-line projection
 * — it writes NOTHING. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 * DETERMINISM-FIRST: the Go is authoritative; the panel only displays its deterministic output.
 */
export function AppServiceSubstratePanel({
	activeProjectId,
	env,
	initial,
}: {
	activeProjectId: string | null;
	env: string;
	initial: AppServiceSubstrateView;
}) {
	const t = useTranslations("substrate");
	const [view, setView] = useState<AppServiceSubstrateView>(initial);
	const [, startTransition] = useTransition();

	// The env is owned by the parent (the data panel's selector); when it changes we re-emit
	// the app-service fragments for the same (project, env) so all slices stay in step.
	const [shownEnv, setShownEnv] = useState(env);
	if (env !== shownEnv) {
		setShownEnv(env);
		startTransition(async () => {
			const v = await emitAppServiceFragments(activeProjectId, env);
			setView(v);
		});
	}

	const binding = view.binding;

	return (
		<section data-testid="substrate-appsvc" className="space-y-6">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("appsvcHeading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("appsvcIntro")}
				</p>
			</header>

			{view.error ? (
				<div
					data-testid="appsvc-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{view.error}
				</div>
			) : null}

			{/* the three emitted app-service fragments — Forgejo + Plane + Better-Auth */}
			<div
				data-testid="substrate-appsvc-services"
				data-env={view.env}
				data-count={view.app_services.length}
				className="grid gap-4 sm:grid-cols-2"
			>
				{view.app_services.map((f) => (
					<AppServiceCard key={f.key} f={f} t={t} />
				))}
			</div>

			{/* THE CAPITAL INDICATOR — the emitted app's auth maps the RUNTIME AuthorityGraph,
			    NEVER the AIDOS approvers (separation auth-app ≠ auth-AIDOS, the wall §2) */}
			<div
				data-testid="auth-app-not-aidos"
				data-no-truth={view.auth_app_not_aidos}
				data-authority-scope={binding?.authority_graph_scope ?? ""}
				className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span
						aria-hidden
						className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[0.7rem] font-bold text-emerald-600 dark:text-emerald-400"
					>
						{view.auth_app_not_aidos ? "✓" : "!"}
					</span>
					<h3 className="text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
						{t("authAppNotAidosHeading")}
					</h3>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("authAppNotAidosBody")}
				</p>
				{binding ? (
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs">
						<dt className="font-medium text-muted-foreground">
							{t("authAuthorityScope")}
						</dt>
						<dd className="font-mono text-emerald-700 dark:text-emerald-300">
							{binding.authority_graph_scope}
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("authRoles")}
						</dt>
						<dd className="flex flex-wrap gap-1.5">
							{binding.roles.map((r) => (
								<span
									key={r}
									className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{r}
								</span>
							))}
						</dd>
					</dl>
				) : null}
			</div>

			{/* the auth cabling — Better-Auth cables onto the S80 app-auth macro via the S76
			    UNIQUE Expand (never duplicated), with the runtime-authz grants + a verbatim demo */}
			{binding ? (
				<div
					data-testid="appsvc-auth-cabling"
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="space-y-1">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("appsvcCablingHeading")}
						</h3>
						<p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
							{t("appsvcCablingIntro")}
						</p>
					</div>

					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
						<dt className="font-medium text-muted-foreground">
							{t("appsvcMacro")}
						</dt>
						<dd className="font-mono text-foreground">
							{binding.macro} → {binding.service_key}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("appsvcSubsystemExpansion")}
						</dt>
						<dd
							data-testid="appsvc-subsystem-expansion"
							className="truncate font-mono text-muted-foreground"
							title={binding.subsystem_expansion_id}
						>
							{binding.subsystem_expansion_id.slice(0, 12)}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("appsvcOwnerScopingExpansion")}
						</dt>
						<dd
							data-testid="appsvc-ownerscoping-expansion"
							className="truncate font-mono text-muted-foreground"
							title={binding.owner_scoping_expansion_id}
						>
							{binding.owner_scoping_expansion_id.slice(0, 12)}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("appsvcBaseUrlVar")}
						</dt>
						<dd className="font-mono text-foreground">
							{binding.base_url_var}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("appsvcSecretVar")}
						</dt>
						<dd className="font-mono text-foreground">{binding.secret_var}</dd>
					</dl>

					{/* the operation→min-role grants — the EMITTED APP'S runtime AuthorityGraph */}
					<div className="space-y-1.5">
						<h4 className="text-xs font-semibold tracking-tight text-foreground">
							{t("appsvcGrantsHeading")}
						</h4>
						<ul data-testid="appsvc-grants" className="flex flex-wrap gap-1.5">
							{binding.grants.map((g) => (
								<li
									key={g.operation}
									data-testid="appsvc-grant"
									data-operation={g.operation}
									data-min-role={g.min_role}
									className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{g.operation}
									<span className="text-muted-foreground">≥</span>
									<span className="text-primary">{g.min_role}</span>
								</li>
							))}
						</ul>
					</div>

					{/* the verbatim runtime-authz demo — a viewer is REFUSED, an admin is ALLOWED */}
					<div className="space-y-1.5">
						<h4 className="text-xs font-semibold tracking-tight text-foreground">
							{t("appsvcDemoHeading")}
						</h4>
						<ul data-testid="appsvc-auth-demo" className="space-y-1">
							{binding.demo.map((d) => (
								<li
									key={`${d.role}-${d.operation}`}
									data-testid="appsvc-auth-decision"
									data-role={d.role}
									data-operation={d.operation}
									data-allowed={d.allowed}
									className="flex flex-wrap items-center gap-2 text-xs"
								>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${
											d.allowed
												? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
												: "bg-destructive/15 text-destructive"
										}`}
									>
										{d.allowed ? t("appsvcAllow") : t("appsvcDeny")}
									</span>
									<span className="font-mono text-foreground">
										{d.role} → {d.operation}
									</span>
									<span className="text-muted-foreground">
										({t("appsvcRequired")}: {d.required})
									</span>
								</li>
							))}
						</ul>
					</div>

					<p className="text-[0.7rem] leading-relaxed text-muted-foreground">
						{t("appsvcCablingNote")}
					</p>
				</div>
			) : null}
		</section>
	);
}

function AppServiceCard({
	f,
	t,
}: {
	f: AppServiceFragmentView;
	t: ReturnType<typeof useTranslations>;
}) {
	const roleKey = `role_${f.service.role}`;
	const isAuth = f.key === "better-auth";
	return (
		<article
			data-testid="substrate-service"
			data-key={f.key}
			data-profile={f.service.profile}
			data-role={f.service.role}
			data-writes-truth={f.writes_truth}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<header className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{f.service.name}
				</h3>
				{/* the role badge (git / tickets / auth) */}
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t(roleKey)}
				</span>
				{/* the profile badge — git / tickets (optional) or core (the auth runtime) */}
				<span
					data-testid="service-profile"
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
						f.service.profile === "core"
							? "bg-primary/10 text-primary"
							: "bg-primary/15 text-primary"
					}`}
				>
					{f.service.profile === "core"
						? t("profileCore")
						: t(`profile_${f.service.profile}`)}
				</span>
				{/* the « optionnel » marker for the opt-in git/tickets services */}
				{f.service.profile !== "core" ? (
					<span
						data-testid="badge-optional"
						className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary"
					>
						{t("appsvcOptional")}
					</span>
				) : null}
			</header>

			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
				<dt className="font-medium text-muted-foreground">{t("image")}</dt>
				<dd data-testid="service-image" className="font-mono text-foreground">
					{f.service.image || t("appsvcImageEmitted")}
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

				<dt className="font-medium text-muted-foreground">
					{t("obsCapabilities")}
				</dt>
				<dd data-testid="service-capabilities" className="flex flex-wrap gap-1">
					{f.capabilities.map((c) => (
						<span
							key={c}
							className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground"
						>
							{c}
						</span>
					))}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("project")}</dt>
				<dd className="font-mono text-foreground">{f.project_id}</dd>

				<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
				<dd className="truncate font-mono text-muted-foreground" title={f.hash}>
					{f.hash.slice(0, 12)}
				</dd>
			</dl>

			{isAuth ? (
				<p className="text-[0.7rem] leading-relaxed text-primary">
					{t("appsvcAuthNote")}
				</p>
			) : null}
		</article>
	);
}
