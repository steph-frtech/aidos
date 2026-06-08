"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { secretAction } from "./actions";
import { SECRET_INITIAL, type SecretView } from "./view";

/**
 * SecretStorePanel makes the /secret-store route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S91 per-app secret store has every op bound to a control, reachable
 * AND executable from the screen — SET a secret, ROTATE it (the old value invalidated),
 * INJECT the boot env from a declared key list (a missing key → the fail-closed
 * BlockReason), and SCAN an emission for leaked secrets (the deterministic gitleaks-style
 * scan). The screen NEVER displays a value — only the SORTED key names + the boot env
 * var NAMES (values masked).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every control runs the PURE twin (lib/secret-store),
 * never an LLM. THE WALL (§2): a secret is operational material, never a truth — it writes
 * NOTHING above the line. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("secretStore");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function SecretStorePanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("secretStore");
	const [state, action] = useActionState<SecretView, FormData>(
		secretAction,
		SECRET_INITIAL,
	);
	const project = activeProjectId ?? "shop";

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
					{project}
				</span>
			</div>

			{/* SET a secret. */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("setHeading")}
				</h2>
				<input type="hidden" name="op" value="set" />
				<input type="hidden" name="project" value={project} />
				<div className="grid gap-3 sm:grid-cols-2">
					<input
						name="name"
						defaultValue="db_url"
						data-testid="set-name"
						aria-label={t("nameLabel")}
						placeholder={t("nameLabel")}
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<input
						name="value"
						type="password"
						defaultValue="postgres://app:s3cr3tpass@db/app"
						data-testid="set-value"
						aria-label={t("valueLabel")}
						placeholder={t("valueLabel")}
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<Submit label={t("setLabel")} testid="set-button" />
			</form>

			{/* ROTATE a secret. */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("rotateHeading")}
				</h2>
				<input type="hidden" name="op" value="rotate" />
				<input type="hidden" name="project" value={project} />
				<div className="grid gap-3 sm:grid-cols-2">
					<input
						name="name"
						defaultValue="db_url"
						data-testid="rotate-name"
						aria-label={t("nameLabel")}
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<input
						name="value"
						type="password"
						defaultValue="postgres://app:r0t4t3dpass@db/app"
						data-testid="rotate-value"
						aria-label={t("newValueLabel")}
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<Submit label={t("rotateLabel")} testid="rotate-button" />
			</form>

			{/* INJECT the boot env from a declared key list (missing key → BlockReason). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("injectHeading")}
				</h2>
				<input type="hidden" name="op" value="inject" />
				<input type="hidden" name="project" value={project} />
				<input
					name="declared"
					defaultValue="db_url, stripe_api_key"
					data-testid="inject-declared"
					aria-label={t("declaredLabel")}
					className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<Submit label={t("injectLabel")} testid="inject-button" />
			</form>

			{/* SCAN an emission for leaked secrets (deterministic gitleaks-style). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("scanHeading")}
				</h2>
				<input type="hidden" name="op" value="scan" />
				<input type="hidden" name="project" value={project} />
				<textarea
					name="source"
					rows={4}
					defaultValue={
						'const dbUrl = "postgres://app:hunter2pass@db/app";\nconst awsKey = "AKIAIOSFODNN7EXAMPLE";'
					}
					data-testid="scan-source"
					aria-label={t("sourceLabel")}
					className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<Submit label={t("scanLabel")} testid="scan-button" />
			</form>

			{/* The fail-closed BlockReason (a missing secret at boot). */}
			{state.blockExplanation && (
				<section
					data-testid="block-reason"
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{/* The result of the last action. */}
			{state.message && (
				<section
					data-testid="secret-result"
					className={`space-y-3 rounded-xl border p-5 ${state.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}
				>
					<p
						data-testid="result-message"
						className="text-sm font-medium text-foreground"
					>
						{state.message}
					</p>

					{state.keyNames && state.keyNames.length > 0 && (
						<div className="space-y-1">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("storedKeysHeading")}
							</h3>
							<div className="flex flex-wrap gap-2 font-mono text-xs">
								{state.keyNames.map((k) => (
									<span
										key={k}
										data-testid="stored-key"
										className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-foreground"
									>
										{k}
									</span>
								))}
							</div>
						</div>
					)}

					{state.env && state.env.length > 0 && (
						<div className="space-y-1">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("bootEnvHeading")}
							</h3>
							<ul className="font-mono text-xs text-foreground">
								{state.env.map((e) => (
									<li key={e.name} data-testid="boot-env">
										{e.name}={e.value}
									</li>
								))}
							</ul>
						</div>
					)}

					{state.did === "scan" && (
						<div className="space-y-1">
							<p
								data-testid="scan-verdict"
								className={`text-sm font-medium ${state.clean ? "text-emerald-600" : "text-destructive"}`}
							>
								{state.clean ? t("scanClean") : t("scanLeaky")}
							</p>
							{state.findings && state.findings.length > 0 && (
								<ul className="font-mono text-xs text-muted-foreground">
									{state.findings.map((f) => (
										<li key={`${f.rule}-${f.line}`} data-testid="scan-finding">
											{f.rule} @ L{f.line}: {f.excerpt}
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</section>
			)}
		</div>
	);
}
