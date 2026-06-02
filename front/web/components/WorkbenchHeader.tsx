import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * En-tête partagé du Workbench (ADR 0010 design system + ADR 0011 bilingue).
 * Server Component : libellés via next-intl (namespace `nav`), bascule de langue cliente.
 */
export async function WorkbenchHeader() {
	const t = await getTranslations("nav");
	const links = [
		{ href: "/", label: t("home") },
		{ href: "/first-app", label: t("firstApp") },
		{ href: "/brain", label: t("brain") },
		{ href: "/contract", label: t("contract") },
		{ href: "/store", label: t("store") },
		{ href: "/records", label: t("records") },
		{ href: "/cli", label: t("cli") },
		{ href: "/wall", label: t("wall") },
		{ href: "/mirrors", label: t("mirrors") },
		{ href: "/mirror-health", label: t("mirrorHealth") },
		{ href: "/sensors", label: t("sensors") },
		{ href: "/completeness", label: t("completeness") },
		{ href: "/why-blocked", label: t("whyBlocked") },
		{ href: "/truth-typing", label: t("truthTyping") },
		{ href: "/scopes", label: t("scopes") },
		{ href: "/authorities", label: t("authorities") },
		{ href: "/link-graph", label: t("linkGraph") },
		{ href: "/truth-tree", label: t("truthTree") },
		{ href: "/red-propagation", label: t("redPropagation") },
		{ href: "/red-wave", label: t("redWave") },
		{ href: "/phase-stable", label: t("phaseStable") },
		{ href: "/version-dag", label: t("versionDag") },
		{ href: "/changeset", label: t("changeset") },
		{ href: "/semantic-diff", label: t("semanticDiff") },
		{ href: "/semantic-merge", label: t("semanticMerge") },
		{ href: "/archive-curation", label: t("archiveCuration") },
		{ href: "/expr", label: t("expr") },
		{ href: "/policy", label: t("policy") },
		{ href: "/operation", label: t("operation") },
		{ href: "/control", label: t("control") },
		{ href: "/ideas", label: t("ideas") },
		{ href: "/exploration", label: t("exploration") },
		{ href: "/goal", label: t("goal") },
		{ href: "/memory-firewall", label: t("memoryFirewall") },
		{ href: "/memory-backends", label: t("memoryBackends") },
		{ href: "/decision-reuse", label: t("decisionReuse") },
		{ href: "/context-pack", label: t("contextPack") },
		{ href: "/emitters", label: t("emitters") },
		{ href: "/entity-map", label: t("entityMap") },
		{ href: "/api-projection", label: t("apiProjection") },
		{ href: "/db-projection", label: t("dbProjection") },
		{ href: "/web-preview", label: t("webPreview") },
		{ href: "/meta", label: t("meta") },
		{ href: "/mutation-score", label: t("mutationScore") },
		{ href: "/kernel-debt", label: t("kernelDebt") },
		{ href: "/evolution-sandbox", label: t("evolutionSandbox") },
		{ href: "/incidents-to-ideas", label: t("incidentsToIdeas") },
		{ href: "/check", label: t("check") },
		{ href: "/demo-checkout", label: t("demoCheckout") },
		{ href: "/adoption", label: t("adoption") },
	];

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
				<nav className="flex items-center gap-1 text-sm">
					<Link
						href="/"
						className="mr-2 font-semibold tracking-tight text-foreground"
					>
						AIDOS
					</Link>
					{links.map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							{l.label}
						</Link>
					))}
				</nav>
				<LanguageSwitcher />
			</div>
		</header>
	);
}
