"use client";

import { Code2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { type EnvName, emitApp } from "@/lib/v2/builder";
import { emitWorkspaceAction } from "../projects-actions";
import { useV3Session } from "../V3Session";

/**
 * /v3/code — CODE : votre éditeur en direct, SUR LE PROJET EN COURS, PAR ENVIRONNEMENT.
 *
 * Un onglet par barreau (state.ladder — l'échelle est une DONNÉE de l'état,
 * paramétrable par la config d'instance ADR 0062 add.) + l'onglet « AIDOS
 * (le moteur) » qui ouvre l'ancien dossier du dépôt. Par barreau : « Préparer le
 * workspace » (le GESTE EXPLICITE — l'app du déploiement de CE barreau, re-projetée
 * par emitApp sur les kernelVersions embarqués, puis émise en VRAIS fichiers par
 * l'action serveur emitWorkspaceAction) puis « Ouvrir dans VS Code » sur le dossier
 * .aidos-projects/<id>/workspace/<env> monté dans le conteneur openvscode-server.
 *
 * DÉTERMINISME-FIRST (§6) : l'app du barreau est RECALCULÉE (emitApp, pur) depuis les
 * kernelVersions du déploiement — jamais stockée ; l'émission (filesOf) est octet pour
 * octet reproductible. LE MUR (§2) : des fichiers d'app émise, aucune écriture-vérité.
 */

type Strings = Record<string, string>;
type Tab = EnvName | "aidos";

export function CodeClient({
	base,
	token,
	t,
}: {
	/** La base de l'IDE (origine + chemin), parsée côté serveur — null si non configuré. */
	base: string | null;
	/** Le jeton de connexion (?tkn=…), parsé côté serveur — jamais dans le code suivi. */
	token: string | null;
	t: Strings;
}) {
	const { state, projectId, projectName } = useV3Session();
	// Le premier barreau de l'ÉCHELLE COURANTE (jamais un nom codé en dur).
	const [tab, setTab] = useState<Tab>(state.ladder[0] ?? "aidos");
	const [emitting, setEmitting] = useState(false);
	const [emitted, setEmitted] = useState<Partial<Record<EnvName, number>>>({});
	const [failed, setFailed] = useState(false);
	// Recharge l'iframe après une émission (les fichiers viennent de changer).
	const [epoch, setEpoch] = useState(0);

	/** Le dossier ouvert par l'IDE pour un onglet (monté dans le conteneur). */
	const folderFor = (tb: Tab): string =>
		tb === "aidos"
			? "/home/workspace/aidos"
			: `/home/workspace/projects/${projectId}/workspace/${tb}`;

	/** L'URL VS Code d'un onglet : la base + le jeton + le dossier — réécrite ICI. */
	const hrefFor = (tb: Tab): string | null => {
		if (base === null) return null;
		try {
			const u = new URL(base);
			if (token !== null) u.searchParams.set("tkn", token);
			u.searchParams.set("folder", folderFor(tb));
			return u.toString();
		} catch {
			return null;
		}
	};

	/** PRÉPARE le workspace du barreau actif : émet les fichiers de l'app DÉPLOYÉE là. */
	const prepare = async () => {
		if (tab === "aidos" || emitting) return;
		const dep = state.envs[tab];
		if (dep === null || projectId === null) return;
		setEmitting(true);
		setFailed(false);
		try {
			// L'app DE CE BARREAU : les kernels embarqués par le déploiement
			// (kernelVersions), re-projetés par emitApp — pur, recalculé, jamais stocké.
			const kernels = state.kernels.filter((k) =>
				dep.kernelVersions.includes(k.version),
			);
			const app = emitApp({ ...state, kernels });
			const out = await emitWorkspaceAction(projectId, tab, projectName ?? "", {
				version: app.version,
				entities: app.entities.map((e) => ({
					name: e.name,
					version: e.version,
				})),
				routes: [...app.routes],
			});
			if (out.ok) {
				setEmitted((prev) => ({ ...prev, [tab]: out.files }));
				setEpoch((n) => n + 1);
			} else {
				setFailed(true);
			}
		} catch {
			setFailed(true);
		} finally {
			setEmitting(false);
		}
	};

	const dep = tab === "aidos" ? null : state.envs[tab];
	const envReady = tab === "aidos" || (dep !== null && projectId !== null);
	const url = envReady ? hrefFor(tab) : null;

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6">
			<header className="flex flex-col gap-2">
				<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
					<Code2 className="h-6 w-6 text-primary" aria-hidden />
					{t.codeTitle}
				</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">{t.codeIntro}</p>
				{projectName !== null && (
					<p className="text-xs text-muted-foreground">
						{t.codeProjectLabel} :{" "}
						<span className="font-medium text-foreground">{projectName}</span>
					</p>
				)}
			</header>

			{base === null ? (
				<div
					data-testid="v3-code-unconfigured"
					className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-6"
				>
					<p className="text-base font-medium text-foreground">
						{t.codeUnconfiguredTitle}
					</p>
					<p className="text-sm text-muted-foreground">
						{t.codeUnconfiguredHint}
					</p>
					<ul className="list-inside list-disc text-sm text-muted-foreground">
						<li>
							<Link
								href="/v2/code"
								className="font-medium text-primary underline-offset-4 hover:underline"
							>
								{t.codeFallbackV2}
							</Link>
						</li>
						<li>{t.codeFallbackLocal}</li>
					</ul>
				</div>
			) : (
				<div className="flex flex-col gap-4">
					{/* ── les onglets : un par barreau (state.ladder, une donnée) + le moteur ── */}
					<div className="flex flex-wrap gap-2">
						{state.ladder.map((env) => (
							<button
								key={env}
								type="button"
								data-testid="v3-code-env"
								data-env={env}
								aria-pressed={tab === env}
								onClick={() => {
									setTab(env);
									setFailed(false);
								}}
								className={[
									"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
									tab === env
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-card text-foreground hover:bg-muted/60",
								].join(" ")}
							>
								{env}
							</button>
						))}
						<button
							type="button"
							data-testid="v3-code-env"
							data-env="aidos"
							aria-pressed={tab === "aidos"}
							onClick={() => {
								setTab("aidos");
								setFailed(false);
							}}
							className={[
								"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
								tab === "aidos"
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-foreground hover:bg-muted/60",
							].join(" ")}
						>
							{t.codeEnvAidos}
						</button>
					</div>

					{/* ── le contenu du barreau actif ── */}
					{tab !== "aidos" &&
						(projectId === null ? (
							<p className="text-sm text-muted-foreground italic">
								{t.codeNoProject}
							</p>
						) : dep === null ? (
							<p className="text-sm text-muted-foreground italic">
								{t.codeEmitNeedDeploy.replace("%env%", tab)}
							</p>
						) : (
							<div className="flex flex-col gap-3">
								<div className="flex flex-wrap items-center gap-3">
									<button
										type="button"
										data-testid="v3-code-emit"
										disabled={emitting}
										onClick={() => void prepare()}
										className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{emitting ? t.codeEmitBusy : t.codeEmitBtn}
									</button>
									{url !== null && (
										<a
											data-testid="v3-code-open"
											href={url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
										>
											<ExternalLink className="h-4 w-4" aria-hidden />
											{t.codeOpenBtn}
										</a>
									)}
								</div>
								{emitted[tab] !== undefined && (
									<p className="text-xs text-emerald-600">
										{t.codeEmitDone.replace("%n%", String(emitted[tab]))}
									</p>
								)}
								{failed && (
									<p className="text-xs text-destructive">{t.codeEmitFailed}</p>
								)}
								{/* · le détail technique (version déployée, dossier) — toujours replié */}
								<details
									data-testid="v3-details"
									className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
								>
									<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
										{t.detailsLabel}
									</summary>
									<div className="mt-2 space-y-1">
										<p className="font-mono text-[11px] text-muted-foreground">
											{dep.version}
										</p>
										<p className="font-mono text-[11px] text-muted-foreground">
											{folderFor(tab)}
										</p>
									</div>
								</details>
							</div>
						))}
					{tab === "aidos" && url !== null && (
						<div>
							<a
								data-testid="v3-code-open"
								href={url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
							>
								<ExternalLink className="h-4 w-4" aria-hidden />
								{t.codeOpenBtn}
							</a>
						</div>
					)}

					{/* ── l'éditeur intégré — le MÊME dossier que le bouton ── */}
					{url !== null && (
						<>
							<p className="text-xs text-muted-foreground">{t.codeFrameHint}</p>
							<iframe
								data-testid="v3-code-frame"
								key={`${tab}-${epoch}`}
								src={url}
								title={t.codeFrameTitle}
								className="h-[70vh] w-full rounded-xl border"
								allow="clipboard-read; clipboard-write"
							/>
						</>
					)}
				</div>
			)}
		</div>
	);
}
