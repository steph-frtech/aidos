"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { previewAction } from "./actions";
import { PREVIEW_INITIAL, type PreviewView } from "./view";

/**
 * PreviewPanel makes the /preview route action-capable (ui-completeness law, CLAUDE.md §7):
 * the S94 ephemeral preview environment has controls bound to the REAL pure twin (lib/preview),
 * reachable AND executable from the screen.
 *
 * Action-capable surfaces, per the done-criteria:
 *  1. BUILD — build the deterministic, content-addressed preview plan for the active phase (the
 *     per-phase preview URL, the `pulumi up` boot, the deterministic `pulumi destroy` teardown,
 *     the emitted-app hash). A "re-emit" toggle mutates the surface so a new phase → a new URL +
 *     hash (content-addressing is observable).
 *  2. PROBE (rendered) — the served-app hash ≟ emitted-app hash badge: the S94 done-criterion,
 *     judged by CODE (the pure servedMatchesEmitted), never an agent.
 *  3. SUBMIT — a REAL, rendered create-order form (the preview's served UI) that POSTS a real
 *     operation (incl. a blob upload) to the datastore, proving clicking an EMITTED button
 *     executes the bound operation against the datastore inside the preview (the Playwright
 *     done-criterion).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): planning runs the PURE twin, never an LLM. THE WALL
 * (§2): planning WRITES NO TRUTH — the preview is an ephemeral environment over an emitted
 * surface; the submit endpoint writes to a BELOW-THE-LINE datastore stand-in, never the kernel.
 * Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("preview");
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

export function PreviewPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("preview");
	const [state, action] = useActionState<PreviewView, FormData>(
		previewAction,
		PREVIEW_INITIAL,
	);
	const [submitResult, setSubmitResult] = useState<string | null>(null);

	async function onSubmitOrder(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const data = new FormData(form);
		// The submission is a REAL operation against the datastore stand-in (a blob included) —
		// the emitted button executes the bound operation inside the preview.
		const res = await fetch("/api/emitted-submit", {
			method: "POST",
			body: data,
		});
		const json = (await res.json()) as {
			ok: boolean;
			id?: number;
			blob?: { name: string; size: number } | null;
			error?: string;
		};
		if (json.ok) {
			setSubmitResult(
				`#${json.id}` +
					(json.blob ? ` · ${json.blob.name} (${json.blob.size}B)` : ""),
			);
		} else {
			setSubmitResult(`ERR: ${json.error}`);
		}
	}

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

			{/* Control 1 — BUILD the preview plan deterministically. */}
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
						htmlFor="phaseHash"
						className="text-sm font-medium text-foreground"
					>
						{t("phaseLabel")}
					</label>
					<input
						id="phaseHash"
						name="phaseHash"
						defaultValue="phase-0123456789abcdef"
						data-testid="phase-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="mutated"
						data-testid="mutated-toggle"
						className="size-4 rounded border-input"
					/>
					{t("mutatedLabel")}
				</label>
				<Submit label={t("buildLabel")} testid="build-button" />
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

			{state.ok && state.plan && (
				<div className="space-y-6" data-testid="preview-result">
					{/* The preview plan — URL, hashes, boot/teardown. */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("planHeading")}
							</h2>
							<a
								href={state.plan.url}
								data-testid="preview-url"
								className="font-mono text-xs text-blue-600 underline"
							>
								{state.plan.url}
							</a>
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("phaseLabel")}</dt>
								<dd
									data-testid="plan-phase"
									className="font-mono text-foreground"
								>
									{state.plan.phaseHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("appHashLabel")}</dt>
								<dd
									data-testid="emitted-app-hash"
									className="font-mono text-foreground"
								>
									{state.plan.emittedAppHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("stackLabel")}</dt>
								<dd
									data-testid="plan-stack"
									className="font-mono text-foreground"
								>
									{state.plan.stackName}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("planIdLabel")}</dt>
								<dd data-testid="plan-id" className="font-mono text-foreground">
									{state.plan.id}
								</dd>
							</div>
						</dl>
						<div className="space-y-1">
							<p className="text-xs font-medium text-foreground">
								{t("bootLabel")}
							</p>
							<pre
								data-testid="plan-boot"
								className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
							>
								{state.plan.boot.join(" ")}
							</pre>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-foreground">
								{t("teardownLabel")}
							</p>
							<pre
								data-testid="plan-teardown"
								className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
							>
								{state.plan.teardown.join(" ")}
							</pre>
						</div>
					</section>

					{/* The PROBE — served-app hash ≟ emitted-app hash (the S94 done-criterion). */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("probeHeading")}
						</h2>
						<p
							data-testid="served-match"
							data-match={state.servedMatches ? "true" : "false"}
							className={
								state.servedMatches
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{state.servedMatches ? t("matchOk") : t("matchFail")} ·{" "}
							{state.servedAppHash}
						</p>
					</section>

					{/* The LIVE, submittable create-order form served by the preview (the Playwright
					    done-criterion: clicking the emitted button executes the bound operation
					    against the datastore, incl. a blob upload). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("liveFormHeading")}
						</h2>
						<form
							onSubmit={onSubmitOrder}
							data-testid="live-order-form"
							className="space-y-3"
							encType="multipart/form-data"
						>
							<input type="hidden" name="entity" value="order" />
							<label className="block text-sm text-foreground">
								total
								<input
									name="total"
									type="text"
									defaultValue="42.50"
									required
									data-testid="field-total"
									className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
								/>
							</label>
							<label className="flex items-center gap-2 text-sm text-foreground">
								<input
									name="paid"
									type="checkbox"
									data-testid="field-paid"
									className="size-4 rounded border-input"
								/>
								paid
							</label>
							<label className="block text-sm text-foreground">
								receipt (blob)
								<input
									name="receipt"
									type="file"
									accept="image/png,application/pdf"
									data-testid="field-receipt"
									className="mt-1 block w-full text-sm"
								/>
							</label>
							<button
								type="submit"
								data-testid="submit-order"
								data-aidos-invoke="CreateOrder"
								className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
							>
								{t("submitOrderLabel")}
							</button>
						</form>
						{submitResult && (
							<p
								data-testid="submit-result"
								className="font-mono text-xs text-emerald-600"
							>
								{submitResult}
							</p>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
