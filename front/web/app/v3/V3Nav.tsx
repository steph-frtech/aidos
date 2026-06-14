"use client";

import {
	ChevronDown,
	Code,
	FolderOpen,
	History,
	Layers,
	ListChecks,
	Map as MapIcon,
	PenTool,
	Search,
	Server,
	Settings,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PALETTE_OPEN_EVENT } from "./Palette";
import { useV3Session } from "./V3Session";

/**
 * La navigation V3 (ADR 0010 thème · ADR 0011 bilingue) : neuf lentilles sur UNE même
 * session (AI Lab · Parcours produit · Spécifications · Historique · Environnements ·
 * Code · Instance · Paramètres · Design) + le retour Workbench V2 en pied. Libellés AMICAUX
 * (aucun jargon KRD en copie primaire). LE COMMUTATEUR DE PROJETS (ADR 0061) sous le
 * logo : le projet actif + un petit panneau (la liste — cliquer rouvre AVEC tout
 * l'historique, le rejeu — et « Nouveau projet »). En pied, l'ouverture de la PALETTE
 * (⌘K — « tous les écrans au meilleur endroit »). Client Component (route active via
 * usePathname). Le mur intact : la nav LIE, n'écrit rien.
 */

export const ENTRIES = [
	{ route: "/v3/lab", key: "navLab", Icon: Sparkles },
	{ route: "/v3/parcours", key: "navParcours", Icon: MapIcon },
	{ route: "/v3/specs", key: "navSpecs", Icon: ListChecks },
	{ route: "/v3/history", key: "navHistory", Icon: History },
	{ route: "/v3/environnements", key: "navEnvs", Icon: Layers },
	{ route: "/v3/code", key: "navCode", Icon: Code },
	{ route: "/v3/instance", key: "navInstance", Icon: Server },
	{ route: "/v3/parametrage", key: "navParams", Icon: Settings },
	{ route: "/v3/design", key: "navDesign", Icon: PenTool },
] as const;

export function V3Nav() {
	const pathname = usePathname();
	const t = useTranslations("v3");
	const { projectId, projectName, projects, switchProject, createProject } =
		useV3Session();
	const [open, setOpen] = useState(false);
	const [newName, setNewName] = useState("");

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
							onSubmit={(e) => {
								e.preventDefault();
								if (newName.trim() === "") return;
								void createProject(newName);
								setNewName("");
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
								onChange={(e) => setNewName(e.target.value)}
								placeholder={t("projectsNewPlaceholder")}
								className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
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
			{ENTRIES.map(({ route, key, Icon }) => {
				const active = pathname === route || pathname.startsWith(`${route}/`);
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
