"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deriveAction } from "./actions";
import { type DeriveView, emptyView, FIXTURES } from "./fixtures";

/**
 * DeriveDocPanel makes the /derive-doc route action-capable (ui-completeness, CLAUDE.md §7):
 * the FK06 emitter DeriveDoc(kernel) → s9 has ONE control bound to it — DÉRIVER S9 — reachable
 * AND executable from the screen. Pick a kernel fixture, run the emitter, and the structured s9
 * appears: concepts (lexique), behaviors, errors, plus the canonical bytes and the byte-identity
 * proof (run twice → identical — the FK06 done-criterion « même kernel → s9 byte-identique »).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/derivedoc, never an
 * LLM — same kernel → same s9. THE WALL (§2): it WRITES NOTHING — s9 is a projection. Themed on
 * ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit() {
	const t = useTranslations("deriveDoc");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="derive-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("deriveCta")}
		</button>
	);
}

function Section({
	heading,
	testid,
	items,
}: {
	heading: string;
	testid: string;
	items: string[];
}) {
	return (
		<div data-testid={testid} className="space-y-2">
			<h3 className="text-sm font-semibold tracking-tight text-foreground">
				{heading}{" "}
				<span className="text-muted-foreground">({items.length})</span>
			</h3>
			<ul className="flex flex-wrap gap-1.5">
				{items.map((it) => (
					<li
						key={it}
						className="inline-flex items-center rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground"
					>
						{it}
					</li>
				))}
			</ul>
		</div>
	);
}

export function DeriveDocPanel() {
	const t = useTranslations("deriveDoc");
	const [state, formAction] = useActionState<DeriveView, FormData>(
		deriveAction,
		emptyView,
	);

	return (
		<section
			aria-label={t("panelHeading")}
			data-testid="derive-panel"
			className="mt-10 space-y-6"
		>
			<form action={formAction} className="space-y-4">
				<label
					htmlFor="fixtureId"
					className="block text-sm font-medium text-foreground"
				>
					{t("fixtureLabel")}
				</label>
				<select
					id="fixtureId"
					name="fixtureId"
					data-testid="fixture-select"
					defaultValue={FIXTURES[0]?.id}
					className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{FIXTURES.map((f) => (
						<option key={f.id} value={f.id}>
							{f.label}
						</option>
					))}
				</select>
				<Submit />
			</form>

			{state.error ? (
				<p data-testid="derive-error" className="text-sm text-destructive">
					{state.error}
				</p>
			) : null}

			{state.ok ? (
				<div data-testid="s9" className="space-y-6">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm text-muted-foreground">
							{t("kernelIdLabel")}
						</span>
						<code
							data-testid="kernel-id"
							className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
						>
							{state.kernelId}
						</code>
						<span
							data-testid="identical-badge"
							data-identical={state.identical ? "true" : "false"}
							className={
								state.identical
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
							}
						>
							{state.identical ? t("identicalYes") : t("identicalNo")}
						</span>
					</div>

					<Section
						heading={t("conceptsHeading")}
						testid="concepts"
						items={state.concepts}
					/>

					<div data-testid="behaviors" className="space-y-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("behaviorsHeading")}{" "}
							<span className="text-muted-foreground">
								({state.behaviors.length})
							</span>
						</h3>
						<ul className="space-y-1.5">
							{state.behaviors.map((b) => (
								<li
									key={b.id}
									data-behavior-id={b.id}
									className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
								>
									<code className="font-mono text-xs text-muted-foreground">
										{b.id}
									</code>
									<p className="text-foreground">{b.description}</p>
								</li>
							))}
						</ul>
					</div>

					<Section
						heading={t("errorsHeading")}
						testid="errors"
						items={state.errors}
					/>

					<div data-testid="bytes" className="space-y-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("bytesHeading")}
						</h3>
						<pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
							{state.bytes}
						</pre>
					</div>
				</div>
			) : null}
		</section>
	);
}
