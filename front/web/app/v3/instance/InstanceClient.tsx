"use client";

import { type FormEvent, useEffect, useState } from "react";
import { INSTANCE_TOOLS, type InstanceConfig } from "@/lib/v3/instance";
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
 * de l'instance (BDD, monitoring…) — on pourrait paramétrer dans le cloud ». Trois
 * zones : les TUILES d'outils (le jeu déclaré INSTANCE_TOOLS, sondé côté serveur au
 * montage — jamais au rendu, pour ne rien bloquer), les CONTENEURS docker connus, et
 * VOS RÉGLAGES (la config persistée, fail-closed via le twin). END-USER FRIENDLY :
 * copie amicale, le code HTTP en tout petit. LE MUR (§2) : ces réglages décrivent
 * VOTRE instance — ils ne touchent jamais la vérité du produit.
 */

/** La pastille d'état — émeraude (en ligne) / rouge (injoignable) / neutre (non sondé). */
const DOT: Record<ProbeStatus, string> = {
	up: "bg-emerald-500",
	down: "bg-red-500",
	unknown: "bg-muted-foreground/40",
};

export function InstanceClient({
	initialConfig,
}: {
	initialConfig: InstanceConfig;
}) {
	const { strings: t } = useV3Session();
	// La config POSÉE (les tuiles la lisent) vs le BROUILLON du formulaire.
	const [config, setConfig] = useState<InstanceConfig>(initialConfig);
	const [draft, setDraft] = useState<Record<string, string>>({
		...initialConfig,
	});
	const [probes, setProbes] = useState<ProbeResult[] | null>(null);
	const [docker, setDocker] = useState<DockerContainer[] | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

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

			{/* ── les CONTENEURS docker connus (l'éditeur live, la boutique démo) ── */}
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
