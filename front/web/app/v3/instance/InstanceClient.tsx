"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
	envStackOf,
	INSTANCE_TOOLS,
	type InstanceConfig,
	ladderOf,
	STACK_SERVICES,
} from "@/lib/v3/instance";
import { useV3Session } from "../V3Session";
import {
	type DockerContainer,
	dockerPsAction,
	loadInstanceConfigAction,
	type ProbeResult,
	type ProbeStatus,
	probeInstanceAction,
	saveInstanceConfigAction,
} from "./actions";

/**
 * /v3/instance — L'INSTANCE (lentille V3, ADR 0062) : « paramétrer toutes les infos
 * de l'instance (BDD, monitoring…) — on pourrait paramétrer dans le cloud ». Quatre
 * zones : les TUILES d'outils (le jeu déclaré INSTANCE_TOOLS, sondé côté serveur au
 * montage — jamais au rendu, pour ne rien bloquer), les CONTENEURS docker connus,
 * LA STACK PAR ENVIRONNEMENT (la palette substrat déclarée STACK_SERVICES, résolue
 * par envStackOf sur l'échelle ladderOf(config) — la spec canonique
 * docs/plan/SPEC-stack-2026.md, DP14), et VOS RÉGLAGES (la config persistée,
 * fail-closed via le twin — y compris l'échelle `ladder` et les surcharges
 * `stack.<service>`). END-USER FRIENDLY : copie amicale, le code HTTP en tout petit.
 * LE MUR (§2) : ces réglages décrivent VOTRE instance — jamais la vérité du produit.
 */

/** La pastille d'état — émeraude (en ligne) / rouge (injoignable) / neutre (non sondé). */
const DOT: Record<ProbeStatus, string> = {
	up: "bg-emerald-500",
	down: "bg-destructive",
	unknown: "bg-muted-foreground/40",
};

/** Le NIVEAU déclaré de chaque service (spec stack-2026 : 1 core · 2 activable · 3 option). */
const LEVEL_BY_KEY: ReadonlyMap<string, 1 | 2 | 3> = new Map(
	STACK_SERVICES.map((s) => [s.key, s.level]),
);

export function InstanceClient({
	initialConfig,
}: {
	initialConfig: InstanceConfig;
}) {
	// projectId = le slug du PROJET COURANT : la stack par environnement est résolue POUR LUI
	// (test → test-dev.sagedesk.fr), jamais le placeholder « app ». Le couple projet/env a SON adresse.
	const { strings: t, projectId } = useV3Session();
	// La config POSÉE (les tuiles la lisent) vs le BROUILLON du formulaire.
	const [config, setConfig] = useState<InstanceConfig>(initialConfig);
	const [draft, setDraft] = useState<Record<string, string>>({
		...initialConfig,
	});
	const [probes, setProbes] = useState<ProbeResult[] | null>(null);
	const [docker, setDocker] = useState<DockerContainer[] | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	// L'ÉCHELLE de la config POSÉE (ladderOf — fail-closed) ; le chip actif retombe
	// sur le premier barreau si l'échelle vient de changer (sauvegarde).
	const ladder = ladderOf(config);
	const [stackEnv, setStackEnv] = useState<string>(ladder[0] ?? "dev");
	const activeEnv = ladder.includes(stackEnv) ? stackEnv : (ladder[0] ?? "dev");

	// La SONDE au montage : l'état des outils + les conteneurs, côté serveur.
	useEffect(() => {
		let alive = true;
		void probeInstanceAction()
			.then((r) => alive && setProbes(r))
			.catch(() => {});
		void dockerPsAction()
			.then((r) => alive && setDocker(r))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	/** ENREGISTRE puis RAFRAÎCHIT : la config relue (canonique) + une nouvelle sonde. */
	const save = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setSaving(true);
		setSaved(false);
		try {
			await saveInstanceConfigAction(draft);
			const fresh = await loadInstanceConfigAction();
			setConfig(fresh);
			setDraft({ ...fresh });
			setSaved(true);
			setProbes(null);
			setProbes(await probeInstanceAction());
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			data-testid="v3-instance"
			className="mx-auto w-full max-w-3xl space-y-6"
		>
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t.instanceTitle}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t.instanceIntro}
				</p>
			</header>

			{/* ── les TUILES d'outils : le jeu DÉCLARÉ du twin, une tuile par outil ── */}
			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-foreground">
					{t.instToolsHeading}
				</h2>
				<ul className="grid gap-3 sm:grid-cols-2">
					{INSTANCE_TOOLS.map((tool) => {
						const probe = probes?.find((p) => p.key === tool.key) ?? null;
						const status: ProbeStatus = probe?.status ?? "unknown";
						const statusLabel = !tool.probe
							? t.instStatusUnknown
							: probes === null
								? t.instProbing
								: status === "up"
									? t.instStatusUp
									: status === "down"
										? t.instStatusDown
										: t.instStatusUnknown;
						const url = config[tool.key] ?? "";
						return (
							<li
								key={tool.key}
								data-testid="v3-inst-tool"
								data-key={tool.key}
								data-status={status}
								className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
							>
								<div className="flex items-center gap-2">
									<span
										aria-hidden
										className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`}
									/>
									<span className="text-xs font-semibold text-foreground">
										{t[tool.labelKey]}
									</span>
									<span className="ml-auto text-[10px] text-muted-foreground">
										{statusLabel}
									</span>
								</div>
								{/^https?:\/\//.test(url) ? (
									<a
										href={url}
										target="_blank"
										rel="noreferrer"
										className="break-all font-mono text-[11px] text-primary hover:underline"
									>
										{url}
									</a>
								) : (
									<span className="break-all font-mono text-[11px] text-muted-foreground">
										{url === "" ? "—" : url}
									</span>
								)}
								{probe !== null && probe.httpCode !== null && (
									<p className="text-[10px] text-muted-foreground">
										HTTP {probe.httpCode}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			</section>

			{/* ── les CONTENEURS docker connus de l'INSTANCE (tous projets confondus, réalité docker) ── */}
			<section
				data-testid="v3-inst-docker"
				className="space-y-2 rounded-xl border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t.instDockerHeading}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.instDockerHint}
				</p>
				{docker === null ? (
					<p className="text-xs text-muted-foreground italic">
						{t.instProbing}
					</p>
				) : docker.length === 0 ? (
					<p className="text-xs text-muted-foreground italic">
						{t.instDockerEmpty}
					</p>
				) : (
					<ul className="space-y-1.5">
						{docker.map((c) => (
							<li key={c.name} className="flex items-center gap-2">
								<span
									aria-hidden
									className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
								/>
								<span className="font-mono text-[11px] text-foreground">
									{c.name}
								</span>
								<span className="ml-auto text-[10px] text-muted-foreground">
									{c.status}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── LA STACK PAR ENVIRONNEMENT : la palette substrat déclarée (STACK_SERVICES),
			    résolue par envStackOf sur l'échelle — la spec docs/plan/SPEC-stack-2026.md ── */}
			<section
				data-testid="v3-inst-stack"
				className="space-y-3 rounded-xl border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t.instStackHeading}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.instStackNote}
				</p>
				{/* · un chip par barreau de l'échelle (paramétrable — jamais codée en dur) */}
				<div className="flex flex-wrap gap-1.5">
					{ladder.map((env) => (
						<button
							key={env}
							type="button"
							data-testid="v3-inst-stack-env"
							data-env={env}
							aria-pressed={activeEnv === env}
							onClick={() => setStackEnv(env)}
							className={[
								"rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
								activeEnv === env
									? "border-primary/40 bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5",
							].join(" ")}
						>
							{env}
						</button>
					))}
				</div>
				{/* · la table résolue : libellé amical, URL (%env% substitué), niveau déclaré */}
				<table className="w-full border-collapse text-left">
					<tbody>
						{envStackOf(activeEnv, config, projectId ?? "app").map((row) => (
							<tr
								key={row.key}
								data-testid="v3-inst-stack-row"
								data-key={row.key}
								className="border-t border-border/60 align-top"
							>
								<td className="py-1.5 pr-3 text-[11px] font-medium text-foreground">
									{t[row.labelKey]}
								</td>
								<td className="py-1.5 pr-3">
									{row.url === "" ? (
										<span className="text-[11px] text-muted-foreground italic">
											{t.instStackUnprovisioned}
										</span>
									) : (
										<span className="break-all font-mono text-[11px] text-muted-foreground">
											{row.url}
										</span>
									)}
								</td>
								<td className="py-1.5 text-right">
									<span
										title="SPEC-stack-2026"
										className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground"
									>
										{t.instStackLevel.replace(
											"%n%",
											String(LEVEL_BY_KEY.get(row.key) ?? 3),
										)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* ── VOS RÉGLAGES : une entrée par outil déclaré, persistée fail-closed ── */}
			<form
				data-testid="v3-inst-config"
				onSubmit={save}
				className="space-y-3 rounded-xl border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t.instConfigHeading}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.instConfigNote}
				</p>
				{INSTANCE_TOOLS.map((tool) => (
					<label key={tool.key} className="block space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">
							{t[tool.labelKey]}
						</span>
						<input
							name={tool.key}
							value={draft[tool.key] ?? ""}
							onChange={(e) => {
								setDraft({ ...draft, [tool.key]: e.target.value });
								setSaved(false);
							}}
							className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary"
						/>
					</label>
				))}

				{/* · l'ÉCHELLE (CSV ordonné — « le nombre d'environnements est paramétrable ») */}
				<label className="block space-y-1">
					<span className="text-[11px] font-medium text-muted-foreground">
						{t.instLadderLabel}
					</span>
					<input
						name="ladder"
						data-testid="v3-inst-ladder"
						value={draft.ladder ?? ""}
						placeholder="dev, staging, prod"
						onChange={(e) => {
							setDraft({ ...draft, ladder: e.target.value });
							setSaved(false);
						}}
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary"
					/>
					<span className="block text-[10px] leading-relaxed text-muted-foreground">
						{t.instLadderHint}
					</span>
				</label>

				{/* · les SURCHARGES de stack — une entrée par service déclaré (stack.<clé>),
				    placeholder = le motif par défaut (%env% substitué à la résolution) */}
				<h3 className="pt-1 text-xs font-semibold text-foreground">
					{t.instStackOverridesHeading}
				</h3>
				<p className="text-[10px] leading-relaxed text-muted-foreground">
					{t.instStackOverridesHint}
				</p>
				{STACK_SERVICES.map((s) => (
					<label key={s.key} className="block space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">
							{t[s.labelKey]}
						</span>
						<input
							name={`stack.${s.key}`}
							data-testid="v3-inst-stack-override"
							data-key={s.key}
							value={draft[`stack.${s.key}`] ?? ""}
							placeholder={s.urlPattern}
							onChange={(e) => {
								setDraft({ ...draft, [`stack.${s.key}`]: e.target.value });
								setSaved(false);
							}}
							className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary"
						/>
					</label>
				))}
				<div className="flex items-center gap-3">
					<button
						type="submit"
						data-testid="v3-inst-save"
						disabled={saving}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t.instSave}
					</button>
					{saved && (
						<span
							data-testid="v3-inst-saved"
							className="text-xs text-emerald-600"
						>
							{t.instSaved}
						</span>
					)}
				</div>
			</form>
		</div>
	);
}
