"use client";

import {
	Code,
	History,
	Layers,
	Map as MapIcon,
	Settings,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * La navigation V3 (ADR 0010 thème · ADR 0011 bilingue) : six lentilles sur UNE même
 * session (AI Lab · Parcours produit · Historique · Environnements · Code · Paramètres)
 * + le retour Workbench V2 en pied. Libellés AMICAUX (aucun jargon KRD en copie primaire).
 * Client Component (route active via usePathname). Le mur intact : la nav LIE, n'écrit rien.
 */

const ENTRIES = [
	{ route: "/v3/lab", key: "navLab", Icon: Sparkles },
	{ route: "/v3/parcours", key: "navParcours", Icon: MapIcon },
	{ route: "/v3/history", key: "navHistory", Icon: History },
	{ route: "/v3/environnements", key: "navEnvs", Icon: Layers },
	{ route: "/v3/code", key: "navCode", Icon: Code },
	{ route: "/v3/parametrage", key: "navParams", Icon: Settings },
] as const;

export function V3Nav() {
	const pathname = usePathname();
	const t = useTranslations("v3");

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
