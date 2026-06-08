"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AccessView,
	accessAction,
	type ProvisionView,
	provisionAction,
	type ResourceView,
	resourceAction,
} from "./actions";

/**
 * WorkspacePanel makes the /workspace route action-capable (ui-completeness law, CLAUDE.md §7): the
 * S82 per-project sandbox has its controls bound to the REAL deterministic engine, reachable AND
 * executable from the screen — PROVISION (an isolated workspace), ACCESS-CHECK (cross-project
 * isolation, SANDBOX_ESCAPE), RESOURCE-CHECK (anti noisy-neighbor, SANDBOX_RESOURCE_LIMIT).
 *
 * DETERMINISM-FIRST (§6/§8): every control runs the PURE twin lib/workspace (the byte-twin of the Go
 * package), never an LLM. THE WALL (§2): the screen WRITES NOTHING — every action is a dry-run value
 * computation; the truth-store is outside every workspace. Themed on the ADR 0010 tokens; strings via
 * next-intl (0011).
 */

const provInit: ProvisionView = { ok: false };
const accInit: AccessView = { ok: false };
const resInit: ResourceView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("workspace");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

const inputClass =
	"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function WorkspacePanel() {
	const t = useTranslations("workspace");
	const [prov, provDispatch] = useActionState(provisionAction, provInit);
	const [acc, accDispatch] = useActionState(accessAction, accInit);
	const [res, resDispatch] = useActionState(resourceAction, resInit);

	return (
		<div className="mt-10 space-y-8">
			{/* PROVISION */}
			<section
				data-testid="provision-card"
				className="rounded-2xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-lg font-semibold text-card-foreground">
					{t("provision.title")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("provision.desc")}
				</p>
				<form action={provDispatch} className="mt-4 space-y-3">
					<input
						name="projectId"
						data-testid="provision-project"
						defaultValue="proj-a"
						placeholder={t("provision.projectPlaceholder")}
						className={inputClass}
					/>
					<input type="hidden" name="vcs" value="git" />
					<Submit label={t("provision.cta")} testId="provision-submit" />
				</form>
				{prov.ok && prov.error ? (
					<p
						data-testid="provision-error"
						className="mt-3 text-sm text-destructive"
					>
						{prov.error}
					</p>
				) : null}
				{prov.ok && prov.id ? (
					<dl
						data-testid="provision-result"
						className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"
					>
						<div>
							<dt className="text-muted-foreground">{t("provision.id")}</dt>
							<dd
								data-testid="provision-id"
								className="font-mono text-xs break-all text-card-foreground"
							>
								{prov.id}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("provision.root")}</dt>
							<dd
								data-testid="provision-root"
								className="font-mono text-xs break-all text-card-foreground"
							>
								{prov.root}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("provision.zones")}</dt>
							<dd
								data-testid="provision-zones"
								className="font-mono text-xs text-card-foreground"
							>
								{(prov.zones ?? []).join(", ")}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("provision.hello")}</dt>
							<dd
								data-testid="provision-hello"
								className="text-xs text-card-foreground"
							>
								{prov.helloGreen ? t("provision.helloGreen") : "—"}
							</dd>
						</div>
					</dl>
				) : null}
			</section>

			{/* ACCESS-CHECK (SANDBOX_ESCAPE) */}
			<section
				data-testid="access-card"
				className="rounded-2xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-lg font-semibold text-card-foreground">
					{t("access.title")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("access.desc")}</p>
				<form action={accDispatch} className="mt-4 space-y-3">
					<input
						name="projectId"
						data-testid="access-project"
						defaultValue="proj-a"
						placeholder={t("provision.projectPlaceholder")}
						className={inputClass}
					/>
					<input
						name="target"
						data-testid="access-target"
						defaultValue=".aidos/workspaces/proj-b/src/secret.go"
						placeholder={t("access.targetPlaceholder")}
						className={inputClass}
					/>
					<Submit label={t("access.cta")} testId="access-submit" />
				</form>
				{acc.ok && acc.error ? (
					<p
						data-testid="access-error"
						className="mt-3 text-sm text-destructive"
					>
						{acc.error}
					</p>
				) : null}
				{acc.ok && acc.allowed !== undefined ? (
					<p data-testid="access-result" className="mt-4 text-sm">
						{acc.allowed ? (
							<span className="text-card-foreground">
								{t("access.allowed")}
							</span>
						) : (
							<span
								data-testid="access-blocked"
								className="font-mono text-destructive"
							>
								{acc.blockCode}
							</span>
						)}
					</p>
				) : null}
			</section>

			{/* RESOURCE-CHECK (SANDBOX_RESOURCE_LIMIT) */}
			<section
				data-testid="resource-card"
				className="rounded-2xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-lg font-semibold text-card-foreground">
					{t("resource.title")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("resource.desc")}
				</p>
				<form action={resDispatch} className="mt-4 space-y-3">
					<input
						name="projectId"
						data-testid="resource-project"
						defaultValue="proj-a"
						className={inputClass}
					/>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<input
							name="memoryMB"
							data-testid="resource-mem"
							defaultValue="0"
							placeholder={t("resource.mem")}
							className={inputClass}
						/>
						<input
							name="cpuMillis"
							data-testid="resource-cpu"
							defaultValue="999999"
							placeholder={t("resource.cpu")}
							className={inputClass}
						/>
						<input
							name="wallSeconds"
							data-testid="resource-wall"
							defaultValue="0"
							placeholder={t("resource.wall")}
							className={inputClass}
						/>
						<input
							name="diskMB"
							data-testid="resource-disk"
							defaultValue="0"
							placeholder={t("resource.disk")}
							className={inputClass}
						/>
					</div>
					<Submit label={t("resource.cta")} testId="resource-submit" />
				</form>
				{res.ok && res.error ? (
					<p
						data-testid="resource-error"
						className="mt-3 text-sm text-destructive"
					>
						{res.error}
					</p>
				) : null}
				{res.ok && res.killed !== undefined ? (
					<p data-testid="resource-result" className="mt-4 text-sm">
						{res.killed ? (
							<span
								data-testid="resource-killed"
								className="font-mono text-destructive"
							>
								{t("resource.killed", { reason: res.reason ?? "" })} —{" "}
								{res.blockCode}
							</span>
						) : (
							<span className="text-card-foreground">
								{t("resource.alive")}
							</span>
						)}
					</p>
				) : null}
			</section>
		</div>
	);
}
