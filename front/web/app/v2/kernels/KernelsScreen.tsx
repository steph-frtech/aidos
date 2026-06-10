import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { entry, type Locale } from "@/lib/v2/glossary";
import { KernelTreeClient } from "./KernelTreeClient";

/**
 * WB2-04 — l'écran de l'ARBRE DE COMPOSITION des kernels (§17 `composes`, §49 fractale).
 *
 * Rendu à DEUX routes : /v2/kernels (la route de l'étape) ET /v2/arbres (le slug du concept
 * « Arbres » du glossaire, atteint depuis la carte/nav de /v2). Les deux segments statiques priment
 * sur la route dynamique /v2/[slug] et CONSERVENT le contrat de navigation WB2-02 : un titre
 * data-testid=v2-concept-title (le libellé canonique) + une définition v2-concept-def.
 *
 * ACTION-CAPABLE (ui-completeness) : déplier/replier l'arbre virtualisé (React Arborist) + cliquer
 * un kernel → son anatomie (WB2-06). Themed + bilingue (FR d'abord). Le mur intact : projection.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = ["nodeCount", "openAnatomy"] as const;

export async function KernelsScreen() {
	const t = await getTranslations("v2Kernels");
	const locale = (await getLocale()) as Locale;
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
	// L'identité CANONIQUE du concept (le glossaire « arbres ») — préserve le contrat WB2-02.
	const concept = entry("arbres");

	return (
		<div className="mx-auto w-full max-w-4xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-kernels-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-concept-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{concept?.[locale].label}
				</h1>
				<p
					data-testid="v2-concept-def"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{concept?.[locale].def}
				</p>
				<h2
					data-testid="v2-kernels-title"
					className="pt-2 text-xl font-semibold tracking-tight text-foreground"
				>
					{t("title")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-kernels-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<KernelTreeClient t={strings} />
		</div>
	);
}
