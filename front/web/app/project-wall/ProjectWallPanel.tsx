"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { type ClassifyView, classifyAction } from "./actions";

/**
 * ProjectWallPanel — the action-capable client surface of /project-wall (S55).
 * It lets the user EXECUTE the project-aware wall: enter the active scope (identity +
 * project) and a target (project + an optionally-forged identity), click "classify",
 * and see the verdict — allow, or deny with the actionable BlockReason
 * (AGENT_CROSS_PROJECT_WRITE). The same predicate the Postgres RLS enforces (the two
 * layers refuse the same op, independently). No truth is written — this wall only
 * judges scope (CLAUDE.md §2). Themed (ADR 0010) + bilingual (ADR 0011).
 */

interface Preset {
	key: string;
	identity: string;
	activeProject: string;
	targetProject: string;
	claimedIdentity: string;
}

const PRESETS: Preset[] = [
	{
		key: "presetSame",
		identity: "alice",
		activeProject: "proj-a",
		targetProject: "proj-a",
		claimedIdentity: "",
	},
	{
		key: "presetCross",
		identity: "alice",
		activeProject: "proj-a",
		targetProject: "proj-b",
		claimedIdentity: "",
	},
	{
		key: "presetForged",
		identity: "alice",
		activeProject: "proj-a",
		targetProject: "proj-a",
		claimedIdentity: "mallory",
	},
];

export function ProjectWallPanel({ code }: { code: string }) {
	const t = useTranslations("projectWall");
	const [identity, setIdentity] = useState("alice");
	const [activeProject, setActiveProject] = useState("proj-a");
	const [targetProject, setTargetProject] = useState("proj-b");
	const [claimedIdentity, setClaimedIdentity] = useState("");
	const [result, setResult] = useState<ClassifyView | null>(null);
	const [pending, setPending] = useState(false);

	async function onClassify() {
		setPending(true);
		try {
			const r = await classifyAction(
				identity,
				activeProject,
				targetProject,
				claimedIdentity,
			);
			setResult(r);
		} finally {
			setPending(false);
		}
	}

	function applyPreset(p: Preset) {
		setIdentity(p.identity);
		setActiveProject(p.activeProject);
		setTargetProject(p.targetProject);
		setClaimedIdentity(p.claimedIdentity);
		setResult(null);
	}

	return (
		<div className="space-y-10">
			{/* Two-layer legend */}
			<section
				aria-labelledby="layers-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="layers-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("layersHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("layersIntro")}</p>
				<dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
					<div>
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("layerHook")}
						</dt>
						<dd className="mt-0.5 text-sm text-foreground">
							{t("layerHookValue")}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("layerRls")}
						</dt>
						<dd className="mt-0.5 text-sm text-foreground">
							{t("layerRlsValue")}
						</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("blockCodeLabel")}
						</dt>
						<dd
							className="mt-0.5 break-all font-mono text-sm text-foreground"
							data-testid="block-code"
						>
							{code}
						</dd>
					</div>
				</dl>
			</section>

			{/* Action: classify a cross-project op — executable, not display-only. */}
			<section aria-labelledby="classify-heading" className="space-y-4">
				<div>
					<h2
						id="classify-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("classifyHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("classifyIntro")}
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
							data-testid="classify-button"
							onClick={onClassify}
							disabled={pending}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{pending ? t("classifying") : t("classifyButton")}
						</button>
					</div>

					{result && (
						<div className="mt-4" data-testid="classify-result">
							{result.verdict === "allow" ? (
								<p
									data-testid="verdict-allow"
									className="rounded-md bg-primary/10 p-3 text-sm text-foreground"
								>
									{t("verdictAllow")}
								</p>
							) : (
								<div
									data-testid="verdict-deny"
									className="rounded-md bg-destructive/10 p-4 text-sm text-destructive"
								>
									<p className="font-mono text-xs font-semibold">
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
