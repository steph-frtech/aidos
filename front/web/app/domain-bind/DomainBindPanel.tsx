"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { bindDomainAction } from "./actions";
import { DOMAIN_BIND_INITIAL, type DomainBindView } from "./view";

/**
 * DomainBindPanel makes the /domain-bind route action-capable (ui-completeness law, CLAUDE.md §7):
 * the S97 custom-domain binding has a control bound to the REAL pure twin (lib/domainbind),
 * reachable AND executable from the screen.
 *
 * Action-capable surfaces, per the done-criteria:
 *  1. BIND — bind a custom domain to the active project's deployed app: the deterministic,
 *     content-addressed bind plan (the HTTPS URL, the Traefik HTTPS labels + ACME certresolver,
 *     the DNS CNAME to the deploy host). A "conflict" toggle (the domain already bound to another
 *     project) proves the DOMAIN_ALREADY_BOUND refusal (the injectivity done-criteria).
 *  2. HTTPS (rendered) — the « sert l'app en HTTPS » badge: judged by CODE (servesHTTPS over the
 *     emitted Traefik labels), never an agent.
 *  3. INJECTIVE (rendered) — the « binding domaine→projet injectif » badge.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): binding runs the PURE twin, never an LLM. THE WALL (§2):
 * binding WRITES NO TRUTH — recording the binding as a DAG decision goes through propose →
 * ChangeSet → approval. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit({ label }: { label: string }) {
	const t = useTranslations("domainBind");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="bind-button"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function DomainBindPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("domainBind");
	const [state, action] = useActionState<DomainBindView, FormData>(
		bindDomainAction,
		DOMAIN_BIND_INITIAL,
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

			{/* Control 1 — BIND a custom domain deterministically. */}
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<div className="space-y-2">
					<label
						htmlFor="project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="project"
						name="project"
						defaultValue="shop"
						data-testid="project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="domain"
						className="text-sm font-medium text-foreground"
					>
						{t("domainLabel")}
					</label>
					<input
						id="domain"
						name="domain"
						defaultValue="shop.acme.com"
						data-testid="domain-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="conflict"
						data-testid="conflict-toggle"
						className="size-4 rounded border-input"
					/>
					{t("conflictLabel")}
				</label>
				<Submit label={t("bindLabel")} />
			</form>

			{state.blockExplanation && !state.ok && (
				<section
					data-testid="block-reason"
					data-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && state.plan && (
				<div className="space-y-6" data-testid="bind-result">
					{/* The bind plan — HTTPS URL, badges, content address. */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("planHeading")}
							</h2>
							<a
								href={state.plan.url}
								data-testid="bind-url"
								className="font-mono text-xs text-primary underline"
							>
								{state.plan.url}
							</a>
						</div>
						<div className="flex flex-wrap gap-2">
							<span
								data-testid="serves-https"
								data-https={state.servesHTTPS ? "true" : "false"}
								className={
									state.servesHTTPS
										? "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
										: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
								}
							>
								{state.servesHTTPS ? t("httpsOk") : t("httpsFail")}
							</span>
							<span
								data-testid="injective"
								data-injective={state.injective ? "true" : "false"}
								className={
									state.injective
										? "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
										: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
								}
							>
								{state.injective ? t("injectiveOk") : t("injectiveFail")}
							</span>
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("routerLabel")}</dt>
								<dd
									data-testid="router-name"
									className="font-mono text-foreground"
								>
									{state.plan.routerName}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									{t("certResolverLabel")}
								</dt>
								<dd
									data-testid="cert-resolver"
									className="font-mono text-foreground"
								>
									{state.plan.certResolver}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("planIdLabel")}</dt>
								<dd data-testid="plan-id" className="font-mono text-foreground">
									{state.plan.id}
								</dd>
							</div>
						</dl>
					</section>

					{/* The DNS CNAME instruction. */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("dnsHeading")}
						</h2>
						<pre
							data-testid="dns-record"
							className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
						>
							{`${state.plan.dns.type}  ${state.plan.dns.name}  ${state.plan.dns.value}`}
						</pre>
					</section>

					{/* The emitted Traefik labels (DP27 — HTTPS via ACME). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("labelsHeading")}
						</h2>
						<ul className="space-y-1" data-testid="traefik-labels">
							{state.plan.labels.map((l) => (
								<li
									key={l.label}
									data-label={l.label}
									className="rounded-lg bg-muted p-2 font-mono text-xs text-muted-foreground"
								>
									{l.label} = {l.value}
								</li>
							))}
						</ul>
					</section>
				</div>
			)}
		</div>
	);
}
