import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { GLOSSARY, type Locale } from "@/lib/v2/glossary";
import { schemaHash } from "@/lib/v2/schema";
import { SCREENS, screensHash } from "@/lib/v2/screens";
import { SchemaDiagramMount } from "./SchemaDiagramMount";

/**
 * /v2 — la PAGE D'ACCUEIL du Workbench V2 = LE schéma KRD complet, interactif (étape WB2-02 ;
 * ADR 0010 · 0011 · 0053).
 *
 * Rend le schéma entier en diagramme React Flow (lecture seule) : idée (étage d'entrée) → MUR
 * (/goal) → la verticale + le kernel → la facette + les paires-miroir → les liens §17 → les
 * arbres → les cellules. CHAQUE BLOC est cliquable et navigue vers son écran /v2/<slug>. Sous
 * le diagramme, la même carte de concepts en liste (repli accessible, sans canvas), elle aussi
 * cliquable. AUCUNE chaîne de schéma en dur : libellés et définitions viennent du glossaire
 * lib/v2/glossary.ts ; le chrome vient du namespace i18n `v2Shell`.
 *
 * DÉTERMINISME-FIRST : le schéma (nœuds, positions, arêtes) est une projection PURE du glossaire
 * (lib/v2/schema.ts) — même glossaire → même schéma, son empreinte est affichée. LE MUR : la
 * page PROPOSE / NAVIGUE, elle n'écrit aucune vérité.
 */
export default async function V2Home() {
	const t = await getTranslations("v2Shell");
	const locale = (await getLocale()) as Locale;

	return (
		<div className="mx-auto w-full max-w-5xl space-y-10">
			<section className="space-y-4">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
					{t("title")}
				</h1>
				<p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<section aria-label={t("schemaHeading")} className="space-y-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("schemaHeading")}
					</h2>
					<span
						data-testid="v2-schema-hash"
						className="font-mono text-xs text-muted-foreground"
					>
						{t("schemaHash")} {schemaHash()}
					</span>
				</div>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("schemaSubtitle")}
				</p>
				<SchemaDiagramMount />
			</section>

			<section aria-label={t("conceptsHeading")} className="space-y-4">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("conceptsHeading")}
				</h2>
				<ul
					data-testid="v2-concept-cards"
					className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
				>
					{GLOSSARY.map((e) => (
						<li key={e.slug}>
							<Link
								href={`/v2/${e.slug}`}
								data-testid={`v2-concept-${e.slug}`}
								className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
							>
								<span className="text-sm font-semibold text-foreground group-hover:text-primary">
									{e[locale].label}
								</span>
								<span className="text-sm leading-relaxed text-muted-foreground">
									{e[locale].def}
								</span>
								<span className="mt-auto text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
									{t("openConcept")} →
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section
				aria-label={t("allScreensHeading")}
				className="space-y-4"
				data-testid="v2-all-screens"
			>
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("allScreensHeading")}
					</h2>
					<span
						data-testid="v2-screens-hash"
						className="font-mono text-xs text-muted-foreground"
					>
						{t("allScreensHash")} {screensHash()}
					</span>
				</div>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("allScreensSubtitle")}
				</p>
				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{SCREENS.map((s) => (
						<li key={s.slug}>
							<Link
								href={`/v2/${s.slug}`}
								data-testid={`v2-screen-${s.slug}`}
								className="group flex h-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
							>
								<span className="text-sm font-medium text-foreground group-hover:text-primary">
									{s[locale].title}
								</span>
								<span className="shrink-0 font-mono text-xs text-muted-foreground">
									/v2/{s.slug}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<footer className="border-t border-border pt-6 text-xs text-muted-foreground">
				{t("footer")}
			</footer>
		</div>
	);
}
