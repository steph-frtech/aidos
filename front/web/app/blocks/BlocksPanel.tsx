"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CATALOG_CODES, TRUTH_WRITE_TOOLS } from "@/lib/blocks";
import { type RefuseView, refuseAction } from "./actions";

/**
 * BlocksPanel — the action-capable client surface of /blocks (S60). It does two things:
 *   1. renders the GLOBAL catalog of the closed, declared BlockReason codes the engine can
 *      raise (the wall S55 / gateway S58 / goal S29), grouped by origin;
 *   2. lets the user EXECUTE a truth-zone write through the gateway router (the same wall
 *      the live server applies) — a refused write surfaces its REAL actionable BlockReason
 *      (code, severity, explanation, how_to_fix[]) as an inline TOAST.
 * No truth is written — the wall refuses (CLAUDE.md §2). Themed (ADR 0010) + bilingual
 * (ADR 0011).
 */
export function BlocksPanel() {
	const t = useTranslations("blocks");
	const [identity, setIdentity] = useState("alice");
	const [activeProject, setActiveProject] = useState("proj-a");
	const [tool, setTool] = useState(TRUTH_WRITE_TOOLS[0]);
	const [view, setView] = useState<RefuseView | null>(null);
	const [pending, setPending] = useState(false);

	async function onRefuse() {
		setPending(true);
		try {
			setView(await refuseAction(identity, activeProject, tool));
		} finally {
			setPending(false);
		}
	}

	const originLabel: Record<string, string> = {
		wall: t("originWall"),
		gateway: t("originGateway"),
		goal: t("originGoal"),
	};

	return (
		<div className="space-y-10">
			{/* The global catalog of declared BlockReason codes. */}
			<section
				aria-labelledby="catalog-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="catalog-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("catalogHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("catalogIntro")}
				</p>
				<ul className="mt-4 space-y-2" data-testid="catalog-list">
					{CATALOG_CODES.map((c) => (
						<li
							key={c.code}
							data-testid={`catalog-${c.code}`}
							className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
						>
							<span className="font-mono text-xs font-semibold text-foreground">
								{c.code}
							</span>
							<span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
								{originLabel[c.origin]}
							</span>
							<span className="text-xs text-muted-foreground">
								{t("severityLabel")}: {c.severity}
							</span>
						</li>
					))}
				</ul>
			</section>

			{/* Action: trigger a refused truth-write — executable. */}
			<section aria-labelledby="try-heading" className="space-y-4">
				<div>
					<h2
						id="try-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("tryHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("tryIntro")}</p>
				</div>

				<div className="rounded-lg border border-border bg-card p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Field
							id="identity"
							label={t("fieldIdentity")}
							value={identity}
							onChange={setIdentity}
						/>
						<Field
							id="active-project"
							label={t("fieldActiveProject")}
							value={activeProject}
							onChange={setActiveProject}
						/>
						<div>
							<label
								htmlFor="tool"
								className="text-xs uppercase tracking-wide text-muted-foreground"
							>
								{t("fieldTool")}
							</label>
							<select
								id="tool"
								data-testid="field-tool"
								value={tool}
								onChange={(e) => setTool(e.target.value)}
								className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
							>
								{TRUTH_WRITE_TOOLS.map((tw) => (
									<option key={tw} value={tw}>
										{tw}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="mt-4">
						<button
							type="button"
							data-testid="refuse-button"
							onClick={onRefuse}
							disabled={pending}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{pending ? t("refusing") : t("refuseButton")}
						</button>
					</div>

					{/* The inline toast: the REAL BlockReason on refusal. */}
					{view &&
						(view.reason ? (
							<div
								data-testid="block-toast"
								role="alert"
								className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
							>
								<p className="font-semibold">{t("toastTitle")}</p>
								<p
									className="mt-1 font-mono text-xs font-semibold"
									data-testid="toast-code"
								>
									{view.reason.code}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{t("severityLabel")}: {view.reason.severity}
								</p>
								<p className="mt-2 text-foreground">
									{view.reason.explanation}
								</p>
								<p className="mt-3 text-xs font-semibold text-foreground">
									{t("howToFixLabel")}
								</p>
								<ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{view.reason.howToFix.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						) : (
							<div
								data-testid="block-routed"
								className="mt-4 rounded-md bg-primary/10 p-4 text-sm text-foreground"
							>
								{t("routedUnexpected")}
							</div>
						))}
				</div>
			</section>
		</div>
	);
}

function Field({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="text-xs uppercase tracking-wide text-muted-foreground"
			>
				{label}
			</label>
			<input
				id={id}
				data-testid={`field-${id}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
			/>
		</div>
	);
}
