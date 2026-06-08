"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEMO_MANIFEST, DEMO_SPEC } from "@/lib/hono-emitter";
import {
	type EmitView,
	emitPulumiAction,
	projectServerAction,
} from "./actions";

/**
 * HonoEmitterPanel makes the /hono-emitter route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S87 emitters have TWO controls bound to the REAL engine, reachable AND
 * executable from the screen —
 *   - « émettre le serveur » → the bootable Hono/TS server (or its async worker);
 *   - « émettre le programme Pulumi » → the StackManifest's IaC program (ADR 0043).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the controls run the PURE twin lib/hono-emitter, never
 * an LLM — same Kernel cut → byte-identical output. THE WALL (§2): they WRITE NOTHING — the
 * emitted bytes are a projection. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: EmitView = { ok: false, surface: null };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("honoEmitter");
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

function Result({ state }: { state: EmitView }) {
	const t = useTranslations("honoEmitter");
	const emitted = state.ok && state.output !== undefined;
	const refused = state.ok && state.block !== undefined;
	if (!emitted && !refused) return null;
	if (emitted)
		return (
			<section
				data-testid="emit-result"
				data-verdict="emitted"
				className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span
						data-testid="verdict-badge"
						className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
					>
						{t("emittedBadge")} · {state.surface}
					</span>
					<span className="font-mono text-xs text-muted-foreground">
						{t("hashLabel")}: <span data-testid="emit-hash">{state.hash}</span>
					</span>
				</div>
				<pre
					data-testid="emit-output"
					className="max-h-96 overflow-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed text-foreground"
				>
					{state.output}
				</pre>
			</section>
		);
	return (
		<section
			data-testid="emit-result"
			data-verdict="refused"
			className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
		>
			<span
				data-testid="verdict-badge"
				className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-xs font-medium text-destructive-foreground"
			>
				{t("refusedBadge")}
			</span>
			<p data-testid="block-explanation" className="text-sm text-foreground">
				{state.block?.explanation}
			</p>
		</section>
	);
}

export function HonoEmitterPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("honoEmitter");
	const [serverState, serverAction] = useActionState(
		projectServerAction,
		initial,
	);
	const [pulumiState, pulumiAction] = useActionState(emitPulumiAction, initial);

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

			{/* The Kernel ops the server is wired on. */}
			<section
				data-testid="ops"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("opsHeading")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{DEMO_SPEC.ops.map((op) => (
						<span
							key={op.name}
							data-op={op.name}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							{op.name}
							{op.async ? (
								<span className="ml-1 text-muted-foreground">
									·async({op.trigger})
								</span>
							) : (
								<span className="ml-1 text-muted-foreground">·sync</span>
							)}
						</span>
					))}
				</div>
			</section>

			{/* The StackManifest the Pulumi program is projected from. */}
			<section
				data-testid="manifest"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("manifestHeading")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{DEMO_MANIFEST.services.map((s) => (
						<span
							key={s.name}
							data-service={s.name}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							{s.name}
							<span className="ml-1 text-muted-foreground">·{s.role}</span>
						</span>
					))}
				</div>
			</section>

			{/* Control 1 — emit the Hono/TS server (or its worker). */}
			<form
				action={serverAction}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("serverHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("surfaceLabel")}
					</span>
					<select
						name="surface"
						data-testid="server-surface"
						defaultValue="server"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="server">{t("surfaceServer")}</option>
						<option value="worker">{t("surfaceWorker")}</option>
					</select>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("emitServerButton")} testId="emit-server" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>
				<Result state={serverState} />
			</form>

			{/* Control 2 — emit the Pulumi/TS infra program. */}
			<form
				action={pulumiAction}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("pulumiHeading")}
				</h2>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("emitPulumiButton")} testId="emit-pulumi" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>
				<Result state={pulumiState} />
			</form>

			<p className="text-xs text-muted-foreground">{t("footer")}</p>
		</div>
	);
}
