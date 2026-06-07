"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { type GatewaySurface, type RouteView, routeAction } from "./actions";

/**
 * GatewayPanel — the action-capable client surface of /gateway (S58). It lets the user
 * EXECUTE the MCP-over-HTTP passerelle's server-side wall: enter the active scope
 * (identity + project), pick a tool, set a target (project + an optionally-forged
 * identity), click "route", and see the decision — route (the dispatched tool +
 * server), or a refusal with the actionable BlockReason (AGENT_CROSS_PROJECT_WRITE /
 * GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET / GATEWAY_UNKNOWN_TOOL). The same wall the live
 * server applies. No truth is written — the gateway routes/refuses (CLAUDE.md §2).
 * Themed (ADR 0010) + bilingual (ADR 0011).
 */

interface Preset {
	key: string;
	tool: string;
	targetProject: string;
	claimedIdentity: string;
}

const PRESETS: Preset[] = [
	{
		key: "presetBelow",
		tool: "store_get",
		targetProject: "proj-a",
		claimedIdentity: "",
	},
	{
		key: "presetCross",
		tool: "store_get",
		targetProject: "proj-b",
		claimedIdentity: "",
	},
	{
		key: "presetTruth",
		tool: "kernel_write",
		targetProject: "proj-a",
		claimedIdentity: "",
	},
	{
		key: "presetUnknown",
		tool: "nope_tool",
		targetProject: "proj-a",
		claimedIdentity: "",
	},
];

export function GatewayPanel({ surface }: { surface: GatewaySurface }) {
	const t = useTranslations("gateway");
	const [identity, setIdentity] = useState("alice");
	const [activeProject, setActiveProject] = useState("proj-a");
	const [tool, setTool] = useState("store_get");
	const [targetProject, setTargetProject] = useState("proj-a");
	const [claimedIdentity, setClaimedIdentity] = useState("");
	const [result, setResult] = useState<RouteView | null>(null);
	const [pending, setPending] = useState(false);

	async function onRoute() {
		setPending(true);
		try {
			setResult(
				await routeAction(
					identity,
					activeProject,
					tool,
					targetProject,
					claimedIdentity,
				),
			);
		} finally {
			setPending(false);
		}
	}

	function applyPreset(p: Preset) {
		setTool(p.tool);
		setTargetProject(p.targetProject);
		setClaimedIdentity(p.claimedIdentity);
		setResult(null);
	}

	return (
		<div className="space-y-10">
			{/* The fronted surface — the 13 servers + the closed tool set. */}
			<section
				aria-labelledby="surface-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="surface-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("surfaceHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("surfaceIntro")}
				</p>
				<div className="mt-4 flex flex-wrap gap-2" data-testid="server-list">
					{surface.servers.map((s) => (
						<span
							key={s}
							className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground"
						>
							{s}
						</span>
					))}
				</div>
				<p
					className="mt-3 text-xs text-muted-foreground"
					data-testid="tool-count"
				>
					{t("toolCount", { count: surface.tools.length })}
				</p>
			</section>

			{/* Action: route a call through the server-side wall — executable. */}
			<section aria-labelledby="route-heading" className="space-y-4">
				<div>
					<h2
						id="route-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("routeHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("routeIntro")}
					</p>
				</div>

				<div className="flex flex-wrap gap-2">
					{PRESETS.map((p) => (
						<button
							key={p.key}
							type="button"
							data-testid={`preset-${p.key}`}
							onClick={() => applyPreset(p)}
							className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
						>
							{t(p.key)}
						</button>
					))}
				</div>

				<div className="rounded-lg border border-border bg-card p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
						<Field
							id="tool"
							label={t("fieldTool")}
							value={tool}
							onChange={setTool}
						/>
						<Field
							id="target-project"
							label={t("fieldTargetProject")}
							value={targetProject}
							onChange={setTargetProject}
						/>
						<Field
							id="claimed-identity"
							label={t("fieldClaimedIdentity")}
							value={claimedIdentity}
							onChange={setClaimedIdentity}
						/>
					</div>

					<div className="mt-4">
						<button
							type="button"
							data-testid="route-button"
							onClick={onRoute}
							disabled={pending}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{pending ? t("routing") : t("routeButton")}
						</button>
					</div>

					{result && (
						<div className="mt-4" data-testid="route-result">
							{result.outcome === "route" ? (
								<div
									data-testid="outcome-route"
									className="rounded-md bg-primary/10 p-4 text-sm text-foreground"
								>
									<p className="font-semibold">{t("outcomeRoute")}</p>
									<p className="mt-1 font-mono text-xs">
										{result.toolName} · {result.toolServer} ·{" "}
										{result.disposition}
									</p>
								</div>
							) : (
								<div
									data-testid="outcome-refused"
									className="rounded-md bg-destructive/10 p-4 text-sm text-destructive"
								>
									<p
										className="font-mono text-xs font-semibold"
										data-testid="refusal-code"
									>
										{result.code}
									</p>
									<p className="mt-2 text-foreground">{result.explanation}</p>
									{result.howToFix && (
										<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
											{result.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									)}
								</div>
							)}
						</div>
					)}
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
