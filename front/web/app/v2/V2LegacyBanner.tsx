"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * V2LegacyBanner — le bandeau de DÉPRÉCIATION du Workbench V2 (décision propriétaire
 * 2026-06-17 : « mettre V2 en legacy » une fois le modèle conceptuel KRD porté « en propre »
 * dans V3). Affiché en tête de CHAQUE écran V2 ; pointe vers V3. Les routes V2 restent
 * accessibles (anti-overwrite §9) — on ne supprime pas, on déprécie honnêtement.
 *
 * Thémé (tokens ADR 0010, jamais de couleur en dur) + bilingue (next-intl, v2Shell). Aucune
 * écriture de vérité — c'est un bandeau de navigation.
 */
export function V2LegacyBanner() {
	const t = useTranslations("v2Shell");
	return (
		<div
			data-testid="v2-legacy-banner"
			className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground sm:px-8"
		>
			<span>{t("legacyBanner")}</span>
			<Link
				href="/v3/lab"
				data-testid="v2-legacy-cta"
				className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				{t("legacyCta")} →
			</Link>
		</div>
	);
}
