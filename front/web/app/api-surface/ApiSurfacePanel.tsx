"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { surfaceAction } from "./actions";
import { SURFACE_INITIAL, type SurfaceView } from "./view";

/**
 * ApiSurfacePanel makes the /api-surface route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S90 API-surface emitter has ONE control bound to the REAL pure
 * twin (lib/api-surface), reachable AND executable from the screen — toggle whether
 * createOrder AUTHORIZES (a policy) and whether a read-only listOrders endpoint joins
 * the surface, then EMIT + VERIFY. The screen shows the per-app OpenAPI 3.1 document,
 * the Hono/TS router (delegating to the Go sidecar interpreter callback), the Pact suite
 * (one contract per operation), and provider-verification on ALL endpoints — OR the
 * BlockReason when the spec is malformed.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin, never an LLM —
 * emission = projection. THE WALL (§2): it WRITES NOTHING — the surface is a record.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit({ label }: { label: string }) {
	const t = useTranslations("apiSurface");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="emit-button"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function ApiSurfacePanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("apiSurface");
	const [state, action] = useActionState<SurfaceView, FormData>(
		surfaceAction,
		SURFACE_INITIAL,
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

			{/* The action-capable control: toggle the policy + the read endpoint → emit + verify. */}
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

				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="authorize"
						data-testid="authorize-toggle"
						defaultChecked
						className="size-4 rounded border-input"
					/>
					{t("authorizeLabel")}
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="withList"
						data-testid="withlist-toggle"
						defaultChecked
						className="size-4 rounded border-input"
					/>
					{t("withListLabel")}
				</label>

				<Submit label={t("emitLabel")} />
			</form>

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

			{state.ok && (
				<div className="space-y-6" data-testid="surface-result">
					{/* Provider verification verdict on ALL emitted endpoints. */}
					<section
						data-testid="verify-verdict"
						className={`space-y-2 rounded-xl border p-5 ${state.verifyPass ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}
					>
						<h2 className="text-sm font-semibold text-foreground">
							{t("verifyHeading")}
						</h2>
						<p data-testid="verify-pass" className="text-sm font-medium">
							{state.verifyPass ? t("verifyPass") : t("verifyFail")} —{" "}
							{state.verifyReason}
						</p>
						{state.verifyInteractions && (
							<ul className="list-inside list-disc text-xs text-muted-foreground">
								{state.verifyInteractions.map((it) => (
									<li key={it} data-testid="verified-interaction">
										{it}
									</li>
								))}
							</ul>
						)}
					</section>

					{/* The per-app OpenAPI 3.1 document. */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("openapiHeading")}
							</h2>
							<span
								data-testid="openapi-hash"
								className="font-mono text-xs text-muted-foreground"
							>
								{state.openapiHash}
							</span>
						</div>
						<pre
							data-testid="openapi-bytes"
							className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
						>
							{state.openapi}
						</pre>
					</section>

					{/* The Hono/TS router. */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("routerHeading")}
						</h2>
						<pre
							data-testid="router-bytes"
							className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
						>
							{state.router}
						</pre>
					</section>

					{/* The Pact suite — one contract per operation. */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("pactHeading")}
						</h2>
						<div className="flex flex-wrap gap-2 font-mono text-xs">
							{state.contracts?.map((c) => (
								<span
									key={c.op}
									data-testid="pact-contract"
									className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-foreground"
								>
									{c.op} → {c.provider.name} ({c.interactions.length})
								</span>
							))}
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
