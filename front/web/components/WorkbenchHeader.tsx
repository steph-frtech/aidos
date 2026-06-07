"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * Navigation latérale du Workbench (ADR 0010 design system + ADR 0011 bilingue).
 * Menu de GAUCHE avec sous-menus repliables par sous-système KRD plutôt qu'une barre
 * horizontale en haut : le groupe contenant la route active s'ouvre et le lien actif est
 * surligné. Client Component (repli + route active) ; libellés via next-intl (namespaces
 * `nav` + `navGroups`). Sur mobile, la barre devient un tiroir dépliable en haut.
 *
 * Conservé sous le nom WorkbenchHeader pour que les 48 pages qui le rendent n'aient pas à
 * changer : le layout pousse le contenu de `md:pl-64` pour dégager la barre fixe.
 */
const GROUPS: { key: string; items: { href: string; k: string }[] }[] = [
	{
		key: "start",
		items: [
			{ href: "/", k: "home" },
			{ href: "/projects", k: "projects" },
			{ href: "/project-scope", k: "projectScope" },
			{ href: "/project-wall", k: "projectWall" },
			{ href: "/app-builder", k: "appBuilder" },
			{ href: "/first-app", k: "firstApp" },
			{ href: "/proof-levels", k: "proofLevels" },
			{ href: "/demo-checkout", k: "demoCheckout" },
		],
	},
	{
		key: "brain",
		items: [
			{ href: "/brain", k: "brain" },
			{ href: "/memory-firewall", k: "memoryFirewall" },
			{ href: "/memory-backends", k: "memoryBackends" },
			{ href: "/decision-reuse", k: "decisionReuse" },
			{ href: "/context-pack", k: "contextPack" },
			{ href: "/context-compression", k: "contextCompression" },
			{ href: "/ingestion", k: "ingestion" },
			{ href: "/compound", k: "compound" },
			{ href: "/besoin-necessity", k: "besoinNecessity" },
			{ href: "/compound-besoin-grammar", k: "besoinGrammar" },
			{ href: "/compound-besoin-graph", k: "besoinGraph" },
			{ href: "/compound-besoin-metadata", k: "besoinMetadata" },
			{ href: "/compound-besoin-proposes", k: "besoinProposes" },
			{ href: "/compound-besoin-thresholds", k: "besoinThresholds" },
			{ href: "/compound-besoin-candescend", k: "besoinCanDescend" },
			{ href: "/compound-besoin-branchtree", k: "besoinBranchTree" },
			{ href: "/compound-besoin-cascade", k: "besoinCascade" },
			{ href: "/compound-besoin-completeness", k: "besoinCompleteness" },
			{ href: "/compound-besoin-mirrorform", k: "besoinMirrorform" },
			{ href: "/compound-besoin-gate", k: "besoinGate" },
			{ href: "/compound-besoin", k: "besoinWizard" },
			{ href: "/compound-besoin/doc", k: "besoinDoc" },
			{ href: "/besoin-invariant", k: "besoinInvariant" },
			{ href: "/besoin-intake", k: "besoinIntake" },
			{ href: "/emit-ideas", k: "emitIdeas" },
			{ href: "/red-backlog", k: "redBacklog" },
			{ href: "/compound-besoin-capitalisation", k: "besoinCapitalisation" },
		],
	},
	{
		key: "kernel",
		items: [
			{ href: "/contract", k: "contract" },
			{ href: "/records", k: "records" },
			{ href: "/expr", k: "expr" },
			{ href: "/policy", k: "policy" },
			{ href: "/operation", k: "operation" },
			{ href: "/control", k: "control" },
			{ href: "/ideas", k: "ideas" },
			{ href: "/truth-typing", k: "truthTyping" },
			{ href: "/scopes", k: "scopes" },
			{ href: "/authorities", k: "authorities" },
			{ href: "/agents", k: "agents" },
			{ href: "/global-invariants", k: "globalInvariants" },
			{ href: "/sagas", k: "sagas" },
			{ href: "/temporal-invariants", k: "temporal" },
		],
	},
	{
		key: "mirror",
		items: [
			{ href: "/mirrors", k: "mirrors" },
			{ href: "/mirror-health", k: "mirrorHealth" },
			{ href: "/sensors", k: "sensors" },
			{ href: "/completeness", k: "completeness" },
			{ href: "/why-blocked", k: "whyBlocked" },
		],
	},
	{
		key: "links",
		items: [
			{ href: "/link-graph", k: "linkGraph" },
			{ href: "/truth-tree", k: "truthTree" },
			{ href: "/red-propagation", k: "redPropagation" },
			{ href: "/red-wave", k: "redWave" },
		],
	},
	{
		key: "versions",
		items: [
			{ href: "/changeset", k: "changeset" },
			{ href: "/semantic-diff", k: "semanticDiff" },
			{ href: "/semantic-merge", k: "semanticMerge" },
			{ href: "/phase-stable", k: "phaseStable" },
			{ href: "/version-dag", k: "versionDag" },
			{ href: "/archive-curation", k: "archiveCuration" },
		],
	},
	{
		key: "build",
		items: [
			{ href: "/goal", k: "goal" },
			{ href: "/exploration", k: "exploration" },
			{ href: "/emitted-target", k: "emittedTarget" },
			{ href: "/emitters", k: "emitters" },
			{ href: "/entity-map", k: "entityMap" },
			{ href: "/api-projection", k: "apiProjection" },
			{ href: "/db-projection", k: "dbProjection" },
			{ href: "/web-preview", k: "webPreview" },
		],
	},
	{
		key: "meta",
		items: [
			{ href: "/meta", k: "meta" },
			{ href: "/mutation-score", k: "mutationScore" },
			{ href: "/kernel-debt", k: "kernelDebt" },
			{ href: "/harness-economics", k: "economics" },
			{ href: "/evolution-sandbox", k: "evolutionSandbox" },
			{ href: "/incidents-to-ideas", k: "incidentsToIdeas" },
			{ href: "/adoption", k: "adoption" },
			{ href: "/governance", k: "governance" },
		],
	},
	{
		key: "tools",
		items: [
			{ href: "/store", k: "store" },
			{ href: "/cli", k: "cli" },
			{ href: "/wall", k: "wall" },
			{ href: "/check", k: "check" },
		],
	},
];

export function WorkbenchHeader() {
	const t = useTranslations("nav");
	const tg = useTranslations("navGroups");
	const pathname = usePathname();

	const activeGroup = GROUPS.find((g) =>
		g.items.some((i) => i.href === pathname),
	)?.key;

	const [openSet, setOpenSet] = useState<Set<string>>(
		() => new Set([activeGroup ?? "start"]),
	);
	const [mobileOpen, setMobileOpen] = useState(false);

	// Keep the group holding the current route open after client-side navigation.
	useEffect(() => {
		if (activeGroup) {
			setOpenSet((prev) => new Set(prev).add(activeGroup));
		}
	}, [activeGroup]);

	function toggle(key: string) {
		setOpenSet((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}

	const nav = (
		<nav className="flex flex-col gap-1 px-2 py-2" aria-label="Workbench">
			{GROUPS.map((g) => {
				const open = openSet.has(g.key) || g.key === activeGroup;
				return (
					<div key={g.key}>
						<button
							type="button"
							data-testid={`navgroup-${g.key}`}
							aria-expanded={open}
							onClick={() => toggle(g.key)}
							className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							{tg(g.key)}
							<span
								aria-hidden="true"
								className={`text-[0.6rem] transition-transform ${open ? "rotate-90" : ""}`}
							>
								▶
							</span>
						</button>
						{open ? (
							<ul className="mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2">
								{g.items.map((i) => {
									const active = pathname === i.href;
									return (
										<li key={i.href}>
											<Link
												href={i.href}
												aria-current={active ? "page" : undefined}
												onClick={() => setMobileOpen(false)}
												className={
													active
														? "block rounded-md bg-primary/10 px-2.5 py-1.5 text-sm font-medium text-primary"
														: "block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
												}
											>
												{t(i.k)}
											</Link>
										</li>
									);
								})}
							</ul>
						) : null}
					</div>
				);
			})}
		</nav>
	);

	return (
		<>
			{/* Desktop: fixed left sidebar */}
			<aside
				data-testid="workbench-sidebar"
				className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card sm:flex"
			>
				<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
					<Link
						href="/"
						className="font-semibold tracking-tight text-foreground"
					>
						AIDOS
					</Link>
					<LanguageSwitcher />
				</div>
				<div className="flex-1 overflow-y-auto">{nav}</div>
			</aside>

			{/* Mobile (< sm): a top bar whose Menu button opens a LEFT off-canvas drawer */}
			<header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur sm:hidden">
				<div className="flex items-center justify-between gap-3 px-4 py-3">
					<button
						type="button"
						data-testid="nav-mobile-toggle"
						aria-expanded={mobileOpen}
						aria-label={tg("menu")}
						onClick={() => setMobileOpen((v) => !v)}
						className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<span aria-hidden="true">☰</span>
						{tg("menu")}
					</button>
					<Link
						href="/"
						className="font-semibold tracking-tight text-foreground"
					>
						AIDOS
					</Link>
					<LanguageSwitcher />
				</div>
			</header>

			{/* Mobile left drawer + backdrop */}
			{mobileOpen ? (
				<div className="sm:hidden">
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is a supplementary close affordance; the drawer links and Esc-free toggle remain keyboard-reachable */}
					<div
						data-testid="nav-backdrop"
						onClick={() => setMobileOpen(false)}
						aria-hidden="true"
						className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
					/>
					<aside
						data-testid="workbench-drawer"
						className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl"
					>
						<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
							<Link
								href="/"
								onClick={() => setMobileOpen(false)}
								className="font-semibold tracking-tight text-foreground"
							>
								AIDOS
							</Link>
							<button
								type="button"
								aria-label="Fermer"
								onClick={() => setMobileOpen(false)}
								className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								✕
							</button>
						</div>
						<div className="flex-1 overflow-y-auto">{nav}</div>
					</aside>
				</div>
			) : null}
		</>
	);
}
