"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * L'en-tête V2 (Workbench V2, étape WB2-00 ; ADR 0010 thème, ADR 0011 bilingue).
 *
 * Le bandeau du groupe de routes /v2 : la marque V2, la note de coexistence (l'ancien
 * Workbench reste servi à /), le retour vers le Workbench actuel, et la bascule de langue
 * (réutilise le LanguageSwitcher partagé). Aucune chaîne en dur : tout via le namespace
 * i18n `v2Shell`. Le mur intact : l'en-tête ne fait que naviguer.
 */
export function V2Header() {
	const t = useTranslations("v2Shell");

	return (
		<header
			data-testid="v2-header"
			className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6"
		>
			<div className="flex items-center gap-3">
				<Link
					href="/v2"
					data-testid="v2-brand"
					className="text-sm font-bold tracking-tight text-foreground"
				>
					AIDOS Workbench{" "}
					<span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
						V2
					</span>
				</Link>
				<span className="hidden text-xs text-muted-foreground sm:inline">
					{t("coexistence")}
				</span>
			</div>
			<div className="flex items-center gap-3">
				<Link
					href="/v2/lab"
					data-testid="v2-lab-link"
					className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
				>
					{t("labTitle")}
				</Link>
				<Link
					href="/"
					data-testid="v2-back-to-v1"
					className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					{t("backToV1")}
				</Link>
				<LanguageSwitcher />
			</div>
		</header>
	);
}
