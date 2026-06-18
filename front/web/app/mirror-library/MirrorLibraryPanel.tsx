"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type AppMirrors, DEMO_PROJECTS } from "@/lib/mirror-library";
import { type ScopedHealthView, scopeAction } from "./actions";

/**
 * MirrorLibraryPanel makes the /mirror-library route action-capable (ui-completeness law, CLAUDE.md
 * §7): the S70 « librairie de miroirs par projet » has ONE control bound to the REAL engine, reachable
 * AND executable from the screen — pick a project and run the PROJECT-SCOPED completeness law. The
 * user's mirrors are listed BY APP with their liveness; the scoped monster detector fires iff the
 * chosen project's cut carries a monster.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/mirror-library (listByApp +
 * scopedCompleteness), never an LLM. THE WALL (§2): it WRITES NOTHING — it reads a projection and
 * computes a verdict. Themed on the ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: ScopedHealthView = {
	ok: false,
	project: "",
	verdict: "",
	hasMonster: false,
	monsters: [],
	apps: [],
	source: "demo",
};

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("mirrorLibrary");
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

function AppCard({ app }: { app: AppMirrors }) {
	const t = useTranslations("mirrorLibrary");
	return (
		<div
			data-testid="app-card"
			data-project={app.project}
			className="space-y-2 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm font-semibold text-foreground">
					{app.project}
				</span>
				<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
					{t("aliveLabel")}: {app.alive}
				</span>
				<span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
					{t("deadLabel")}: {app.dead}
				</span>
			</div>
			<ul className="space-y-1 text-xs">
				{app.mirrors.map((m) => (
					<li
						key={m.mirrorId}
						data-mirror-id={m.mirrorId}
						data-liveness={m.liveness}
						className="flex items-center gap-2 font-mono text-muted-foreground"
					>
						<span
							className={`inline-flex h-2 w-2 rounded-full ${
								m.liveness === "alive" ? "bg-primary" : "bg-destructive"
							}`}
						/>
						<span className="text-foreground">{m.mirrorId}</span>
						<span>
							→ {m.reflects.layerId}@{m.reflects.version}
						</span>
						<span>· {m.testKind}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function MirrorLibraryPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("mirrorLibrary");
	const [state, action] = useActionState(scopeAction, initial);

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

			{/* Pick a project + run the scoped completeness law (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<label className="space-y-1.5 text-sm">
					<span className="font-medium text-foreground">
						{t("projectLabel")}
					</span>
					<select
						name="project"
						data-testid="library-project"
						defaultValue="app-blog"
						className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{DEMO_PROJECTS.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="library-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{state.ok && (
					<section
						data-testid="library-result"
						data-project={state.project}
						data-verdict={state.verdict}
						data-monster={state.hasMonster ? "true" : "false"}
						className={`space-y-3 rounded-xl border p-4 ${
							state.hasMonster
								? "border-destructive/40 bg-destructive/5"
								: "border-primary/40 bg-primary/5"
						}`}
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
									state.hasMonster
										? "bg-destructive text-destructive-foreground"
										: "bg-primary text-primary-foreground"
								}`}
							>
								{state.hasMonster ? t("redBadge") : t("greenBadge")}
							</span>
							<p
								className={`text-sm font-medium ${
									state.hasMonster ? "text-destructive" : "text-primary"
								}`}
							>
								{state.hasMonster
									? t("messages.monsterFired", { project: state.project })
									: t("messages.complete", { project: state.project })}
							</p>
						</div>

						{state.hasMonster && (
							<ul
								data-testid="monster-list"
								className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
							>
								{state.monsters.map((m) => (
									<li
										key={`${m.reason}-${m.layerId ?? ""}-${m.mirrorId ?? ""}-${m.missingTestKind ?? ""}`}
										data-reason={m.reason}
										className="font-mono text-destructive"
									>
										<span className="font-semibold">{m.reason}</span>
										{m.reason === "no_truth_without_mirror" && (
											<>
												{" "}
												{m.layerId}@{m.version} ({m.kind})
												{m.missingTestKind ? ` · ${m.missingTestKind}` : ""}
											</>
										)}
										{m.reason === "no_orphan_mirror" && (
											<>
												{" "}
												{m.mirrorId} → {m.layerId}@{m.version}
											</>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				)}
			</form>

			{/* The user's mirrors listed BY APP with liveness. */}
			{state.apps.length > 0 && (
				<section className="space-y-3" data-testid="apps">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("appsHeading")}
						</h2>
						<span
							data-testid="apps-source"
							data-source={state.source}
							className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
								state.source === "live"
									? "bg-primary/10 text-primary"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{t(state.source === "live" ? "sourceLive" : "sourceDemo")}
						</span>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{state.apps.map((app) => (
							<AppCard key={app.project} app={app} />
						))}
					</div>
				</section>
			)}
		</div>
	);
}
