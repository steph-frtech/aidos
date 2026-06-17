"use client";

import { useEffect, useState } from "react";
import type { DesktopChildren } from "@/lib/v3/desktop-preview";
import { useV3Session } from "../V3Session";
import {
	captureDesktopFrame,
	type DesktopFrameResult,
	getDesktopChildren,
} from "./desktop-actions";

/**
 * /v3/emetteurs — APERÇU DESKTOP (Electron) : la capacité « voir Electron » (ADR 0093) rendue dans la
 * lentille émetteurs, SOUS la vue émetteurs existante (additif, §6/§9 — ne casse rien).
 *
 * L'écran ne réimplémente RIEN (le MOTEUR Go est la source, ADR 0092) :
 *   - au montage, il appelle la server action getDesktopChildren() → liste les 3 ENFANTS émis de la
 *     maître démo (un badge par cible web/mobile/desktop, l'empreinte courte de la maître, le compte
 *     d'artefacts + leurs chemins) ;
 *   - un bouton « Capturer la fenêtre » → captureDesktopFrame() boote l'enfant desktop Electron
 *     headless et capture UNE frame (<img src=data:image/jpeg…>) ; spinner pendant. Si la toolchain
 *     est absente (available:false), l'écran affiche HONNÊTEMENT la raison + l'arbre de fichiers du
 *     bundle desktop en repli (ADR 0074 : la vue ne casse jamais).
 *
 * LE MUR (§2) : l'écran LIT une projection (enfants, frame) et la REND ; AUCUNE écriture de vérité.
 * Thémé (tokens shadcn ADR 0010, jamais de hex/zinc-* en dur) + bilingue (strings via useV3Session,
 * next-intl, FR par défaut, ADR 0011).
 */

type Strings = Record<string, string>;

/** Le badge court d'une cible d'enfant (web/mobile/desktop) — thémé, pas de couleur en dur. */
function TargetBadge({ target }: { target: string }) {
	return (
		<span
			data-testid="v3-emetteurs-desktop-child-target"
			data-target={target}
			className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
		>
			{target}
		</span>
	);
}

export function DesktopPreview() {
	const { strings } = useV3Session();
	const t = strings as Strings;

	// les 3 enfants émis (chargés au montage via la server action) ; null = pas encore chargé.
	const [children, setChildren] = useState<DesktopChildren | null>(null);
	const [childrenError, setChildrenError] = useState<string | null>(null);

	// l'état de la capture live : la frame, en cours, ou indisponible (gracieux).
	const [frame, setFrame] = useState<DesktopFrameResult | null>(null);
	const [capturing, setCapturing] = useState(false);

	useEffect(() => {
		let alive = true;
		void getDesktopChildren().then((r) => {
			if (!alive) return;
			if (r.ok) setChildren(r.children);
			else setChildrenError(r.reason);
		});
		return () => {
			alive = false;
		};
	}, []);

	async function onCapture() {
		setCapturing(true);
		setFrame(null);
		try {
			const r = await captureDesktopFrame();
			setFrame(r);
		} finally {
			setCapturing(false);
		}
	}

	// l'enfant desktop, pour l'arbre de fichiers du repli honnête (available:false).
	const desktopChild = children?.children.find(
		(c) => c.target === "desktop-app",
	);

	return (
		<section
			data-testid="v3-emetteurs-desktop"
			className="space-y-4 rounded-xl border border-border bg-card p-6"
		>
			<div className="space-y-1.5">
				<h2 className="text-sm font-semibold text-foreground">
					{t.emetteursDesktopTitle}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.emetteursDesktopIntro}
				</p>
			</div>

			{/* LES 3 ENFANTS émis de la maître démo (web/mobile/desktop) */}
			<div className="space-y-2">
				<h3 className="text-xs font-semibold text-foreground">
					{t.emetteursDesktopChildren}
				</h3>
				{childrenError !== null ? (
					<p
						data-testid="v3-emetteurs-desktop-children-error"
						className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
					>
						{t.emetteursDesktopChildrenError} ({childrenError})
					</p>
				) : children === null ? (
					<p
						data-testid="v3-emetteurs-desktop-children-loading"
						className="text-[11px] text-muted-foreground"
					>
						{t.emetteursDesktopLoading}
					</p>
				) : (
					<div
						data-testid="v3-emetteurs-desktop-children"
						className="space-y-2"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-[11px] text-muted-foreground">
								{t.emetteursDesktopMaster}:
							</span>
							<span
								data-testid="v3-emetteurs-desktop-master"
								className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground"
							>
								{children.masterHash.slice(0, 16)}…
							</span>
						</div>
						<div className="grid gap-2 sm:grid-cols-3">
							{children.children.map((c) => (
								<div
									key={c.target}
									data-testid="v3-emetteurs-desktop-child"
									data-target={c.target}
									className="space-y-1 rounded-lg border border-border bg-muted/20 px-3 py-2"
								>
									<TargetBadge target={c.target} />
									<p className="text-[10px] text-muted-foreground">
										{c.artifacts.length} {t.emetteursDesktopArtifacts}
									</p>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* LA CAPTURE LIVE de la fenêtre Electron */}
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="v3-emetteurs-desktop-capture"
						onClick={onCapture}
						disabled={capturing || children === null}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						{capturing && (
							<span
								data-testid="v3-emetteurs-desktop-spinner"
								className="size-3 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
								aria-hidden="true"
							/>
						)}
						{capturing
							? t.emetteursDesktopCapturing
							: t.emetteursDesktopCapture}
					</button>
					{frame?.available === true && (
						<span className="font-mono text-[10px] text-muted-foreground">
							{frame.width}×{frame.height}
							{frame.bundleHash !== "" && (
								<> · {frame.bundleHash.slice(0, 12)}…</>
							)}
						</span>
					)}
				</div>

				{frame?.available === true && (
					<figure className="space-y-1">
						{/* biome-ignore lint/performance/noImgElement: une data-URL base64 éphémère (la frame
						    capturée en mémoire) n'est pas optimisable par next/image — un <img> direct est correct. */}
						<img
							data-testid="v3-emetteurs-desktop-frame"
							src={frame.dataUrl}
							alt={t.emetteursDesktopFrameAlt}
							className="w-full rounded-lg border border-border"
						/>
						<figcaption className="text-[10px] text-muted-foreground">
							{t.emetteursDesktopFrameHint}
						</figcaption>
					</figure>
				)}

				{/* REPLI HONNÊTE (ADR 0074) : toolchain absente → la raison + l'arbre de fichiers du bundle */}
				{frame?.available === false && (
					<div
						data-testid="v3-emetteurs-desktop-unavailable"
						className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2"
					>
						<p className="text-[11px] text-muted-foreground">
							{t.emetteursDesktopUnavailable} ({frame.reason})
						</p>
						{desktopChild && (
							<div className="space-y-1">
								<p className="text-[10px] font-medium text-foreground">
									{t.emetteursDesktopBundleTree}
								</p>
								<ul
									data-testid="v3-emetteurs-desktop-bundle-tree"
									className="space-y-0.5"
								>
									{desktopChild.artifacts.map((a) => (
										<li
											key={a}
											className="font-mono text-[10px] text-muted-foreground"
										>
											{a}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
