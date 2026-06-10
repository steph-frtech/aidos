import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { entry, type Locale, SLUGS } from "@/lib/v2/glossary";

/**
 * /v2/<slug> — l'écran d'un concept canonique KRD (Workbench V2, étape WB2-00).
 *
 * Aux étapes WB2-02.., chaque concept reçoit son écran dédié (arbre, grille, anatomie, DAG…).
 * Ici, à la fondation, l'écran rend la DÉFINITION canonique du concept (issue du glossaire
 * lib/v2/glossary.ts) — une vraie page, jamais un lien mort. Un slug hors-glossaire → 404
 * (totalité : seuls les concepts déclarés existent). Le mur intact : lecture seule.
 *
 * Certains concepts ont reçu leur ÉCRAN DÉDIÉ (un répertoire de route frère, ex. /v2/liens). Pour
 * ces slugs, la route dédiée fait AUTORITÉ : on les EXCLUT du catch-all (et un accès via [slug] →
 * 404) pour qu'il n'y ait aucune ambiguïté de routage (un segment statique doit primer le dynamique).
 */
const DEDICATED_SLUGS = new Set<string>(["liens"]);

export function generateStaticParams() {
	return SLUGS.filter((slug) => !DEDICATED_SLUGS.has(slug)).map((slug) => ({
		slug,
	}));
}

export default async function ConceptScreen({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	// Un slug à écran dédié (route frère) n'est jamais rendu par le catch-all : la route dédiée prime.
	if (DEDICATED_SLUGS.has(slug)) notFound();
	const e = entry(slug);
	if (e === undefined) notFound();

	const locale = (await getLocale()) as Locale;
	const t = await getTranslations("v2Shell");

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6">
			<Link
				href="/v2"
				data-testid="v2-concept-back"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("conceptsHeading")}
			</Link>
			<h1
				data-testid="v2-concept-title"
				className="text-3xl font-bold tracking-tight text-foreground"
			>
				{e[locale].label}
			</h1>
			<p
				data-testid="v2-concept-def"
				className="text-lg leading-relaxed text-muted-foreground"
			>
				{e[locale].def}
			</p>
			<div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
				{t("wallNote")}
			</div>
		</div>
	);
}
