"use client";

import { useState } from "react";
import { type AppProjection, emitApp } from "@/lib/v2/builder";
import { envStackOf } from "@/lib/v3/instance";
import type { Strings } from "../friendly";
import { useV3Session } from "../V3Session";

/**
 * /v3/lab — LES TROIS PRÉVISUALISATIONS EN DIRECT (« voir le site en construction ») :
 * trois CADRES (fenêtre navigateur · téléphone Expo Go · fenêtre Electron) autour de
 * la MÊME projection pure emitApp(state) — RECALCULÉE à chaque tour de chat, jamais
 * stockée (déterminisme-first : même état → même app, même version). Les idées
 * capturées apparaissent en INDICES de contenu ; l'URL web vient de envStackOf
 * (« dev », la config d'instance, le slug du projet — chaque couple projet/env a
 * SON adresse). L'app mobile (Expo Go) et desktop (Electron) RÉELLES = la piste
 * DP — le cadre le dit honnêtement. Une LECTURE pure de la session, aucune écriture.
 */

type Kind = "web" | "mobile" | "desktop";

/** Les trois onglets déclarés (un cadre par cible — le jeu clos). */
const TABS: readonly { kind: Kind; labelKey: string }[] = [
	{ kind: "web", labelKey: "previewTabWeb" },
	{ kind: "mobile", labelKey: "previewTabMobile" },
	{ kind: "desktop", labelKey: "previewTabDesktop" },
];

/** Un indice de contenu : une idée capturée (id + intention verbatim). */
type IdeaHint = { readonly id: string; readonly intent: string };

/**
 * LA VITRINE — la même projection dans ses trois variantes : un onglet de
 * navigation par route émise, une carte par entité, les idées capturées en
 * indices de contenu (jamais inventés). La variante ne change que la MISE EN
 * FORME (colonnes), jamais la donnée — une seule projection, trois cadres.
 */
function Storefront({
	app,
	ideas,
	variant,
	t,
}: {
	app: AppProjection;
	ideas: readonly IdeaHint[];
	variant: Kind;
	t: Strings;
}) {
	const cols =
		variant === "mobile"
			? "grid-cols-1"
			: variant === "desktop"
				? "grid-cols-2 md:grid-cols-3"
				: "grid-cols-1 sm:grid-cols-2";
	return (
		<div className="bg-background">
			{/* · un ONGLET par route émise (le premier actif, purement visuel) */}
			{app.routes.length === 0 ? (
				<p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground italic">
					{t.previewNoPages}
				</p>
			) : (
				<nav className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
					{app.routes.map((route, i) => (
						<span
							key={route}
							className={[
								"rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
								i === 0
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground",
							].join(" ")}
						>
							{route.slice(1)}
						</span>
					))}
				</nav>
			)}
			{/* · une CARTE par entité émise (le contenu simulé, jamais inventé) */}
			{app.entities.length > 0 && (
				<div className={`grid gap-2 p-3 ${cols}`}>
					{app.entities.map((e) => (
						<div
							key={e.version}
							className="space-y-1.5 rounded-md border border-border bg-card p-3"
						>
							<p className="text-xs font-medium text-foreground capitalize">
								{e.name}
							</p>
							<div className="h-2 w-3/4 rounded bg-muted" />
							<div className="h-2 w-1/2 rounded bg-muted" />
						</div>
					))}
				</div>
			)}
			{/* · les IDÉES capturées en indices de contenu (verbatim, jamais reformulées) */}
			{ideas.length > 0 && (
				<div className="space-y-1.5 px-3 pt-1 pb-3">
					<p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
						{t.previewIdeasLabel}
					</p>
					<ul className="space-y-1">
						{ideas.map((i) => (
							<li
								key={i.id}
								className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] leading-relaxed text-muted-foreground italic"
							>
								« {i.intent} »
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

/**
 * LE PANNEAU DE PRÉVISUALISATION (colonne droite du lab) : trois onglets, trois
 * cadres, UNE projection — re-rendue à chaque tour (la session est la seule source).
 */
export function PreviewPane() {
	const { state, instanceConfig, projectId, strings: t } = useV3Session();
	const [kind, setKind] = useState<Kind>("web");

	// LA PROJECTION PURE — recalculée à CHAQUE rendu : chaque tour de chat rafraîchit
	// l'aperçu (« voir le site en construction »), rien n'est jamais stocké.
	const app = emitApp(state);
	const empty = state.kernels.length === 0 && state.ideas.length === 0;

	// L'URL de l'app en DEV : le motif déclaré %project%-%env% (envStackOf, ADR 0062).
	const devUrl =
		envStackOf("dev", instanceConfig, projectId ?? "app").find(
			(s) => s.key === "app",
		)?.url ?? "";

	return (
		<aside
			data-testid="v3-preview"
			aria-label={t.previewHeading}
			className="w-full space-y-3 py-4 lg:sticky lg:top-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
		>
			{/* ── l'en-tête : le titre + la version content-adressée de l'app ── */}
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-semibold text-foreground">
					{t.previewHeading}
				</h2>
				{!empty && (
					<span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
						{app.version}
					</span>
				)}
			</div>

			{/* ── les trois onglets (web · mobile · desktop) ── */}
			<div
				role="tablist"
				aria-label={t.previewHeading}
				className="flex gap-1.5"
			>
				{TABS.map((tab) => (
					<button
						key={tab.kind}
						type="button"
						role="tab"
						aria-selected={kind === tab.kind}
						data-testid="v3-preview-tab"
						data-kind={tab.kind}
						onClick={() => setKind(tab.kind)}
						className={[
							"rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
							kind === tab.kind
								? "border-primary/40 bg-primary/10 text-primary"
								: "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
						].join(" ")}
					>
						{t[tab.labelKey]}
					</button>
				))}
			</div>

			{/* ── l'état vide amical — l'app naît au fil de la conversation ── */}
			{empty ? (
				<p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm leading-relaxed text-muted-foreground">
					{t.previewEmpty}
				</p>
			) : kind === "web" ? (
				/* ── WEB : la fenêtre navigateur (3 points + barre d'URL) ── */
				<div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
					<div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
						<span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
						<span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
						<span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
						<span
							title={t.previewUrlLabel}
							className="ml-2 min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground"
						>
							{devUrl}
						</span>
					</div>
					<Storefront app={app} ideas={state.ideas} variant="web" t={t} />
				</div>
			) : kind === "mobile" ? (
				/* ── MOBILE (Expo Go) : le cadre téléphone (encoche, ratio 9:19) ── */
				<div className="space-y-2">
					<div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[2.5rem] border-4 border-foreground/20 bg-background shadow-sm">
						<div className="flex justify-center" aria-hidden="true">
							<span className="h-4 w-24 rounded-b-2xl bg-foreground/15" />
						</div>
						<div className="aspect-[9/19] overflow-y-auto">
							<Storefront
								app={app}
								ideas={state.ideas}
								variant="mobile"
								t={t}
							/>
						</div>
					</div>
					<p
						data-testid="v3-preview-expo-note"
						className="text-center text-[11px] leading-relaxed text-muted-foreground"
					>
						{t.previewExpoNote}
					</p>
				</div>
			) : (
				/* ── DESKTOP (Electron) : la fenêtre (feux tricolores + bande de menu) ── */
				<div className="space-y-2">
					<div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
						<div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
							<span className="h-2.5 w-2.5 rounded-full bg-red-400" />
							<span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
							<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
							<span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
								{app.version}
							</span>
						</div>
						<div
							aria-hidden="true"
							className="flex gap-3 border-b border-border px-3 py-1 text-[10px] text-muted-foreground"
						>
							<span>Fichier</span>
							<span>Édition</span>
							<span>Affichage</span>
							<span>Aide</span>
						</div>
						<Storefront app={app} ideas={state.ideas} variant="desktop" t={t} />
					</div>
					<p
						data-testid="v3-preview-desktop-note"
						className="text-center text-[11px] leading-relaxed text-muted-foreground"
					>
						{t.previewDesktopNote}
					</p>
				</div>
			)}
		</aside>
	);
}
