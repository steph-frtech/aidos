"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { GLOSSARY, type Locale } from "@/lib/v2/glossary";

/**
 * La navigation V2 par concept (Workbench V2, étape WB2-00 ; ADR 0010 thème, ADR 0011 bilingue).
 *
 * UNE source unique de libellés : le glossaire canonique KRD (lib/v2/glossary.ts). Chaque
 * entrée du glossaire = un lien de nav, dans l'ORDRE du parcours (idée → mur → kernel →
 * verticale → facette → paires-miroir → liens → arbres → cellules). AUCUNE chaîne en dur :
 * le libellé vient de `entry[locale].label`, la définition de `entry[locale].def` (en infobulle).
 * Le lint vocabulaire (lib/v2/vocabulary-lint.ts) prouve qu'aucun terme franglais n'y entre.
 *
 * Client Component (route active via usePathname). Le slug du concept route vers /v2/<slug>
 * (les écrans concrets arrivent aux étapes WB2-02..). Le mur intact : la nav LIE, n'écrit rien.
 */
export function V2Nav() {
	const pathname = usePathname();
	const locale = useLocale() as Locale;
	const t = useTranslations("v2Shell");

	return (
		<nav
			aria-label={t("navHeading")}
			data-testid="v2-nav"
			className="flex flex-col gap-1"
		>
			<p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{t("navHeading")}
			</p>
			{GLOSSARY.map((e) => {
				const href = `/v2/${e.slug}`;
				const active = pathname === href;
				const label = e[locale].label;
				return (
					<Link
						key={e.slug}
						href={href}
						title={e[locale].def}
						data-testid={`v2-nav-${e.slug}`}
						aria-current={active ? "page" : undefined}
						className={[
							"rounded-md px-2 py-1.5 text-sm transition-colors",
							active
								? "bg-primary/10 font-semibold text-primary"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						].join(" ")}
					>
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
