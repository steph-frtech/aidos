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
		{ href: "/contract", label: t("contract") },
		{ href: "/store", label: t("store") },
		{ href: "/records", label: t("records") },
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
