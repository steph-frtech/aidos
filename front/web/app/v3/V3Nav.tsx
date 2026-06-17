"use client";

import {
	Boxes,
	ChevronDown,
	ClipboardCheck,
	Code,
	Component,
	Dna,
	Eye,
	FileCode2,
	FolderOpen,
	GitBranch,
	Grid2x2,
	History,
	Layers,
	LayoutGrid,
	Link2,
	ListChecks,
	ListTree,
	Map as MapIcon,
	Network,
	PenTool,
	Ruler,
	Scale,
	Search,
	Server,
	Settings,
	Sparkles,
	Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PALETTE_OPEN_EVENT } from "./Palette";
import { useV3Session } from "./V3Session";

/**
 * La navigation V3 (ADR 0010 thème · ADR 0011 bilingue) : les lentilles d'UNE même
 * session, REGROUPÉES par parcours utilisateur en CINQ sections (Concevoir · Comprendre ·
 * Construire & déployer · Faire évoluer · Réglages) — une nav LOGIQUE et COORDONNÉE plutôt
 * qu'une liste plate. Chaque section porte un en-tête thémé + bilingue (navGroupConcevoir…).
 * Libellés AMICAUX (aucun jargon KRD en copie primaire). LE COMMUTATEUR DE PROJETS
 * (ADR 0061) sous le logo : le projet actif + un petit panneau (la liste — cliquer rouvre
 * AVEC tout l'historique, le rejeu — et « Nouveau projet »). En pied, l'ouverture de la
 * PALETTE (⌘K — « tous les écrans au meilleur endroit »). Client Component (route active
 * via usePathname). Le mur intact : la nav LIE, n'écrit rien.
 *
 * REGROUPER SANS CASSER : les treize lentilles existantes conservent leurs treize routes
 * et leur comportement (data-testid `v3-nav-item`, data-route) ; seule l'ORGANISATION
 * visuelle change. Les écrans CONCEPTUELS KRD (les `soon: true`) sont annoncés à leur
 * place de parcours — routés en /v3/<concept> — mais rendus DÉSACTIVÉS tant que leur
 * lentille native (lecture LIVE du moteur, jamais un twin) n'est pas portée (1er batch :
 * policy · kernels · version-dag · arch-fitness — why-tree et conscience sont désormais
 * PORTÉES, lecture LIVE des serveurs Go `why-tree` / `conscience` via la passerelle).
 * Aucun lien mort.
 */

/** Une entrée de nav : une lentille. `soon` ⇒ conceptuel annoncé, page pas encore portée. */
interface NavEntry {
	route: string;
	key: string;
	Icon: typeof Sparkles;
	/** Conceptuel KRD pas encore porté en /v3 : rendu désactivé (placeholder, aucun lien mort). */
	soon?: boolean;
}

/** Une section de la nav : un parcours utilisateur (en-tête + ses lentilles). */
interface NavSection {
	/** La clé i18n de l'en-tête de groupe (navGroupConcevoir…). */
	titleKey: string;
	entries: readonly NavEntry[];
}

export const SECTIONS: readonly NavSection[] = [
	{
		titleKey: "navGroupConcevoir",
		entries: [
			{ route: "/v3/lab", key: "navLab", Icon: Sparkles },
			{ route: "/v3/specs", key: "navSpecs", Icon: ListChecks },
			{ route: "/v3/operation", key: "navOperation", Icon: Workflow },
			{ route: "/v3/policy", key: "navPolicy", Icon: Scale },
			{ route: "/v3/kernels", key: "navKernels", Icon: Boxes },
		],
	},
	{
		titleKey: "navGroupComprendre",
		entries: [
			{ route: "/v3/parcours", key: "navParcours", Icon: MapIcon },
			{ route: "/v3/grille", key: "navGrille", Icon: LayoutGrid },
			{ route: "/v3/anatomie", key: "navAnatomie", Icon: Grid2x2 },
			{ route: "/v3/liens", key: "navLiens", Icon: Link2 },
			{ route: "/v3/why-tree", key: "navWhyTree", Icon: Network },
			{ route: "/v3/arbres", key: "navArbres", Icon: ListTree },
			{ route: "/v3/conscience", key: "navConscience", Icon: Eye },
			{ route: "/v3/cellules", key: "navCellules", Icon: Component },
			{
				route: "/v3/version-dag",
				key: "navVersionDag",
				Icon: GitBranch,
			},
			{ route: "/v3/history", key: "navHistory", Icon: History },
		],
	},
	{
		titleKey: "navGroupConstruire",
		entries: [
			{ route: "/v3/code", key: "navCode", Icon: Code },
			{ route: "/v3/emetteurs", key: "navEmetteurs", Icon: FileCode2 },
			{ route: "/v3/environnements", key: "navEnvs", Icon: Layers },
			{ route: "/v3/instance", key: "navInstance", Icon: Server },
		],
	},
	{
		titleKey: "navGroupEvoluer",
		entries: [
			{ route: "/v3/evolve", key: "navEvolve", Icon: Dna },
			{ route: "/v3/bench", key: "navBench", Icon: ClipboardCheck },
			{ route: "/v3/arch-fitness", key: "navArchFitness", Icon: Ruler },
			{ route: "/v3/design", key: "navDesign", Icon: PenTool },
		],
	},
	{
		titleKey: "navGroupReglages",
		entries: [{ route: "/v3/parametrage", key: "navParams", Icon: Settings }],
	},
] as const;

/**
 * Le tableau PLAT des lentilles RÉELLEMENT navigables (non-`soon`), dérivé des sections —
 * conservé pour la palette ⌘K et la loi de couverture (les conceptuels `soon` n'ont pas
 * encore de page, on ne les expose donc pas comme écrans atteignables).
 */
export const ENTRIES = SECTIONS.flatMap((s) =>
	s.entries.filter((e) => e.soon !== true),
);

export function V3Nav() {
	const pathname = usePathname();
	const t = useTranslations("v3");
	const { projectId, projectName, projects, switchProject, createProject } =
		useV3Session();
	const [open, setOpen] = useState(false);
	const [newName, setNewName] = useState("");
	// L'alerte de création : le motif de refus (doublon / vide / imprononçable), ou null.
	const [createError, setCreateError] = useState<string | null>(null);

	return (
		<nav
			aria-label={t("navHeading")}
			data-testid="v3-nav"
			className="flex h-full flex-col gap-1"
		>
			<Link
				href="/v3/lab"
				className="px-2 pb-3 text-sm font-bold tracking-wide text-foreground"
			>
				{t("navLogo")}
			</Link>
			{/* LE COMMUTATEUR DE PROJETS : le projet actif + le panneau (liste, création). */}
			<div className="mb-2 border-b border-border pb-3">
				<button
					type="button"
					data-testid="v3-project-name"
					aria-label={t("projectsCurrent")}
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					<FolderOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
					<span className="min-w-0 flex-1 truncate text-left">
						{projectName ?? "—"}
					</span>
					<ChevronDown
						className={[
							"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
							open ? "rotate-180" : "",
						].join(" ")}
						aria-hidden
					/>
				</button>
				{open && (
					<div
						data-testid="v3-project-panel"
						className="mt-1 rounded-md border border-border bg-card p-2"
					>
						<p className="px-1 pb-2 text-xs text-muted-foreground">
							{t("projectsHint")}
						</p>
						<ul className="flex flex-col gap-0.5">
							{projects.map((p) => (
								<li key={p.id}>
									<button
										type="button"
										data-testid="v3-project-item"
										data-id={p.id}
										aria-current={p.id === projectId ? "true" : undefined}
										onClick={() => void switchProject(p.id)}
										className={[
											"flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors",
											p.id === projectId
												? "bg-primary/10 font-semibold text-primary"
												: "text-foreground hover:bg-muted",
										].join(" ")}
									>
										<span className="min-w-0 flex-1 truncate">{p.name}</span>
										<span
											className="shrink-0 text-[10px] text-muted-foreground"
											title={t("projectsTurnsLabel")}
										>
											{p.turns}
											<span className="sr-only">
												{" "}
												{t("projectsTurnsLabel")}
											</span>
										</span>
									</button>
								</li>
							))}
						</ul>
						<form
							className="mt-2 flex flex-col gap-1 border-t border-border pt-2"
							aria-label={t("projectsNew")}
							onSubmit={async (e) => {
								e.preventDefault();
								const outcome = await createProject(newName);
								if (!outcome.ok) {
									// Refus → ALERTE (le défaut « aucune alerte sur doublon » corrigé).
									setCreateError(
										outcome.reason === "duplicate"
											? t("projectsErrDuplicate")
											: outcome.reason === "unusable"
												? t("projectsErrUnusable")
												: t("projectsErrEmpty"),
									);
									return;
								}
								setCreateError(null);
								setNewName("");
								setOpen(false);
							}}
						>
							<label
								htmlFor="v3-project-new-name"
								className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
							>
								{t("projectsNew")}
							</label>
							<input
								id="v3-project-new-name"
								data-testid="v3-project-new-name"
								value={newName}
								onChange={(e) => {
									setNewName(e.target.value);
									if (createError !== null) setCreateError(null);
								}}
								aria-invalid={createError !== null}
								placeholder={t("projectsNewPlaceholder")}
								className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive"
							/>
							{createError !== null && (
								<p
									data-testid="v3-project-create-error"
									role="alert"
									className="px-1 text-[11px] font-medium text-destructive"
								>
									{createError}
								</p>
							)}
							<button
								type="submit"
								data-testid="v3-project-create"
								disabled={newName.trim() === ""}
								className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{t("projectsCreate")}
							</button>
						</form>
					</div>
				)}
			</div>
			{/* LES CINQ SECTIONS : un en-tête de groupe thémé + ses lentilles. Les conceptuels
			    `soon` sont des placeholders DÉSACTIVÉS (aucun lien mort) jusqu'à leur portage. */}
			{SECTIONS.map((section) => (
				<div
					key={section.titleKey}
					className="flex flex-col gap-0.5 pt-2 first:pt-0"
				>
					<h2
						data-testid="v3-nav-group"
						data-group={section.titleKey}
						className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
					>
						{t(section.titleKey)}
					</h2>
					{section.entries.map(({ route, key, Icon, soon }) => {
						if (soon === true) {
							// Conceptuel KRD annoncé à sa place de parcours, page pas encore portée :
							// un placeholder DÉSACTIVÉ + un badge « bientôt » (jamais un lien mort).
							return (
								<span
									key={route}
									data-testid="v3-nav-soon"
									data-route={route}
									aria-disabled="true"
									title={t("navSoon")}
									className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/50"
								>
									<Icon className="h-4 w-4 shrink-0" aria-hidden />
									<span className="min-w-0 flex-1 truncate">{t(key)}</span>
									<span className="shrink-0 rounded border border-border bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
										{t("navSoon")}
									</span>
								</span>
							);
						}
						const active =
							pathname === route || pathname.startsWith(`${route}/`);
						return (
							<Link
								key={route}
								href={route}
								data-testid="v3-nav-item"
								data-route={route}
								aria-current={active ? "page" : undefined}
								className={[
									"flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
									active
										? "bg-primary/10 font-semibold text-primary"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								].join(" ")}
							>
								<Icon className="h-4 w-4 shrink-0" aria-hidden />
								<span>{t(key)}</span>
							</Link>
						);
					})}
				</div>
			))}
			<div className="mt-auto border-t border-border pt-3">
				{/* L'OUVERTURE DE LA PALETTE (⌘K) : le bouton DISPATCHE l'événement que la
				    palette (montée dans le layout) écoute — aucun état partagé de plus. */}
				<button
					type="button"
					data-testid="v3-palette-open"
					onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
					<span className="min-w-0 flex-1 truncate text-left">
						{t("paletteOpen")}
					</span>
					<kbd className="shrink-0 rounded border border-border bg-muted px-1 font-mono text-[10px]">
						⌘K
					</kbd>
				</button>
				<Link
					href="/v2"
					data-testid="v3-nav-workbench"
					className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					{t("navWorkbench")} →
				</Link>
			</div>
		</nav>
	);
}
